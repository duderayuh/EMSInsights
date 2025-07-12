import { HospitalCallSegment } from '@shared/schema';
import OpenAI from 'openai';
import { SORDetectionService } from './sor-detection';

interface ConversationMessage {
  speaker: 'EMS' | 'Hospital';
  message: string;
  timestamp: string;
  confidence: number;
  segmentId: number;
}

interface ConversationAnalysis {
  messages: ConversationMessage[];
  summary: string;
  keyPoints: string[];
  medicalContext: string;
  sorDetected: boolean;
  physicianMentioned: string | null;
  units?: string[]; // Add units field
}

export class ConversationAnalyzer {
  private openaiClient: OpenAI | null = null;
  private sorDetector: SORDetectionService;

  constructor() {
    this.sorDetector = new SORDetectionService();
    
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openaiClient = new OpenAI({ apiKey });
    }
  }

  async analyzeConversation(segments: HospitalCallSegment[], hospitalCall?: any): Promise<ConversationAnalysis> {
    // Sort segments by sequence number to ensure proper order
    const sortedSegments = segments.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    // Extract units from all segments
    const units = this.extractUnitsFromSegments(sortedSegments);

    // Build conversation messages
    const messages: ConversationMessage[] = sortedSegments.map(segment => ({
      speaker: segment.speakerType === 'ems' ? 'EMS' : 'Hospital' as 'EMS' | 'Hospital',
      message: segment.transcript || '',
      timestamp: new Date(segment.timestamp).toLocaleTimeString(),
      confidence: segment.confidence || 0,
      segmentId: segment.id
    }));

    // Check for SOR detection in each segment
    let sorDetected = false;
    let physicianMentioned: string | null = null;
    
    for (const segment of sortedSegments) {
      if (segment.transcript) {
        const sorResult = this.sorDetector.detectSOR(segment.transcript);
        if (sorResult.isSOR) {
          sorDetected = true;
          if (sorResult.physicianName) {
            physicianMentioned = sorResult.physicianName;
          }
        }
      }
    }

    // Only analyze completed hospital calls with AI, not dispatch calls
    const isCompletedHospitalCall = hospitalCall && hospitalCall.status === 'completed';
    
    if (!isCompletedHospitalCall || !this.openaiClient) {
      // Return verbatim transcripts for non-completed calls or when OpenAI is not available
      return {
        messages,
        summary: 'AI analysis pending - call in progress',
        keyPoints: [],
        medicalContext: 'verbatim_only',
        sorDetected,
        physicianMentioned,
        units
      };
    }

    try {
      // Build conversation text for AI analysis
      const conversationText = messages
        .map(msg => `${msg.speaker} (${msg.timestamp}): ${msg.message}`)
        .join('\n');

      // Use GPT-4o model for analysis (released May 13, 2024)
      const completion = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert EMS medical reviewer analyzing hospital communication transcripts between EMS units and hospital personnel.
Focus on extracting:
1. Medical summary - patient condition, chief complaint, vital signs
2. Key clinical points - treatments given, medications, procedures
3. Transport information - unit ID, destination, ETA if mentioned
4. SOR (Signature of Release) requests and physician names

Be concise and factual. Extract only what is explicitly stated in the transcript.`
          },
          {
            role: 'user',
            content: `Analyze this EMS-Hospital conversation transcript:

${conversationText}

Provide:
1. A brief medical summary (2-3 sentences)
2. Key clinical points (bullet points)
3. Medical context and urgency level`
          }
        ],
        temperature: 0.3, // Lower temperature for more focused, factual responses
        max_tokens: 1000
      });

      const aiResponse = completion.choices[0]?.message?.content || '';
      
      // Parse AI response to extract summary and key points
      const lines = aiResponse.split('\n').filter(line => line.trim());
      let summary = '';
      const keyPoints: string[] = [];
      let medicalContext = '';
      
      let section = '';
      for (const line of lines) {
        if (line.toLowerCase().includes('summary:') || line.match(/^1\./)) {
          section = 'summary';
          summary = line.replace(/^1\.\s*|summary:\s*/i, '').trim();
        } else if (line.toLowerCase().includes('key') || line.toLowerCase().includes('clinical') || line.match(/^2\./)) {
          section = 'keypoints';
        } else if (line.toLowerCase().includes('context') || line.toLowerCase().includes('urgency') || line.match(/^3\./)) {
          section = 'context';
          medicalContext = line.replace(/^3\.\s*|context:\s*/i, '').trim();
        } else if (section === 'summary' && line.trim()) {
          summary += ' ' + line.trim();
        } else if (section === 'keypoints' && line.trim() && line.startsWith('-')) {
          keyPoints.push(line.substring(1).trim());
        } else if (section === 'context' && line.trim()) {
          medicalContext += ' ' + line.trim();
        }
      }

      // Clean up the extracted data
      summary = summary.trim() || 'EMS-Hospital communication analyzed';
      medicalContext = medicalContext.trim() || 'Standard EMS transport';

      return {
        messages,
        summary,
        keyPoints: keyPoints.length > 0 ? keyPoints : ['Verbatim transcripts available'],
        medicalContext,
        sorDetected,
        physicianMentioned,
        units
      };
    } catch (error) {
      console.error('AI analysis error:', error);
      // Fallback to basic analysis on error
      return {
        messages,
        summary: 'AI analysis unavailable - showing verbatim transcripts',
        keyPoints: [],
        medicalContext: 'verbatim_only',
        sorDetected,
        physicianMentioned,
        units
      };
    }
  }

  private extractUnitsFromSegments(segments: HospitalCallSegment[]): string[] {
    const units = new Set<string>();
    const unitPatterns = [
      /\b(medic|med)\s*(\d+)/gi,
      /\b(ambulance|amb)\s*(\d+)/gi,
      /\b(ems)\s*(\d+)/gi,
      /\b(engine|eng)\s*(\d+)/gi,
      /\b(ladder|lad)\s*(\d+)/gi,
      /\b(squad|sqd)\s*(\d+)/gi,
      /\b(truck|trk)\s*(\d+)/gi,
      /\b(rescue|res)\s*(\d+)/gi,
      /\b(battalion|bat|chief)\s*(\d+)/gi,
      /\b(unit)\s*(\d+)/gi
    ];

    segments.forEach(segment => {
      if (segment.transcript) {
        unitPatterns.forEach(pattern => {
          const matches = segment.transcript.matchAll(pattern);
          for (const match of matches) {
            const unitType = match[1].toLowerCase();
            const unitNumber = match[2];
            // Normalize unit type names
            let normalizedType = unitType;
            if (unitType === 'med') normalizedType = 'Medic';
            else if (unitType === 'amb') normalizedType = 'Ambulance';
            else if (unitType === 'eng') normalizedType = 'Engine';
            else if (unitType === 'lad') normalizedType = 'Ladder';
            else if (unitType === 'sqd') normalizedType = 'Squad';
            else if (unitType === 'trk') normalizedType = 'Truck';
            else if (unitType === 'res') normalizedType = 'Rescue';
            else if (unitType === 'bat') normalizedType = 'Battalion';
            else normalizedType = unitType.charAt(0).toUpperCase() + unitType.slice(1);
            
            units.add(`${normalizedType} ${unitNumber}`);
          }
        });
      }
    });

    return Array.from(units).sort();
  }
}

export const conversationAnalyzer = new ConversationAnalyzer();
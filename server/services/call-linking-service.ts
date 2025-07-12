import { EventEmitter } from 'events';
import { storage } from '../storage';
import { transcriptionService } from './transcription';
import { transcriptCleanupService } from './transcript-cleanup';
import { nlpClassifier } from './nlp-classifier';
import { geocodingService } from './geocoding';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

interface CallLinkCandidate {
  id: number;
  timestamp: Date;
  audioSegmentId: string;
  transcript: string | null;
  confidence: number | null;
  talkgroup: string | null;
  duration: number;
  metadata: any;
}

interface LinkAnalysis {
  isIncomplete: boolean;
  confidence: number;
  reason: string;
  suggestedLinks?: number[];
}

export class CallLinkingService extends EventEmitter {
  private timeWindow: number = 5 * 60 * 1000; // 5 minutes
  private audioDir: string;

  constructor() {
    super();
    this.audioDir = join(process.cwd(), 'ems_audio_processing');
  }

  /**
   * Analyze if a call appears incomplete and needs linking
   */
  async analyzeCallCompleteness(call: CallLinkCandidate): Promise<LinkAnalysis> {
    if (!call.transcript || call.transcript.trim() === '' || 
        call.transcript.includes('transcription unavailable')) {
      return {
        isIncomplete: true,
        confidence: 0.9,
        reason: 'No transcript available'
      };
    }

    const transcript = call.transcript.toLowerCase();
    
    // Check for incomplete dispatch patterns
    const incompletePatterns = [
      // Starts with unit but no location/reason
      /^(engine|medic|ambulance|truck|ladder)\s+\d+(?:\s*,\s*(?:engine|medic|ambulance|truck|ladder)\s+\d+)*\s*$/,
      // Has location but no call type
      /\d+\s+\w+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd)\s*$/,
      // Ends abruptly mid-sentence
      /\b(and|to|at|on|near|from)\s*$/,
      // Missing typical dispatch ending
      /^\w+.*[^.]$/,
      // Very short calls (likely cut off)
      /^.{1,15}$/
    ];

    for (const pattern of incompletePatterns) {
      if (pattern.test(transcript.trim())) {
        return {
          isIncomplete: true,
          confidence: 0.8,
          reason: `Pattern suggests incomplete: ${transcript.substring(0, 50)}...`
        };
      }
    }

    // Check dispatch completeness indicators
    const hasUnit = /\b(engine|medic|ambulance|truck|ladder)\s+\d+/.test(transcript);
    const hasLocation = /\b\d+\s+\w+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd)/.test(transcript);
    const hasCallType = /(medical|fire|mva|accident|unconscious|breathing|chest pain|cardiac|overdose|assault|trauma)/.test(transcript);

    if (hasUnit && !hasLocation && !hasCallType) {
      return {
        isIncomplete: true,
        confidence: 0.7,
        reason: 'Has unit assignment but missing location and call type'
      };
    }

    if (hasLocation && !hasCallType) {
      return {
        isIncomplete: true,
        confidence: 0.6,
        reason: 'Has location but missing call type description'
      };
    }

    return {
      isIncomplete: false,
      confidence: 0.9,
      reason: 'Call appears complete'
    };
  }

  /**
   * Find potential linking candidates for an incomplete call
   */
  async findLinkingCandidates(targetCall: CallLinkCandidate): Promise<CallLinkCandidate[]> {
    const timeWindowStart = new Date(targetCall.timestamp.getTime() - this.timeWindow);
    const timeWindowEnd = new Date(targetCall.timestamp.getTime() + this.timeWindow);

    // Get calls within the time window on the same talkgroup
    const allCalls = await storage.searchCalls({ 
      dateFrom: timeWindowStart,
      dateTo: timeWindowEnd,
      limit: 50 
    });

    return allCalls
      .filter(call => 
        call.id !== targetCall.id &&
        call.talkgroup === targetCall.talkgroup &&
        call.audioSegmentId
      )
      .map(call => ({
        id: call.id,
        timestamp: new Date(call.timestamp),
        audioSegmentId: call.audioSegmentId,
        transcript: call.transcript,
        confidence: call.confidence,
        talkgroup: call.talkgroup,
        duration: call.endMs ? call.endMs - (call.startMs || 0) : 0,
        metadata: call.metadata
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Analyze if two calls should be linked together
   */
  async analyzeLinkCompatibility(call1: CallLinkCandidate, call2: CallLinkCandidate): Promise<number> {
    // Time proximity (closer = higher score)
    const timeDiff = Math.abs(call1.timestamp.getTime() - call2.timestamp.getTime());
    const timeScore = Math.max(0, 1 - (timeDiff / this.timeWindow));

    if (!call1.transcript || !call2.transcript) {
      return timeScore * 0.3; // Low confidence without transcripts
    }

    const transcript1 = call1.transcript.toLowerCase();
    const transcript2 = call2.transcript.toLowerCase();

    // Content compatibility analysis
    let contentScore = 0;

    // Check for complementary content
    const units1 = transcript1.match(/\b(engine|medic|ambulance|truck|ladder)\s+\d+/g) || [];
    const units2 = transcript2.match(/\b(engine|medic|ambulance|truck|ladder)\s+\d+/g) || [];
    const locations1 = transcript1.match(/\b\d+\s+\w+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd)/g) || [];
    const locations2 = transcript2.match(/\b\d+\s+\w+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd)/g) || [];

    // Same units mentioned (continuation of dispatch)
    const commonUnits = units1.filter(unit => units2.includes(unit));
    if (commonUnits.length > 0) {
      contentScore += 0.4;
    }

    // Same location mentioned
    const commonLocations = locations1.filter(loc => locations2.includes(loc));
    if (commonLocations.length > 0) {
      contentScore += 0.3;
    }

    // Complementary patterns (one has units, other has location/type)
    const hasUnits1 = units1.length > 0;
    const hasUnits2 = units2.length > 0;
    const hasLocation1 = locations1.length > 0;
    const hasLocation2 = locations2.length > 0;

    if ((hasUnits1 && hasLocation2) || (hasUnits2 && hasLocation1)) {
      contentScore += 0.3;
    }

    // Sequential speech patterns
    const endsIncomplete1 = /\b(and|to|at|on|near|from)\s*$/.test(transcript1.trim());
    const startsIncomplete2 = /^\s*(the|a|an|of|for|with)\b/.test(transcript2.trim());
    
    if (endsIncomplete1 || startsIncomplete2) {
      contentScore += 0.2;
    }

    return Math.min(1, timeScore * 0.4 + contentScore * 0.6);
  }

  /**
   * Merge audio files and create combined transcript
   */
  async mergeAudioFiles(audioSegmentIds: string[]): Promise<string> {
    const tempDir = join(this.audioDir, 'temp');
    const mergedId = `merged_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outputPath = join(this.audioDir, `${mergedId}.wav`);

    try {
      // Create temporary directory if needed
      try {
        execSync(`mkdir -p "${tempDir}"`);
      } catch (error) {
        // Directory might already exist
      }

      // Find audio files for each segment
      const audioFiles: string[] = [];
      for (const segmentId of audioSegmentIds) {
        const possibleExtensions = ['.wav', '.mp3', '.m4a', '.ogg'];
        let foundFile = false;
        
        for (const ext of possibleExtensions) {
          const filePath = join(this.audioDir, `${segmentId}${ext}`);
          try {
            await readFile(filePath);
            audioFiles.push(filePath);
            foundFile = true;
            break;
          } catch (error) {
            // File doesn't exist, try next extension
          }
        }
        
        if (!foundFile) {
          console.warn(`Audio file not found for segment: ${segmentId}`);
        }
      }

      if (audioFiles.length === 0) {
        throw new Error('No audio files found for merging');
      }

      if (audioFiles.length === 1) {
        // Just copy the single file
        const sourceContent = await readFile(audioFiles[0]);
        await writeFile(outputPath, sourceContent);
      } else {
        // Use ffmpeg to concatenate audio files
        const inputList = audioFiles.map(file => `file '${file}'`).join('\n');
        const listPath = join(tempDir, `concat_${mergedId}.txt`);
        await writeFile(listPath, inputList);

        const ffmpegCmd = `ffmpeg -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}" -y`;
        execSync(ffmpegCmd, { stdio: 'ignore' });
      }

      console.log(`Merged audio created: ${outputPath}`);
      return mergedId;

    } catch (error) {
      console.error('Error merging audio files:', error);
      throw error;
    }
  }

  /**
   * Process call linking for a specific call
   */
  async processCallLinking(callId: number): Promise<boolean> {
    try {
      const call = await storage.getCall(callId);
      if (!call) {
        console.log(`Call ${callId} not found`);
        return false;
      }

      const callCandidate: CallLinkCandidate = {
        id: call.id,
        timestamp: new Date(call.timestamp),
        audioSegmentId: call.audioSegmentId,
        transcript: call.transcript,
        confidence: call.confidence,
        talkgroup: call.talkgroup,
        duration: call.endMs ? call.endMs - (call.startMs || 0) : 0,
        metadata: call.metadata
      };

      // Analyze if this call needs linking
      const analysis = await this.analyzeCallCompleteness(callCandidate);
      
      if (!analysis.isIncomplete) {
        console.log(`Call ${callId} appears complete, no linking needed`);
        return false;
      }

      console.log(`Call ${callId} appears incomplete: ${analysis.reason}`);

      // Find potential candidates
      const candidates = await this.findLinkingCandidates(callCandidate);
      
      if (candidates.length === 0) {
        console.log(`No linking candidates found for call ${callId}`);
        return false;
      }

      // Analyze compatibility with each candidate
      const compatibilityScores = await Promise.all(
        candidates.map(async candidate => ({
          candidate,
          score: await this.analyzeLinkCompatibility(callCandidate, candidate)
        }))
      );

      // Filter candidates with high compatibility
      const viableCandidates = compatibilityScores
        .filter(({ score }) => score > 0.6)
        .sort((a, b) => b.score - a.score);

      if (viableCandidates.length === 0) {
        console.log(`No viable linking candidates found for call ${callId}`);
        return false;
      }

      // Link with the best candidate(s)
      const bestCandidates = viableCandidates.slice(0, 2); // Link up to 2 additional segments
      const segmentIds = [callCandidate.audioSegmentId, ...bestCandidates.map(c => c.candidate.audioSegmentId)];

      console.log(`Linking call ${callId} with calls: ${bestCandidates.map(c => c.candidate.id).join(', ')}`);

      // Merge audio files
      const mergedSegmentId = await this.mergeAudioFiles(segmentIds);

      // Create merged audio segment record
      await storage.createAudioSegment({
        id: mergedSegmentId,
        filepath: join(this.audioDir, `${mergedSegmentId}.wav`),
        duration: 0, // Will be updated after processing
        sampleRate: 8000,
        channels: 1,
        timestamp: callCandidate.timestamp,
        processed: false
      });

      // Transcribe merged audio
      const transcriptionResult = await transcriptionService.transcribeAudioSegment(mergedSegmentId);
      
      if (transcriptionResult) {
        // Apply AI cleanup
        const cleanupResult = await transcriptCleanupService.cleanupTranscript(transcriptionResult.utterance);
        
        // Classify the merged transcript
        const classification = await nlpClassifier.classify(cleanupResult.cleanedTranscript, cleanupResult);

        // Update the original call with merged data
        await storage.updateCall(callId, {
          audioSegmentId: mergedSegmentId,
          transcript: cleanupResult.cleanedTranscript,
          confidence: Math.max(transcriptionResult.confidence, cleanupResult.confidence),
          startMs: transcriptionResult.start_ms,
          endMs: transcriptionResult.end_ms,
          callType: classification.callType,
          location: classification.location,
          keywords: classification.keywords,
          embedding: classification.metadata.embedding,
          urgencyScore: classification.urgencyScore,
          metadata: {
            ...(call.metadata || {}),
            linkedCalls: bestCandidates.map(c => c.candidate.id),
            mergedSegment: true,
            originalSegment: callCandidate.audioSegmentId
          }
        });

        // Mark linked calls as merged (but keep them for reference)
        for (const { candidate } of bestCandidates) {
          await storage.updateCall(candidate.id, {
            status: 'merged',
            metadata: {
              ...(candidate.metadata || {}),
              mergedInto: callId,
              originalSegment: candidate.audioSegmentId
            }
          });
        }

        // Try geocoding if we have a location
        if (classification.location) {
          await geocodingService.geocodeAndUpdateCall(callId);
        }

        console.log(`Successfully linked and processed call ${callId}`);
        this.emit('callLinked', {
          primaryCallId: callId,
          linkedCallIds: bestCandidates.map(c => c.candidate.id),
          mergedSegmentId
        });

        return true;
      }

      return false;

    } catch (error) {
      console.error(`Error processing call linking for call ${callId}:`, error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Process linking for all incomplete calls
   */
  async processAllIncompleteLinks(): Promise<{ processed: number; linked: number }> {
    console.log('Scanning for incomplete calls that need linking...');
    
    const allCalls = await storage.searchCalls({ limit: 200 });
    let processed = 0;
    let linked = 0;

    for (const call of allCalls) {
      if (call.status === 'merged') continue; // Skip already merged calls

      const callCandidate: CallLinkCandidate = {
        id: call.id,
        timestamp: new Date(call.timestamp),
        audioSegmentId: call.audioSegmentId,
        transcript: call.transcript,
        confidence: call.confidence,
        talkgroup: call.talkgroup,
        duration: call.endMs ? call.endMs - (call.startMs || 0) : 0,
        metadata: call.metadata
      };

      const analysis = await this.analyzeCallCompleteness(callCandidate);
      
      if (analysis.isIncomplete) {
        processed++;
        const success = await this.processCallLinking(call.id);
        if (success) {
          linked++;
        }
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Processed ${processed} incomplete calls, successfully linked ${linked}`);
    return { processed, linked };
  }
}

export const callLinkingService = new CallLinkingService();
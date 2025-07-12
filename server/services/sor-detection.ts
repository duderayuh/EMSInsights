// SOR (Signature of Release) detection and physician name extraction service
export interface SORDetectionResult {
  isSOR: boolean;
  physicianName?: string;
  confidence: number;
  extractedText?: string;
}

export class SORDetectionService {
  private sorKeywords = [
    'signature of release',
    'sor',
    's.o.r.',
    'release signature',
    'physician signature',
    'doctor signature',
    'release form',
    'need signature',
    'requesting signature',
    'sign off',
    'physician authorization',
    'doctor authorization',
    'medical authorization'
  ];

  private physicianTitles = [
    'dr.',
    'dr',
    'doctor',
    'physician',
    'doc',
    'provider',
    'attending',
    'resident',
    'intern',
    'hospitalist',
    'emergency physician',
    'emergency doctor',
    'trauma doctor',
    'trauma physician'
  ];

  /**
   * Detect SOR requests and extract physician names from transcript
   */
  detectSOR(transcript: string): SORDetectionResult {
    if (!transcript) {
      return { isSOR: false, confidence: 0 };
    }

    const normalizedText = transcript.toLowerCase().trim();
    
    // Check for SOR keywords
    const sorMatch = this.checkSORKeywords(normalizedText);
    
    // Extract physician name if present
    const physicianName = this.extractPhysicianName(transcript);
    
    let confidence = 0;
    let isSOR = false;

    if (sorMatch.found) {
      isSOR = true;
      confidence += 0.7; // High confidence for explicit SOR keywords
    }

    if (physicianName) {
      isSOR = true; // If physician mentioned, likely SOR related
      confidence += 0.5; // Additional confidence for physician name
    }

    // Adjust confidence based on context
    if (this.hasHospitalContext(normalizedText)) {
      confidence += 0.2;
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    return {
      isSOR,
      physicianName,
      confidence,
      extractedText: sorMatch.matchedText || physicianName
    };
  }

  private checkSORKeywords(text: string): { found: boolean; matchedText?: string } {
    for (const keyword of this.sorKeywords) {
      if (text.includes(keyword)) {
        return { found: true, matchedText: keyword };
      }
    }
    return { found: false };
  }

  private extractPhysicianName(transcript: string): string | undefined {
    const words = transcript.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[.,;:!?]/g, '');
      
      // Check if current word is a physician title
      if (this.physicianTitles.includes(word)) {
        // Look for name following the title
        const nameCandidate = this.extractNameAfterTitle(words, i);
        if (nameCandidate) {
          return nameCandidate;
        }
      }
    }

    // Also check for patterns like "This is Dr. Smith" or "Dr. Johnson speaking"
    return this.extractNameFromPhrase(transcript);
  }

  private extractNameAfterTitle(words: string[], titleIndex: number): string | undefined {
    const maxNameLength = 3; // Max words to consider for a name
    const nameWords: string[] = [];

    for (let i = titleIndex + 1; i < Math.min(words.length, titleIndex + 1 + maxNameLength); i++) {
      const word = words[i].replace(/[.,;:!?]/g, '');
      
      // Stop if we hit another common word that's not a name
      if (this.isCommonWord(word.toLowerCase())) {
        break;
      }

      // Check if word looks like a name (capitalized, alphabetic)
      if (this.looksLikeName(word)) {
        nameWords.push(word);
      } else {
        break;
      }
    }

    if (nameWords.length > 0) {
      return nameWords.join(' ');
    }

    return undefined;
  }

  private extractNameFromPhrase(transcript: string): string | undefined {
    // Patterns like "This is Dr. Smith", "Dr. Johnson speaking", etc.
    const patterns = [
      /(?:this is|speaking is|i am|my name is)\s+(dr\.?|doctor|physician)\s+([a-z]+(?:\s+[a-z]+)?)/i,
      /(dr\.?|doctor|physician)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:speaking|here|available)/i,
      /physician\s+([a-z]+(?:\s+[a-z]+)?)/i
    ];

    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match && match[2]) {
        return this.cleanPhysicianName(match[2]);
      } else if (match && match[1] && this.looksLikeName(match[1])) {
        return this.cleanPhysicianName(match[1]);
      }
    }

    return undefined;
  }

  private cleanPhysicianName(name: string): string {
    return name
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  private looksLikeName(word: string): boolean {
    // Check if word looks like a proper name
    return /^[A-Z][a-z]+$/.test(word) && word.length >= 2 && word.length <= 20;
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      'and', 'or', 'but', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for',
      'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
      'this', 'that', 'these', 'those', 'here', 'there', 'where', 'when', 'how',
      'what', 'who', 'why', 'we', 'need', 'requesting', 'please', 'can', 'you'
    ];
    return commonWords.includes(word);
  }

  private hasHospitalContext(text: string): boolean {
    const hospitalKeywords = [
      'hospital', 'emergency', 'patient', 'medical', 'treatment', 'admission',
      'discharge', 'transfer', 'room', 'bed', 'unit', 'department', 'staff'
    ];
    
    return hospitalKeywords.some(keyword => text.includes(keyword));
  }
}

export const sorDetectionService = new SORDetectionService();
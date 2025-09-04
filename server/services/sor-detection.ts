// SOR (Signature of Release) detection and physician name extraction service
import { distance as leven } from 'fastest-levenshtein';
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
    'medical authorization',
    'need orders',
    'requesting orders',
    'physician orders',
    'doctor orders',
    'medical orders',
    'orders requested',
    'requesting medical orders',
    'need physician orders'
  ];
  
  // These are courtesy phrases, not actual SOR requests
  private courtesyPhrases = [
    'any questions or orders',
    'questions or orders at this time',
    'if you have any questions or orders',
    'do you have any orders'
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
    
    // Handle Unicode replacement markers
    if (normalizedText === '[static]' || normalizedText === '[unable to transcribe]') {
      return { isSOR: false, confidence: 0, extractedText: 'Non-speech audio' };
    }
    
    // Check if this is just a courtesy phrase, not an actual SOR request
    const isCourtesyPhrase = this.courtesyPhrases.some(phrase => normalizedText.includes(phrase));
    if (isCourtesyPhrase) {
      return { isSOR: false, confidence: 0.1, extractedText: 'Courtesy phrase detected' };
    }
    
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
      // Only count physician name if there's also an SOR keyword
      if (sorMatch.found) {
        confidence += 0.3; // Additional confidence for physician name
      } else {
        // Just mentioning a physician doesn't make it an SOR
        confidence += 0.1;
      }
    }
    
    // Check for EMS-to-hospital communication patterns
    // Only add to confidence if SOR keywords already found, don't trigger SOR by itself
    if (sorMatch.found && this.hasEMSHospitalContext(normalizedText)) {
      confidence += 0.2; // Small boost for proper context
    }

    // Adjust confidence based on context
    if (isSOR && this.hasHospitalContext(normalizedText)) {
      confidence += 0.1;
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
    // First try exact match
    for (const keyword of this.sorKeywords) {
      if (text.includes(keyword)) {
        return { found: true, matchedText: keyword };
      }
    }
    
    // Then try fuzzy matching for common variations
    const words = text.split(/\s+/);
    for (const word of words) {
      // Special handling for "SOR" variations
      if (this.isSORVariation(word)) {
        return { found: true, matchedText: `SOR variation: ${word}` };
      }
      
      // Fuzzy match against keywords (allow up to 2 character differences)
      for (const keyword of this.sorKeywords) {
        if (this.fuzzyMatch(word, keyword, 2)) {
          return { found: true, matchedText: `Fuzzy match: ${keyword}` };
        }
      }
    }
    
    // Check for phonetic variations and misspellings
    const phoneticPatterns = [
      /\bs\.?\s*o\.?\s*r\.?/i,  // S.O.R, S O R, etc.
      /\bsor\b/i,  // SOR in any case
      /\bsignature\s+(?:of\s+)?release/i,
      /\bsign\s*off\s*release/i,
      /\bphysician\s+sign/i,
      /\bdoctor\s+sign/i,
      /\bneed\s+(?:a\s+)?signature/i,
      /\brequesting\s+(?:a\s+)?signature/i,
      /\bmedical\s+authorization/i,
      /\bphysician\s+authorization/i
    ];
    
    for (const pattern of phoneticPatterns) {
      const match = text.match(pattern);
      if (match) {
        return { found: true, matchedText: match[0] };
      }
    }
    
    return { found: false };
  }
  
  /**
   * Check if a word is likely a variation of "SOR"
   */
  private isSORVariation(word: string): boolean {
    const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
    
    // Direct SOR variations
    const sorVariations = ['sor', 'soar', 'soor', 'sorr', 'sor', 's0r'];
    if (sorVariations.includes(normalized)) {
      return true;
    }
    
    // Check if it's close to "sor" (1 character difference)
    if (normalized.length >= 2 && normalized.length <= 4) {
      const distance = leven(normalized, 'sor');
      if (distance <= 1) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Fuzzy string matching using Levenshtein distance
   */
  private fuzzyMatch(str1: string, str2: string, maxDistance: number): boolean {
    if (str1.length < 3 || str2.length < 3) {
      return false; // Don't fuzzy match very short strings
    }
    
    const distance = leven(str1.toLowerCase(), str2.toLowerCase());
    return distance <= maxDistance;
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

  private hasEMSHospitalContext(text: string): boolean {
    const emsKeywords = [
      'medic',
      'ambulance',
      'ems',
      'patient',
      'vitals',
      'blood pressure',
      'heart rate',
      'eta',
      'transport',
      'arrival',
      'questions or orders',
      'any orders',
      'orders at this time'
    ];
    
    return emsKeywords.some(keyword => text.includes(keyword));
  }
}

export const sorDetectionService = new SORDetectionService();
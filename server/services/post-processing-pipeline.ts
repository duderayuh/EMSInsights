// @ts-ignore - parse-address doesn't have TypeScript types
import * as parseAddressModule from 'parse-address';
const { parseAddress } = parseAddressModule;
import { db } from '../db.js';
import { transcriptionDictionary } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import { advancedAddressExtractor } from './advanced-address-extractor.js';

export interface PostProcessingResult {
  cleanedTranscript: string;
  isNoise: boolean;
  isHallucination: boolean;
  extractedAddress?: string;
  extractedUnits?: string[];
  extractedCallType?: string;
  parseErrors?: string[];
  confidence: number;
}

interface DictionaryEntry {
  id: number;
  wrongWord: string;
  correctWord: string;
  category?: string | null;
}

export class PostProcessingPipeline {
  private transcriptionDictionary: DictionaryEntry[] = [];
  
  constructor() {
    // Load transcription dictionary on initialization
    this.loadTranscriptionDictionary();
  }

  private async loadTranscriptionDictionary() {
    try {
      const entries = await db.select()
        .from(transcriptionDictionary)
        .where(eq(transcriptionDictionary.isActive, true));
      
      this.transcriptionDictionary = entries.map(entry => ({
        id: entry.id,
        wrongWord: entry.wrongWord,
        correctWord: entry.correctWord,
        category: entry.category
      }));
      
      console.log(`Loaded ${this.transcriptionDictionary.length} transcription dictionary entries`);
    } catch (error) {
      console.error('Error loading transcription dictionary:', error);
    }
  }

  // Public method to reload dictionary (e.g., after admin updates)
  async reloadDictionary() {
    await this.loadTranscriptionDictionary();
  }

  private async applyTranscriptionDictionary(transcript: string): Promise<string> {
    let corrected = transcript;
    const appliedCorrections: { from: string; to: string; id: number }[] = [];
    
    // Apply each dictionary entry
    for (const entry of this.transcriptionDictionary) {
      // Create a case-insensitive regex with word boundaries
      const regex = new RegExp(`\\b${entry.wrongWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      
      if (regex.test(corrected)) {
        corrected = corrected.replace(regex, entry.correctWord);
        appliedCorrections.push({
          from: entry.wrongWord,
          to: entry.correctWord,
          id: entry.id
        });
      }
    }
    
    // Log corrections for debugging
    if (appliedCorrections.length > 0) {
      console.log('Applied transcription dictionary corrections:', appliedCorrections);
      
      // Increment usage count for applied corrections
      for (const correction of appliedCorrections) {
        try {
          await db.update(transcriptionDictionary)
            .set({ usageCount: sql`${transcriptionDictionary.usageCount} + 1` })
            .where(eq(transcriptionDictionary.id, correction.id));
        } catch (error) {
          console.error(`Error incrementing usage count for dictionary entry ${correction.id}:`, error);
        }
      }
    }
    
    return corrected;
  }

  private hallucationBlacklist: RegExp[] = [
    // YouTube/media artifacts
    /thank you for watching/i,
    /thanks for watching/i,
    /please subscribe/i,
    /subscribe to/i,
    /like and subscribe/i,
    /www\./i,
    /\.com/i,
    /http/i,
    /visit our website/i,
    /for more.*videos/i,
    /for more.*information/i,
    /click.*link/i,
    /download.*app/i,
    /follow us/i,
    /social media/i,
    
    // Media endings
    /the end/i,
    /to be continued/i,
    /stay tuned/i,
    /coming up next/i,
    /previously on/i,
    
    // Transcription artifacts
    /\[music\]/i,
    /\[applause\]/i,
    /\[laughter\]/i,
    /copyright/i,
    /all rights reserved/i,
    
    // Non-speech indicators
    /do not generate text for non-speech audio/i,
    /audio unavailable/i,
    /no speech detected/i,
  ];

  private beepPatterns: RegExp[] = [
    /^\s*\{beeping\}\s*$/i,
    /^\s*\{beep\}\s*$/i,
    /^\s*\[beeping\]\s*$/i,
    /^\s*\[beep\]\s*$/i,
    /^\s*beep+\s*$/i,
    /^\s*tone+\s*$/i,
  ];

  private unitPatterns: RegExp[] = [
    /\b(medic|engine|ambulance|rescue|squad|unit)\s*\d+/gi,
    /\b(med|eng|amb|res|sq)\s*\d+/gi,
  ];

  async process(transcript: string, confidence: number): Promise<PostProcessingResult> {
    const errors: string[] = [];
    let cleanedTranscript = transcript.trim();
    
    // Step 1: Check for pure noise/beeps
    const isNoise = this.isNoiseOnly(cleanedTranscript);
    if (isNoise) {
      return {
        cleanedTranscript: '{beeping}',
        isNoise: true,
        isHallucination: false,
        confidence: 0.1,
        parseErrors: ['Audio contains only beeps/tones']
      };
    }

    // Step 2: Check for hallucinations
    const hallucination = this.detectHallucination(cleanedTranscript);
    if (hallucination.isHallucination) {
      // Remove hallucinated content
      cleanedTranscript = hallucination.cleanedText;
      errors.push(`Removed hallucination: ${hallucination.removedText}`);
      
      // If nothing left after removing hallucinations, mark as non-emergency
      if (!cleanedTranscript || cleanedTranscript.length < 5) {
        return {
          cleanedTranscript: '',
          isNoise: false,
          isHallucination: true,
          confidence: 0.1,
          parseErrors: errors
        };
      }
    }

    // Step 3: Apply transcription dictionary corrections
    cleanedTranscript = await this.applyTranscriptionDictionary(cleanedTranscript);
    
    // Step 4: Fix common transcription errors
    cleanedTranscript = this.fixTranscriptionErrors(cleanedTranscript);

    // Step 4: Extract units
    const extractedUnits = this.extractUnits(cleanedTranscript);

    // Step 5: Parse and normalize address
    const addressResult = await this.parseAndNormalizeAddress(cleanedTranscript);
    if (addressResult.error) {
      errors.push(addressResult.error);
    }

    // Step 6: Extract call type (basic extraction, NLP classifier will do detailed work)
    const extractedCallType = this.extractBasicCallType(cleanedTranscript);

    return {
      cleanedTranscript,
      isNoise: false,
      isHallucination: hallucination.isHallucination,
      extractedAddress: addressResult.address,
      extractedUnits,
      extractedCallType,
      parseErrors: errors.length > 0 ? errors : undefined,
      confidence: this.adjustConfidence(confidence, errors.length, hallucination.isHallucination)
    };
  }

  private isNoiseOnly(transcript: string): boolean {
    const text = transcript.toLowerCase().trim();
    
    // Check if it matches any beep pattern
    return this.beepPatterns.some(pattern => pattern.test(text));
  }

  private detectHallucination(transcript: string): { isHallucination: boolean; cleanedText: string; removedText?: string } {
    let cleanedText = transcript;
    let removedText = '';
    let isHallucination = false;

    // Check each blacklist pattern
    for (const pattern of this.hallucationBlacklist) {
      const match = cleanedText.match(pattern);
      if (match) {
        isHallucination = true;
        removedText += match[0] + ' ';
        cleanedText = cleanedText.replace(pattern, ' ').trim();
      }
    }

    // Clean up multiple spaces
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

    return {
      isHallucination,
      cleanedText,
      removedText: removedText.trim()
    };
  }

  private fixTranscriptionErrors(transcript: string): string {
    let fixed = transcript;

    // Common dispatch audio corrections
    const corrections: [RegExp, string][] = [
      // Split numbers that should be together
      [/\b(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3$4'], // "9 0 1 5" -> "9015"
      [/\b(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3'], // "7 1 2" -> "712"
      
      // Fix unit number concatenation issues (e.g., "Ambulance 432318" -> "Ambulance 43, 2318")
      [/\b(ambulance|medic|engine|ladder|squad|rescue)\s*(\d{2})(\d{4})\b/gi, '$1 $2, $3'],
      [/\b(ambulance|medic|engine|ladder|squad|rescue)\s*(\d{2})-(\d{4})\b/gi, '$1 $2, $3'],
      
      // Hospital identification corrections (context-sensitive)
      [/(\bmedic\s+\d+,?\s+this\s+is\s+)negative/gi, '$1Methodist'],
      [/(\bmedic\s+\d+,?\s+)negative(\s+here)?/gi, '$1Methodist$2'],
      [/\bthis\s+is\s+negative\b/gi, 'this is Methodist'],
      [/\bnegative\s+here\b/gi, 'Methodist here'],
      [/\bnegative\s+receiving\b/gi, 'Methodist receiving'],
      [/\bnegative\s+hospital\b/gi, 'Methodist Hospital'],
      
      // Other hospital name corrections
      [/\brelease\s+hospital?\b/gi, 'Riley Hospital'],
      [/\brelease\s+children\b/gi, 'Riley Children'],
      [/\besken[ao]z[io]\b/gi, 'Eskenazi'],
      [/\buniversity\s+medical\b/gi, 'University Hospital'],
      [/\bsaint\s+vincent\b/gi, 'St. Vincent'],
      [/\bfrancis[ck]an\b/gi, 'Franciscan'],
      
      // Street name corrections
      [/\bNorth Tv on the street\b/gi, 'North Tremont Street'],
      [/\bTv on the street\b/gi, 'Tremont Street'],
      
      // Emergency terminology corrections
      [/\bfalse trauma\b/gi, 'assault trauma'],
      [/\bC and A secure\b/gi, 'scene not secure'],
      
      // Time format corrections
      [/\b0,?\s*0,?\s*50\s*hours?\b/gi, '0050 hours'],
      [/\b(\d),?\s*(\d),?\s*(\d{2})\s*hours?\b/gi, '$1$2$3 hours'],
      
      // Address formatting improvements
      [/\b(\d+),?\s*North\s+Tv\s+on\s+the\s+left\b/gi, '$1 North 2500 West'],
      [/\blocation\s+(\d+),?\s*(\w+)\s+(\d+),?\s*west\b/gi, '$1 $2 & $3 West'],
      
      // Medical terminology corrections
      [/\btessane?\s*park\b/gi, 'chest pain'],
      [/\bsieg-?hurzen\b/gi, 'sick person'],
      [/\badorno-?batain\s*v?\b/gi, 'abdominal pain'],
      [/\bcedar\b/gi, 'seizure'],
      
      // Radio communication improvements
      [/\bcopy\s+that\s+see\s+you\s+inside\b/gi, 'copy that, see you inside'],
      [/\b10-?\s*4\b/gi, '10-4'],
      [/\broger\s+that\b/gi, 'roger'],
      
      // Fix spacing issues
      [/medic(\d)/gi, 'Medic $1'],
      [/engine(\d)/gi, 'Engine $1'],
      [/ambulance(\d)/gi, 'Ambulance $1'],
      
      // Remove duplicate phrases
      [/(.+)\s+\1/g, '$1'], // Remove exact duplicates
    ];

    for (const [pattern, replacement] of corrections) {
      fixed = fixed.replace(pattern, replacement);
    }

    return fixed.trim();
  }

  private extractUnits(transcript: string): string[] {
    const units: string[] = [];
    const matches = transcript.matchAll(this.unitPatterns[0]) || [];
    
    for (const match of matches) {
      units.push(match[0]);
    }

    // Also check abbreviated forms
    const abbrevMatches = transcript.matchAll(this.unitPatterns[1]) || [];
    for (const match of abbrevMatches) {
      units.push(match[0]);
    }

    return [...new Set(units)]; // Remove duplicates
  }

  private async parseAndNormalizeAddress(transcript: string): Promise<{ address?: string; error?: string }> {
    try {
      // Use the advanced address extractor for comprehensive address detection
      const result = await advancedAddressExtractor.extractAddress(transcript);
      
      if (result.address && result.confidence > 0.6) {
        return { address: result.address };
      }
      
      // If advanced extractor failed, try the legacy fallback method
      return this.legacyAddressExtraction(transcript);
    } catch (error) {
      console.error('Advanced address extraction failed:', error);
      // Fallback to legacy method if advanced fails
      return this.legacyAddressExtraction(transcript);
    }
  }

  private legacyAddressExtraction(transcript: string): { address?: string; error?: string } {
    try {
      // Simplified fallback patterns for when advanced extractor fails
      const patterns = [
        // Simple street address
        /\b(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/i,
        
        // Simple intersection
        /\b([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\s+(?:and|&|\bat\b)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\b/i
      ];

      for (const pattern of patterns) {
        const match = transcript.match(pattern);
        if (match) {
          return { address: this.cleanupAddress(match[0]) };
        }
      }

      return { error: 'No address found in transcript' };
    } catch (error) {
      return { error: `Legacy address parsing error: ${error}` };
    }
  }

  private cleanupAddress(address: string): string {
    let cleaned = address
      .replace(/\s+/g, ' ')
      .replace(/[,\-]\s*/g, ', ')
      .trim();
    
    // Expand common abbreviations
    const abbreviations: [RegExp, string][] = [
      [/\bst\.?\b/gi, 'Street'],
      [/\bave\.?\b/gi, 'Avenue'],
      [/\brd\.?\b/gi, 'Road'],
      [/\bdr\.?\b/gi, 'Drive'],
      [/\bln\.?\b/gi, 'Lane'],
      [/\bpl\.?\b/gi, 'Place'],
      [/\bct\.?\b/gi, 'Court'],
      [/\bcir\.?\b/gi, 'Circle'],
      [/\bblvd\.?\b/gi, 'Boulevard'],
      [/\bpkwy\.?\b/gi, 'Parkway'],
      [/\bter\.?\b/gi, 'Terrace'],
      [/\bhwy\.?\b/gi, 'Highway'],
      [/\bxing\.?\b/gi, 'Crossing'],
      [/\bn\.?\b(?!\w)/gi, 'North'],
      [/\bs\.?\b(?!\w)/gi, 'South'],
      [/\be\.?\b(?!\w)/gi, 'East'],
      [/\bw\.?\b(?!\w)/gi, 'West'],
      [/\bapt\.?\b/gi, 'Apartment'],
      [/\b&\b/g, 'and']
    ];
    
    for (const [pattern, replacement] of abbreviations) {
      cleaned = cleaned.replace(pattern, replacement);
    }
    
    // Ensure proper capitalization
    cleaned = cleaned.replace(/\b\w/g, letter => letter.toUpperCase());
    
    return cleaned;
  }

  private extractBasicCallType(transcript: string): string | undefined {
    const text = transcript.toLowerCase();
    
    // Common call type patterns in dispatch audio
    const callTypePatterns: [RegExp, string][] = [
      [/cardiac arrest/i, 'Cardiac Arrest'],
      [/chest pain/i, 'Chest Pain/Heart'],
      [/difficulty breathing/i, 'Difficulty Breathing'],
      [/seizure/i, 'Seizure'],
      [/unconscious/i, 'Unconscious Person'],
      [/overdose/i, 'Overdose'],
      [/mvc|motor vehicle|vehicle accident/i, 'Vehicle Accident'],
      [/assault/i, 'Assault'],
      [/gsw|gunshot/i, 'Gunshot Wound'],
      [/fire/i, 'Fire'],
      [/sick person/i, 'Sick Person'],
      [/mental|emotional|psychiatric/i, 'Mental/Emotional'],
      [/diabetic/i, 'Diabetic'],
      [/bleeding/i, 'Bleeding'],
      [/fall/i, 'Fall'],
      [/trauma/i, 'Trauma'],
    ];

    for (const [pattern, callType] of callTypePatterns) {
      if (pattern.test(text)) {
        return callType;
      }
    }

    return undefined;
  }

  private adjustConfidence(originalConfidence: number, errorCount: number, hasHallucination: boolean): number {
    let adjusted = originalConfidence;
    
    // Reduce confidence for each error
    adjusted -= errorCount * 0.05;
    
    // Reduce confidence if hallucination was detected
    if (hasHallucination) {
      adjusted -= 0.15;
    }
    
    // Ensure confidence stays within bounds
    return Math.max(0.1, Math.min(0.95, adjusted));
  }
}

// Create singleton instance
export const postProcessingPipeline = new PostProcessingPipeline();

// Initialize the dictionary loading after a brief delay to ensure DB is ready
setTimeout(() => {
  postProcessingPipeline.reloadDictionary().catch(error => {
    console.error('Failed to load transcription dictionary on startup:', error);
  });
}, 1000);
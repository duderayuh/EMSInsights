import { storage } from "../storage";
import { NLPClassifier } from "../services/nlp-classifier";
import { geocodingService } from "../services/geocoding";
import { VoiceTypeClassifier } from "../services/voice-type-classifier";

interface TranscriptionFixResult {
  processed: number;
  reclassified: number;
  geocoded: number;
  errors: string[];
}

export class TranscriptionFixer {
  private voiceTypeClassifier = new VoiceTypeClassifier();
  private nlpClassifier = new NLPClassifier();

  async fixAllTranscriptions(): Promise<TranscriptionFixResult> {
    const result: TranscriptionFixResult = {
      processed: 0,
      reclassified: 0,
      geocoded: 0,
      errors: []
    };

    console.log("Starting comprehensive transcription fix...");

    try {
      // Get all calls that need fixing (using large limit to get all calls)
      const allCalls = await storage.getRecentCalls(10000); // Get up to 10,000 recent calls
      console.log(`Found ${allCalls.length} total calls to process`);

      // Process calls in batches
      const batchSize = 50;
      for (let i = 0; i < allCalls.length; i += batchSize) {
        const batch = allCalls.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allCalls.length / batchSize)}`);

        for (const call of batch) {
          try {
            await this.fixSingleCall(call, result);
            result.processed++;
          } catch (error) {
            result.errors.push(`Call ${call.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      result.errors.push(`Overall error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log("Transcription fix completed:", result);
    return result;
  }

  private async fixSingleCall(call: any, result: TranscriptionFixResult): Promise<void> {
    let needsUpdate = false;
    const updates: any = {};

    // 1. Fix call type if it's "Unknown"
    if (call.callType === "Unknown" || call.callType === "Unknown Call Type") {
      const transcript = call.transcript || "";
      
      // Skip obvious non-emergency content
      if (this.isNonEmergencyContent(transcript)) {
        console.log(`Skipping non-emergency content: ${call.id} - "${transcript.substring(0, 50)}..."`);
        return;
      }

      // Reclassify using NLP
      const classification = await this.nlpClassifier.classifyCall(transcript);
      if (classification.callType && classification.callType !== "Unknown") {
        updates.callType = classification.callType;
        updates.keywords = classification.keywords;
        needsUpdate = true;
        result.reclassified++;
        console.log(`Reclassified call ${call.id}: "${transcript.substring(0, 50)}..." -> ${classification.callType}`);
      }
    }

    // 2. Fix location if missing
    if (!call.location || call.location === "" || call.location === "none") {
      const transcript = call.transcript || "";
      
      // Extract location from transcript
      const locationMatch = this.extractLocationFromTranscript(transcript);
      if (locationMatch) {
        try {
          const geocoded = await geocodingService.geocodeAddress(locationMatch);
          if (geocoded.success && geocoded.latitude && geocoded.longitude) {
            updates.location = geocoded.address || locationMatch;
            updates.latitude = geocoded.latitude;
            updates.longitude = geocoded.longitude;
            needsUpdate = true;
            result.geocoded++;
            console.log(`Geocoded call ${call.id}: "${locationMatch}" -> ${geocoded.address}`);
          }
        } catch (error) {
          console.log(`Geocoding failed for call ${call.id}: ${error}`);
        }
      }
    }

    // 3. Update voice type if needed
    if (!call.voiceType) {
      const voiceType = this.voiceTypeClassifier.classifyVoiceType(call.talkgroup);
      if (voiceType) {
        updates.voiceType = voiceType;
        needsUpdate = true;
      }
    }

    // Apply updates if needed
    if (needsUpdate) {
      await storage.updateCall(call.id, updates);
    }
  }

  private isNonEmergencyContent(transcript: string): boolean {
    const nonEmergencyPatterns = [
      // Beeping sound patterns (most common hallucinations)
      /\{beeping\}/i,
      /\{beep\}/i,
      /for more.*videos.*visit/i,
      /for more.*information.*visit/i,
      /www\./i,
      /thank you for watching/i,
      /subscribe/i,
      /isglobal/i,
      /to be continued/i,
      /the end/i,
      /r\.?i\.?p\.?/i,
      // Generic patterns
      /^[\d\s-]+$/,  // Only numbers and spaces
      /^[a-z\s]*$/i,  // Only single words
      /pause/i,
      /test/i,
      /^.{1,10}$/,  // Very short content
      /^\s*$/,      // Empty or whitespace only
      /click/i,
      /beep/i,
      /tone/i,
      /static/i,
      /interference/i,
      /signal/i,
      /error/i,
      /timeout/i,
      /connection/i,
      /failed/i
    ];

    return nonEmergencyPatterns.some(pattern => pattern.test(transcript));
  }

  private extractLocationFromTranscript(transcript: string): string | null {
    // Common emergency dispatch address patterns
    const addressPatterns = [
      // Street addresses with numbers
      /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Circle|Cir|Court|Ct|Place|Pl|Terrace|Ter|Way)\b/gi,
      // Interstate/Highway
      /\b(?:I-?\d{1,3}|Interstate\s+\d{1,3}|Highway\s+\d{1,3}|US\s+\d{1,3})\b/gi,
      // Mile markers
      /\b\d{1,3}\s+mile\s+marker?\b/gi,
      // Intersections
      /\b[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd)\s+(?:and|&|\+)\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd)\b/gi
    ];

    for (const pattern of addressPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }

    return null;
  }

  async fixUnknownCalls(): Promise<TranscriptionFixResult> {
    const result: TranscriptionFixResult = {
      processed: 0,
      reclassified: 0,
      geocoded: 0,
      errors: []
    };

    console.log("Fixing Unknown call types...");

    try {
      // Get all calls with Unknown type
      const allCalls = await storage.getRecentCalls(10000);
      const unknownCalls = allCalls.filter(call => 
        call.callType === "Unknown" || call.callType === "Unknown Call Type"
      );

      console.log(`Found ${unknownCalls.length} unknown calls to reclassify`);

      for (const call of unknownCalls) {
        try {
          await this.fixSingleCall(call, result);
          result.processed++;
        } catch (error) {
          result.errors.push(`Call ${call.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

    } catch (error) {
      result.errors.push(`Error fixing unknown calls: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  async fixMissingLocations(): Promise<TranscriptionFixResult> {
    const result: TranscriptionFixResult = {
      processed: 0,
      reclassified: 0,
      geocoded: 0,
      errors: []
    };

    console.log("Fixing missing locations...");

    try {
      // Get all calls with missing locations
      const allCalls = await storage.getRecentCalls(10000);
      const missingLocationCalls = allCalls.filter(call => 
        !call.location || call.location === "" || call.location === "none"
      );

      console.log(`Found ${missingLocationCalls.length} calls with missing locations`);

      for (const call of missingLocationCalls) {
        try {
          await this.fixSingleCall(call, result);
          result.processed++;
        } catch (error) {
          result.errors.push(`Call ${call.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

    } catch (error) {
      result.errors.push(`Error fixing locations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }
}

// Export for use in API endpoints
export const transcriptionFixer = new TranscriptionFixer();
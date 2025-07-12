import { storage } from "../storage";

interface BeepingFixResult {
  processed: number;
  updated: number;
  errors: string[];
}

export class BeepingTranscriptFixer {
  async fixBeepingTranscripts(): Promise<BeepingFixResult> {
    const result: BeepingFixResult = {
      processed: 0,
      updated: 0,
      errors: []
    };

    console.log("Starting beeping transcript fix...");

    try {
      // Get all calls to process
      const allCalls = await storage.getRecentCalls(10000);
      console.log(`Found ${allCalls.length} total calls to process`);

      // Filter calls that have beeping-related hallucinations
      const beepingHallucinations = [
        /for more.*un.*videos.*visit.*www/i,
        /for more.*information.*visit.*www.*isglobal/i,
        /for more.*information.*visit.*www/i,
        /thank you for watching/i,
        /subscribe/i,
        /to be continued/i,
        /the end/i,
        /r\.?i\.?p/i,
      ];

      for (const call of allCalls) {
        result.processed++;
        
        if (!call.transcript) {
          continue;
        }

        let needsUpdate = false;
        let updatedTranscript = call.transcript;

        // Check for beeping hallucinations and patterns with extra text
        for (const pattern of beepingHallucinations) {
          if (pattern.test(call.transcript)) {
            updatedTranscript = call.transcript.replace(pattern, '{beeping}');
            needsUpdate = true;
            console.log(`Fixed beeping hallucination in call ${call.id}: "${call.transcript}" -> "${updatedTranscript}"`);
            break;
          }
        }
        
        // Also check for beeping patterns with extra text that should be filtered
        const beepingWithExtraText = [
          /\{beeping\}.*$/i,     // {beeping} with trailing text
          /^.*\{beeping\}.*$/i,  // Any text containing {beeping}
          /\{beep\}.*$/i,        // {beep} with trailing text
          /^.*\{beep\}.*$/i,     // Any text containing {beep}
        ];
        
        if (!needsUpdate) {
          for (const pattern of beepingWithExtraText) {
            if (pattern.test(call.transcript)) {
              updatedTranscript = '{beeping}';
              needsUpdate = true;
              console.log(`Fixed beeping with extra text in call ${call.id}: "${call.transcript}" -> "${updatedTranscript}"`);
              break;
            }
          }
        }

        if (needsUpdate) {
          try {
            await storage.updateCall(call.id, { 
              transcript: updatedTranscript,
              callType: "Non-Emergency Content", // Mark as non-emergency
              confidence: 0.1 // Low confidence to filter from frontend
            });
            result.updated++;
          } catch (error) {
            result.errors.push(`Call ${call.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

    } catch (error) {
      result.errors.push(`Overall error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log("Beeping transcript fix completed:", result);
    return result;
  }
}

export const beepingTranscriptFixer = new BeepingTranscriptFixer();
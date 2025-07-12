import { config } from 'dotenv';
config();

import { db } from '../db';
import { calls, audioSegments } from '../../shared/schema';
import { transcriptionService } from '../services/transcription';
import { nlpClassifier } from '../services/nlp-classifier';
import { googleAddressValidation } from '../services/google-address-validation';
import { eq, or, lt, like, and } from 'drizzle-orm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as Database from 'better-sqlite3';

interface RetranscriptionStats {
  totalProblemCalls: number;
  retranscribed: number;
  improved: number;
  errors: number;
  noAudioFound: number;
  beepingFixed: number;
  unknownFixed: number;
  lowConfidenceFixed: number;
}

export async function retranscribeProblemCalls(limit?: number): Promise<RetranscriptionStats> {
  const stats: RetranscriptionStats = {
    totalProblemCalls: 0,
    retranscribed: 0,
    improved: 0,
    errors: 0,
    noAudioFound: 0,
    beepingFixed: 0,
    unknownFixed: 0,
    lowConfidenceFixed: 0
  };

  try {
    // Find problem calls
    console.log('Finding problem calls...');
    const problemCalls = await db.select()
      .from(calls)
      .where(
        or(
          lt(calls.confidence, 0.30),
          like(calls.transcript, '%{beeping}%'),
          like(calls.transcript, '%{beep}%'),
          eq(calls.callType, 'Unknown Call Type'),
          eq(calls.callType, 'Non-Emergency Content')
        )
      )
      .limit(limit || 5000);

    stats.totalProblemCalls = problemCalls.length;
    console.log(`Found ${stats.totalProblemCalls} problem calls to retranscribe`);

    // Process each problem call
    for (const call of problemCalls) {
      try {
        console.log(`\nProcessing problem call ${call.id}`);
        console.log(`- Original transcript: ${call.transcript?.substring(0, 100)}...`);
        console.log(`- Original confidence: ${call.confidence}`);
        console.log(`- Original call type: ${call.callType}`);

        // Try to find the audio
        let audioBuffer: Buffer | null = null;
        let audioFound = false;

        // First check if we have an audioSegmentId
        if (call.audioSegmentId) {
          // Check audio_segments table
          const segments = await db.select()
            .from(audioSegments)
            .where(eq(audioSegments.id, call.audioSegmentId))
            .limit(1);

          if (segments.length > 0 && segments[0].filepath) {
            // Check if file exists
            if (existsSync(segments[0].filepath)) {
              audioBuffer = readFileSync(segments[0].filepath);
              audioFound = true;
              console.log(`- Found audio in filesystem: ${segments[0].filepath}`);
            }
          }
        }

        // If not found, try rdio-scanner database
        if (!audioFound && call.rdioCallId) {
          try {
            const rdioDbPath = join(process.cwd(), 'rdio-scanner.db');
            if (existsSync(rdioDbPath)) {
              const rdioDb = new Database(rdioDbPath, { readonly: true });
              const stmt = rdioDb.prepare('SELECT audio, audioType FROM rdio_scanner_calls WHERE id = ?');
              const result = stmt.get(call.rdioCallId) as { audio: Buffer; audioType: string } | undefined;
              
              if (result && result.audio) {
                audioBuffer = result.audio;
                audioFound = true;
                console.log(`- Found audio in rdio-scanner.db`);
              }
              
              rdioDb.close();
            }
          } catch (error) {
            console.error(`Error accessing rdio-scanner.db:`, error);
          }
        }

        if (!audioFound || !audioBuffer) {
          console.log('- No audio found, skipping');
          stats.noAudioFound++;
          continue;
        }

        // Retranscribe the audio
        console.log('- Retranscribing audio...');
        const transcriptionResult = await transcriptionService.transcribeAudioBuffer(
          audioBuffer,
          call.audioSegmentId || `call-${call.id}`
        );

        if (!transcriptionResult) {
          console.log('- Transcription failed');
          stats.errors++;
          continue;
        }

        console.log(`- New transcript: ${transcriptionResult.utterance?.substring(0, 100)}...`);
        console.log(`- New confidence: ${transcriptionResult.confidence}`);

        // Check if transcript improved
        const oldWasBeeping = call.transcript?.includes('{beeping}') || call.transcript?.includes('{beep}');
        const newIsBeeping = transcriptionResult.utterance?.includes('{beeping}') || transcriptionResult.utterance?.includes('{beep}');
        
        let improved = false;
        
        // Track what was fixed
        if (oldWasBeeping && !newIsBeeping && transcriptionResult.confidence > 0.3) {
          stats.beepingFixed++;
          improved = true;
        }
        
        if (call.confidence < 0.3 && transcriptionResult.confidence >= 0.3) {
          stats.lowConfidenceFixed++;
          improved = true;
        }

        // Re-classify the new transcript
        const classification = await nlpClassifier.classify(
          transcriptionResult.utterance || '',
          {
            extractedAddress: transcriptionResult.extractedAddress,
            extractedUnits: transcriptionResult.extractedUnits,
            extractedCallReason: transcriptionResult.extractedCallReason
          }
        );

        if (call.callType === 'Unknown Call Type' && classification.callType !== 'Unknown Call Type') {
          stats.unknownFixed++;
          improved = true;
        }

        // Geocode if we have an address
        let latitude = call.latitude;
        let longitude = call.longitude;
        let location = transcriptionResult.extractedAddress || classification.location;

        if (location && (!latitude || !longitude)) {
          try {
            const geocoded = await googleAddressValidation.geocodeAddress(
              location + ', Indianapolis, IN'
            );
            if (geocoded) {
              latitude = geocoded.lat;
              longitude = geocoded.lng;
              improved = true;
            }
          } catch (geoError) {
            console.error(`Geocoding error:`, geoError);
          }
        }

        // Update the call
        await db.update(calls)
          .set({
            transcript: transcriptionResult.utterance,
            confidence: transcriptionResult.confidence,
            callType: classification.callType,
            location: location,
            latitude: latitude,
            longitude: longitude,
            keywords: classification.keywords,
            metadata: {
              ...call.metadata,
              retranscribedAt: new Date().toISOString(),
              originalConfidence: call.confidence,
              originalCallType: call.callType,
              acuityLevel: classification.acuityLevel,
              extractedUnits: transcriptionResult.extractedUnits,
              isNoise: (transcriptionResult as any).isNoise,
              isHallucination: (transcriptionResult as any).isHallucination
            } as any
          })
          .where(eq(calls.id, call.id));

        stats.retranscribed++;
        if (improved) {
          stats.improved++;
          console.log(`- Call improved!`);
        }

        // Log progress every 50 calls
        if (stats.retranscribed % 50 === 0) {
          console.log(`\nProgress: ${stats.retranscribed}/${stats.totalProblemCalls} calls retranscribed`);
        }

      } catch (error) {
        console.error(`Error retranscribing call ${call.id}:`, error);
        stats.errors++;
      }
    }

    // Log final stats
    console.log('\n=== Retranscription Complete ===');
    console.log(`Total problem calls: ${stats.totalProblemCalls}`);
    console.log(`Retranscribed: ${stats.retranscribed}`);
    console.log(`Improved: ${stats.improved}`);
    console.log(`No audio found: ${stats.noAudioFound}`);
    console.log(`Beeping fixed: ${stats.beepingFixed}`);
    console.log(`Unknown fixed: ${stats.unknownFixed}`);
    console.log(`Low confidence fixed: ${stats.lowConfidenceFixed}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Improvement rate: ${stats.retranscribed > 0 ? (stats.improved / stats.retranscribed * 100).toFixed(2) : 0}%`);

    return stats;
  } catch (error) {
    console.error('Fatal error during retranscription:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const limit = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  console.log(`Starting retranscription${limit ? ` (limit: ${limit} calls)` : ' of all problem calls'}...`);
  
  retranscribeProblemCalls(limit)
    .then(() => {
      console.log('Retranscription completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Retranscription failed:', error);
      process.exit(1);
    });
}
import { config } from 'dotenv';
config();

import { db } from '../db';
import { calls } from '../../shared/schema';
import { postProcessingPipeline } from '../services/post-processing-pipeline';
import { nlpClassifier } from '../services/nlp-classifier';
import { googleAddressValidation } from '../services/google-address-validation';
import { eq } from 'drizzle-orm';

interface ReprocessingStats {
  totalCalls: number;
  processed: number;
  improved: number;
  errors: number;
  hallucinations: number;
  unknownCallTypes: number;
  addressesGeocoded: number;
}

export async function reprocessAllCalls(limit?: number): Promise<ReprocessingStats> {
  const stats: ReprocessingStats = {
    totalCalls: 0,
    processed: 0,
    improved: 0,
    errors: 0,
    hallucinations: 0,
    unknownCallTypes: 0,
    addressesGeocoded: 0
  };

  try {
    // Get all calls from database
    console.log('Fetching calls from database...');
    const allCalls = await db.select().from(calls).limit(limit || 10000);
    stats.totalCalls = allCalls.length;
    console.log(`Found ${stats.totalCalls} calls to reprocess`);

    // Process each call
    for (const call of allCalls) {
      try {
        console.log(`Processing call ${call.id} - ${call.transcript?.substring(0, 50)}...`);
        
        // Skip if no transcript
        if (!call.transcript) {
          console.log(`Skipping call ${call.id} - no transcript`);
          continue;
        }

        const originalCallType = call.callType;
        const originalLocation = call.location;
        const originalConfidence = call.confidence || 0;

        // Apply post-processing pipeline
        const postProcessed = await postProcessingPipeline.process(
          call.transcript,
          call.confidence || 0.5
        );

        // Check if it's a hallucination
        if (postProcessed.isHallucination || postProcessed.isNoise) {
          stats.hallucinations++;
          
          // Update call with low confidence and mark as non-emergency
          await db.update(calls)
            .set({
              confidence: 0.1,
              callType: 'Non-Emergency Content',
              location: null,
              latitude: null,
              longitude: null,
              metadata: {
                ...call.metadata,
                isHallucination: postProcessed.isHallucination,
                isNoise: postProcessed.isNoise,
                reprocessedAt: new Date().toISOString()
              } as any
            })
            .where(eq(calls.id, call.id));
          
          stats.improved++;
          console.log(`Call ${call.id} marked as hallucination/noise`);
          continue;
        }

        // Re-classify with NLP
        const classification = await nlpClassifier.classify(
          postProcessed.cleanedTranscript,
          { extractedAddress: postProcessed.extractedAddress }
        );

        // Check if we improved the call type
        const newCallType = classification.callType;
        let improved = false;

        if (originalCallType === 'Unknown Call Type' && newCallType !== 'Unknown Call Type') {
          improved = true;
          stats.unknownCallTypes++;
        }

        // Geocode address if we have one and don't have coordinates
        let newLat = call.latitude;
        let newLng = call.longitude;
        let newLocation = postProcessed.extractedAddress || call.location;

        if (newLocation && (!call.latitude || !call.longitude)) {
          try {
            const geocoded = await googleAddressValidation.geocodeAddress(
              newLocation + ', Indianapolis, IN'
            );
            if (geocoded) {
              newLat = geocoded.lat;
              newLng = geocoded.lng;
              stats.addressesGeocoded++;
              improved = true;
            }
          } catch (geoError) {
            console.error(`Geocoding error for call ${call.id}:`, geoError);
          }
        }

        // Update confidence based on post-processing
        const newConfidence = postProcessed.confidence;
        if (newConfidence > originalConfidence) {
          improved = true;
        }

        // Update call if improved
        if (improved || newCallType !== originalCallType || newLocation !== originalLocation) {
          await db.update(calls)
            .set({
              callType: newCallType,
              location: newLocation,
              latitude: newLat,
              longitude: newLng,
              confidence: newConfidence,
              keywords: classification.keywords,
              metadata: {
                ...call.metadata,
                reprocessedAt: new Date().toISOString(),
                extractedUnits: postProcessed.extractedUnits,
                parseErrors: postProcessed.parseErrors,
                acuityLevel: classification.acuityLevel
              } as any
            })
            .where(eq(calls.id, call.id));

          stats.improved++;
          console.log(`Call ${call.id} improved: ${originalCallType} -> ${newCallType}`);
        }

        stats.processed++;

        // Log progress every 100 calls
        if (stats.processed % 100 === 0) {
          console.log(`Progress: ${stats.processed}/${stats.totalCalls} calls processed`);
        }

      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
        stats.errors++;
      }
    }

    // Log final stats
    console.log('\n=== Reprocessing Complete ===');
    console.log(`Total calls: ${stats.totalCalls}`);
    console.log(`Processed: ${stats.processed}`);
    console.log(`Improved: ${stats.improved}`);
    console.log(`Hallucinations/Noise: ${stats.hallucinations}`);
    console.log(`Unknown -> Known: ${stats.unknownCallTypes}`);
    console.log(`Addresses geocoded: ${stats.addressesGeocoded}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Success rate: ${((stats.processed - stats.errors) / stats.totalCalls * 100).toFixed(2)}%`);

    return stats;
  } catch (error) {
    console.error('Fatal error during reprocessing:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const limit = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  console.log(`Starting reprocessing${limit ? ` (limit: ${limit} calls)` : ' all calls'}...`);
  
  reprocessAllCalls(limit)
    .then(() => {
      console.log('Reprocessing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Reprocessing failed:', error);
      process.exit(1);
    });
}
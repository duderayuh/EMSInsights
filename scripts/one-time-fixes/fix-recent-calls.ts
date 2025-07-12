import { db } from './server/db';
import { calls } from './shared/schema';
import { eq, and, isNull, or } from 'drizzle-orm';
import { postProcessingPipeline } from './server/services/post-processing-pipeline';
import { nlpClassifier } from './server/services/nlp-classifier';
import { geocodingService } from './server/services/geocoding';

async function fixRecentCalls() {
  console.log('Fixing recent calls with missing locations...\n');
  
  try {
    // Get recent dispatch calls without locations
    const recentCalls = await db.select()
      .from(calls)
      .where(
        and(
          isNull(calls.location),
          or(
            eq(calls.talkgroup, '10202'),
            eq(calls.talkgroup, '10244')
          )
        )
      )
      .orderBy(calls.id)
      .limit(10);
    
    console.log(`Found ${recentCalls.length} recent calls without locations`);
    
    for (const call of recentCalls) {
      if (!call.transcript || call.transcript.length < 20) {
        console.log(`\nSkipping call ${call.id}: no transcript`);
        continue;
      }
      
      console.log(`\n=== Processing Call ${call.id} ===`);
      console.log(`Transcript: "${call.transcript.substring(0, 100)}..."`);
      
      // Apply post-processing to extract address
      const postProcessed = await postProcessingPipeline.process(
        call.transcript,
        call.confidence || 0.5
      );
      
      console.log(`Post-processing results:`);
      console.log(`  - Extracted address: ${postProcessed.extractedAddress || 'none'}`);
      console.log(`  - Extracted units: ${postProcessed.extractedUnits?.join(', ') || 'none'}`);
      console.log(`  - Extracted call type: ${postProcessed.extractedCallType || 'none'}`);
      
      // Prepare extracted data for NLP classifier
      const extractedData = {
        extractedAddress: postProcessed.extractedAddress,
        extractedUnits: postProcessed.extractedUnits,
        extractedCallType: postProcessed.extractedCallType
      };
      
      // Run NLP classifier with extracted data
      const classification = await nlpClassifier.classify(
        call.transcript,
        extractedData,
        call.audioSegmentId || undefined
      );
      
      console.log(`NLP Classification results:`);
      console.log(`  - Call type: ${classification.callType}`);
      console.log(`  - Location: ${classification.location || 'none'}`);
      
      // Update call with classification results
      if (classification.location) {
        console.log(`\nUpdating call ${call.id} with location: ${classification.location}`);
        
        await db.update(calls)
          .set({
            location: classification.location,
            callType: classification.callType,
            keywords: classification.keywords
          })
          .where(eq(calls.id, call.id));
        
        // Try to geocode
        console.log(`Geocoding: ${classification.location}`);
        try {
          const geocoded = await geocodingService.geocodeAndUpdateCall(call.id);
          if (geocoded) {
            console.log(`✓ Successfully geocoded!`);
          } else {
            console.log(`✗ Geocoding failed`);
          }
        } catch (error) {
          console.log(`✗ Geocoding error: ${error}`);
        }
      } else {
        console.log(`✗ No location found for call ${call.id}`);
      }
    }
    
    console.log('\n=== Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixRecentCalls();
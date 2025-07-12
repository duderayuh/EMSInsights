import { db } from './server/db';
import { calls } from './shared/schema';
import { eq, and, or, like, not } from 'drizzle-orm';
import { postProcessingPipeline } from './server/services/post-processing-pipeline';
import { nlpClassifier } from './server/services/nlp-classifier';
import { geocodingService } from './server/services/geocoding';

async function fixAllDispatchAddresses() {
  console.log('Fixing all dispatch calls with problematic addresses...\n');
  
  try {
    // Get dispatch calls with very long addresses (likely redundant)
    const problematicCalls = await db.select()
      .from(calls)
      .where(
        and(
          or(
            eq(calls.talkgroup, '10202'),
            eq(calls.talkgroup, '10244')
          ),
          or(
            // Location contains unit names (shouldn't be in address)
            like(calls.location, '%Squad%'),
            like(calls.location, '%Ambulance%'),
            like(calls.location, '%Engine%'),
            like(calls.location, '%Medic%'),
            // Location is too long (>100 chars)
            like(calls.location, '%Hours%'),
            like(calls.location, '%Location%'),
            // Or no location at all
            eq(calls.location, 'none'),
            eq(calls.location, null)
          )
        )
      )
      .orderBy(calls.id)
      .limit(50);
    
    console.log(`Found ${problematicCalls.length} calls to fix`);
    
    let fixedCount = 0;
    let geocodedCount = 0;
    
    for (const call of problematicCalls) {
      if (!call.transcript || call.transcript.length < 20) {
        console.log(`\nSkipping call ${call.id}: no transcript`);
        continue;
      }
      
      console.log(`\n=== Processing Call ${call.id} ===`);
      console.log(`Current location: "${call.location}"`);
      console.log(`Transcript: "${call.transcript.substring(0, 100)}..."`);
      
      // Apply post-processing to extract clean address
      const postProcessed = await postProcessingPipeline.process(
        call.transcript,
        call.confidence || 0.5
      );
      
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
      
      console.log(`  Extracted address: ${postProcessed.extractedAddress || 'none'}`);
      console.log(`  NLP location: ${classification.location || 'none'}`);
      
      // Update call if we found a better location
      if (classification.location && classification.location !== call.location) {
        console.log(`  ✓ Updating location to: ${classification.location}`);
        
        await db.update(calls)
          .set({
            location: classification.location,
            callType: classification.callType,
            keywords: classification.keywords
          })
          .where(eq(calls.id, call.id));
        
        fixedCount++;
        
        // Try to geocode if coordinates are missing
        if (!call.latitude || !call.longitude) {
          console.log(`  Geocoding: ${classification.location}`);
          try {
            const geocoded = await geocodingService.geocodeAndUpdateCall(call.id);
            if (geocoded) {
              console.log(`  ✓ Successfully geocoded!`);
              geocodedCount++;
            } else {
              console.log(`  ✗ Geocoding failed`);
            }
          } catch (error) {
            console.log(`  ✗ Geocoding error: ${error}`);
          }
        }
      } else if (!classification.location) {
        console.log(`  ✗ No location found`);
      } else {
        console.log(`  - Location unchanged`);
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Fixed ${fixedCount} calls with better addresses`);
    console.log(`Successfully geocoded ${geocodedCount} calls`);
    console.log(`Total processed: ${problematicCalls.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixAllDispatchAddresses();
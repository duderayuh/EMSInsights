import { db } from './server/db';
import { calls } from './shared/schema';
import { eq, and, isNotNull, isNull, like, notLike, or } from 'drizzle-orm';
import { geocodingService } from './server/services/geocoding';
import { postProcessingPipeline } from './server/services/post-processing-pipeline';

async function fixMissingCoordinatesFocused() {
  console.log('Starting focused fix for missing coordinates...');
  
  try {
    // Focus on dispatch calls with real content that are missing coordinates
    const dispatchCallsWithMissingCoords = await db.select()
      .from(calls)
      .where(
        and(
          isNull(calls.latitude),
          or(
            eq(calls.talkgroup, '10202'),
            eq(calls.talkgroup, '10244')
          ),
          isNotNull(calls.transcript),
          notLike(calls.transcript, '%BEEP%'),
          notLike(calls.transcript, '%beep%'),
          notLike(calls.transcript, '%{beeping}%'),
          notLike(calls.transcript, '[No transcription available]'),
          notLike(calls.transcript, '[Unable to transcribe audio]')
        )
      )
      .limit(100) // Process in smaller batches
      .orderBy(calls.id);
    
    console.log(`Found ${dispatchCallsWithMissingCoords.length} dispatch calls with missing coordinates`);
    
    let fixed = 0;
    let failed = 0;
    
    for (const call of dispatchCallsWithMissingCoords) {
      try {
        // Skip very short transcripts
        if (!call.transcript || call.transcript.length < 20) {
          console.log(`Skipping call ${call.id}: transcript too short`);
          failed++;
          continue;
        }
        
        console.log(`\nProcessing call ${call.id}:`);
        console.log(`  Transcript: ${call.transcript.substring(0, 100)}...`);
        
        // Apply post-processing to extract address
        const postProcessed = await postProcessingPipeline.process(
          call.transcript,
          call.confidence || 0.5
        );
        
        if (postProcessed.isNoise || postProcessed.isHallucination) {
          console.log(`  Skipping: noise or hallucination detected`);
          failed++;
          continue;
        }
        
        let addressToGeocode = postProcessed.extractedAddress || call.location || '';
        
        if (!addressToGeocode || addressToGeocode.trim().length < 5) {
          console.log(`  No valid address found`);
          failed++;
          continue;
        }
        
        console.log(`  Extracted address: ${addressToGeocode}`);
        
        // Update location if we found a better address
        if (addressToGeocode !== call.location) {
          await db.update(calls)
            .set({ location: addressToGeocode })
            .where(eq(calls.id, call.id));
        }
        
        // Geocode the address
        console.log(`  Geocoding: ${addressToGeocode}`);
        const geocodeResult = await geocodingService.geocodeAddress(addressToGeocode);
        
        if (geocodeResult) {
          console.log(`  ✓ Geocoded to: [${geocodeResult.latitude}, ${geocodeResult.longitude}]`);
          console.log(`  Formatted: ${geocodeResult.formatted_address}`);
          
          // Update the call with coordinates
          await db.update(calls)
            .set({
              latitude: geocodeResult.latitude,
              longitude: geocodeResult.longitude,
              location: geocodeResult.formatted_address || addressToGeocode
            })
            .where(eq(calls.id, call.id));
          
          fixed++;
        } else {
          console.log(`  ✗ Geocoding failed`);
          failed++;
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
        failed++;
      }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total dispatch calls processed: ${dispatchCallsWithMissingCoords.length}`);
    console.log(`Successfully geocoded: ${fixed}`);
    console.log(`Failed to geocode: ${failed}`);
    console.log(`Success rate: ${dispatchCallsWithMissingCoords.length > 0 ? ((fixed / dispatchCallsWithMissingCoords.length) * 100).toFixed(1) : 0}%`);
    
    // Check overall progress
    const stats = await db.select({
      totalDispatch: db.count(),
      withCoords: db.count(calls.latitude)
    })
    .from(calls)
    .where(
      or(
        eq(calls.talkgroup, '10202'),
        eq(calls.talkgroup, '10244')
      )
    );
    
    console.log('\n=== Overall Progress ===');
    console.log(`Total dispatch calls: ${stats[0].totalDispatch}`);
    console.log(`Dispatch calls with coordinates: ${stats[0].withCoords}`);
    console.log(`Percentage geocoded: ${((stats[0].withCoords / stats[0].totalDispatch) * 100).toFixed(1)}%`);
    
    if (fixed > 0) {
      console.log('\n✓ Successfully improved geocoding coverage!');
    }
    
  } catch (error) {
    console.error('Error in fixMissingCoordinatesFocused:', error);
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixMissingCoordinatesFocused();
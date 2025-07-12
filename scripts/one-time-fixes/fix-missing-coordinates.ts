import { db } from './server/db';
import { calls } from './shared/schema';
import { eq, and, isNotNull, isNull, ne } from 'drizzle-orm';
import { geocodingService } from './server/services/geocoding';
import { postProcessingPipeline } from './server/services/post-processing-pipeline';
import { nlpClassifier } from './server/services/nlp-classifier';

async function fixMissingCoordinates() {
  console.log('Starting fix for missing coordinates...');
  
  try {
    // Find all calls with locations but no coordinates
    const callsWithMissingCoords = await db.select()
      .from(calls)
      .where(
        and(
          isNotNull(calls.location),
          isNull(calls.latitude)
        )
      )
      .orderBy(calls.id);
    
    console.log(`Found ${callsWithMissingCoords.length} calls with locations but missing coordinates`);
    
    let fixed = 0;
    let failed = 0;
    
    for (const call of callsWithMissingCoords) {
      try {
        console.log(`\nProcessing call ${call.id}:`);
        console.log(`  Current location: ${call.location}`);
        console.log(`  Transcript: ${call.transcript?.substring(0, 100)}...`);
        
        let addressToGeocode = call.location || '';
        
        // If we have a transcript, try to extract a better address
        if (call.transcript) {
          // Apply post-processing to extract address
          const postProcessed = await postProcessingPipeline.process(
            call.transcript,
            call.confidence || 0.5
          );
          
          if (postProcessed.extractedAddress) {
            console.log(`  Extracted address: ${postProcessed.extractedAddress}`);
            addressToGeocode = postProcessed.extractedAddress;
            
            // Update the location field with the better address
            await db.update(calls)
              .set({ location: addressToGeocode })
              .where(eq(calls.id, call.id));
          } else {
            // Try NLP classifier patterns as fallback
            const extractedData = {
              extractedAddress: undefined,
              extractedUnits: postProcessed.extractedUnits,
              extractedCallType: postProcessed.extractedCallType
            };
            
            const classification = await nlpClassifier.classify(
              call.transcript,
              extractedData,
              call.audioSegmentId || undefined
            );
            
            if (classification.location && classification.location !== call.location) {
              console.log(`  NLP extracted location: ${classification.location}`);
              addressToGeocode = classification.location;
              
              // Update the location field
              await db.update(calls)
                .set({ location: addressToGeocode })
                .where(eq(calls.id, call.id));
            }
          }
        }
        
        // Now geocode the address
        if (addressToGeocode && addressToGeocode.trim().length > 0) {
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
                // Optionally update location with the formatted address
                location: geocodeResult.formatted_address || addressToGeocode
              })
              .where(eq(calls.id, call.id));
            
            fixed++;
          } else {
            console.log(`  ✗ Geocoding failed for: ${addressToGeocode}`);
            failed++;
          }
        } else {
          console.log(`  ✗ No valid address to geocode`);
          failed++;
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
        failed++;
      }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total calls with missing coordinates: ${callsWithMissingCoords.length}`);
    console.log(`Successfully geocoded: ${fixed}`);
    console.log(`Failed to geocode: ${failed}`);
    console.log(`Success rate: ${((fixed / callsWithMissingCoords.length) * 100).toFixed(1)}%`);
    
    // Check current state
    const afterStats = await db.select({
      total: db.count(),
      withCoords: db.count(calls.latitude)
    })
    .from(calls)
    .where(isNotNull(calls.location));
    
    console.log('\n=== Database State ===');
    console.log(`Total calls with locations: ${afterStats[0].total}`);
    console.log(`Calls with coordinates: ${afterStats[0].withCoords}`);
    console.log(`Percentage geocoded: ${((afterStats[0].withCoords / afterStats[0].total) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Error in fixMissingCoordinates:', error);
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixMissingCoordinates();
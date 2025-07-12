import { db } from './server/db';
import { calls, CallType } from './shared/schema';
import { eq, and, or, isNull, gte, sql } from 'drizzle-orm';
import { postProcessingPipeline } from './server/services/post-processing-pipeline';
import { nlpClassifier } from './server/services/nlp-classifier';
import { geocodingService } from './server/services/geocoding';

async function fixAllAddressExtraction() {
  console.log('Starting comprehensive address extraction fix...');

  // Get all dispatch calls from the last 30 days that are missing locations
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 30);

  const callsToFix = await db.select()
    .from(calls)
    .where(
      and(
        or(
          eq(calls.talkgroup, '10202'),
          eq(calls.talkgroup, '10244')
        ),
        or(
          isNull(calls.location),
          eq(calls.location, '')
        ),
        gte(calls.timestamp, recentDate)
      )
    );

  console.log(`Found ${callsToFix.length} calls to fix`);
  
  let fixed = 0;
  let geocoded = 0;
  
  for (const call of callsToFix) {
    if (!call.transcript || call.transcript.trim() === '' || 
        call.transcript.includes('[No transcription available]') ||
        call.transcript.includes('ľľľľ')) {
      continue;
    }
    
    console.log(`\nProcessing call ${call.id}...`);
    console.log(`Transcript: "${call.transcript}"`);
    
    // Use post-processing pipeline to extract address
    const postProcessed = await postProcessingPipeline.process(
      call.transcript,
      call.confidence || 0.5
    );
    
    // If post-processing found an address, use it
    let location = postProcessed.extractedAddress;
    
    // If not, try NLP classifier
    if (!location) {
      const classification = await nlpClassifier.classify(
        call.transcript,
        postProcessed,
        call.audioSegmentId || undefined
      );
      location = classification.location;
    }
    
    // Try simplified address extraction if still no location
    if (!location) {
      // Pattern 1: Look for intersections first
      const intersectionMatch = call.transcript.match(
        /\b([a-zA-Z0-9]+(?:\s+[a-zA-Z]+)*?\s+(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|way|lane|ln|place|pl|court|ct))\s+(?:and|&|\bat\b)\s+([a-zA-Z0-9]+(?:\s+[a-zA-Z]+)*?\s+(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|way|lane|ln|place|pl|court|ct))\b/i
      );
      
      if (intersectionMatch) {
        location = `${intersectionMatch[1]} and ${intersectionMatch[2]}`;
        console.log(`Found intersection: ${location}`);
      } else {
        // Pattern 2: Standard addresses
        const addressMatch = call.transcript.match(
          /\b(\d{1,5})\s+((?:north|south|east|west|n|s|e|w)\s+)?([a-zA-Z][a-zA-Z0-9\s]{2,40}(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|way|lane|ln|place|pl|court|ct|circle|cir|trail|parkway|pkwy))/i
        );
        
        if (addressMatch) {
          const streetNumber = addressMatch[1];
          const direction = addressMatch[2] || '';
          const streetName = addressMatch[3];
          location = `${streetNumber} ${direction} ${streetName}`.replace(/\s+/g, ' ').trim();
          console.log(`Found address: ${location}`);
        }
      }
    }
    
    if (location) {
      // Update the location
      await db.update(calls)
        .set({ location })
        .where(eq(calls.id, call.id!));
      
      fixed++;
      console.log(`Updated location to: ${location}`);
      
      // Try to geocode if no coordinates
      if (!call.latitude || !call.longitude) {
        try {
          const geocodeResult = await geocodingService.geocodeAddress(location);
          if (geocodeResult) {
            await db.update(calls)
              .set({
                latitude: geocodeResult.latitude,
                longitude: geocodeResult.longitude
              })
              .where(eq(calls.id, call.id!));
            
            geocoded++;
            console.log(`Geocoded to: [${geocodeResult.latitude}, ${geocodeResult.longitude}]`);
          }
        } catch (error) {
          console.log(`Failed to geocode: ${error}`);
        }
      }
    } else {
      console.log(`Could not extract address from transcript`);
    }
  }
  
  console.log(`\nFixed ${fixed} calls with addresses`);
  console.log(`Geocoded ${geocoded} addresses`);
  
  // Show final statistics
  const [stats] = await db.select({
    total: sql<number>`COUNT(*)`,
    withLocation: sql<number>`COUNT(CASE WHEN location IS NOT NULL AND location != '' THEN 1 END)`,
    withCoords: sql<number>`COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END)`
  })
  .from(calls)
  .where(
    and(
      or(
        eq(calls.talkgroup, '10202'),
        eq(calls.talkgroup, '10244')
      ),
      gte(calls.timestamp, recentDate)
    )
  );
  
  console.log('\nFinal statistics for dispatch calls (last 30 days):');
  console.log(`Total calls: ${stats?.total || 0}`);
  console.log(`Calls with location: ${stats?.withLocation || 0} (${((stats?.withLocation || 0) / (stats?.total || 1) * 100).toFixed(1)}%)`);
  console.log(`Calls with coordinates: ${stats?.withCoords || 0} (${((stats?.withCoords || 0) / (stats?.total || 1) * 100).toFixed(1)}%)`);
}

// Run the fix
fixAllAddressExtraction().catch(console.error);
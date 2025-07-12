import { db } from './server/db';
import { calls } from './shared/schema';
import { eq, and, or, isNull, gte } from 'drizzle-orm';
import { postProcessingPipeline } from './server/services/post-processing-pipeline';
import { nlpClassifier } from './server/services/nlp-classifier';
import { geocodingService } from './server/services/geocoding';

async function fixRecentDispatchCalls() {
  console.log('Fixing recent dispatch calls with missing addresses...');
  
  // Get dispatch calls from the last hour that are missing locations
  const recentDate = new Date();
  recentDate.setHours(recentDate.getHours() - 1);

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

  console.log(`Found ${callsToFix.length} recent calls to fix`);
  
  let fixed = 0;
  let geocoded = 0;
  
  for (const call of callsToFix) {
    if (!call.transcript || call.transcript.trim() === '' || 
        call.transcript.includes('[No transcription available]')) {
      continue;
    }
    
    console.log(`\nProcessing call ${call.id}...`);
    console.log(`Transcript: "${call.transcript}"`);
    
    // Try multiple extraction methods
    let location: string | undefined;
    
    // Method 1: Direct extraction for specific patterns
    const patterns = [
      // Standard address with direction
      /\b(\d{1,5})\s+(north|south|east|west|n|s|e|w)\s+([a-zA-Z][a-zA-Z0-9\s]{2,40}(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|way|lane|ln|place|pl|court|ct|circle|cir|trail|parkway|pkwy|crest))/i,
      // Intersection pattern
      /\b([a-zA-Z0-9]+(?:\s+[a-zA-Z]+)*?\s+(?:street|st|avenue|ave|road|rd|drive|dr))\s+(?:and|&|\bat\b)\s+([a-zA-Z0-9]+(?:\s+[a-zA-Z]+)*?\s+(?:street|st|avenue|ave|road|rd|drive|dr))/i,
      // Simple street name after comma
      /,\s*(\d{1,5}\s+[a-zA-Z][a-zA-Z0-9\s]+(?:street|st|avenue|ave|road|rd|drive|dr|crest))/i
    ];
    
    for (const pattern of patterns) {
      const match = call.transcript.match(pattern);
      if (match) {
        if (match[2] && !match[2].match(/\d/)) {
          // Intersection match
          location = `${match[1]} and ${match[2]}`;
        } else {
          // Address match
          location = match[0].replace(/^,\s*/, '').trim();
        }
        console.log(`Pattern matched: ${location}`);
        break;
      }
    }
    
    // Method 2: Use post-processing pipeline if no direct match
    if (!location) {
      const postProcessed = await postProcessingPipeline.process(
        call.transcript,
        call.confidence || 0.5
      );
      location = postProcessed.extractedAddress;
    }
    
    // Method 3: Use NLP classifier as fallback
    if (!location) {
      const classification = await nlpClassifier.classify(
        call.transcript,
        { cleanedTranscript: call.transcript, isNoise: false, isHallucination: false, confidence: call.confidence || 0.5 },
        call.audioSegmentId || undefined
      );
      location = classification.location;
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
}

// Run the fix
fixRecentDispatchCalls().catch(console.error);
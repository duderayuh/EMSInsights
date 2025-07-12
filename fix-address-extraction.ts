import { db } from './server/db.js';
import { calls } from './shared/schema.js';
import { eq, isNull, not, and, sql } from 'drizzle-orm';
import { PostProcessingPipeline } from './server/services/post-processing-pipeline.js';
import { NLPClassifier } from './server/services/nlp-classifier.js';
import { GeocodingService } from './server/services/geocoding.js';

const postProcessor = new PostProcessingPipeline();
const nlpClassifier = new NLPClassifier();
const geocodingService = new GeocodingService();

async function fixAddressExtraction() {
  console.log('Starting address extraction fix...');

  // Get calls with transcripts but no location
  const callsToFix = await db
    .select()
    .from(calls)
    .where(
      and(
        isNull(calls.location),
        not(sql`${calls.transcript} LIKE '%[No transcription%'`),
        not(sql`${calls.transcript} LIKE '%[Unable to%'`),
        not(sql`${calls.transcript} LIKE '%{beeping}%'`),
        not(sql`${calls.transcript} LIKE '%ĹĹĹĹ%'`),
        sql`LENGTH(${calls.transcript}) > 20`
      )
    )
    .limit(100);

  console.log(`Found ${callsToFix.length} calls to fix`);

  let fixed = 0;
  let failed = 0;

  for (const call of callsToFix) {
    try {
      console.log(`\nProcessing call ${call.id}`);
      console.log(`Transcript: ${call.transcript}`);

      // Run through post-processing to extract address
      const postProcessed = await postProcessor.process(call.transcript, call.confidenceScore || 0.8);
      
      if (postProcessed.extractedAddress) {
        console.log(`Extracted address: ${postProcessed.extractedAddress}`);
        
        // Try to geocode it
        const geocoded = await geocodingService.geocodeAddress(postProcessed.extractedAddress);
        
        if (geocoded) {
          await db.update(calls)
            .set({
              location: postProcessed.extractedAddress,
              latitude: geocoded.latitude,
              longitude: geocoded.longitude
            })
            .where(eq(calls.id, call.id));
          
          fixed++;
          console.log(`✓ Fixed: ${postProcessed.extractedAddress} → ${geocoded.latitude}, ${geocoded.longitude}`);
        } else {
          // Still save the address even if geocoding fails
          await db.update(calls)
            .set({ location: postProcessed.extractedAddress })
            .where(eq(calls.id, call.id));
          
          fixed++;
          console.log(`✓ Saved address without geocoding: ${postProcessed.extractedAddress}`);
        }
      } else {
        // Try enhanced address extraction patterns
        const addressPatterns = [
          // Intersection with "and"
          /\b(\w+(?:\s+\w+)*)\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir|Parkway|Pkwy),?\s+and\s+(\w+(?:\s+\w+)*)\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir|Parkway|Pkwy)/gi,
          
          // Address with building/place name
          /\b(\d+)\s+([NSEW]?\s*)?(\w+(?:\s+\w+)*)\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir|Parkway|Pkwy),?\s*([^,]+)?/gi,
          
          // Simple street names without numbers
          /\b([NSEW]?\s*)?(\w+(?:\s+\w+)*)\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir|Parkway|Pkwy)\b/gi
        ];

        let foundAddress = null;
        for (const pattern of addressPatterns) {
          const match = call.transcript.match(pattern);
          if (match) {
            foundAddress = match[0];
            break;
          }
        }

        if (foundAddress) {
          console.log(`Found address with enhanced patterns: ${foundAddress}`);
          
          const geocoded = await geocodingService.geocodeAddress(foundAddress);
          
          if (geocoded) {
            await db.update(calls)
              .set({
                location: foundAddress,
                latitude: geocoded.latitude,
                longitude: geocoded.longitude
              })
              .where(eq(calls.id, call.id));
            
            fixed++;
            console.log(`✓ Fixed with enhanced pattern: ${foundAddress} → ${geocoded.latitude}, ${geocoded.longitude}`);
          } else {
            await db.update(calls)
              .set({ location: foundAddress })
              .where(eq(calls.id, call.id));
            
            fixed++;
            console.log(`✓ Saved address without geocoding: ${foundAddress}`);
          }
        } else {
          console.log('✗ No address found');
          failed++;
        }
      }
    } catch (error) {
      console.error(`Error processing call ${call.id}:`, error);
      failed++;
    }
  }

  console.log(`\nAddress extraction fix complete!`);
  console.log(`Fixed: ${fixed} calls`);
  console.log(`Failed: ${failed} calls`);
}

// Run the fix
fixAddressExtraction()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
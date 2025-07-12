import { db } from './server/db.js';
import { calls } from './shared/schema.js';
import { eq, sql, and, isNull, or } from 'drizzle-orm';
import { advancedAddressExtractor } from './server/services/advanced-address-extractor.js';
import { geocodingService } from './server/services/geocoding.js';

async function fixAddressExtractionComprehensive() {
  console.log('Comprehensive Address Extraction Fix');
  console.log('=====================================');
  
  // First, find all calls without addresses for comprehensive testing
  const callsWithoutAddresses = await db
    .select({
      id: calls.id,
      transcript: calls.transcript,
      location: calls.location,
      confidence: calls.confidence,
      callType: calls.callType,
      talkgroup: calls.talkgroup
    })
    .from(calls)
    .where(
      and(
        eq(calls.talkgroup, '10202'),
        eq(calls.voiceType, 'automated_voice'),
        sql`${calls.callType} != 'Non-Emergency Content'`,
        sql`${calls.confidence} >= 0.3`,
        sql`${calls.transcript} IS NOT NULL`,
        sql`${calls.transcript} != ''`,
        sql`${calls.transcript} != '[No transcription available]'`,
        or(
          isNull(calls.location),
          eq(calls.location, ''),
          eq(calls.location, 'none')
        )
      )
    )
    .orderBy(calls.id)
    .limit(100);
  
  console.log(`Found ${callsWithoutAddresses.length} calls without addresses to process`);
  
  let successCount = 0;
  let geocodedCount = 0;
  let totalProcessed = 0;
  
  for (const call of callsWithoutAddresses) {
    totalProcessed++;
    console.log(`\n[${totalProcessed}/${callsWithoutAddresses.length}] Processing Call ${call.id}:`);
    console.log(`  Transcript: ${call.transcript.substring(0, 100)}...`);
    
    try {
      const result = await advancedAddressExtractor.extractAddress(call.transcript);
      
      if (result.address && result.confidence > 0.6) {
        successCount++;
        console.log(`  ✓ Extracted: "${result.address}" (${result.method}, confidence: ${result.confidence})`);
        
        // Try geocoding
        try {
          const geocodingResult = await geocodingService.geocode(result.address);
          if (geocodingResult.latitude && geocodingResult.longitude) {
            geocodedCount++;
            console.log(`  ✓ Geocoded: [${geocodingResult.latitude}, ${geocodingResult.longitude}]`);
            
            // Update the database with the extracted address and coordinates
            await db
              .update(calls)
              .set({
                location: result.address,
                latitude: geocodingResult.latitude,
                longitude: geocodingResult.longitude
              })
              .where(eq(calls.id, call.id));
            
            console.log(`  ✓ Database updated with address and coordinates`);
          } else {
            console.log(`  ⚠ Geocoding failed: ${geocodingResult.error || 'Unknown error'}`);
            
            // Still update with just the address
            await db
              .update(calls)
              .set({
                location: result.address
              })
              .where(eq(calls.id, call.id));
            
            console.log(`  ✓ Database updated with address only`);
          }
        } catch (geocodingError) {
          console.log(`  ⚠ Geocoding error: ${geocodingError}`);
          
          // Still update with just the address
          await db
            .update(calls)
            .set({
              location: result.address
            })
            .where(eq(calls.id, call.id));
          
          console.log(`  ✓ Database updated with address only`);
        }
        
        if (result.alternativeAddresses && result.alternativeAddresses.length > 0) {
          console.log(`  ℹ Alternative addresses: ${result.alternativeAddresses.join(', ')}`);
        }
      } else {
        console.log(`  ✗ Failed to extract address: ${result.error || 'No suitable pattern found'}`);
      }
    } catch (error) {
      console.log(`  ✗ Error processing call: ${error}`);
    }
  }
  
  // Summary statistics
  const extractionSuccessRate = (successCount / totalProcessed) * 100;
  const geocodingSuccessRate = (geocodedCount / successCount) * 100;
  
  console.log('\n=====================================');
  console.log('COMPREHENSIVE ADDRESS EXTRACTION RESULTS');
  console.log('=====================================');
  console.log(`Total calls processed: ${totalProcessed}`);
  console.log(`Addresses extracted: ${successCount}`);
  console.log(`Addresses geocoded: ${geocodedCount}`);
  console.log(`Extraction success rate: ${extractionSuccessRate.toFixed(1)}%`);
  console.log(`Geocoding success rate: ${geocodingSuccessRate.toFixed(1)}%`);
  console.log(`Overall success rate: ${((geocodedCount / totalProcessed) * 100).toFixed(1)}%`);
  
  // Calculate failure rate
  const extractionFailureRate = 100 - extractionSuccessRate;
  console.log(`\nExtraction failure rate: ${extractionFailureRate.toFixed(1)}%`);
  
  if (extractionFailureRate < 3) {
    console.log('\n🎉 SUCCESS: Advanced address extractor meets the <3% failure rate requirement!');
  } else {
    console.log('\n⚠ NEEDS IMPROVEMENT: Failure rate is above 3% target');
    console.log('Next steps: Analyze failed cases and improve pattern matching');
  }
  
  // Show a few examples of failed cases for analysis
  console.log('\n=====================================');
  console.log('SAMPLE FAILED CASES FOR ANALYSIS');
  console.log('=====================================');
  
  const failedCalls = callsWithoutAddresses.slice(successCount, Math.min(successCount + 5, callsWithoutAddresses.length));
  for (const call of failedCalls) {
    console.log(`\nCall ${call.id}:`);
    console.log(`  Transcript: ${call.transcript}`);
    console.log(`  Call Type: ${call.callType}`);
    console.log(`  Confidence: ${call.confidence}`);
    
    // Try to identify what pattern might work
    if (call.transcript.includes('north') || call.transcript.includes('south') || 
        call.transcript.includes('east') || call.transcript.includes('west')) {
      console.log(`  ℹ Contains directional words - may need grid pattern improvement`);
    }
    
    if (call.transcript.includes('and') || call.transcript.includes('&')) {
      console.log(`  ℹ Contains intersection indicators - may need intersection pattern improvement`);
    }
    
    if (/\d{3,5}/.test(call.transcript)) {
      console.log(`  ℹ Contains numbers - may need numerical pattern improvement`);
    }
    
    if (/(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd)/i.test(call.transcript)) {
      console.log(`  ℹ Contains street types - may need standard pattern improvement`);
    }
  }
  
  console.log('\n=====================================');
  console.log('FINAL SUMMARY');
  console.log('=====================================');
  console.log(`The advanced address extractor processed ${totalProcessed} calls`);
  console.log(`Successfully extracted ${successCount} addresses (${extractionSuccessRate.toFixed(1)}% success rate)`);
  console.log(`Successfully geocoded ${geocodedCount} addresses`);
  console.log(`Current failure rate: ${extractionFailureRate.toFixed(1)}%`);
  console.log(`Target failure rate: <3%`);
  console.log(`Status: ${extractionFailureRate < 3 ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);
}

// Run the comprehensive fix
fixAddressExtractionComprehensive().catch(console.error);
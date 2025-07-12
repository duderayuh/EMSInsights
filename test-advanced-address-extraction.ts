import { db } from './server/db.js';
import { calls } from './shared/schema.js';
import { eq, sql, and, isNull, or } from 'drizzle-orm';
import { advancedAddressExtractor } from './server/services/advanced-address-extractor.js';
import { geocodingService } from './server/services/geocoding.js';

interface TestCase {
  transcript: string;
  expectedAddress?: string;
  expectedPattern?: string;
  callId?: number;
}

// Test cases with known addresses from actual dispatch transcripts
const testCases: TestCase[] = [
  {
    transcript: "Engine 11. Ladder 7. 1411 East Marcus Street. Building Alarm. Engine 11. Ladder 7. 1411 East Marcus Street.",
    expectedAddress: "1411 East Marcus Street",
    expectedPattern: "standard_pattern"
  },
  {
    transcript: "Ambulance 5, 516 West 30th Street, Mental Emotional B, 2, 23 hours, 3000 North & 500 West 30th Street",
    expectedAddress: "516 West 30th Street",
    expectedPattern: "standard_pattern"
  },
  {
    transcript: "Engine 27, Medic 20, 3118 Brookside Parkway, North Drive. Gunshots see now secure. 2, 16 hours. Location 1400 North 3100 East.",
    expectedAddress: "3118 Brookside Parkway",
    expectedPattern: "standard_pattern"
  },
  {
    transcript: "Engine 3, Ambulance 3, EMS 91, South Alabama Street and Orange Street, Motorcycle Personal Injury, 2, 13 hours",
    expectedAddress: "South Alabama Street and Orange Street",
    expectedPattern: "intersection_pattern"
  },
  {
    transcript: "Ambulance 27, 6850 East 21st Street, Room 159, Injured Person C, 115 hours, Location 2100 North 6800 East.",
    expectedAddress: "6850 East 21st Street",
    expectedPattern: "standard_pattern"
  },
  {
    transcript: "Medic 63, 2440 Korobok Place, unconscious person. 108 hours, 8400 North & 2500 West.",
    expectedAddress: "2440 Korobok Place",
    expectedPattern: "standard_pattern"
  },
  {
    transcript: "Engine 31, Medic 10, EMS 91, West 40th Street and North Illinois Street, Injured Person. 10-4 hours. Location 4000 North 100.",
    expectedAddress: "West 40th Street and North Illinois Street",
    expectedPattern: "intersection_pattern"
  },
  {
    transcript: "Engine 61, Ladder 61, 7601, Interactive Bay, Building Alarm, 244 hours, 7600 North & 6200 West",
    expectedAddress: "7600 North & 6200 West",
    expectedPattern: "grid_pattern"
  },
  {
    transcript: "Medic 2349 West Maryland Street. Difficulty breathing. 244-hour 100 South & 1 West.",
    expectedAddress: "2349 West Maryland Street",
    expectedPattern: "standard_pattern"
  },
  {
    transcript: "Engine 2, Medic 2, 10474 East 37th Street, Apartment C, Difficulty Breathing, 0023 hours, Location 3700 North & 10400 East",
    expectedAddress: "10474 East 37th Street",
    expectedPattern: "standard_pattern"
  }
];

async function testAdvancedAddressExtraction() {
  console.log('Testing Advanced Address Extraction System');
  console.log('==========================================');
  
  let totalTests = 0;
  let successfulExtractions = 0;
  let correctExtractions = 0;
  
  // Test predefined test cases
  console.log('\n1. Testing Predefined Test Cases:');
  console.log('----------------------------------');
  
  for (const testCase of testCases) {
    totalTests++;
    console.log(`\nTest ${totalTests}: ${testCase.transcript.substring(0, 50)}...`);
    
    const result = await advancedAddressExtractor.extractAddress(testCase.transcript);
    
    if (result.address) {
      successfulExtractions++;
      console.log(`  ✓ Extracted: "${result.address}" (${result.method}, confidence: ${result.confidence})`);
      
      if (testCase.expectedAddress) {
        // Check if extracted address matches expected (case-insensitive)
        const extracted = result.address.toLowerCase().replace(/\s+/g, ' ').trim();
        const expected = testCase.expectedAddress.toLowerCase().replace(/\s+/g, ' ').trim();
        
        if (extracted === expected || extracted.includes(expected) || expected.includes(extracted)) {
          correctExtractions++;
          console.log(`  ✓ CORRECT: Matches expected address`);
        } else {
          console.log(`  ✗ INCORRECT: Expected "${testCase.expectedAddress}"`);
        }
      }
      
      if (result.alternativeAddresses && result.alternativeAddresses.length > 0) {
        console.log(`  ℹ Alternatives: ${result.alternativeAddresses.join(', ')}`);
      }
    } else {
      console.log(`  ✗ FAILED: ${result.error}`);
    }
  }
  
  // Test real database calls that currently lack addresses
  console.log('\n2. Testing Real Database Calls Without Addresses:');
  console.log('--------------------------------------------------');
  
  const callsWithoutAddresses = await db
    .select({
      id: calls.id,
      transcript: calls.transcript,
      location: calls.location
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
    .limit(10);
  
  console.log(`\nFound ${callsWithoutAddresses.length} calls without addresses to test:`);
  
  for (const call of callsWithoutAddresses) {
    totalTests++;
    console.log(`\nCall ${call.id}: ${call.transcript.substring(0, 60)}...`);
    
    const result = await advancedAddressExtractor.extractAddress(call.transcript);
    
    if (result.address) {
      successfulExtractions++;
      console.log(`  ✓ Extracted: "${result.address}" (${result.method}, confidence: ${result.confidence})`);
      
      // Test geocoding
      try {
        const geocodingResult = await geocodingService.geocode(result.address);
        if (geocodingResult.latitude && geocodingResult.longitude) {
          console.log(`  ✓ Geocoded: [${geocodingResult.latitude}, ${geocodingResult.longitude}]`);
        } else {
          console.log(`  ⚠ Geocoding failed: ${geocodingResult.error}`);
        }
      } catch (error) {
        console.log(`  ⚠ Geocoding error: ${error}`);
      }
    } else {
      console.log(`  ✗ FAILED: ${result.error}`);
    }
  }
  
  // Test calls that currently have addresses (validation)
  console.log('\n3. Validating Calls That Currently Have Addresses:');
  console.log('---------------------------------------------------');
  
  const callsWithAddresses = await db
    .select({
      id: calls.id,
      transcript: calls.transcript,
      location: calls.location
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
        sql`${calls.location} IS NOT NULL`,
        sql`${calls.location} != ''`,
        sql`${calls.location} != 'none'`
      )
    )
    .limit(10);
  
  console.log(`\nValidating ${callsWithAddresses.length} calls that currently have addresses:`);
  
  let validationMatches = 0;
  let validationImprovements = 0;
  
  for (const call of callsWithAddresses) {
    console.log(`\nCall ${call.id}: Current address: "${call.location}"`);
    console.log(`  Transcript: ${call.transcript.substring(0, 60)}...`);
    
    const result = await advancedAddressExtractor.extractAddress(call.transcript);
    
    if (result.address) {
      const current = call.location.toLowerCase().replace(/\s+/g, ' ').trim();
      const extracted = result.address.toLowerCase().replace(/\s+/g, ' ').trim();
      
      if (current === extracted || current.includes(extracted) || extracted.includes(current)) {
        validationMatches++;
        console.log(`  ✓ MATCHES: Advanced extractor agrees with current address`);
      } else {
        console.log(`  ℹ DIFFERENT: Advanced extractor found "${result.address}" (${result.method})`);
        
        // Check if the new extraction might be better
        if (result.confidence > 0.8) {
          validationImprovements++;
          console.log(`  ⚡ POTENTIAL IMPROVEMENT: High confidence extraction`);
        }
      }
    } else {
      console.log(`  ⚠ Could not extract address: ${result.error}`);
    }
  }
  
  // Summary
  console.log('\n4. SUMMARY:');
  console.log('===========');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Successful extractions: ${successfulExtractions}/${totalTests} (${(successfulExtractions/totalTests*100).toFixed(1)}%)`);
  console.log(`Correct extractions: ${correctExtractions}/${testCases.length} (${(correctExtractions/testCases.length*100).toFixed(1)}%)`);
  console.log(`Validation matches: ${validationMatches}/${callsWithAddresses.length} (${(validationMatches/callsWithAddresses.length*100).toFixed(1)}%)`);
  console.log(`Potential improvements: ${validationImprovements}`);
  
  const successRate = (successfulExtractions / totalTests) * 100;
  const failureRate = 100 - successRate;
  
  console.log(`\nAddress extraction success rate: ${successRate.toFixed(1)}%`);
  console.log(`Address extraction failure rate: ${failureRate.toFixed(1)}%`);
  
  if (failureRate < 3) {
    console.log('\n🎉 SUCCESS: Advanced address extractor meets the <3% failure rate requirement!');
  } else {
    console.log('\n⚠ NEEDS IMPROVEMENT: Failure rate is above 3% target');
  }
}

// Run the test
testAdvancedAddressExtraction().catch(console.error);
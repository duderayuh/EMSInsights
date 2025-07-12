import { advancedAddressExtractor } from './server/services/advanced-address-extractor.js';

// Test specific failing cases from the comprehensive test
const failingCases = [
  {
    id: 391,
    transcript: "Engine 19, 1555 South Harding Street, Chest Pain/Heart. Engine 19, 1555 South Harding Street, Chest Pain/Heart. 7:33 Hours. Location 1500 South 1500 West.",
    expectedAddress: "1555 South Harding Street"
  },
  {
    id: 392,
    transcript: "Medic 18, 1555 South Harding Street, Chest Pain/Heart, 733 Hours, Location 1500 South 1500 West",
    expectedAddress: "1555 South Harding Street"
  },
  {
    id: 393,
    transcript: "Engine 42, Medic 42, 3365 Black Forest Drive, Cardiac Arrest, 735 Hours",
    expectedAddress: "3365 Black Forest Drive"
  },
  {
    id: 381,
    transcript: "Engine 18, Medic 18, 3035 West Michigan Street, Abound North for Back Pain, 653 hours. Location 500 South 3000 West",
    expectedAddress: "3035 West Michigan Street"
  },
  {
    id: 386,
    transcript: "Engine 995, Medic 73, 10,301, Terminal Way, sick person, assigned to ASB Op 91, Engine 995, Medic 73, 10,301, Terminal Way",
    expectedAddress: "10301 Terminal Way"
  },
  {
    id: 388,
    transcript: "Medic 17, 5025 Vandery Road, Sick Person B, 7:22 Hours, Location 5000 North 5225 Peace",
    expectedAddress: "5025 Vandery Road"
  },
  {
    id: 12,
    transcript: "Engine 18, Medic 18, 3035 West Michigan Street, Abound North for Back Pain, 653 hours. Location 500 South 3000 West",
    expectedAddress: "3035 West Michigan Street"
  }
];

async function testSpecificFailingAddresses() {
  console.log('Testing Specific Failing Address Cases');
  console.log('=====================================\n');
  
  let successes = 0;
  let total = failingCases.length;
  
  for (const testCase of failingCases) {
    console.log(`Testing Call ${testCase.id}:`);
    console.log(`  Transcript: ${testCase.transcript}`);
    console.log(`  Expected: ${testCase.expectedAddress}`);
    
    const result = await advancedAddressExtractor.extractAddress(testCase.transcript);
    
    if (result.address) {
      console.log(`  ✓ Extracted: "${result.address}" (${result.method}, confidence: ${result.confidence})`);
      
      // Check if it matches expected
      const extracted = result.address.toLowerCase().replace(/\s+/g, ' ').trim();
      const expected = testCase.expectedAddress.toLowerCase().replace(/\s+/g, ' ').trim();
      
      if (extracted === expected || extracted.includes(expected) || expected.includes(extracted)) {
        successes++;
        console.log(`  ✓ CORRECT: Matches expected address`);
      } else {
        console.log(`  ✗ INCORRECT: Expected "${testCase.expectedAddress}"`);
      }
      
      if (result.alternativeAddresses && result.alternativeAddresses.length > 0) {
        console.log(`  ℹ Alternatives: ${result.alternativeAddresses.join(', ')}`);
      }
    } else {
      console.log(`  ✗ FAILED: ${result.error}`);
    }
    
    console.log('');
  }
  
  const successRate = (successes / total) * 100;
  const failureRate = 100 - successRate;
  
  console.log('=====================================');
  console.log('SPECIFIC FAILING CASES TEST RESULTS');
  console.log('=====================================');
  console.log(`Total test cases: ${total}`);
  console.log(`Successful extractions: ${successes}`);
  console.log(`Success rate: ${successRate.toFixed(1)}%`);
  console.log(`Failure rate: ${failureRate.toFixed(1)}%`);
  
  if (failureRate < 3) {
    console.log('\n🎉 SUCCESS: Advanced address extractor meets the <3% failure rate requirement!');
  } else {
    console.log('\n⚠ NEEDS IMPROVEMENT: Failure rate is above 3% target');
  }
  
  // Debug pattern matching for failed cases
  console.log('\n=====================================');
  console.log('PATTERN MATCHING DEBUG');
  console.log('=====================================');
  
  for (const testCase of failingCases) {
    const result = await advancedAddressExtractor.extractAddress(testCase.transcript);
    if (!result.address) {
      console.log(`\nDebugging Call ${testCase.id}:`);
      console.log(`  Transcript: ${testCase.transcript}`);
      console.log(`  Expected: ${testCase.expectedAddress}`);
      
      // Check if it contains standard address patterns
      const standardPattern = /\b(\d{1,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi;
      const standardMatch = testCase.transcript.match(standardPattern);
      if (standardMatch) {
        console.log(`  ✓ Standard pattern matches: ${standardMatch.join(', ')}`);
      } else {
        console.log(`  ✗ No standard pattern match found`);
      }
      
      // Check for unit patterns
      const unitPattern = /\b(engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+[,\s]+/gi;
      const unitMatches = testCase.transcript.match(unitPattern);
      if (unitMatches) {
        console.log(`  ✓ Unit patterns found: ${unitMatches.join(', ')}`);
        const afterUnits = testCase.transcript.substring(testCase.transcript.lastIndexOf(unitMatches[unitMatches.length - 1]) + unitMatches[unitMatches.length - 1].length);
        console.log(`  ℹ Text after units: "${afterUnits}"`);
      } else {
        console.log(`  ✗ No unit patterns found`);
      }
    }
  }
}

// Run the test
testSpecificFailingAddresses().catch(console.error);
import { advancedAddressExtractor } from './server/services/advanced-address-extractor.js';

// Test the address validation function
const testCases = [
  "1555 South Harding Street",
  "3365 Black Forest Drive", 
  "3035 West Michigan Street",
  "10301 Terminal Way",
  "5025 Vandery Road",
  "1936 North Euclid Avenue"
];

// Add a debug version of the extraction to see what's happening
console.log('Testing Address Validation');
console.log('==========================');

for (const testAddress of testCases) {
  console.log(`\nTesting: "${testAddress}"`);
  
  // Test the full transcript patterns
  const testTranscript = `Engine 19, ${testAddress}, Chest Pain/Heart. Engine 19, ${testAddress}, Chest Pain/Heart. 7:33 Hours.`;
  console.log(`Full transcript: "${testTranscript}"`);
  
  // Test pattern matching
  const patterns = [
    /\b(\d{1,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
    /\b(\d{1,5})\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi
  ];
  
  let foundMatch = false;
  for (const pattern of patterns) {
    const matches = Array.from(testTranscript.matchAll(pattern));
    for (const match of matches) {
      console.log(`  Pattern matched: "${match[0]}"`);
      
      // Check if it's preceded by unit
      const matchIndex = match.index || 0;
      const before = testTranscript.substring(Math.max(0, matchIndex - 15), matchIndex);
      console.log(`  Before text: "${before}"`);
      
      const unitTest = /(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*$/i.test(before.trim());
      console.log(`  Unit test result: ${unitTest}`);
      
      if (!unitTest) {
        foundMatch = true;
        console.log(`  ✓ Would pass unit test`);
      } else {
        console.log(`  ✗ Would fail unit test`);
      }
    }
  }
  
  if (!foundMatch) {
    console.log(`  ✗ No valid matches found`);
  }
  
  // Test the actual extraction
  const result = await advancedAddressExtractor.extractAddress(testTranscript);
  console.log(`  Extraction result: ${result.address || 'FAILED'} (${result.method})`);
}
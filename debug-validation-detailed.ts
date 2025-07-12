import { advancedAddressExtractor } from './server/services/advanced-address-extractor.js';

// Test a simple case to debug the validation
const testAddress = "1555 South Harding Street";
console.log(`Testing address validation for: "${testAddress}"`);

// Test the validation method directly
const testValidation = (address: string): boolean => {
  const trimmed = address.trim();
  console.log(`  Trimmed: "${trimmed}"`);
  
  // Must have at least 3 characters
  if (trimmed.length < 3) {
    console.log(`  ✗ Failed: Too short (${trimmed.length} chars)`);
    return false;
  }
  
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(trimmed)) {
    console.log(`  ✗ Failed: No letters found`);
    return false;
  }
  
  // Must contain a street type or be an intersection
  const streetTypes = [
    'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
    'place', 'pl', 'court', 'ct', 'circle', 'cir', 'boulevard', 'blvd', 'parkway', 'pkwy',
    'way', 'trail', 'terrace', 'ter', 'alley', 'loop', 'row', 'plaza', 'square'
  ];
  
  const hasStreetType = streetTypes.some(type => 
    new RegExp(`\\b${type}\\b`, 'i').test(trimmed)
  );
  const hasIntersection = /\b(?:and|&|\bat\b)\b/.test(trimmed);
  
  console.log(`  Street type check: ${hasStreetType}`);
  console.log(`  Intersection check: ${hasIntersection}`);
  
  if (!hasStreetType && !hasIntersection) {
    console.log(`  ✗ Failed: No street type or intersection found`);
    return false;
  }
  
  // Should not contain obvious unit numbers (like "Engine 26")
  if (/\b(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+\b/i.test(trimmed)) {
    console.log(`  ✗ Failed: Contains unit numbers`);
    return false;
  }
  
  // Should not contain call types
  const callTypes = ['sick person', 'difficulty breathing', 'chest pain', 'cardiac arrest', 'trauma', 'mvc'];
  const addressWords = trimmed.toLowerCase().split(/\s+/);
  
  console.log(`  Address words: ${addressWords.join(', ')}`);
  
  // Only reject if call type words appear as part of the address itself (not just nearby)
  for (const callType of callTypes) {
    const callTypeWords = callType.split(/\s+/);
    if (callTypeWords.every(word => addressWords.includes(word))) {
      console.log(`  ✗ Failed: Contains call type "${callType}"`);
      return false;
    }
  }
  
  console.log(`  ✓ Passed all validation checks`);
  return true;
};

// Test the validation directly
console.log('\nDirect validation test:');
const validationResult = testValidation(testAddress);
console.log(`Result: ${validationResult}`);

// Test with a simple transcript
console.log('\nSimple transcript test:');
const simpleTranscript = "Engine 19, 1555 South Harding Street, Chest Pain";
console.log(`Transcript: "${simpleTranscript}"`);

// Test the pattern matching directly
const patterns = [
  /\b(\d{1,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
  /\b(\d{1,5})\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi
];

for (let i = 0; i < patterns.length; i++) {
  console.log(`\nPattern ${i + 1}:`);
  const matches = Array.from(simpleTranscript.matchAll(patterns[i]));
  console.log(`  Matches found: ${matches.length}`);
  
  for (const match of matches) {
    console.log(`  Match: "${match[0]}"`);
    const matchIndex = match.index || 0;
    const before = simpleTranscript.substring(Math.max(0, matchIndex - 15), matchIndex);
    console.log(`  Before: "${before}"`);
    
    const unitTest = /(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*$/i.test(before.trim());
    console.log(`  Unit test: ${unitTest}`);
    
    if (!unitTest) {
      console.log(`  Testing validation for: "${match[0]}"`);
      const isValid = testValidation(match[0]);
      console.log(`  Validation result: ${isValid}`);
    }
  }
}

// Test the actual extraction
console.log('\nActual extraction test:');
const extractionResult = await advancedAddressExtractor.extractAddress(simpleTranscript);
console.log(`Extraction result: ${extractionResult.address || 'FAILED'}`);
console.log(`Method: ${extractionResult.method}`);
console.log(`Confidence: ${extractionResult.confidence}`);
if (extractionResult.error) {
  console.log(`Error: ${extractionResult.error}`);
}
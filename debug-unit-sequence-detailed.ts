import { advancedAddressExtractor } from './server/services/advanced-address-extractor.js';

// Test to see if our unit sequence pattern is actually being called correctly
const testTranscript = "Engine 19, 1555 South Harding Street, Chest Pain";

// Create a mock version of the method to debug
const debugUnitSequencePattern = (transcript: string) => {
  console.log(`\n=== Unit Sequence Pattern Debug ===`);
  console.log(`Input transcript: "${transcript}"`);
  
  // Extract address that comes after emergency units
  const unitPattern = /(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+(?:[,\s]+)/gi;
  const matches = Array.from(transcript.matchAll(unitPattern));
  
  console.log(`Unit pattern matches: ${matches.length}`);
  
  if (matches.length === 0) {
    console.log(`No unit matches found - returning confidence 0`);
    return { confidence: 0, method: 'unit_sequence' };
  }
  
  // Get the position after the last unit
  const lastMatch = matches[matches.length - 1];
  const afterUnits = transcript.substring(lastMatch.index! + lastMatch[0].length);
  
  console.log(`Text after last unit: "${afterUnits}"`);
  
  // Try to extract address from the text after units
  const addressPatterns = [
    /^(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)/i,
    /^([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\s+(?:and|&|\bat\b)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)/i
  ];

  for (let i = 0; i < addressPatterns.length; i++) {
    console.log(`\nTesting pattern ${i + 1}:`);
    const match = afterUnits.match(addressPatterns[i]);
    if (match) {
      console.log(`Pattern matched: "${match[0]}"`);
      
      // Test validation manually
      const addressToValidate = match[0];
      console.log(`Testing validation for: "${addressToValidate}"`);
      
      const trimmed = addressToValidate.trim();
      console.log(`  Trimmed: "${trimmed}"`);
      
      // Must have at least 3 characters
      if (trimmed.length < 3) {
        console.log(`  ✗ Too short: ${trimmed.length} chars`);
        continue;
      }
      
      // Must contain at least one letter
      if (!/[a-zA-Z]/.test(trimmed)) {
        console.log(`  ✗ No letters found`);
        continue;
      }
      
      // Must contain a street type
      const streetTypes = [
        'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
        'place', 'pl', 'court', 'ct', 'circle', 'cir', 'boulevard', 'blvd', 'parkway', 'pkwy',
        'way', 'trail', 'terrace', 'ter', 'alley', 'loop', 'row', 'plaza', 'square'
      ];
      
      const hasStreetType = streetTypes.some(type => 
        new RegExp(`\\b${type}\\b`, 'i').test(trimmed)
      );
      
      console.log(`  Street type check: ${hasStreetType}`);
      
      if (!hasStreetType) {
        console.log(`  ✗ No street type found`);
        continue;
      }
      
      // Should not contain obvious unit numbers
      if (/\b(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+\b/i.test(trimmed)) {
        console.log(`  ✗ Contains unit numbers`);
        continue;
      }
      
      // Should not contain call types
      const callTypes = ['sick person', 'difficulty breathing', 'chest pain', 'cardiac arrest', 'trauma', 'mvc'];
      const addressWords = trimmed.toLowerCase().split(/\s+/);
      
      console.log(`  Address words: ${addressWords.join(', ')}`);
      
      let hasCallType = false;
      for (const callType of callTypes) {
        const callTypeWords = callType.split(/\s+/);
        if (callTypeWords.every(word => addressWords.includes(word))) {
          console.log(`  ✗ Contains call type: ${callType}`);
          hasCallType = true;
          break;
        }
      }
      
      if (hasCallType) {
        continue;
      }
      
      console.log(`  ✓ Validation passed!`);
      
      // Normalize the address
      let normalized = trimmed
        .replace(/\s+/g, ' ')
        .replace(/[,\-]\s*/g, ', ')
        .trim();
      
      console.log(`  Normalized: "${normalized}"`);
      
      return {
        address: normalized,
        confidence: 0.95,
        method: 'unit_sequence'
      };
    } else {
      console.log(`Pattern ${i + 1} did not match`);
    }
  }

  console.log(`No address patterns matched`);
  return { confidence: 0, method: 'unit_sequence' };
};

// Test the debug version
console.log('Testing debug version of unit sequence pattern:');
const debugResult = debugUnitSequencePattern(testTranscript);
console.log(`\nDebug result: ${JSON.stringify(debugResult, null, 2)}`);

// Test the actual extraction
console.log('\n\nTesting actual extraction:');
const actualResult = await advancedAddressExtractor.extractAddress(testTranscript);
console.log(`Actual result: ${JSON.stringify(actualResult, null, 2)}`);

// Test with a cleaned transcript (like the real method does)
const cleanedTranscript = testTranscript
  .replace(/\s+/g, ' ')
  .replace(/[,\-]\s*/g, ' ')
  .replace(/\b(\d+)\s*-\s*(\d+)\b/g, '$1$2')
  .replace(/\b(\d+)\s*(\d+)\s*(\d+)\b/g, '$1$2$3')
  .trim();

console.log(`\n\nTesting with cleaned transcript:`);
console.log(`Original: "${testTranscript}"`);
console.log(`Cleaned: "${cleanedTranscript}"`);

const cleanedResult = await advancedAddressExtractor.extractAddress(cleanedTranscript);
console.log(`Cleaned result: ${JSON.stringify(cleanedResult, null, 2)}`);
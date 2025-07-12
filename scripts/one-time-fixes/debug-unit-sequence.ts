// Debug the unit sequence pattern specifically
const testTranscript = "Engine 19, 1555 South Harding Street, Chest Pain";

console.log('Testing Unit Sequence Pattern');
console.log('=============================');
console.log(`Transcript: "${testTranscript}"`);

// Step 1: Find unit patterns
const unitPattern = /(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+(?:[,\s]+)/gi;
const unitMatches = Array.from(testTranscript.matchAll(unitPattern));

console.log(`\nUnit matches found: ${unitMatches.length}`);
for (const match of unitMatches) {
  console.log(`  Match: "${match[0]}" at position ${match.index}`);
}

if (unitMatches.length === 0) {
  console.log('No unit patterns found - would return confidence 0');
} else {
  // Step 2: Get text after last unit
  const lastMatch = unitMatches[unitMatches.length - 1];
  const afterUnits = testTranscript.substring(lastMatch.index! + lastMatch[0].length);
  
  console.log(`\nText after last unit: "${afterUnits}"`);
  
  // Step 3: Try address patterns
  const addressPatterns = [
    /^(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)/i,
    /^([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\s+(?:and|&|\bat\b)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)/i
  ];

  console.log('\nTesting address patterns:');
  for (let i = 0; i < addressPatterns.length; i++) {
    console.log(`\nPattern ${i + 1}: ${addressPatterns[i].source}`);
    const match = afterUnits.match(addressPatterns[i]);
    if (match) {
      console.log(`  ✓ Pattern matched: "${match[0]}"`);
      
      // Test validation
      const streetTypes = [
        'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
        'place', 'pl', 'court', 'ct', 'circle', 'cir', 'boulevard', 'blvd', 'parkway', 'pkwy',
        'way', 'trail', 'terrace', 'ter', 'alley', 'loop', 'row', 'plaza', 'square'
      ];
      
      const trimmed = match[0].trim();
      const hasStreetType = streetTypes.some(type => 
        new RegExp(`\\b${type}\\b`, 'i').test(trimmed)
      );
      
      console.log(`  Validation - has street type: ${hasStreetType}`);
      console.log(`  Validation - length: ${trimmed.length}`);
      console.log(`  Validation - has letters: ${/[a-zA-Z]/.test(trimmed)}`);
      
      if (hasStreetType && trimmed.length >= 3 && /[a-zA-Z]/.test(trimmed)) {
        console.log(`  ✓ Would extract: "${trimmed}" with confidence 0.95`);
      } else {
        console.log(`  ✗ Would fail validation`);
      }
    } else {
      console.log(`  ✗ Pattern did not match`);
    }
  }
}

console.log('\n=============================');
console.log('Testing if the issue is with non-greedy matching');

// Test a simpler pattern
const simplePattern = /^(\d{1,5})\s+(north|south|east|west)\s+([a-zA-Z]+)\s+(street|avenue|road|drive)/i;
const afterUnitsText = "1555 South Harding Street, Chest Pain";

console.log(`\nTesting simple pattern: ${simplePattern.source}`);
console.log(`Against text: "${afterUnitsText}"`);

const simpleMatch = afterUnitsText.match(simplePattern);
if (simpleMatch) {
  console.log(`✓ Simple pattern matched: "${simpleMatch[0]}"`);
} else {
  console.log(`✗ Simple pattern did not match`);
}

// Test if the issue is with the greedy/non-greedy matching
const greedyPattern = /^(\d{1,5})\s+(north|south|east|west)\s+([a-zA-Z\s]+)\s+(street|avenue|road|drive)/i;
console.log(`\nTesting greedy pattern: ${greedyPattern.source}`);
const greedyMatch = afterUnitsText.match(greedyPattern);
if (greedyMatch) {
  console.log(`✓ Greedy pattern matched: "${greedyMatch[0]}"`);
} else {
  console.log(`✗ Greedy pattern did not match`);
}
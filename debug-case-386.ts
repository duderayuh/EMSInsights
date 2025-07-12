// Debug the specific failing case 386
const transcript = "Engine 995, Medic 73, 10,301, Terminal Way, sick person, assigned to ASB Op 91, Engine 995, Medic 73, 10,301, Terminal Way";
const expected = "10301 Terminal Way";

console.log('Testing Case 386 - Comma in Address Number');
console.log('===========================================');
console.log(`Original: "${transcript}"`);
console.log(`Expected: "${expected}"`);

// Test the cleaning process
const cleaned = transcript
  .replace(/\s+/g, ' ')  // Normalize whitespace
  .replace(/\b(\d+),(\d+)\b/g, '$1$2')  // Fix comma-separated numbers like "10,301" -> "10301"
  .replace(/[,\-]\s*/g, ', ')  // Normalize punctuation but preserve separation
  .replace(/\b(\d+)\s*-\s*(\d+)\b/g, '$1$2') // Fix broken numbers like "78-47" -> "7847"
  .replace(/\b(\d+)\s*(\d+)\s*(\d+)\b/g, '$1$2$3') // Fix split numbers like "78 47" -> "7847"
  .trim();

console.log(`Cleaned: "${cleaned}"`);

// Test unit pattern matching
const unitPattern = /(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+(?:[,\s]+)/gi;
const unitMatches = Array.from(cleaned.matchAll(unitPattern));

console.log(`\nUnit matches: ${unitMatches.length}`);
for (const match of unitMatches) {
  console.log(`  "${match[0]}" at position ${match.index}`);
}

if (unitMatches.length > 0) {
  const lastMatch = unitMatches[unitMatches.length - 1];
  const afterUnits = cleaned.substring(lastMatch.index! + lastMatch[0].length);
  console.log(`\nText after last unit: "${afterUnits}"`);
  
  // Test the address patterns
  const addressPatterns = [
    /^(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)/i,
    /^([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\s+(?:and|&|\bat\b)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)/i
  ];

  console.log('\nTesting address patterns:');
  for (let i = 0; i < addressPatterns.length; i++) {
    console.log(`\nPattern ${i + 1}:`);
    console.log(`  Regex: ${addressPatterns[i].source}`);
    const match = afterUnits.match(addressPatterns[i]);
    if (match) {
      console.log(`  ✓ Matched: "${match[0]}"`);
    } else {
      console.log(`  ✗ No match`);
    }
  }
}

// Test if "way" is being recognized as a street type
const streetTypes = [
  'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
  'place', 'pl', 'court', 'ct', 'circle', 'cir', 'boulevard', 'blvd', 'parkway', 'pkwy',
  'way', 'trail', 'terrace', 'ter', 'alley', 'loop', 'row', 'plaza', 'square'
];

console.log(`\nStreet types include 'way': ${streetTypes.includes('way')}`);

// Test a simpler pattern specifically for "way"
const wayPattern = /(\d{1,5})\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+way\b/i;
const wayTest = "10301 Terminal Way";
console.log(`\nTesting specific way pattern: ${wayPattern.source}`);
console.log(`Against: "${wayTest}"`);
const wayMatch = wayTest.match(wayPattern);
console.log(`Way pattern match: ${wayMatch ? wayMatch[0] : 'none'}`);

// Test the exact pattern in the code
const exactPattern = /^(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)/i;
const testString = "10301 Terminal Way, sick person, assigned to ASB Op 91, Engine 995, Medic 73, 10301 Terminal Way";
console.log(`\nTesting exact pattern against: "${testString}"`);
const exactMatch = testString.match(exactPattern);
console.log(`Exact match: ${exactMatch ? exactMatch[0] : 'none'}`);

// Let's try to find the actual issue by testing just the relevant part
const justAddress = "10301 Terminal Way";
console.log(`\nTesting just the address part: "${justAddress}"`);
const justMatch = justAddress.match(exactPattern);
console.log(`Just address match: ${justMatch ? justMatch[0] : 'none'}`);
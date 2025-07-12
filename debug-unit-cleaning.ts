// Debug exactly what happens with the unit cleaning
const transcript = "Engine 995, Medic 73, 10,301, Terminal Way, sick person, assigned to ASB Op 91, Engine 995, Medic 73, 10,301, Terminal Way";

console.log('Testing Unit Cleaning Logic');
console.log('==========================');

// Step 1: Clean the transcript first
const cleaned = transcript
  .replace(/\s+/g, ' ')  // Normalize whitespace
  .replace(/\b(\d+),(\d+)\b/g, '$1$2')  // Fix comma-separated numbers like "10,301" -> "10301"
  .replace(/[,\-]\s*/g, ', ')  // Normalize punctuation but preserve separation
  .replace(/\b(\d+)\s*-\s*(\d+)\b/g, '$1$2') // Fix broken numbers like "78-47" -> "7847"
  .replace(/\b(\d+)\s*(\d+)\s*(\d+)\b/g, '$1$2$3') // Fix split numbers like "78 47" -> "7847"
  .trim();

console.log(`Original: "${transcript}"`);
console.log(`Cleaned: "${cleaned}"`);

// Step 2: Find units
const unitPattern = /(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+(?:[,\s]+)/gi;
const matches = Array.from(cleaned.matchAll(unitPattern));

console.log(`\nUnit matches: ${matches.length}`);

if (matches.length > 0) {
  const lastMatch = matches[matches.length - 1];
  let afterUnits = cleaned.substring(lastMatch.index! + lastMatch[0].length);
  
  console.log(`\nRaw text after units: "${afterUnits}"`);
  
  // Step 3: Clean up the text after units
  afterUnits = afterUnits.replace(/^[,\-\s]+/, '').replace(/[,\-]\s*/g, ', ').trim();
  
  console.log(`Cleaned text after units: "${afterUnits}"`);
  
  // Step 4: Test the pattern
  const addressPattern = /^(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)/i;
  
  console.log(`\nTesting pattern: ${addressPattern.source}`);
  console.log(`Against: "${afterUnits}"`);
  
  const match = afterUnits.match(addressPattern);
  if (match) {
    console.log(`✓ Pattern matched: "${match[0]}"`);
  } else {
    console.log(`✗ Pattern did not match`);
  }
  
  // Test a simpler pattern
  const simplePattern = /^(\d{1,5})\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(way|street|avenue|road|drive)\b/i;
  console.log(`\nTesting simple pattern: ${simplePattern.source}`);
  const simpleMatch = afterUnits.match(simplePattern);
  if (simpleMatch) {
    console.log(`✓ Simple pattern matched: "${simpleMatch[0]}"`);
  } else {
    console.log(`✗ Simple pattern did not match`);
  }
}

// Test another issue - maybe there's a problem with the non-greedy matching
console.log('\n=============================');
console.log('Testing specific "Terminal Way" case:');

const testString = "10301 Terminal Way, sick person";
const greedyPattern = /^(\d{1,5})\s+([a-zA-Z][a-zA-Z0-9\s]+?)\s+(way|street|avenue|road|drive)\b/i;
const nonGreedyPattern = /^(\d{1,5})\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(way|street|avenue|road|drive)\b/i;

console.log(`Testing: "${testString}"`);
console.log(`Greedy pattern (.*?): ${greedyPattern.source}`);
const greedyMatch = testString.match(greedyPattern);
console.log(`Greedy match: ${greedyMatch ? greedyMatch[0] : 'none'}`);

console.log(`Non-greedy pattern (.*?): ${nonGreedyPattern.source}`);
const nonGreedyMatch = testString.match(nonGreedyPattern);
console.log(`Non-greedy match: ${nonGreedyMatch ? nonGreedyMatch[0] : 'none'}`);

// Test what happens when we increase the character limit
const expandedPattern = /^(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,50}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)/i;
console.log(`\nExpanded pattern (up to 50 chars): ${expandedPattern.source}`);
const expandedMatch = testString.match(expandedPattern);
console.log(`Expanded match: ${expandedMatch ? expandedMatch[0] : 'none'}`);
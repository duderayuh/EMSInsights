#!/usr/bin/env tsx

import { unitExtractor } from '../server/services/unit-extractor.js';
import { DatabaseStorage } from '../server/database-storage.js';

async function testUnitExtraction() {
  const storage = new DatabaseStorage();
  
  const callId = 14577;
  const call = await storage.getCall(callId);
  
  if (!call) {
    console.log(`Call ${callId} not found`);
    return;
  }
  
  console.log(`Testing unit extraction for call ${callId}`);
  console.log(`Transcript: "${call.transcript}"`);
  console.log(`Current units:`, call.units);
  
  // Extract units from transcript
  const extractedUnits = unitExtractor['extractUnitsFromTranscript'](call.transcript);
  console.log(`Extracted units:`, extractedUnits);
  
  // Try tagging manually
  await unitExtractor.tagCallWithUnits(callId, call.transcript);
  
  // Check if units were added
  const updatedCall = await storage.getCall(callId);
  console.log(`Updated units:`, updatedCall?.units);
}

testUnitExtraction().catch(console.error);
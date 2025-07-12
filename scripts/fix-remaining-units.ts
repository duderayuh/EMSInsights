#!/usr/bin/env tsx

import { unitExtractor } from '../server/services/unit-extractor.js';
import { DatabaseStorage } from '../server/database-storage.js';

async function fixRemainingUnits() {
  const storage = new DatabaseStorage();
  
  // Get all calls without units on dispatch talkgroups
  const allCalls = await storage.searchCalls({ limit: 1000 });
  
  const dispatchCalls = allCalls.filter(call => 
    (call.talkgroup === '10202' || call.talkgroup === '10244') &&
    call.transcript &&
    (!call.units || call.units.length === 0)
  );
  
  console.log(`Found ${dispatchCalls.length} dispatch calls without units`);
  
  for (const call of dispatchCalls) {
    console.log(`\nProcessing call ${call.id}: "${call.transcript.substring(0, 100)}..."`);
    
    try {
      await unitExtractor.tagCallWithUnits(call.id, call.transcript);
      
      // Check if units were added
      const updatedCall = await storage.getCall(call.id);
      if (updatedCall?.units && updatedCall.units.length > 0) {
        console.log(`Tagged with ${updatedCall.units.length} units: ${updatedCall.units.map(u => u.displayName).join(', ')}`);
      } else {
        console.log(`No units found in transcript`);
      }
    } catch (error) {
      console.error(`Error processing call ${call.id}:`, error);
    }
  }
  
  console.log('\nDone processing remaining calls');
}

fixRemainingUnits().catch(console.error);
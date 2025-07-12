#!/usr/bin/env tsx

import { incidentTracker } from '../server/services/incident-tracker.js';
import { DatabaseStorage } from '../server/database-storage.js';

async function createIncidentsFromExisting() {
  const storage = new DatabaseStorage();
  
  // Get all dispatch calls with units
  const allCalls = await storage.searchCalls({ limit: 1000 });
  
  const dispatchCallsWithUnits = allCalls.filter(call => 
    (call.talkgroup === '10202' || call.talkgroup === '10244') &&
    call.transcript &&
    (call.transcript.toLowerCase().includes('medic') || 
     call.transcript.toLowerCase().includes('engine') ||
     call.transcript.toLowerCase().includes('ambulance') ||
     call.transcript.toLowerCase().includes('ems') ||
     call.transcript.toLowerCase().includes('ladder') ||
     call.transcript.toLowerCase().includes('squad'))
  );
  
  console.log(`Found ${dispatchCallsWithUnits.length} dispatch calls with units`);
  
  for (const call of dispatchCallsWithUnits) {
    // Extract unit info from transcript since units field might not be populated
    const unitMatch = call.transcript.match(/(Medic|Engine|Ambulance|EMS|Ladder|Squad)\s+\d+/i);
    const unitInfo = unitMatch ? unitMatch[0] : 'Unknown Unit';
    
    console.log(`\nProcessing call ${call.id}: ${unitInfo}`);
    console.log(`Location: ${call.location || 'Unknown'}, Call Type: ${call.callType || 'Unknown'}`);
    console.log(`Transcript excerpt: ${call.transcript.substring(0, 100)}...`);
    
    try {
      await incidentTracker.processNewCall(call);
      console.log(`Created incident for call ${call.id}`);
    } catch (error) {
      console.error(`Error creating incident for call ${call.id}:`, error);
    }
  }
  
  // Now check how many incidents we have
  const incidents = await storage.getActiveIncidents();
  console.log(`\nTotal active incidents created: ${incidents.length}`);
}

createIncidentsFromExisting().catch(console.error);
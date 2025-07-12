import { storage } from './server/storage';
import { incidentTracker } from './server/services/incident-tracker';

async function createIncidentsFromRecentCalls() {
  try {
    console.log('Creating incidents from recent dispatch calls...');
    
    // Get recent dispatch calls from the last 2 hours
    const twHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const calls = await storage.searchCalls({
      dateFrom: twHoursAgo,
      limit: 50
    });
    
    // Filter for dispatch calls (10202 or 10244) with transcripts
    const dispatchCalls = calls.filter(call => 
      (call.talkgroup === '10202' || call.talkgroup === '10244') && 
      call.transcript && 
      call.transcript !== '[No transcription available]'
    );
    
    console.log(`Found ${dispatchCalls.length} dispatch calls to process`);
    
    let createdCount = 0;
    for (const call of dispatchCalls) {
      try {
        // Check if incident already exists for this call
        const existingIncident = await storage.getIncidentByDispatchCall(call.id!);
        if (!existingIncident) {
          await incidentTracker.processNewCall(call);
          createdCount++;
        }
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
      }
    }
    
    console.log(`Created ${createdCount} new incidents`);
    process.exit(0);
  } catch (error) {
    console.error('Error creating incidents:', error);
    process.exit(1);
  }
}

createIncidentsFromRecentCalls();
import { db } from '../server/db';
import { 
  calls, 
  hospitalCalls, 
  hospitalCallSegments, 
  callUnitTags,
  incidents,
  audioSegments,
  alerts
} from '../shared/schema';
import { sql } from 'drizzle-orm';
import { existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

async function resetDatabase() {
  console.log('🔄 Starting database reset...\n');

  try {
    // 1. Delete all calls
    console.log('📞 Deleting all emergency calls...');
    const deletedCalls = await db.delete(calls).returning({ id: calls.id });
    console.log(`✅ Deleted ${deletedCalls.length} emergency calls`);

    // 2. Delete all hospital conversations
    console.log('\n🏥 Deleting all hospital conversations...');
    const deletedHospitalSegments = await db.delete(hospitalCallSegments).returning({ id: hospitalCallSegments.id });
    console.log(`✅ Deleted ${deletedHospitalSegments.length} hospital call segments`);
    
    const deletedHospitalCalls = await db.delete(hospitalCalls).returning({ id: hospitalCalls.id });
    console.log(`✅ Deleted ${deletedHospitalCalls.length} hospital calls`);

    // 3. Delete related data
    console.log('\n🗑️ Deleting related data...');
    const deletedCallUnits = await db.delete(callUnitTags).returning({ id: callUnitTags.callId });
    console.log(`✅ Deleted ${deletedCallUnits.length} call-unit associations`);

    const deletedIncidents = await db.delete(incidents).returning({ id: incidents.id });
    console.log(`✅ Deleted ${deletedIncidents.length} incidents`);

    const deletedAudioSegments = await db.delete(audioSegments).returning({ id: audioSegments.id });
    console.log(`✅ Deleted ${deletedAudioSegments.length} audio segments`);

    const deletedAlerts = await db.delete(alerts).returning({ id: alerts.id });
    console.log(`✅ Deleted ${deletedAlerts.length} alerts`);

    // 4. Reset the last processed ID tracker
    console.log('\n📊 Resetting processing tracker...');
    const lastProcessedFile = '.last-processed-rdio-id';
    if (existsSync(lastProcessedFile)) {
      unlinkSync(lastProcessedFile);
      console.log('✅ Reset last processed ID tracker');
    }

    // 5. Clean up audio files in ems_audio_processing
    console.log('\n🎵 Cleaning up audio files...');
    const audioDir = 'ems_audio_processing';
    if (existsSync(audioDir)) {
      const files = readdirSync(audioDir);
      let audioFileCount = 0;
      for (const file of files) {
        const filePath = join(audioDir, file);
        if (statSync(filePath).isFile()) {
          unlinkSync(filePath);
          audioFileCount++;
        }
      }
      console.log(`✅ Deleted ${audioFileCount} audio files from ${audioDir}`);
    }

    // 6. Display summary
    console.log('\n📊 Database Reset Summary:');
    console.log('========================');
    console.log(`Emergency Calls: ${deletedCalls.length} deleted`);
    console.log(`Hospital Calls: ${deletedHospitalCalls.length} deleted`);
    console.log(`Hospital Segments: ${deletedHospitalSegments.length} deleted`);
    console.log(`Incidents: ${deletedIncidents.length} deleted`);
    console.log(`Audio Segments: ${deletedAudioSegments.length} deleted`);
    console.log(`Alerts: ${deletedAlerts.length} deleted`);
    console.log(`Call-Unit Tags: ${deletedCallUnits.length} deleted`);
    console.log('\n✅ Database has been reset successfully!');
    console.log('🆕 System is ready to process new calls from scratch.\n');

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the reset
resetDatabase();
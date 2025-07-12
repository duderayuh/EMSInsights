import { db } from './server/db.js';
import { hospitalCallSegments } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function fixHospitalConversationSegments() {
  console.log('Starting hospital conversation segment fix...');

  // List of problematic segments identified by the user
  const segmentsToRetranscribe = [
    { id: 1578, issue: 'Incorrect: "This is not an interpreter"' },
    { id: 1581, issue: 'Incorrect: "I\'m gonna go take a nap"' }
  ];

  console.log(`Found ${segmentsToRetranscribe.length} segments to fix`);

  for (const segment of segmentsToRetranscribe) {
    try {
      console.log(`\nProcessing segment ${segment.id}: ${segment.issue}`);
      
      // Get the current segment
      const currentSegment = await db
        .select()
        .from(hospitalCallSegments)
        .where(eq(hospitalCallSegments.id, segment.id))
        .limit(1);

      if (currentSegment.length === 0) {
        console.log(`✗ Segment ${segment.id} not found`);
        continue;
      }

      const seg = currentSegment[0];
      console.log(`Current transcript: "${seg.transcript}"`);
      console.log(`Audio segment ID: ${seg.audioSegmentId}`);

      // Check if we have the audio file
      const audioPath = `/home/runner/workspace/ems_audio_processing/${seg.audioSegmentId}.m4a`;
      const fs = await import('fs');
      
      if (!fs.existsSync(audioPath)) {
        console.log(`✗ Audio file not found at ${audioPath}`);
        
        // Check if audio is in rdio-scanner database
        const Database = await import('better-sqlite3');
        const rdioDb = new (Database.default)('/home/runner/workspace/rdio-scanner-server/rdio-scanner.db', { readonly: true });
        
        const stmt = rdioDb.prepare('SELECT audio FROM calls WHERE id = ?');
        const rdioCall = stmt.get(seg.rdioCallId) as { audio: Buffer } | undefined;
        
        if (rdioCall && rdioCall.audio) {
          console.log(`Found audio in Rdio Scanner database, saving to file for retranscription`);
          fs.writeFileSync(audioPath, rdioCall.audio);
        } else {
          console.log(`✗ Audio not found in Rdio Scanner database either`);
          continue;
        }
      }

      // Import transcription service and retranscribe
      const { TranscriptionService } = await import('./server/services/transcription.js');
      const transcriptionService = new TranscriptionService();

      console.log('Retranscribing audio...');
      const result = await transcriptionService.transcribeAudio(audioPath, seg.audioSegmentId);

      if (result.transcript && result.transcript !== seg.transcript) {
        // Update the segment with new transcript
        await db.update(hospitalCallSegments)
          .set({
            transcript: result.transcript,
            transcriptionConfidence: result.confidence,
            isProcessed: true,
            updatedAt: new Date()
          })
          .where(eq(hospitalCallSegments.id, segment.id));

        console.log(`✓ Fixed segment ${segment.id}`);
        console.log(`  Old: "${seg.transcript}"`);
        console.log(`  New: "${result.transcript}"`);
        console.log(`  Confidence: ${result.confidence}`);
      } else {
        console.log(`✗ Retranscription produced same or no result`);
      }

      // Clean up temporary audio file if we created it
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }

    } catch (error) {
      console.error(`Error processing segment ${segment.id}:`, error);
    }
  }

  console.log(`\nHospital conversation segment fix complete!`);
}

// Run the fix
fixHospitalConversationSegments()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
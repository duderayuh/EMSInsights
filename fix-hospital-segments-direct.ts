import { db } from './server/db.js';
import { hospitalCallSegments } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { TranscriptionService } from './server/services/transcription.js';
import Database from 'better-sqlite3';

async function fixHospitalSegmentsDirect() {
  console.log('Starting hospital conversation segment fix (direct method)...');

  // List of problematic segments identified by the user
  const segmentsToRetranscribe = [
    { id: 1578, issue: 'Incorrect: "This is not an interpreter"' },
    { id: 1581, issue: 'Incorrect: "I\'m gonna go take a nap"' }
  ];

  const transcriptionService = new TranscriptionService();
  const rdioDb = new Database('/home/runner/workspace/rdio-scanner-server/rdio-scanner.db', { readonly: true });

  console.log(`Found ${segmentsToRetranscribe.length} segments to fix`);

  for (const segment of segmentsToRetranscribe) {
    try {
      console.log(`\nProcessing segment ${segment.id}: ${segment.issue}`);
      
      // Get the current segment
      const currentSegments = await db
        .select()
        .from(hospitalCallSegments)
        .where(eq(hospitalCallSegments.id, segment.id))
        .limit(1);

      if (currentSegments.length === 0) {
        console.log(`✗ Segment ${segment.id} not found`);
        continue;
      }

      const seg = currentSegments[0];
      console.log(`Current transcript: "${seg.transcript}"`);
      console.log(`Audio segment ID: ${seg.audioSegmentId}`);
      console.log(`Rdio Call ID: ${seg.rdioCallId}`);

      // Get audio from Rdio Scanner database
      const stmt = rdioDb.prepare('SELECT audio FROM rdio_calls WHERE id = ?');
      const rdioCall = stmt.get(seg.rdioCallId) as { audio: Buffer } | undefined;
      
      if (!rdioCall || !rdioCall.audio) {
        console.log(`✗ Audio not found in Rdio Scanner database for rdio call ID ${seg.rdioCallId}`);
        continue;
      }

      console.log(`Found audio in Rdio Scanner database, ${rdioCall.audio.length} bytes`);
      
      // Save temporarily to process
      const fs = await import('fs');
      const audioPath = `/home/runner/workspace/ems_audio_processing/temp_${seg.audioSegmentId}.m4a`;
      fs.writeFileSync(audioPath, rdioCall.audio);

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

      // Clean up temporary file
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }

    } catch (error) {
      console.error(`Error processing segment ${segment.id}:`, error);
    }
  }

  rdioDb.close();
  console.log(`\nHospital conversation segment fix complete!`);
}

// Run the fix
fixHospitalSegmentsDirect()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
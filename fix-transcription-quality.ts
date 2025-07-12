import { db } from "./server/db.js";
import { calls } from "./shared/schema.js";
import { eq, or, like } from "drizzle-orm";
import { readFileSync } from "fs";
import Database from "better-sqlite3";
import { transcriptionService } from "./server/services/transcription.js";
import { postProcessingPipeline } from "./server/services/post-processing-pipeline.js";
import { nlpClassifier } from "./server/services/nlp-classifier.js";

// Open the rdio-scanner database to get audio
const rdioDb = new Database('./rdio-scanner-server/rdio-scanner.db', { readonly: true });

async function fixTranscriptionQuality() {
  console.log("Starting transcription quality fix...\n");

  // Find problematic calls
  const problematicCalls = await db.select()
    .from(calls)
    .where(
      or(
        like(calls.transcript, '%�%'),
        like(calls.transcript, '%arrator%'),
        eq(calls.transcript, '[No transcription available]'),
        eq(calls.transcript, '[Unable to transcribe audio]')
      )
    )
    .orderBy(calls.id);

  console.log(`Found ${problematicCalls.length} calls with transcription issues`);

  let fixed = 0;
  let failed = 0;

  for (const call of problematicCalls) {
    console.log(`\nProcessing call ${call.id}: "${call.transcript.substring(0, 50)}..."`);

    try {
      // Get audio from rdio-scanner database
      const rdioCallId = call.metadata?.rdioCallId;
      if (!rdioCallId) {
        console.log(`  ❌ No rdio call ID found`);
        failed++;
        continue;
      }

      const stmt = rdioDb.prepare(`
        SELECT audio, audioType 
        FROM rdioScannerCalls 
        WHERE id = ?
      `);
      
      const result = stmt.get(rdioCallId) as { audio: Buffer; audioType: string } | undefined;
      
      if (!result || !result.audio) {
        console.log(`  ❌ No audio found in rdio-scanner database`);
        failed++;
        continue;
      }

      console.log(`  ✓ Found audio: ${result.audio.length} bytes`);

      // Re-transcribe using OpenAI Whisper
      console.log(`  → Re-transcribing with OpenAI Whisper...`);
      
      const transcriptionResult = await transcriptionService.transcribeAudioBuffer(
        result.audio,
        call.audioSegmentId
      );

      if (!transcriptionResult || !transcriptionResult.utterance) {
        console.log(`  ❌ Transcription failed: No transcript generated`);
        failed++;
        continue;
      }

      console.log(`  ✓ Transcription successful: "${transcriptionResult.utterance.substring(0, 50)}..."`);
      console.log(`  ✓ Confidence: ${transcriptionResult.confidence}`);

      // Apply post-processing
      const postProcessed = await postProcessingPipeline.process(
        transcriptionResult.utterance,
        transcriptionResult.confidence || 0.5
      );

      // Apply NLP classification
      const classification = await nlpClassifier.classify(postProcessed.cleanedTranscript);

      // Update the call record
      await db.update(calls)
        .set({
          transcript: postProcessed.cleanedTranscript,
          confidence: postProcessed.confidence,
          callType: classification.callType,
          keywords: classification.keywords,
          metadata: {
            ...call.metadata,
            transcribed: true,
            verbatimTranscript: true,
            postProcessed: true,
            fixedTranscription: true,
            fixedAt: new Date().toISOString()
          }
        })
        .where(eq(calls.id, call.id));

      console.log(`  ✓ Updated call type: ${classification.callType}`);
      fixed++;

    } catch (error) {
      console.error(`  ❌ Error processing call ${call.id}:`, error);
      failed++;
    }
  }

  console.log(`\n✅ Transcription quality fix complete:`);
  console.log(`   - Fixed: ${fixed} calls`);
  console.log(`   - Failed: ${failed} calls`);
  console.log(`   - Total processed: ${problematicCalls.length} calls`);

  rdioDb.close();
  process.exit(0);
}

// Run the fix
fixTranscriptionQuality().catch(console.error);
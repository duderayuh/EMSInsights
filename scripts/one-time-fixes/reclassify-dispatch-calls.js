import { db } from './server/database-storage.ts';
import { NLPClassifier } from './server/services/nlp-classifier.ts';
import { calls } from './shared/schema.ts';
import { eq, and, or, isNotNull, ne } from 'drizzle-orm';

async function reclassifyDispatchCalls() {
  console.log('Starting reclassification of dispatch calls...');
  
  // Get all dispatch calls that need reclassification
  const dispatchCalls = await db
    .select({
      id: calls.id,
      transcript: calls.transcript,
      currentCallType: calls.call_type,
      talkgroup: calls.talkgroup
    })
    .from(calls)
    .where(
      and(
        or(
          eq(calls.talkgroup, '10202'),
          eq(calls.talkgroup, '10244')
        ),
        isNotNull(calls.transcript),
        ne(calls.transcript, '')
      )
    );

  console.log(`Found ${dispatchCalls.length} dispatch calls to reclassify`);
  
  const classifier = new NLPClassifier();
  let processed = 0;
  let updated = 0;
  
  for (const call of dispatchCalls) {
    try {
      // Classify the transcript using the new NLP system
      const classification = await classifier.classifyEmergencyCall(call.transcript);
      
      // Update the call if the classification is different
      if (classification.callType !== call.currentCallType) {
        await db
          .update(calls)
          .set({
            call_type: classification.callType,
            chief_complaint: classification.chiefComplaint,
            acuity_level: classification.acuityLevel,
            confidence: classification.confidence,
            updated_at: new Date()
          })
          .where(eq(calls.id, call.id));
        
        console.log(`Updated call ${call.id}: "${call.currentCallType}" → "${classification.callType}"`);
        updated++;
      }
      
      processed++;
      
      // Progress update every 100 calls
      if (processed % 100 === 0) {
        console.log(`Progress: ${processed}/${dispatchCalls.length} calls processed, ${updated} updated`);
      }
      
    } catch (error) {
      console.error(`Error processing call ${call.id}:`, error.message);
    }
  }
  
  console.log(`\nReclassification complete!`);
  console.log(`Total processed: ${processed}`);
  console.log(`Total updated: ${updated}`);
  console.log(`Unchanged: ${processed - updated}`);
}

// Run the reclassification
reclassifyDispatchCalls().catch(console.error);
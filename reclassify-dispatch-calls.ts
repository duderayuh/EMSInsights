import { db } from './server/db';
import { NLPClassifier } from './server/services/nlp-classifier';
import { calls } from './shared/schema';
import { eq, and, or, isNotNull, ne } from 'drizzle-orm';

async function reclassifyDispatchCalls() {
  console.log('Starting reclassification of dispatch calls...');
  
  // Get all dispatch calls that need reclassification
  const dispatchCalls = await db
    .select()
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
      const classification = await classifier.classify(call.transcript);
      
      // Update the call (always update since we're reclassifying all calls)
      if (classification.callType) {
        await db
          .update(calls)
          .set({
            call_type: classification.callType,
            chief_complaint: classification.callType, // Use callType as chief complaint
            acuity_level: classification.acuityLevel,
            updatedAt: new Date()
          })
          .where(eq(calls.id, call.id));
        
        console.log(`Updated call ${call.id}: "${call.call_type || 'undefined'}" → "${classification.callType}"`);
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
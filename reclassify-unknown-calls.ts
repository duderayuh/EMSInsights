import { db } from './server/db.js';
import { calls } from './shared/schema.js';
import { eq, and, or, isNotNull, ne } from 'drizzle-orm';
import { nlpClassifier } from './server/services/nlp-classifier.js';

async function reclassifyUnknownCalls() {
  console.log('Starting reclassification of Unknown Call Type calls...');
  
  // Get all "Unknown Call Type" calls from dispatch talkgroups
  const unknownCalls = await db.select().from(calls).where(
    and(
      or(
        eq(calls.talkgroup, '10202'),
        eq(calls.talkgroup, '10244')
      ),
      eq(calls.call_type, 'Unknown Call Type'),
      isNotNull(calls.transcript),
      ne(calls.transcript, '')
    )
  );

  console.log(`Found ${unknownCalls.length} unknown calls to reclassify`);

  let successCount = 0;
  let errorCount = 0;

  // Process calls in batches of 20 for better performance
  const batchSize = 20;
  
  for (let i = 0; i < unknownCalls.length; i += batchSize) {
    const batch = unknownCalls.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(unknownCalls.length/batchSize)} (${batch.length} calls)`);
    
    for (const call of batch) {
      try {
        // Reclassify using enhanced NLP classifier
        const result = await nlpClassifier.classify(call.transcript || '');
        
        if (result.callType && result.callType !== 'Unknown') {
          // Update the call with new classification
          await db.update(calls)
            .set({
              call_type: result.callType,
              acuity_level: result.acuityLevel || null,
              keywords: JSON.stringify(result.keywords)
            })
            .where(eq(calls.id, call.id));
          
          console.log(`Updated call ${call.id}: "Unknown Call Type" → "${result.callType}"`);
          successCount++;
        } else {
          console.log(`Call ${call.id}: Still unknown after reclassification`);
        }
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
        errorCount++;
      }
    }
    
    // Small delay between batches to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\nReclassification complete:`);
  console.log(`- Successfully reclassified: ${successCount} calls`);
  console.log(`- Errors: ${errorCount} calls`);
  console.log(`- Still unknown: ${unknownCalls.length - successCount - errorCount} calls`);
}

reclassifyUnknownCalls().catch(console.error);
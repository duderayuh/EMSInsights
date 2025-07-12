import { db } from '../db';
import { calls } from '../../shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { nlpClassifier } from '../services/nlp-classifier';

async function reclassifyMedicalEmergencyCalls() {
  console.log('Starting reclassification of Medical Emergency calls...\n');
  
  try {
    // Get all Medical Emergency calls with transcripts
    const medicalEmergencyCalls = await db.select()
      .from(calls)
      .where(and(
        eq(calls.callType, 'Medical Emergency'),
        isNotNull(calls.transcript)
      ))
      .orderBy(calls.id);
    
    console.log(`Found ${medicalEmergencyCalls.length} Medical Emergency calls to analyze\n`);
    
    let reclassified = 0;
    
    // Track what we're changing to
    const changes: Record<string, number> = {};
    
    for (const call of medicalEmergencyCalls) {
      try {
        // Re-analyze the transcript with NLP classifier
        const result = await nlpClassifier.classify(call.transcript!);
        
        // Only update if we found a more specific call type
        if (result.callType !== 'Medical Emergency' && result.callType !== 'Unknown Call Type') {
          await db.update(calls)
            .set({ callType: result.callType })
            .where(eq(calls.id, call.id));
          
          // Track the change
          changes[result.callType] = (changes[result.callType] || 0) + 1;
          reclassified++;
          
          console.log(`Call ${call.id}: Medical Emergency → ${result.callType}`);
          console.log(`  Transcript: "${call.transcript!.substring(0, 100)}..."`);
        }
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
      }
    }
    
    console.log(`\n=== RECLASSIFICATION SUMMARY ===`);
    console.log(`Total Medical Emergency calls analyzed: ${medicalEmergencyCalls.length}`);
    console.log(`Successfully reclassified: ${reclassified}`);
    console.log(`Remaining as Medical Emergency: ${medicalEmergencyCalls.length - reclassified}\n`);
    
    console.log('Reclassification breakdown:');
    const sortedChanges = Object.entries(changes).sort((a, b) => b[1] - a[1]);
    for (const [callType, count] of sortedChanges) {
      console.log(`  ${callType}: ${count}`);
    }
    
    console.log('\nReclassification complete!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to reclassify calls:', error);
    process.exit(1);
  }
}

// Run the reclassification
reclassifyMedicalEmergencyCalls();
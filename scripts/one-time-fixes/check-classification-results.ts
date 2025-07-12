import { db } from './server/db.js';
import { calls } from './shared/schema.js';
import { eq, or, and } from 'drizzle-orm';

async function checkClassificationResults() {
  console.log('Checking classification results...');
  
  // Get all dispatch calls from both talkgroups
  const dispatchCalls = await db.select().from(calls).where(
    or(
      eq(calls.talkgroup, '10202'),
      eq(calls.talkgroup, '10244')
    )
  );
  
  console.log('Total dispatch calls:', dispatchCalls.length);
  
  // Count by call type
  const callTypes = {};
  for (const call of dispatchCalls) {
    const type = call.call_type || 'undefined';
    callTypes[type] = (callTypes[type] || 0) + 1;
  }
  
  console.log('\nCall types breakdown:');
  Object.entries(callTypes).sort(([,a], [,b]) => b - a).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  // Show some examples
  console.log('\nExample classified calls:');
  const exampleCalls = await db.select().from(calls).where(
    and(
      or(eq(calls.talkgroup, '10202'), eq(calls.talkgroup, '10244')),
      eq(calls.call_type, 'Medical Emergency')
    )
  ).limit(5);
  
  for (const call of exampleCalls) {
    console.log(`- ${call.call_type}: "${call.transcript?.substring(0, 100)}..."`);
  }
}

checkClassificationResults().catch(console.error);
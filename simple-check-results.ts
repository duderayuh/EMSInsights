import { db } from './server/db.js';
import { calls } from './shared/schema.js';
import { eq, or, isNotNull, and } from 'drizzle-orm';

async function checkResults() {
  console.log('Checking dispatch call classification results...');
  
  // Get dispatch calls with non-null call_type
  const classifiedCalls = await db.select().from(calls).where(
    and(
      or(
        eq(calls.talkgroup, '10202'),
        eq(calls.talkgroup, '10244')
      ),
      isNotNull(calls.call_type)
    )
  );
  
  console.log('Total classified dispatch calls:', classifiedCalls.length);
  
  // Count by call type
  const callTypes = {};
  for (const call of classifiedCalls) {
    const type = call.call_type;
    if (type && type !== 'undefined') {
      callTypes[type] = (callTypes[type] || 0) + 1;
    }
  }
  
  console.log('\nClassified call types:');
  Object.entries(callTypes).sort(([,a], [,b]) => b - a).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}

checkResults().catch(console.error);
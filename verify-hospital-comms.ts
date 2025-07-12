import { db } from './server/db.js';
import { calls } from './shared/schema.js';
import { eq, and, or, inArray } from 'drizzle-orm';

async function verifyHospitalCommunications() {
  console.log('Verifying EMS-Hospital Communications classification...');
  
  // Hospital talkgroups
  const hospitalTalkgroups = [
    '10255', '10256', '10257', '10258', '10259', '10260', '10261', 
    '10262', '10263', '10264', '10265', '10266', '10267', '10268', 
    '10269', '10270', '10271', '10272', '10273'
  ];

  // Check all hospital talkgroup calls
  const hospitalCalls = await db.select().from(calls).where(
    inArray(calls.talkgroup, hospitalTalkgroups)
  );

  const correctlyClassified = hospitalCalls.filter(call => 
    call.call_type === 'EMS-Hospital Communications'
  );

  const incorrectlyClassified = hospitalCalls.filter(call => 
    call.call_type !== 'EMS-Hospital Communications'
  );

  console.log(`\nHospital Talkgroup Analysis:`);
  console.log(`- Total hospital calls: ${hospitalCalls.length}`);
  console.log(`- Correctly classified as "EMS-Hospital Communications": ${correctlyClassified.length}`);
  console.log(`- Incorrectly classified: ${incorrectlyClassified.length}`);

  if (incorrectlyClassified.length > 0) {
    console.log(`\nIncorrectly classified calls:`);
    incorrectlyClassified.forEach(call => {
      console.log(`- Call ID ${call.id}: "${call.call_type}" (talkgroup ${call.talkgroup})`);
    });
  } else {
    console.log(`✓ All hospital calls correctly classified!`);
  }

  // Check overall call type distribution
  const allCalls = await db.select().from(calls);
  const callTypeDistribution = allCalls.reduce((acc, call) => {
    acc[call.call_type] = (acc[call.call_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`\nTop Call Types After Hospital Communications Update:`);
  Object.entries(callTypeDistribution)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([type, count], index) => {
      console.log(`${index + 1}. ${type}: ${count} calls`);
    });
}

verifyHospitalCommunications().catch(console.error);
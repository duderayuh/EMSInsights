import { db } from './server/db';
import { calls } from './shared/schema';
import { eq, isNotNull, isNull, and, or, sql } from 'drizzle-orm';

async function checkStats() {
  console.log('Checking geocoding statistics...\n');
  
  // Overall stats
  const totalCalls = await db.select().from(calls);
  const callsWithLocation = totalCalls.filter(c => c.location);
  const callsWithCoords = totalCalls.filter(c => c.latitude);
  
  console.log('=== Overall Statistics ===');
  console.log(`Total calls: ${totalCalls.length}`);
  console.log(`Calls with location: ${callsWithLocation.length}`);
  console.log(`Calls with coordinates: ${callsWithCoords.length}`);
  console.log(`Missing coordinates: ${callsWithLocation.length - callsWithCoords.length}`);
  console.log(`Geocoding rate: ${((callsWithCoords.length / callsWithLocation.length) * 100).toFixed(1)}%`);
  
  // Recent dispatch calls
  const recentDispatch = await db.select()
    .from(calls)
    .where(
      or(
        eq(calls.talkgroup, '10202'),
        eq(calls.talkgroup, '10244')
      )
    )
    .orderBy(sql`${calls.id} DESC`)
    .limit(10);
  
  console.log('\n=== Recent 10 Dispatch Calls ===');
  recentDispatch.forEach(call => {
    console.log(`\nCall ${call.id} (TG:${call.talkgroup}):`);
    console.log(`  Transcript: ${call.transcript?.substring(0, 80)}...`);
    console.log(`  Location: ${call.location || 'NONE'}`);
    console.log(`  Coordinates: ${call.latitude ? `[${call.latitude}, ${call.longitude}]` : 'MISSING'}`);
  });
  
  process.exit(0);
}

checkStats();

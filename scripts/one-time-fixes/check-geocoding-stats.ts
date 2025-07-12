import { db } from './server/db';
import { calls } from './shared/schema';
import { eq, isNotNull, isNull, and, or } from 'drizzle-orm';

async function checkGeocodingStats() {
  console.log('Checking geocoding statistics...\n');
  
  // Overall stats
  const overallStats = await db.select({
    total: db.count(),
    withLocation: db.count(calls.location),
    withCoords: db.count(calls.latitude)
  }).from(calls);
  
  console.log('=== Overall Statistics ===');
  console.log(`Total calls: ${overallStats[0].total}`);
  console.log(`Calls with location: ${overallStats[0].withLocation}`);
  console.log(`Calls with coordinates: ${overallStats[0].withCoords}`);
  console.log(`Missing coordinates: ${overallStats[0].withLocation - overallStats[0].withCoords}`);
  console.log(`Geocoding rate: ${((overallStats[0].withCoords / overallStats[0].withLocation) * 100).toFixed(1)}%`);
  
  // Dispatch stats
  const dispatchStats = await db.select({
    total: db.count(),
    withLocation: db.count(calls.location),
    withCoords: db.count(calls.latitude)
  }).from(calls)
  .where(
    or(
      eq(calls.talkgroup, '10202'),
      eq(calls.talkgroup, '10244')
    )
  );
  
  console.log('\n=== Dispatch Calls (10202, 10244) ===');
  console.log(`Total dispatch calls: ${dispatchStats[0].total}`);
  console.log(`Dispatch calls with location: ${dispatchStats[0].withLocation}`);
  console.log(`Dispatch calls with coordinates: ${dispatchStats[0].withCoords}`);
  console.log(`Missing coordinates: ${dispatchStats[0].withLocation - dispatchStats[0].withCoords}`);
  console.log(`Geocoding rate: ${((dispatchStats[0].withCoords / dispatchStats[0].withLocation) * 100).toFixed(1)}%`);
  
  // Recent calls check
  const recentCalls = await db.select({
    id: calls.id,
    transcript: calls.transcript,
    location: calls.location,
    latitude: calls.latitude,
    longitude: calls.longitude
  }).from(calls)
  .where(
    or(
      eq(calls.talkgroup, '10202'),
      eq(calls.talkgroup, '10244')
    )
  )
  .orderBy(calls.id)
  .limit(5);
  
  console.log('\n=== Recent Dispatch Calls ===');
  recentCalls.forEach(call => {
    console.log(`\nCall ${call.id}:`);
    console.log(`  Transcript: ${call.transcript?.substring(0, 80)}...`);
    console.log(`  Location: ${call.location || 'NONE'}`);
    console.log(`  Coordinates: ${call.latitude ? `[${call.latitude}, ${call.longitude}]` : 'MISSING'}`);
  });
  
  process.exit(0);
}

checkGeocodingStats();

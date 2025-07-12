import { db } from './server/db';
import { calls, unitTags, callUnitTags } from './shared/schema';
import { eq, sql, and, or } from 'drizzle-orm';
import { unitExtractor } from './server/services/unit-extractor';

async function fixUnitExtraction() {
  console.log('Starting unit extraction fix for dispatch calls...\n');

  try {
    // Get all dispatch calls with transcripts
    const dispatchCalls = await db
      .select()
      .from(calls)
      .where(
        and(
          or(eq(calls.talkgroup, '10202'), eq(calls.talkgroup, '10244')),
          sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
        )
      )
      .orderBy(sql`${calls.id} DESC`)
      .limit(100);

    console.log(`Found ${dispatchCalls.length} dispatch calls to process\n`);

    // First, ensure we have the necessary unit tags in the database
    const existingTags = await db.select().from(unitTags);
    const tagMap = new Map(existingTags.map(tag => [`${tag.unitType}-${tag.unitNumber}`, tag.id]));

    // Common unit types we're seeing in transcripts
    const unitTypes = ['ambulance', 'ems', 'medic', 'squad', 'engine', 'ladder', 'rescue', 'truck', 'battalion', 'chief'];
    
    // Create missing unit tags
    const newTags: any[] = [];
    for (const unitType of unitTypes) {
      for (let num = 1; num <= 99; num++) {
        const key = `${unitType}-${num}`;
        if (!tagMap.has(key)) {
          newTags.push({
            unitType,
            unitNumber: num,
            displayName: `${unitType.charAt(0).toUpperCase() + unitType.slice(1)} ${num}`,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    if (newTags.length > 0) {
      console.log(`Creating ${newTags.length} new unit tags...`);
      await db.insert(unitTags).values(newTags);
      console.log('Unit tags created successfully\n');
    }

    // Now process each call
    let processedCount = 0;
    let taggedCount = 0;
    let fixedCount = 0;

    for (const call of dispatchCalls) {
      console.log(`\nProcessing call ${call.id}:`);
      console.log(`Transcript: "${call.transcript?.substring(0, 100)}..."`);

      // Remove existing unit associations to start fresh
      await db.delete(callUnitTags).where(eq(callUnitTags.callId, call.id));

      // Extract and tag units
      if (call.transcript) {
        await unitExtractor.tagCallWithUnits(call.id, call.transcript);
        
        // Check if units were added
        const units = await db
          .select()
          .from(callUnitTags)
          .where(eq(callUnitTags.callId, call.id))
          .innerJoin(unitTags, eq(callUnitTags.unitTagId, unitTags.id));

        if (units.length > 0) {
          console.log(`✓ Tagged with ${units.length} units: ${units.map(u => u.unit_tags.displayName).join(', ')}`);
          taggedCount++;
          fixedCount++;
        } else {
          console.log('✗ No units found');
          
          // Try to manually extract units for debugging
          const manualUnits = call.transcript.match(/\b(ambulance|medic|engine|ladder|squad|rescue|truck|battalion|chief)\s*\d+/gi);
          if (manualUnits) {
            console.log(`  Manual extraction found: ${manualUnits.join(', ')}`);
          }
        }
      }
      
      processedCount++;
    }

    console.log('\n=== Summary ===');
    console.log(`Total calls processed: ${processedCount}`);
    console.log(`Calls with units tagged: ${taggedCount}`);
    console.log(`Calls fixed: ${fixedCount}`);

  } catch (error) {
    console.error('Error during unit extraction fix:', error);
  }

  process.exit(0);
}

// Run the fix
fixUnitExtraction();
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql, isNull, or, and, desc, asc, isNotNull, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './shared/schema';

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/emsinsight';
const client = postgres(connectionString);
const db = drizzle(client, { schema });

interface FixStats {
  totalProcessed: number;
  callTypesFixed: number;
  unitsExtracted: number;
  locationsExtracted: number;
  coordinatesAdded: number;
  errors: string[];
}

async function processCallsSimple(): Promise<FixStats> {
  const stats: FixStats = {
    totalProcessed: 0,
    callTypesFixed: 0,
    unitsExtracted: 0,
    locationsExtracted: 0,
    coordinatesAdded: 0,
    errors: []
  };

  console.log('🔧 Starting simple database fixes...');
  
  // Get calls that need fixing - with simpler criteria
  const callsToFix = await db
    .select()
    .from(schema.calls)
    .where(or(
      eq(schema.calls.callType, 'Unknown'),
      eq(schema.calls.callType, 'Unknown Call Type'),
      isNull(schema.calls.callType)
    ))
    .orderBy(desc(schema.calls.id))
    .limit(500);

  console.log(`📊 Found ${callsToFix.length} calls with unknown call types`);

  for (const call of callsToFix) {
    try {
      const transcript = call.transcript || '';
      
      // Skip if no transcript
      if (!transcript || transcript === '[No transcription available]') {
        continue;
      }

      // Simple call type classification
      const newCallType = classifyCallType(transcript);
      
      if (newCallType !== 'Unknown') {
        await db
          .update(schema.calls)
          .set({ callType: newCallType })
          .where(eq(schema.calls.id, call.id));
        
        stats.callTypesFixed++;
      }

      stats.totalProcessed++;
      
      if (stats.totalProcessed % 50 === 0) {
        console.log(`   ✅ Processed ${stats.totalProcessed}/${callsToFix.length} calls`);
      }

    } catch (error) {
      console.error(`Error processing call ${call.id}:`, error);
      stats.errors.push(`Call ${call.id}: ${error}`);
    }
  }

  return stats;
}

function classifyCallType(transcript: string): string {
  const lowerTranscript = transcript.toLowerCase();
  
  // Medical Emergency patterns
  if (lowerTranscript.includes('cardiac arrest') || lowerTranscript.includes('heart attack')) {
    return 'Cardiac Arrest';
  }
  if (lowerTranscript.includes('chest pain') || lowerTranscript.includes('heart pain')) {
    return 'Chest Pain/Heart';
  }
  if (lowerTranscript.includes('difficulty breathing') || lowerTranscript.includes('trouble breathing')) {
    return 'Difficulty Breathing';
  }
  if (lowerTranscript.includes('unconscious') || lowerTranscript.includes('unresponsive')) {
    return 'Unconscious / Fainting (Near)';
  }
  if (lowerTranscript.includes('seizure') || lowerTranscript.includes('convulsions')) {
    return 'Convulsions/Seizures';
  }
  if (lowerTranscript.includes('choking')) {
    return 'Choking';
  }
  if (lowerTranscript.includes('sick person') || lowerTranscript.includes('illness')) {
    return 'Sick Person';
  }
  if (lowerTranscript.includes('overdose') || lowerTranscript.includes('drug')) {
    return 'Overdose/Substance Abuse';
  }
  if (lowerTranscript.includes('fire') && (lowerTranscript.includes('house') || lowerTranscript.includes('building'))) {
    return 'Fire/Hazmat';
  }
  if (lowerTranscript.includes('trash fire') || lowerTranscript.includes('dumpster fire')) {
    return 'Trash Fire';
  }
  if (lowerTranscript.includes('vehicle accident') || lowerTranscript.includes('mvc')) {
    return 'Vehicle Accident';
  }
  if (lowerTranscript.includes('trauma') || lowerTranscript.includes('assault')) {
    return 'Trauma/MVC';
  }
  if (lowerTranscript.includes('building alarm') || lowerTranscript.includes('fire alarm')) {
    return 'Building Alarm';
  }
  if (lowerTranscript.includes('methodist') || lowerTranscript.includes('riley') || lowerTranscript.includes('eskenazi')) {
    return 'EMS-Hospital Communications';
  }
  if (lowerTranscript.includes('medic') || lowerTranscript.includes('ambulance')) {
    return 'Medical Emergency';
  }
  
  return 'Unknown';
}

async function createMissingUnitTags(): Promise<void> {
  console.log('🏷️  Creating missing unit tags...');
  
  const unitTypes = ['ambulance', 'engine', 'medic', 'ladder', 'rescue', 'battalion', 'chief', 'squad', 'truck', 'ems'];
  let created = 0;
  
  for (const unitType of unitTypes) {
    for (let unitNumber = 1; unitNumber <= 50; unitNumber++) {
      try {
        // Check if it exists
        const existing = await db
          .select()
          .from(schema.unitTags)
          .where(and(
            eq(schema.unitTags.unitType, unitType),
            eq(schema.unitTags.unitNumber, unitNumber)
          ))
          .limit(1);
        
        if (existing.length === 0) {
          await db
            .insert(schema.unitTags)
            .values({
              unitType,
              unitNumber,
              displayName: `${unitType.charAt(0).toUpperCase() + unitType.slice(1)} ${unitNumber}`,
              color: '#3B82F6',
              isActive: true
            });
          created++;
        }
      } catch (error) {
        console.error(`Error creating unit tag ${unitType} ${unitNumber}:`, error);
      }
    }
  }

  console.log(`   ✅ Created ${created} new unit tags`);
}

async function generateReport(stats: FixStats): Promise<void> {
  console.log('\n🎯 DATABASE FIX REPORT');
  console.log('=' .repeat(40));
  
  console.log('\n📊 PROCESSING STATISTICS:');
  console.log(`   Total Calls Processed: ${stats.totalProcessed}`);
  console.log(`   Call Types Fixed: ${stats.callTypesFixed}`);
  console.log(`   Errors: ${stats.errors.length}`);
  
  // Get updated statistics
  const totalCalls = await db
    .select({ count: sql`count(*)` })
    .from(schema.calls);
  
  const unknownCallTypes = await db
    .select({ count: sql`count(*)` })
    .from(schema.calls)
    .where(or(
      eq(schema.calls.callType, 'Unknown'),
      eq(schema.calls.callType, 'Unknown Call Type'),
      isNull(schema.calls.callType)
    ));
  
  // Count calls with unit tags
  const callsWithUnits = await db
    .select({ count: sql`count(distinct ${schema.callUnitTags.callId})` })
    .from(schema.callUnitTags);
  
  const callsWithLocations = await db
    .select({ count: sql`count(*)` })
    .from(schema.calls)
    .where(and(
      isNotNull(schema.calls.location),
      sql`${schema.calls.location} != ''`
    ));
  
  const total = Number(totalCalls[0].count);
  const unknownTypes = Number(unknownCallTypes[0].count);
  const withUnits = Number(callsWithUnits[0].count);
  const withLocations = Number(callsWithLocations[0].count);
  
  console.log('\n📈 UPDATED DATABASE STATUS:');
  console.log(`   Total Calls: ${total}`);
  console.log(`   Unknown Call Types: ${unknownTypes} (${((unknownTypes / total) * 100).toFixed(1)}%)`);
  console.log(`   Calls with Units: ${withUnits} (${((withUnits / total) * 100).toFixed(1)}%)`);
  console.log(`   Calls with Locations: ${withLocations} (${((withLocations / total) * 100).toFixed(1)}%)`);
  
  console.log('\n✅ SIMPLE FIX COMPLETE!');
  console.log(`   • Improved call type identification for ${stats.callTypesFixed} calls`);
  console.log(`   • Reduced unknown call types from previous count`);
}

async function main() {
  try {
    console.log('🚀 Starting simple database fix...');
    
    // Create missing unit tags first
    await createMissingUnitTags();
    
    // Fix unknown call types
    const stats = await processCallsSimple();
    
    // Generate report
    await generateReport(stats);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql, isNull, or, and, desc, asc, isNotNull } from 'drizzle-orm';
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

// Simplified classification using existing patterns
function classifyCallType(transcript: string): string {
  const lowerTranscript = transcript.toLowerCase();
  
  if (lowerTranscript.includes('cardiac arrest') || lowerTranscript.includes('heart attack')) {
    return 'Cardiac Arrest';
  }
  if (lowerTranscript.includes('chest pain') || lowerTranscript.includes('heart pain')) {
    return 'Chest Pain/Heart';
  }
  if (lowerTranscript.includes('difficulty breathing') || lowerTranscript.includes('trouble breathing')) {
    return 'Difficulty Breathing';
  }
  if (lowerTranscript.includes('unconscious') || lowerTranscript.includes('unresponsive') || lowerTranscript.includes('fainting')) {
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
  if (lowerTranscript.includes('injured person') || lowerTranscript.includes('injury')) {
    return 'Injured Person';
  }
  if (lowerTranscript.includes('abdominal pain') || lowerTranscript.includes('stomach pain')) {
    return 'Abdominal Pain';
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
  if (lowerTranscript.includes('medic') || lowerTranscript.includes('ambulance') || lowerTranscript.includes('ems')) {
    return 'Medical Emergency';
  }
  
  return 'Unknown';
}

// Extract units from transcript
function extractUnits(transcript: string): Array<{unitType: string, unitNumber: number}> {
  const units: Array<{unitType: string, unitNumber: number}> = [];
  
  const unitPatterns = [
    { type: 'ambulance', patterns: ['ambulance', 'amb'] },
    { type: 'ems', patterns: ['ems'] },
    { type: 'medic', patterns: ['medic', 'med'] },
    { type: 'squad', patterns: ['squad', 'sq'] },
    { type: 'engine', patterns: ['engine', 'eng'] },
    { type: 'ladder', patterns: ['ladder', 'lad'] },
    { type: 'rescue', patterns: ['rescue', 'res'] },
    { type: 'truck', patterns: ['truck', 'trk'] },
    { type: 'battalion', patterns: ['battalion', 'bat'] },
    { type: 'chief', patterns: ['chief'] }
  ];
  
  for (const { type, patterns } of unitPatterns) {
    for (const pattern of patterns) {
      const regex = new RegExp(`\\b${pattern}\\s*([1-9]\\d?)(?:[-,\\s]\\d+)?\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(transcript)) !== null) {
        const unitNumber = parseInt(match[1]);
        if (unitNumber > 0 && unitNumber <= 99) {
          units.push({ unitType: type, unitNumber });
        }
      }
    }
  }
  
  return units;
}

// Extract location from transcript
function extractLocation(transcript: string): string | null {
  const addressPatterns = [
    /(\d+\s+(?:North|South|East|West|N|S|E|W)\s+\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/gi,
    /(\d+\s+\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/gi,
    /(\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way)\s+(?:and|at|&)\s+\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way))/gi
  ];
  
  for (const pattern of addressPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return null;
}

async function processCallsInBatches(batchSize: number = 50): Promise<FixStats> {
  const stats: FixStats = {
    totalProcessed: 0,
    callTypesFixed: 0,
    unitsExtracted: 0,
    locationsExtracted: 0,
    coordinatesAdded: 0,
    errors: []
  };

  console.log('🔧 Starting database fixes via targeted updates...');
  
  // Get calls that need fixing
  const callsToFix = await db
    .select()
    .from(schema.calls)
    .where(or(
      eq(schema.calls.callType, 'Unknown'),
      eq(schema.calls.callType, 'Unknown Call Type'),
      isNull(schema.calls.callType),
      isNull(schema.calls.units),
      sql`json_array_length(coalesce(${schema.calls.units}, '[]')) = 0`,
      isNull(schema.calls.location),
      eq(schema.calls.location, '')
    ))
    .orderBy(desc(schema.calls.id))
    .limit(1000); // Process most recent 1000 calls that need fixing

  console.log(`📊 Found ${callsToFix.length} calls that need fixing`);

  let processedCount = 0;
  
  for (const call of callsToFix) {
    try {
      const transcript = call.transcript || '';
      
      // Skip if no transcript or garbage
      if (!transcript || transcript === '[No transcription available]' || transcript.includes('ľ') || transcript.includes('Ծ')) {
        continue;
      }

      const updates: any = {};
      let hasUpdates = false;

      // 1. Fix call type
      if (!call.callType || call.callType === 'Unknown' || call.callType === 'Unknown Call Type') {
        const newCallType = classifyCallType(transcript);
        if (newCallType !== 'Unknown') {
          updates.callType = newCallType;
          hasUpdates = true;
          stats.callTypesFixed++;
        }
      }

      // 2. Extract units
      if (!call.units || call.units.length === 0) {
        const extractedUnits = extractUnits(transcript);
        if (extractedUnits.length > 0) {
          // Get unit tag IDs
          const unitTagIds: number[] = [];
          for (const unit of extractedUnits) {
            try {
              const unitTag = await db
                .select()
                .from(schema.unitTags)
                .where(
                  and(
                    eq(schema.unitTags.unitType, unit.unitType),
                    eq(schema.unitTags.unitNumber, unit.unitNumber),
                    eq(schema.unitTags.isActive, true)
                  )
                )
                .limit(1);
              
              if (unitTag.length > 0) {
                unitTagIds.push(unitTag[0].id);
              }
            } catch (error) {
              console.error('Error finding unit tag:', error);
            }
          }
          
          if (unitTagIds.length > 0) {
            updates.units = unitTagIds;
            hasUpdates = true;
            stats.unitsExtracted++;
          }
        }
      }

      // 3. Extract location
      if (!call.location || call.location.trim() === '') {
        const extractedLocation = extractLocation(transcript);
        if (extractedLocation) {
          updates.location = extractedLocation;
          hasUpdates = true;
          stats.locationsExtracted++;
        }
      }

      // 4. Apply updates
      if (hasUpdates) {
        await db
          .update(schema.calls)
          .set(updates)
          .where(eq(schema.calls.id, call.id));
      }

      processedCount++;
      
      if (processedCount % 50 === 0) {
        console.log(`   ✅ Processed ${processedCount}/${callsToFix.length} calls`);
      }

    } catch (error) {
      console.error(`Error processing call ${call.id}:`, error);
      stats.errors.push(`Call ${call.id}: ${error}`);
    }
  }

  stats.totalProcessed = processedCount;
  return stats;
}

async function generateReport(stats: FixStats): Promise<void> {
  console.log('\n🎯 DATABASE FIX REPORT');
  console.log('=' .repeat(40));
  
  console.log('\n📊 PROCESSING STATISTICS:');
  console.log(`   Total Calls Processed: ${stats.totalProcessed}`);
  console.log(`   Call Types Fixed: ${stats.callTypesFixed}`);
  console.log(`   Units Extracted: ${stats.unitsExtracted}`);
  console.log(`   Locations Extracted: ${stats.locationsExtracted}`);
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
  
  const callsWithUnits = await db
    .select({ count: sql`count(*)` })
    .from(schema.calls)
    .where(sql`${schema.calls.units} IS NOT NULL AND json_array_length(${schema.calls.units}) > 0`);
  
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
  
  console.log('\n✅ FIX COMPLETE!');
}

async function main() {
  try {
    console.log('🚀 Starting targeted database fix...');
    
    const stats = await processCallsInBatches(50);
    await generateReport(stats);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
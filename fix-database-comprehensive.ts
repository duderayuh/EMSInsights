import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql, isNull, or, and, desc, asc, inArray, isNotNull } from 'drizzle-orm';
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

async function processCallsInBatches(batchSize: number = 100): Promise<FixStats> {
  const stats: FixStats = {
    totalProcessed: 0,
    callTypesFixed: 0,
    unitsExtracted: 0,
    locationsExtracted: 0,
    coordinatesAdded: 0,
    errors: []
  };

  console.log('🔧 Starting comprehensive database fixes...');
  
  // Get total count first
  const totalCount = await db
    .select({ count: sql`count(*)` })
    .from(schema.calls);
  
  const total = Number(totalCount[0].count);
  console.log(`📊 Found ${total} total calls to process`);

  let offset = 0;
  let processedCount = 0;

  while (offset < total) {
    try {
      console.log(`\n📦 Processing batch ${Math.floor(offset / batchSize) + 1}/${Math.ceil(total / batchSize)} (calls ${offset + 1}-${Math.min(offset + batchSize, total)})`);
      
      // Get batch of calls
      const calls = await db
        .select()
        .from(schema.calls)
        .orderBy(desc(schema.calls.id))
        .limit(batchSize)
        .offset(offset);

      console.log(`   Retrieved ${calls.length} calls for processing`);

      // Process each call in the batch
      for (const call of calls) {
        try {
          await processCall(call, stats);
          processedCount++;
          
          if (processedCount % 200 === 0) {
            console.log(`   ✅ Processed ${processedCount}/${total} calls`);
          }
        } catch (error) {
          console.error(`   ❌ Error processing call ${call.id}:`, error);
          stats.errors.push(`Call ${call.id}: ${error}`);
        }
      }

      offset += batchSize;
      stats.totalProcessed += calls.length;

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 50));

    } catch (error) {
      console.error(`❌ Error processing batch starting at ${offset}:`, error);
      stats.errors.push(`Batch at ${offset}: ${error}`);
      break;
    }
  }

  return stats;
}

async function processCall(call: any, stats: FixStats): Promise<void> {
  const transcript = call.transcript || '';
  const updates: any = {};
  let hasUpdates = false;

  // Skip if no transcript or garbage transcript
  if (!transcript || transcript === '[No transcription available]' || transcript.includes('ľ') || transcript.includes('Ծ')) {
    return;
  }

  // 1. Fix call type if unknown or missing
  const currentCallType = call.callType;
  if (!currentCallType || currentCallType === 'Unknown' || currentCallType === 'Unknown Call Type') {
    const newCallType = await classifyCallType(transcript);
    if (newCallType && newCallType !== 'Unknown') {
      updates.callType = newCallType;
      hasUpdates = true;
      stats.callTypesFixed++;
    }
  }

  // 2. Extract units if missing
  if (!call.units || call.units.length === 0) {
    const extractedUnits = await extractUnitsFromTranscript(transcript);
    if (extractedUnits && extractedUnits.length > 0) {
      updates.units = extractedUnits;
      hasUpdates = true;
      stats.unitsExtracted++;
    }
  }

  // 3. Extract location if missing
  if (!call.location || call.location.trim() === '') {
    const extractedLocation = await extractLocationFromTranscript(transcript);
    if (extractedLocation && extractedLocation.trim() !== '') {
      updates.location = extractedLocation;
      hasUpdates = true;
      stats.locationsExtracted++;
    }
  }

  // 4. Geocode if location exists but no coordinates
  if ((call.location || updates.location) && (!call.latitude || !call.longitude)) {
    const addressToGeocode = updates.location || call.location;
    const coordinates = await geocodeAddress(addressToGeocode);
    if (coordinates) {
      updates.latitude = coordinates.lat;
      updates.longitude = coordinates.lng;
      hasUpdates = true;
      stats.coordinatesAdded++;
    }
  }

  // 5. Apply updates if any
  if (hasUpdates) {
    try {
      await db
        .update(schema.calls)
        .set(updates)
        .where(eq(schema.calls.id, call.id));
    } catch (error) {
      console.error(`Error updating call ${call.id}:`, error);
      stats.errors.push(`Update failed for call ${call.id}: ${error}`);
    }
  }
}

async function classifyCallType(transcript: string): Promise<string | null> {
  // Simple rule-based classification
  const lowerTranscript = transcript.toLowerCase();
  
  // Medical Emergency patterns
  if (lowerTranscript.includes('cardiac arrest') || lowerTranscript.includes('heart attack')) {
    return 'Cardiac Arrest';
  }
  if (lowerTranscript.includes('chest pain') || lowerTranscript.includes('heart pain')) {
    return 'Chest Pain/Heart';
  }
  if (lowerTranscript.includes('difficulty breathing') || lowerTranscript.includes('trouble breathing') || lowerTranscript.includes('breathing problems')) {
    return 'Difficulty Breathing';
  }
  if (lowerTranscript.includes('unconscious') || lowerTranscript.includes('unresponsive') || lowerTranscript.includes('fainting')) {
    return 'Unconscious / Fainting (Near)';
  }
  if (lowerTranscript.includes('convulsions') || lowerTranscript.includes('seizure') || lowerTranscript.includes('seizures')) {
    return 'Convulsions/Seizures';
  }
  if (lowerTranscript.includes('choking') || lowerTranscript.includes('airway obstruction')) {
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
  if (lowerTranscript.includes('back pain') || lowerTranscript.includes('spine')) {
    return 'Back Pain';
  }
  if (lowerTranscript.includes('overdose') || lowerTranscript.includes('drug') || lowerTranscript.includes('substance')) {
    return 'Overdose/Substance Abuse';
  }
  if (lowerTranscript.includes('psychiatric') || lowerTranscript.includes('mental') || lowerTranscript.includes('suicide')) {
    return 'Psychiatric/Suicide';
  }
  
  // Fire and Emergency patterns
  if (lowerTranscript.includes('fire') && (lowerTranscript.includes('house') || lowerTranscript.includes('building') || lowerTranscript.includes('structure'))) {
    return 'Fire/Hazmat';
  }
  if (lowerTranscript.includes('trash fire') || lowerTranscript.includes('dumpster fire') || lowerTranscript.includes('garbage fire')) {
    return 'Trash Fire';
  }
  if (lowerTranscript.includes('vehicle accident') || lowerTranscript.includes('mvc') || lowerTranscript.includes('motor vehicle')) {
    return 'Vehicle Accident';
  }
  if (lowerTranscript.includes('trauma') || lowerTranscript.includes('assault') || lowerTranscript.includes('gunshot')) {
    return 'Trauma/MVC';
  }
  if (lowerTranscript.includes('building alarm') || lowerTranscript.includes('fire alarm') || lowerTranscript.includes('alarm')) {
    return 'Building Alarm';
  }
  if (lowerTranscript.includes('investigation') || lowerTranscript.includes('suspicious') || lowerTranscript.includes('welfare check')) {
    return 'Investigation';
  }
  
  // Hospital Communications
  if (lowerTranscript.includes('methodist') || lowerTranscript.includes('riley') || lowerTranscript.includes('eskenazi') || lowerTranscript.includes('hospital')) {
    return 'EMS-Hospital Communications';
  }
  
  // General Medical Emergency fallback
  if (lowerTranscript.includes('medic') || lowerTranscript.includes('ambulance') || lowerTranscript.includes('ems')) {
    return 'Medical Emergency';
  }
  
  return null;
}

async function extractUnitsFromTranscript(transcript: string): Promise<number[] | null> {
  const units: Array<{unitType: string, unitNumber: number}> = [];
  const lowerTranscript = transcript.toLowerCase();
  
  // Unit patterns
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
      // Look for pattern followed by a number
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
  
  // Find matching unit tag IDs
  if (units.length === 0) return null;
  
  const unitTagIds: number[] = [];
  for (const unit of units) {
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
  
  return unitTagIds.length > 0 ? unitTagIds : null;
}

async function extractLocationFromTranscript(transcript: string): Promise<string | null> {
  // Simple address extraction patterns
  const addressPatterns = [
    // Street address patterns
    /(\d+\s+(?:North|South|East|West|N|S|E|W)\s+\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/gi,
    /(\d+\s+\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/gi,
    
    // Highway/Interstate patterns
    /((?:I-|Interstate\s+|US\s+|State\s+Route\s+|SR\s+|Highway\s+)\d+)/gi,
    
    // Intersection patterns
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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Use Nominatim for geocoding
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Indianapolis, IN')}&limit=1`;
    const response = await fetch(nominatimUrl);
    
    if (response.ok) {
      const data = await response.json();
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function createMissingUnitTags(): Promise<void> {
  console.log('\n🏷️  Creating missing unit tags...');
  
  // Get all existing unit tags
  const existingTags = await db
    .select()
    .from(schema.unitTags);
  
  const existingTagsMap = new Map();
  existingTags.forEach(tag => {
    const key = `${tag.unitType}-${tag.unitNumber}`;
    existingTagsMap.set(key, tag);
  });

  // Define unit types and numbers to create
  const unitTypes = ['ambulance', 'engine', 'medic', 'ladder', 'rescue', 'battalion', 'chief', 'squad', 'truck', 'ems'];
  const unitNumbers = Array.from({length: 99}, (_, i) => i + 1);

  let created = 0;
  
  for (const unitType of unitTypes) {
    for (const unitNumber of unitNumbers) {
      const key = `${unitType}-${unitNumber}`;
      
      if (!existingTagsMap.has(key)) {
        try {
          await db
            .insert(schema.unitTags)
            .values({
              unitType,
              unitNumber,
              displayName: `${unitType.charAt(0).toUpperCase() + unitType.slice(1)} ${unitNumber}`,
              isActive: true
            });
          created++;
        } catch (error) {
          console.error(`Error creating unit tag ${key}:`, error);
        }
      }
    }
  }

  console.log(`   ✅ Created ${created} new unit tags`);
}

async function generateFinalReport(stats: FixStats): Promise<void> {
  console.log('\n🎯 COMPREHENSIVE FIX REPORT');
  console.log('=' .repeat(50));
  
  console.log('\n📊 PROCESSING STATISTICS:');
  console.log(`   Total Calls Processed: ${stats.totalProcessed}`);
  console.log(`   Call Types Fixed: ${stats.callTypesFixed}`);
  console.log(`   Units Extracted: ${stats.unitsExtracted}`);
  console.log(`   Locations Extracted: ${stats.locationsExtracted}`);
  console.log(`   Coordinates Added: ${stats.coordinatesAdded}`);
  console.log(`   Errors Encountered: ${stats.errors.length}`);
  
  // Get updated database statistics
  const updatedStats = await getUpdatedStats();
  
  console.log('\n📈 UPDATED DATABASE STATISTICS:');
  console.log(`   Total Calls: ${updatedStats.totalCalls}`);
  console.log(`   Unknown Call Types: ${updatedStats.unknownCallTypes} (${((updatedStats.unknownCallTypes / updatedStats.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Calls with Units: ${updatedStats.callsWithUnits} (${((updatedStats.callsWithUnits / updatedStats.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Calls with Locations: ${updatedStats.callsWithLocations} (${((updatedStats.callsWithLocations / updatedStats.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Calls with Coordinates: ${updatedStats.callsWithCoordinates} (${((updatedStats.callsWithCoordinates / updatedStats.totalCalls) * 100).toFixed(1)}%)`);
  
  console.log('\n✅ DATABASE FIX COMPLETE!');
  console.log('\n🎉 ACHIEVEMENTS:');
  console.log(`   • Improved call type identification by ${stats.callTypesFixed} calls`);
  console.log(`   • Added unit information to ${stats.unitsExtracted} calls`);
  console.log(`   • Extracted locations for ${stats.locationsExtracted} calls`);
  console.log(`   • Added coordinates to ${stats.coordinatesAdded} calls`);
}

async function getUpdatedStats(): Promise<any> {
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
  
  const callsWithCoordinates = await db
    .select({ count: sql`count(*)` })
    .from(schema.calls)
    .where(and(
      isNotNull(schema.calls.latitude),
      isNotNull(schema.calls.longitude)
    ));
  
  return {
    totalCalls: Number(totalCalls[0].count),
    unknownCallTypes: Number(unknownCallTypes[0].count),
    callsWithUnits: Number(callsWithUnits[0].count),
    callsWithLocations: Number(callsWithLocations[0].count),
    callsWithCoordinates: Number(callsWithCoordinates[0].count)
  };
}

async function main() {
  try {
    console.log('🚀 Starting comprehensive database fix process...');
    
    // Create missing unit tags first
    await createMissingUnitTags();
    
    // Process all calls in batches
    const stats = await processCallsInBatches(100);
    
    // Generate final report
    await generateFinalReport(stats);
    
  } catch (error) {
    console.error('❌ Fatal error during database fix:', error);
  } finally {
    await client.end();
    console.log('\n🔚 Database connection closed');
  }
}

// Run the fix
main().catch(console.error);
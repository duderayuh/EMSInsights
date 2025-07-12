import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql, isNull, or, and, desc, asc, inArray, isNotNull } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './shared/schema';
import { NLPClassifier } from './server/services/nlp-classifier';
import { UnitExtractor } from './server/services/unit-extractor';
import { PostProcessingPipeline } from './server/post-processing-pipeline';

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/emsinsight';
const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Initialize services
const nlpClassifier = new NLPClassifier();
const unitExtractor = new UnitExtractor();
const postProcessor = new PostProcessingPipeline();

interface FixStats {
  totalProcessed: number;
  callTypesFixed: number;
  unitsExtracted: number;
  locationsExtracted: number;
  coordinatesAdded: number;
  errors: string[];
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
          
          if (processedCount % 100 === 0) {
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
      await new Promise(resolve => setTimeout(resolve, 100));

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
    try {
      const classification = await nlpClassifier.classifyCall(transcript);
      if (classification.callType && classification.callType !== 'Unknown') {
        updates.callType = classification.callType;
        hasUpdates = true;
        stats.callTypesFixed++;
      }
    } catch (error) {
      console.error(`Error classifying call ${call.id}:`, error);
    }
  }

  // 2. Extract units if missing
  if (!call.units || call.units.length === 0) {
    try {
      const extractedUnits = await unitExtractor.extractUnitsFromTranscript(transcript);
      if (extractedUnits && extractedUnits.length > 0) {
        const unitTagIds = await unitExtractor.matchUnitsToTags(extractedUnits);
        if (unitTagIds && unitTagIds.length > 0) {
          updates.units = unitTagIds;
          hasUpdates = true;
          stats.unitsExtracted++;
        }
      }
    } catch (error) {
      console.error(`Error extracting units for call ${call.id}:`, error);
    }
  }

  // 3. Extract location if missing using post-processing pipeline
  if (!call.location || call.location.trim() === '') {
    try {
      const processedTranscript = await postProcessor.processTranscript(transcript);
      if (processedTranscript.extractedAddress && processedTranscript.extractedAddress.trim() !== '') {
        updates.location = processedTranscript.extractedAddress;
        hasUpdates = true;
        stats.locationsExtracted++;
      }
    } catch (error) {
      console.error(`Error extracting location for call ${call.id}:`, error);
    }
  }

  // 4. Geocode if location exists but no coordinates
  if ((call.location || updates.location) && (!call.latitude || !call.longitude)) {
    try {
      const addressToGeocode = updates.location || call.location;
      const coordinates = await geocodeAddress(addressToGeocode);
      if (coordinates) {
        updates.latitude = coordinates.lat;
        updates.longitude = coordinates.lng;
        hasUpdates = true;
        stats.coordinatesAdded++;
      }
    } catch (error) {
      console.error(`Error geocoding address for call ${call.id}:`, error);
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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Try Google Address Validation API first
    const response = await fetch('/api/address/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.coordinates) {
        return data.coordinates;
      }
    }

    // Fallback to Nominatim geocoding
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Indianapolis, IN')}&limit=1`;
    const nominatimResponse = await fetch(nominatimUrl);
    
    if (nominatimResponse.ok) {
      const nominatimData = await nominatimResponse.json();
      if (nominatimData.length > 0) {
        return {
          lat: parseFloat(nominatimData[0].lat),
          lng: parseFloat(nominatimData[0].lon)
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
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
  const unitTypes = ['ambulance', 'engine', 'medic', 'ladder', 'rescue', 'battalion', 'chief', 'squad', 'truck'];
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
  
  if (stats.errors.length > 0) {
    console.log('\n❌ ERRORS ENCOUNTERED:');
    stats.errors.slice(0, 10).forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
  }
  
  console.log('\n✅ DATABASE FIX COMPLETE!');
  console.log('\n🎉 ACHIEVEMENTS:');
  console.log(`   • Improved call type identification by ${stats.callTypesFixed} calls`);
  console.log(`   • Added unit information to ${stats.unitsExtracted} calls`);
  console.log(`   • Extracted locations for ${stats.locationsExtracted} calls`);
  console.log(`   • Added coordinates to ${stats.coordinatesAdded} calls`);
}

async function getUpdatedStats(): Promise<any> {
  // Get updated statistics after fixes
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
    const stats = await processCallsInBatches(50);
    
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
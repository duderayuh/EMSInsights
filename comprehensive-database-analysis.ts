import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql, isNull, or, and, desc, asc } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './shared/schema';

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/emsinsight';
const client = postgres(connectionString);
const db = drizzle(client, { schema });

interface CallAnalysis {
  totalCalls: number;
  unknownCallTypes: number;
  missingUnits: number;
  missingLocations: number;
  lowConfidence: number;
  callTypeBreakdown: Record<string, number>;
  unitExtractionStats: {
    hasUnits: number;
    noUnits: number;
    unitTypes: Record<string, number>;
  };
  locationStats: {
    hasLocation: number;
    hasCoordinates: number;
    missingBoth: number;
  };
  confidenceStats: {
    high: number; // > 0.7
    medium: number; // 0.5 - 0.7
    low: number; // 0.3 - 0.5
    veryLow: number; // < 0.3
  };
}

async function analyzeDatabase(): Promise<CallAnalysis> {
  console.log('Starting comprehensive database analysis...');
  
  // Get all calls
  const allCalls = await db
    .select()
    .from(schema.calls)
    .orderBy(desc(schema.calls.timestamp));
  
  console.log(`Found ${allCalls.length} total calls in database`);
  
  const analysis: CallAnalysis = {
    totalCalls: allCalls.length,
    unknownCallTypes: 0,
    missingUnits: 0,
    missingLocations: 0,
    lowConfidence: 0,
    callTypeBreakdown: {},
    unitExtractionStats: {
      hasUnits: 0,
      noUnits: 0,
      unitTypes: {}
    },
    locationStats: {
      hasLocation: 0,
      hasCoordinates: 0,
      missingBoth: 0
    },
    confidenceStats: {
      high: 0,
      medium: 0,
      low: 0,
      veryLow: 0
    }
  };
  
  // Analyze each call
  for (const call of allCalls) {
    // Call type analysis
    const callType = call.callType || 'Unknown';
    analysis.callTypeBreakdown[callType] = (analysis.callTypeBreakdown[callType] || 0) + 1;
    
    if (callType === 'Unknown' || callType === 'Unknown Call Type') {
      analysis.unknownCallTypes++;
    }
    
    // Unit analysis
    const hasUnits = call.units && call.units.length > 0;
    if (hasUnits) {
      analysis.unitExtractionStats.hasUnits++;
      // Count unit types
      call.units.forEach(unit => {
        const unitType = unit.unitType || 'unknown';
        analysis.unitExtractionStats.unitTypes[unitType] = 
          (analysis.unitExtractionStats.unitTypes[unitType] || 0) + 1;
      });
    } else {
      analysis.unitExtractionStats.noUnits++;
      analysis.missingUnits++;
    }
    
    // Location analysis
    const hasLocation = call.location && call.location.trim() !== '';
    const hasCoordinates = call.latitude && call.longitude;
    
    if (hasLocation) {
      analysis.locationStats.hasLocation++;
    }
    if (hasCoordinates) {
      analysis.locationStats.hasCoordinates++;
    }
    if (!hasLocation && !hasCoordinates) {
      analysis.locationStats.missingBoth++;
      analysis.missingLocations++;
    }
    
    // Confidence analysis
    const confidence = call.confidence || 0;
    if (confidence > 0.7) {
      analysis.confidenceStats.high++;
    } else if (confidence > 0.5) {
      analysis.confidenceStats.medium++;
    } else if (confidence > 0.3) {
      analysis.confidenceStats.low++;
    } else {
      analysis.confidenceStats.veryLow++;
      analysis.lowConfidence++;
    }
  }
  
  return analysis;
}

async function generateDetailedReport(analysis: CallAnalysis): Promise<void> {
  console.log('\n=== COMPREHENSIVE DATABASE ANALYSIS REPORT ===\n');
  
  console.log('📊 OVERALL STATISTICS:');
  console.log(`   Total Calls: ${analysis.totalCalls}`);
  console.log(`   Unknown Call Types: ${analysis.unknownCallTypes} (${((analysis.unknownCallTypes / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Missing Units: ${analysis.missingUnits} (${((analysis.missingUnits / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Missing Locations: ${analysis.missingLocations} (${((analysis.missingLocations / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Low Confidence: ${analysis.lowConfidence} (${((analysis.lowConfidence / analysis.totalCalls) * 100).toFixed(1)}%)`);
  
  console.log('\n🚨 CALL TYPE BREAKDOWN:');
  const sortedCallTypes = Object.entries(analysis.callTypeBreakdown)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15);
  
  sortedCallTypes.forEach(([type, count]) => {
    const percentage = ((count / analysis.totalCalls) * 100).toFixed(1);
    console.log(`   ${type}: ${count} calls (${percentage}%)`);
  });
  
  console.log('\n🚑 UNIT EXTRACTION STATISTICS:');
  console.log(`   Calls with Units: ${analysis.unitExtractionStats.hasUnits} (${((analysis.unitExtractionStats.hasUnits / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Calls without Units: ${analysis.unitExtractionStats.noUnits} (${((analysis.unitExtractionStats.noUnits / analysis.totalCalls) * 100).toFixed(1)}%)`);
  
  console.log('\n   Unit Types Found:');
  const sortedUnitTypes = Object.entries(analysis.unitExtractionStats.unitTypes)
    .sort(([,a], [,b]) => b - a);
  
  sortedUnitTypes.forEach(([type, count]) => {
    console.log(`     ${type}: ${count} units`);
  });
  
  console.log('\n📍 LOCATION STATISTICS:');
  console.log(`   Has Location Text: ${analysis.locationStats.hasLocation} (${((analysis.locationStats.hasLocation / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Has Coordinates: ${analysis.locationStats.hasCoordinates} (${((analysis.locationStats.hasCoordinates / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Missing Both: ${analysis.locationStats.missingBoth} (${((analysis.locationStats.missingBoth / analysis.totalCalls) * 100).toFixed(1)}%)`);
  
  console.log('\n🎯 CONFIDENCE DISTRIBUTION:');
  console.log(`   High (>70%): ${analysis.confidenceStats.high} calls (${((analysis.confidenceStats.high / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Medium (50-70%): ${analysis.confidenceStats.medium} calls (${((analysis.confidenceStats.medium / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Low (30-50%): ${analysis.confidenceStats.low} calls (${((analysis.confidenceStats.low / analysis.totalCalls) * 100).toFixed(1)}%)`);
  console.log(`   Very Low (<30%): ${analysis.confidenceStats.veryLow} calls (${((analysis.confidenceStats.veryLow / analysis.totalCalls) * 100).toFixed(1)}%)`);
}

async function identifyFixableCalls(): Promise<void> {
  console.log('\n🔧 IDENTIFYING FIXABLE CALLS:\n');
  
  // Find calls with unknown types that might be fixable
  const unknownCalls = await db
    .select()
    .from(schema.calls)
    .where(or(
      eq(schema.calls.callType, 'Unknown'),
      eq(schema.calls.callType, 'Unknown Call Type'),
      isNull(schema.calls.callType)
    ))
    .orderBy(desc(schema.calls.timestamp))
    .limit(20);
  
  console.log(`Found ${unknownCalls.length} recent calls with unknown types (showing first 20):`);
  
  unknownCalls.forEach((call, index) => {
    const transcript = call.transcript || '';
    const truncatedTranscript = transcript.length > 100 ? 
      transcript.substring(0, 100) + '...' : transcript;
    
    console.log(`\n${index + 1}. Call ${call.id} - ${new Date(call.timestamp).toLocaleString()}`);
    console.log(`   Transcript: "${truncatedTranscript}"`);
    console.log(`   Confidence: ${(call.confidence || 0).toFixed(2)}`);
    console.log(`   Location: ${call.location || 'Missing'}`);
    console.log(`   Units: ${call.units ? call.units.length : 0} units`);
  });
  
  // Find calls without units that might be fixable
  const noUnitCalls = await db
    .select()
    .from(schema.calls)
    .where(
      and(
        or(
          isNull(schema.calls.units),
          sql`json_array_length(${schema.calls.units}) = 0`
        ),
        sql`${schema.calls.confidence} > 0.5`
      )
    )
    .orderBy(desc(schema.calls.timestamp))
    .limit(10);
  
  console.log(`\n\nFound ${noUnitCalls.length} high-confidence calls without units (showing first 10):`);
  
  noUnitCalls.forEach((call, index) => {
    const transcript = call.transcript || '';
    const truncatedTranscript = transcript.length > 100 ? 
      transcript.substring(0, 100) + '...' : transcript;
    
    console.log(`\n${index + 1}. Call ${call.id} - ${new Date(call.timestamp).toLocaleString()}`);
    console.log(`   Transcript: "${truncatedTranscript}"`);
    console.log(`   Confidence: ${(call.confidence || 0).toFixed(2)}`);
    console.log(`   Call Type: ${call.callType || 'Unknown'}`);
  });
}

async function main() {
  try {
    console.log('🔍 Starting comprehensive database analysis...');
    
    const analysis = await analyzeDatabase();
    await generateDetailedReport(analysis);
    await identifyFixableCalls();
    
    console.log('\n✅ Database analysis complete!');
    console.log('\nRECOMMENDATIONS:');
    
    if (analysis.unknownCallTypes > 0) {
      console.log(`• Re-classify ${analysis.unknownCallTypes} calls with unknown types`);
    }
    
    if (analysis.missingUnits > 0) {
      console.log(`• Extract units from ${analysis.missingUnits} calls missing unit information`);
    }
    
    if (analysis.missingLocations > 0) {
      console.log(`• Extract locations from ${analysis.missingLocations} calls missing location data`);
    }
    
    if (analysis.lowConfidence > 0) {
      console.log(`• Consider re-transcribing ${analysis.lowConfidence} low-confidence calls`);
    }
    
  } catch (error) {
    console.error('Error during analysis:', error);
  } finally {
    await client.end();
  }
}

// Run the analysis
main().catch(console.error);
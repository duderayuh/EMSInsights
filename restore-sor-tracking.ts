import { db } from './server/db';
import { hospitalCalls, hospitalCallSegments } from '@shared/schema';
import { eq, isNull, sql } from 'drizzle-orm';
import { SORDetectionService } from './server/services/sor-detection';

async function restoreHistoricalSORTracking() {
  console.log('Starting historical SOR tracking restoration...');
  
  const sorDetector = new SORDetectionService();
  
  try {
    // Get all hospital calls that haven't been analyzed for SOR
    const unanalyzedCalls = await db.select()
      .from(hospitalCalls)
      .where(isNull(hospitalCalls.sorDetected))
      .orderBy(hospitalCalls.timestamp);
      
    console.log(`Found ${unanalyzedCalls.length} hospital calls without SOR analysis`);
    
    let updatedCount = 0;
    let sorDetectedCount = 0;
    
    for (const call of unanalyzedCalls) {
      // Get all segments for this hospital call
      const segments = await db.select()
        .from(hospitalCallSegments)
        .where(eq(hospitalCallSegments.hospitalCallId, call.id))
        .orderBy(hospitalCallSegments.segmentOrder);
        
      if (segments.length === 0) {
        console.log(`No segments found for hospital call ${call.id}, skipping`);
        continue;
      }
      
      // Check each segment for SOR mentions
      let sorDetected = false;
      let physicianName: string | null = null;
      let highestConfidence = 0;
      
      for (const segment of segments) {
        if (!segment.transcript) continue;
        
        const sorResult = sorDetector.detectSOR(segment.transcript);
        
        if (sorResult.isSOR && sorResult.confidence > highestConfidence) {
          sorDetected = true;
          highestConfidence = sorResult.confidence;
          if (sorResult.physicianName) {
            physicianName = sorResult.physicianName;
          }
        }
      }
      
      // Update the hospital call with SOR information
      await db.update(hospitalCalls)
        .set({
          sorDetected,
          sorPhysician: physicianName
        })
        .where(eq(hospitalCalls.id, call.id));
        
      updatedCount++;
      if (sorDetected) {
        sorDetectedCount++;
        console.log(`Hospital call ${call.id} - SOR detected with physician: ${physicianName || 'Unknown'} (confidence: ${highestConfidence.toFixed(2)})`);
      }
      
      // Progress update every 10 calls
      if (updatedCount % 10 === 0) {
        console.log(`Progress: ${updatedCount}/${unanalyzedCalls.length} calls analyzed`);
      }
    }
    
    console.log('\nSOR tracking restoration complete!');
    console.log(`Total calls analyzed: ${updatedCount}`);
    console.log(`Calls with SOR detected: ${sorDetectedCount}`);
    console.log(`SOR detection rate: ${((sorDetectedCount / updatedCount) * 100).toFixed(1)}%`);
    
    // Show some statistics on existing SOR data
    const allCallsWithSOR = await db.execute(sql`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN sor_detected = true THEN 1 ELSE 0 END) as sor_count,
             COUNT(DISTINCT sor_physician) as unique_physicians
      FROM hospital_calls
    `);
    
    const stats = Array.isArray(allCallsWithSOR) ? allCallsWithSOR[0] : allCallsWithSOR.rows?.[0];
    if (stats) {
      console.log('\nOverall SOR statistics:');
      console.log(`Total hospital calls: ${stats.total}`);
      console.log(`Calls with SOR: ${stats.sor_count}`);
      console.log(`Unique physicians: ${stats.unique_physicians}`);
    }
    
  } catch (error) {
    console.error('Error restoring SOR tracking:', error);
    throw error;
  }
}

// Run the restoration
restoreHistoricalSORTracking()
  .then(() => {
    console.log('SOR tracking restoration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('SOR tracking restoration failed:', error);
    process.exit(1);
  });
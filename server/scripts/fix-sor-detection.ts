import { storage } from '../storage';
import { SORDetectionService } from '../services/sor-detection';
import { conversationAnalyzer } from '../services/conversation-analyzer';

/**
 * Fix SOR detection for existing hospital calls
 * This script will re-analyze all hospital calls to detect SOR requests
 */
async function fixSORDetection() {
  console.log('Starting SOR detection fix...');
  
  const sorDetector = new SORDetectionService();
  let processed = 0;
  let sorDetected = 0;
  
  try {
    // Get all hospital calls
    const hospitalCalls = await storage.getHospitalCalls(1000); // Get up to 1000 calls
    console.log(`Found ${hospitalCalls.length} hospital calls to process`);
    
    for (const call of hospitalCalls) {
      try {
        // Get all segments for this call
        const segments = await storage.getHospitalCallSegments(call.id);
        console.log(`Processing call ${call.id} with ${segments.length} segments`);
        
        let callHasSOR = false;
        let sorPhysician: string | null = null;
        
        // Check each segment for SOR content
        for (const segment of segments) {
          if (segment.transcript && segment.transcript.trim() !== '' && 
              segment.transcript !== '[No transcription available]') {
            
            const sorResult = sorDetector.detectSOR(segment.transcript);
            
            if (sorResult.isSOR) {
              console.log(`  - SOR detected in segment ${segment.id}: "${segment.transcript}"`);
              console.log(`    Confidence: ${sorResult.confidence}, Physician: ${sorResult.physicianName || 'None'}`);
              
              callHasSOR = true;
              if (sorResult.physicianName && !sorPhysician) {
                sorPhysician = sorResult.physicianName;
              }
            }
          }
        }
        
        // Update hospital call if SOR was detected
        if (callHasSOR) {
          await storage.updateHospitalCall(call.id, {
            sorDetected: true,
            sorPhysician: sorPhysician
          });
          
          console.log(`✓ Updated call ${call.id} - SOR detected with physician: ${sorPhysician || 'Unknown'}`);
          sorDetected++;
        } else if (call.sorDetected) {
          // Clear false positives
          await storage.updateHospitalCall(call.id, {
            sorDetected: false,
            sorPhysician: null
          });
          console.log(`✓ Cleared false SOR detection for call ${call.id}`);
        }
        
        processed++;
        
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
      }
    }
    
    console.log(`\nSOR detection fix completed:`);
    console.log(`- Processed: ${processed} hospital calls`);
    console.log(`- SOR detected: ${sorDetected} calls`);
    
  } catch (error) {
    console.error('Error during SOR detection fix:', error);
  }
}

// Run the fix if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixSORDetection()
    .then(() => {
      console.log('SOR detection fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('SOR detection fix failed:', error);
      process.exit(1);
    });
}

export { fixSORDetection };
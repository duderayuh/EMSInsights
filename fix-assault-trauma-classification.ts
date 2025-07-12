import { storage } from "./server/storage";
import { nlpClassifier } from "./server/services/nlp-classifier";

async function fixAssaultTraumaClassification() {
  console.log("Starting fix for Assault Trauma B classification...");
  
  try {
    // Get recent calls (large batch) to search for classification issues
    const recentCalls = await storage.getRecentCalls(5000);
    
    console.log(`Checking ${recentCalls.length} recent calls for classification issues...`);
    
    // Find calls with "assault trauma" in transcript but classified as "Vehicle Accident"
    const callsToFix = recentCalls.filter(call => {
      const transcript = call.transcript?.toLowerCase() || "";
      const callType = call.callType?.toLowerCase() || "";
      
      return (
        transcript.includes("assault trauma") &&
        callType.includes("vehicle accident")
      );
    });
    
    console.log(`Found ${callsToFix.length} calls to fix`);
    
    let fixedCount = 0;
    
    for (const call of callsToFix) {
      console.log(`Fixing call ${call.id}: "${call.transcript}" (currently "${call.callType}")`);
      
      // Re-classify using our updated NLP classifier
      const result = await nlpClassifier.classify(call.transcript || "");
      
      // Update the call with the new classification
      await storage.updateCall(call.id, {
        callType: result.callType,
        keywords: result.keywords,
        acuityLevel: result.acuityLevel
      });
      
      fixedCount++;
      console.log(`Fixed call ${call.id}: "${call.callType}" -> "${result.callType}"`);
    }
    
    console.log(`Successfully fixed ${fixedCount} calls`);
    
    // Also check for any calls that should be classified as "Assault Trauma B"
    const allAssaultCalls = recentCalls.filter(call => {
      const transcript = call.transcript?.toLowerCase() || "";
      return transcript.includes("assault trauma b");
    });
    
    console.log(`Found ${allAssaultCalls.length} calls containing "assault trauma b"`);
    
    for (const call of allAssaultCalls) {
      console.log(`Call ${call.id}: "${call.transcript}" -> Current type: "${call.callType}"`);
      
      if (call.callType !== "Assault Trauma B") {
        await storage.updateCall(call.id, {
          callType: "Assault Trauma B"
        });
        console.log(`Updated call ${call.id} to "Assault Trauma B"`);
      }
    }
    
  } catch (error) {
    console.error("Error fixing assault trauma classification:", error);
  }
}

// Run the fix
fixAssaultTraumaClassification().then(() => {
  console.log("Fix completed");
  process.exit(0);
}).catch(error => {
  console.error("Fix failed:", error);
  process.exit(1);
});
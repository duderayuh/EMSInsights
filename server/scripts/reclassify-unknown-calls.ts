import { storage } from "../storage";
import { nlpClassifier } from "../services/nlp-classifier";
import { geocodingService } from "../services/geocoding";

export async function reclassifyUnknownCalls() {
  console.log("Starting targeted reclassification of Unknown calls...");
  
  const calls = await storage.getRecentCalls(5000);
  const unknownCalls = calls.filter(call => 
    call.callType === "Unknown" || call.callType === "Unknown Call Type"
  );
  
  console.log(`Found ${unknownCalls.length} unknown calls to reclassify`);
  
  let reclassified = 0;
  let geocoded = 0;
  
  for (const call of unknownCalls) {
    const transcript = call.transcript || "";
    
    // Skip obvious non-emergency content
    if (shouldSkipCall(transcript)) {
      continue;
    }
    
    let updates: any = {};
    
    // Try to reclassify based on obvious patterns
    const newCallType = identifyCallType(transcript);
    if (newCallType && newCallType !== "Unknown") {
      updates.callType = newCallType;
      reclassified++;
      console.log(`Reclassified call ${call.id}: "${transcript.substring(0, 50)}..." -> ${newCallType}`);
    }
    
    // Try to extract location
    if (!call.location || call.location === "" || call.location === "none") {
      const location = extractLocation(transcript);
      if (location) {
        try {
          const geocoded_result = await geocodingService.geocodeAddress(location);
          if (geocoded_result.success && geocoded_result.latitude && geocoded_result.longitude) {
            updates.location = geocoded_result.address || location;
            updates.latitude = geocoded_result.latitude;
            updates.longitude = geocoded_result.longitude;
            geocoded++;
            console.log(`Geocoded call ${call.id}: "${location}" -> ${geocoded_result.address}`);
          }
        } catch (error) {
          console.log(`Geocoding failed for call ${call.id}: ${error}`);
        }
      }
    }
    
    // Apply updates
    if (Object.keys(updates).length > 0) {
      await storage.updateCall(call.id, updates);
    }
  }
  
  console.log(`Reclassification complete: ${reclassified} calls reclassified, ${geocoded} calls geocoded`);
  return { reclassified, geocoded, total: unknownCalls.length };
}

function shouldSkipCall(transcript: string): boolean {
  const skipPatterns = [
    /thank you for watching/i,
    /visit www\./i,
    /subscribe/i,
    /beep/i,
    /tone/i,
    /pause/i,
    /test/i,
    /error/i,
    /failed/i,
    /timeout/i,
    /static/i,
    /interference/i,
    /the end/i,
    /r\.i\.p/i,
    /^[a-z\s]*$/i,  // Only single words
    /^.{1,10}$/,    // Very short
    /^\s*$/,        // Empty
    /^[\d\s-]+$/,   // Only numbers
    /audio processing error/i,
    /no dispatch content/i,
    /audio contains only/i,
    /incomplete transmission/i,
    /audio artifact/i
  ];
  
  return skipPatterns.some(pattern => pattern.test(transcript));
}

function identifyCallType(transcript: string): string | null {
  const text = transcript.toLowerCase();
  
  // Dispatch patterns
  if (text.includes("ambulance") || text.includes("medic") || text.includes("engine")) {
    if (text.includes("street") || text.includes("avenue") || text.includes("road") || 
        text.includes("boulevard") || text.includes("court") || text.includes("drive")) {
      return "Medical Emergency";
    }
  }
  
  // Medical emergencies
  if (text.includes("cardiac arrest") || text.includes("heart attack")) {
    return "Cardiac Arrest";
  }
  
  if (text.includes("chest pain") || text.includes("heart")) {
    return "Chest Pain/Heart";
  }
  
  if (text.includes("difficulty breathing") || text.includes("trouble breathing") || 
      text.includes("shortness of breath") || text.includes("respiratory")) {
    return "Difficulty Breathing";
  }
  
  if (text.includes("unconscious") || text.includes("unresponsive") || text.includes("collapse")) {
    return "Unconscious / Fainting (Near)";
  }
  
  if (text.includes("seizure") || text.includes("convulsion")) {
    return "Convulsions/Seizures";
  }
  
  if (text.includes("trauma") || text.includes("injury") || text.includes("injured")) {
    return "Trauma/MVC";
  }
  
  if (text.includes("motorcycle") || text.includes("vehicle") || text.includes("accident") || 
      text.includes("crash") || text.includes("collision")) {
    return "Vehicle Accident";
  }
  
  if (text.includes("fire") && !text.includes("trash fire")) {
    return "Fire/Hazmat";
  }
  
  if (text.includes("overdose") || text.includes("poisoning") || text.includes("ingestion")) {
    return "Overdose / Poisoning (Ingestion)";
  }
  
  if (text.includes("sick") || text.includes("ill")) {
    return "Sick Person";
  }
  
  if (text.includes("diabetic") || text.includes("diabetes")) {
    return "Diabetic";
  }
  
  if (text.includes("assault") || text.includes("violence") || text.includes("attack")) {
    return "Assault / Sexual Assault / Stun Gun";
  }
  
  if (text.includes("bleeding") || text.includes("hemorrhage")) {
    return "Bleeding";
  }
  
  if (text.includes("choking")) {
    return "Choking";
  }
  
  if (text.includes("abdominal") || text.includes("stomach")) {
    return "Abdominal Pain";
  }
  
  if (text.includes("back pain") || text.includes("spine")) {
    return "Back Pain (Non-Traumatic)";
  }
  
  if (text.includes("burn") || text.includes("scald")) {
    return "Burns (Scalds) / Explosion (Blast)";
  }
  
  if (text.includes("psychiatric") || text.includes("mental") || text.includes("suicide")) {
    return "Psychiatric / Suicide Attempt";
  }
  
  if (text.includes("pregnancy") || text.includes("birth") || text.includes("labor")) {
    return "Pregnancy/Childbirth";
  }
  
  // Hospital communications
  if (text.includes("methodist") || text.includes("eskenazi") || text.includes("riley") || 
      text.includes("hospital") || text.includes("this is") || text.includes("receiving")) {
    return "EMS-Hospital Communications";
  }
  
  return null;
}

function extractLocation(transcript: string): string | null {
  // Look for obvious address patterns
  const addressPatterns = [
    // Street address with number
    /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Circle|Cir|Court|Ct|Place|Pl|Terrace|Ter|Way)\b/gi,
    // Interstate/Highway
    /\b(?:I-?\d{1,3}|Interstate\s+\d{1,3}|Highway\s+\d{1,3}|US\s+\d{1,3})\b/gi,
    // Mile markers
    /\b\d{1,3}\s+mile\s+marker?\b/gi
  ];
  
  for (const pattern of addressPatterns) {
    const match = transcript.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return null;
}
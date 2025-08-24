import { db } from '../db';
import { callTypes } from '@shared/schema';
import type { CallType } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface ClassificationResult {
  callType: string;
  keywords: string[];
  acuityLevel?: string; // A, B, or C
  location?: string;
  metadata: Record<string, any>;
}

interface KeywordConfig {
  medical: string[];
  fire: string[];
  trauma: string[];
  hospital: string[];
  investigation: string[];
  locations: string[];
}

export class NLPClassifier {
  private callTypesMap: Map<string, CallType> = new Map();
  private callTypeNames: string[] = [];
  private keywords: KeywordConfig = {} as KeywordConfig;
  private locationPattern: RegExp;
  private indianapolisLocations: string[];
  private initialized: Promise<void>;

  constructor() {
    this.locationPattern =
      /\b\d+\s+[NSEW]?\s*\w+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|way|drive|dr|lane|ln|ct|court|pl|place)\b/gi;
    this.indianapolisLocations = [
      "i-465", "i-65", "i-70", "i-69", "i-74",
      "downtown", "broad ripple", "fountain square", 
      "massachusetts avenue", "meridian", "keystone", 
      "college avenue", "washington street", "market street",
      "circle centre", "monument circle"
    ];
    
    // Initialize asynchronously
    this.initialized = this.initialize();
  }

  private async initialize() {
    await this.loadCallTypesFromDatabase();
    this.loadKeywords();
  }

  private async loadCallTypesFromDatabase() {
    try {
      const activeCallTypes = await db.select()
        .from(callTypes)
        .where(eq(callTypes.active, true));
      
      // Clear existing maps
      this.callTypesMap.clear();
      this.callTypeNames = [];
      
      // Build maps for quick lookup
      for (const callType of activeCallTypes) {
        this.callTypesMap.set(callType.displayName.toLowerCase(), callType);
        this.callTypeNames.push(callType.displayName.toLowerCase());
      }
      
      console.log(`Loaded ${this.callTypeNames.length} call types from database`);
    } catch (error) {
      console.error('Error loading call types from database:', error);
      // Fallback to a minimal set if database fails
      this.loadFallbackCallTypes();
    }
  }

  private loadFallbackCallTypes() {
    // Minimal fallback if database is unavailable
    const fallbackTypes = [
      'Medical Emergency', 'Fire/Hazmat', 'Vehicle Accident', 
      'Investigation', 'Hospital-EMS Communications'
    ];
    
    for (const typeName of fallbackTypes) {
      this.callTypeNames.push(typeName.toLowerCase());
    }
  }

  // Method to ensure initialization is complete before classification
  async ensureInitialized() {
    await this.initialized;
  }

  private loadKeywords() {
    // Backup keyword configuration for classification
    this.keywords = {
      medical: [
        "cardiac arrest", "chest pain", "heart", "breathing", "difficulty breathing",
        "seizure", "unconscious", "diabetic", "allergic", "overdose", "stroke",
        "abdominal pain", "back pain", "headache", "sick person", "bleeding",
        "mental", "emotional", "psychiatric", "ob", "childbirth", "pregnancy",
        "mental emotional", "mental/emotional", "6c", "6a", "6b", "6d", "31c", "31b", "31a", "31d"
      ],
      fire: [
        "fire", "smoke", "flames", "burning", "structure fire", "building fire",
        "residential fire", "residence fire", "vehicle fire", "gas leak", "explosion", "hazmat",
        "gas odor", "gas smell", "apartment alarm", "building alarm", "alarm", "smoke alarm"
      ],
      trauma: [
        "vehicle accident", "mvc", "crash", "collision", "gunshot", "gsw",
        "injured", "trauma", "assault", "fall", "accident", "pi working", "personal injury"
      ],
      hospital: [
        "this is methodist", "methodist here", "methodist receiving",
        "riley hospital", "riley receiving", "eskenazi", "st vincent",
        "community hospital", "iu methodist", "signature of release",
        "hospital notification", "eta to hospital", "physician signature"
      ],
      investigation: [
        "assist person", "welfare check", "investigation", "suspicious",
        "unknown problem", "check wellbeing"
      ],
      locations: this.indianapolisLocations
    };
  }

  async classify(
    transcript: string,
    extractedData?: any,
    segmentId?: string
  ): Promise<ClassificationResult> {
    // Ensure we're initialized before classifying
    await this.ensureInitialized();
    const text = transcript.toLowerCase();
    const foundKeywords: string[] = [];
    let callType = "Unknown";
    let acuityLevel: string | undefined;

    // Step 1: Extract chief complaint from transcript
    const chiefComplaint = this.extractChiefComplaint(transcript);
    
    // Step 2: If no chief complaint found, use keyword scoring
    if (!chiefComplaint) {
      const typeScores = {
        medical: 0,
        fire: 0,
        trauma: 0,
        hospital: 0,
        investigation: 0
      };

      // Check each category
      for (const [category, keywords] of Object.entries(this.keywords)) {
        if (category === "locations") continue;

        for (const keyword of keywords) {
          if (text.includes(keyword.toLowerCase())) {
            foundKeywords.push(keyword);
            typeScores[category as keyof typeof typeScores] += 1;
          }
        }
      }

      // Determine call type based on highest score
      const maxScore = Math.max(...Object.values(typeScores));
      if (maxScore > 0) {
        const topCategory = Object.keys(typeScores).find(
          (key) => typeScores[key as keyof typeof typeScores] === maxScore
        );
        
        // Map categories to call types
        switch(topCategory) {
          case "medical":
            callType = "Medical Emergency";
            break;
          case "fire":
            callType = "Fire/Hazmat";
            break;
          case "trauma":
            // Better trauma classification based on specific keywords
            if (text.includes("assault") || text.includes("trauma")) {
              callType = "Trauma/MVC";
            } else if (text.includes("vehicle accident") || text.includes("mvc") || text.includes("crash") || text.includes("collision")) {
              callType = "Vehicle Accident";
            } else if (text.includes("gunshot") || text.includes("gsw")) {
              callType = "Gunshot";
            } else {
              callType = "Trauma/MVC";
            }
            break;
          case "hospital":
            callType = "Hospital-EMS Communications";
            break;
          case "investigation":
            callType = "Assist Person";
            break;
          default:
            callType = "Unknown Call Type";
        }
      }
    } else {
      callType = chiefComplaint;
    }

    // Step 3: Extract acuity level (A, B, C) from transcript
    acuityLevel = this.extractAcuityLevel(transcript);

    // Step 4: Extract location from transcript (skip for hospital communications)
    let location = extractedData?.extractedAddress || undefined;
    
    // If post-processing didn't find an address, try our own patterns
    if (!location && callType !== "EMS-Hospital Communications") {
      // Enhanced location patterns for dispatch audio
      const enhancedLocationPatterns = [
        // Standard address pattern
        this.locationPattern,
        // Intersection pattern (very common in dispatch)
        /\b([a-zA-Z0-9\s]+(?:street|st|avenue|ave|road|rd|drive|dr))\s*(?:and|&|\bat\b|near)\s*([a-zA-Z0-9\s]+(?:street|st|avenue|ave|road|rd|drive|dr))/gi,
        // Grid coordinates
        /\b(\d{3,5})\s*(north|south|east|west|n|s|e|w)\s*[,&]\s*(\d{3,5})\s*(north|south|east|west|n|s|e|w)/gi,
        // Simple numbered streets
        /\b(\d{1,3})(?:st|nd|rd|th)\s+(?:street|and|&)\s*([a-zA-Z\s]+)/gi
      ];
      
      for (const pattern of enhancedLocationPatterns) {
        const match = transcript.match(pattern);
        if (match) {
          location = match[0].trim();
          break;
        }
      }
    }
    
    // Clear location for hospital communications
    if (callType === "EMS-Hospital Communications") {
      location = undefined;
    }
    
    // Log extraction results for debugging
    if (location) {
      console.log(`NLP Classification for segment ${segmentId || 'unknown'}: callType="${callType}", location="${location}"}`);
    } else {
      console.log(`NLP Classification for segment ${segmentId || 'unknown'}: callType="${callType}", location="none"}`);
    }

    // Step 5: Check for Indianapolis-specific locations
    for (const indyLocation of this.indianapolisLocations) {
      if (text.includes(indyLocation)) {
        foundKeywords.push(indyLocation);
      }
    }

    // Step 6: Apply EMS terminology corrections
    callType = this.applyTerminologyCorrections(callType, transcript);

    // console.log(`NLP Debug - Transcript: "${transcript}"`);
    // console.log(`NLP Debug - Call type: "${callType}"`);
    // console.log(`NLP Debug - Acuity level: "${acuityLevel || 'None'}"`);
    // console.log(`NLP Debug - Location: "${location || 'None'}"`);

    // Generate embedding for similarity search
    const embedding = await this.generateEmbedding(transcript);

    return {
      callType: this.formatCallType(callType),
      keywords: foundKeywords,
      acuityLevel,
      location,
      metadata: {
        embedding,
        transcriptLength: transcript.length,
        keywordCount: foundKeywords.length,
        containsLocation: !!location,
      },
    };
  }

  private extractChiefComplaint(transcript: string): string | null {
    const text = transcript.toLowerCase();
    
    // Check each call type from the database
    for (const callTypeName of this.callTypeNames) {
      if (text.includes(callTypeName)) {
        // Get the proper display name from the map
        const callType = this.callTypesMap.get(callTypeName);
        return callType ? callType.displayName : null;
      }
    }
    
    // Look for "for [complaint]" pattern common in EMS dispatches
    const forPattern = /for\s+([^,\.]+)/;
    const forMatch = text.match(forPattern);
    if (forMatch) {
      const complaint = forMatch[1].trim().toLowerCase();
      // Check if it matches any known call type
      for (const callTypeName of this.callTypeNames) {
        if (complaint.includes(callTypeName)) {
          const callType = this.callTypesMap.get(callTypeName);
          return callType ? callType.displayName : null;
        }
      }
    }
    
    return null;
  }

  private extractAcuityLevel(transcript: string): string | undefined {
    const text = transcript.toLowerCase();
    
    // Look for acuity patterns
    const patterns = [
      /\b([abc])\s*level/i,
      /level\s*([abc])\b/i,
      /\bacuity\s*([abc])\b/i,
      /\b([abc])\s*acuity/i,
      /\s+([abc])\s*$/,  // At end of transcript
      /\s+([abc])[,\.]/,  // Followed by punctuation
      /\s+([abc])\s+/,    // Surrounded by spaces
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }
    
    return undefined;
  }

  private applyTerminologyCorrections(callType: string, transcript: string): string {
    const text = transcript.toLowerCase();
    
    // Enhanced mapping to available call types
    // Check for specific medical conditions
    if (text.includes("cardiac arrest") || text.includes("heart stopped")) {
      return "Cardiac Arrest";
    }
    
    if (text.includes("chest pain") || text.includes("heart attack")) {
      return "Chest Pain";
    }
    
    if (text.includes("difficulty breathing") || text.includes("trouble breathing") || text.includes("shortness of breath") || text.includes("sob")) {
      return "Difficulty Breathing";
    }
    
    if (text.includes("seizure") || text.includes("seizing")) {
      return "Seizure";
    }
    
    if (text.includes("stroke") || text.includes("cva") || text.includes("cerebrovascular")) {
      return "Stroke/CVA";
    }
    
    if (text.includes("diabetic") || text.includes("blood sugar") || text.includes("glucose")) {
      return "Diabetic";
    }
    
    if (text.includes("overdose") || text.includes("od") || text.includes("poisoning")) {
      return "Overdose";
    }
    
    if (text.includes("unconscious") || text.includes("unresponsive") || text.includes("fainting")) {
      return "Unconscious Person";
    }
    
    if (text.includes("mental") || text.includes("emotional") || text.includes("psychiatric") || text.includes("psych")) {
      return "Mental/Emotional";
    }
    
    if (text.includes("bleeding") && !text.includes("trauma")) {
      return "Bleeding Non-Traumatic";
    }
    
    if (text.includes("abdominal pain") || text.includes("stomach pain")) {
      return "Abdominal Pain";
    }
    
    if (text.includes("back pain")) {
      return "Abdominal/Back Pain";
    }
    
    if (text.includes("headache")) {
      return "Headache";
    }
    
    if (text.includes("allergic") || text.includes("allergy")) {
      return "Allergic Reaction";
    }
    
    // Trauma-related
    if (text.includes("mvc") || text.includes("motor vehicle") || text.includes("car accident") || text.includes("crash")) {
      return "Vehicle Accident";
    }
    
    if (text.includes("gsw") || text.includes("gunshot")) {
      return "Gunshot Wound";
    }
    
    if (text.includes("stabbing") || text.includes("stab wound") || text.includes("penetrating")) {
      return "Stab / Gunshot / Penetrating Trauma";
    }
    
    if (text.includes("assault")) {
      return "Assault / Sexual Assault / Stun Gun";
    }
    
    if (text.includes("injured") || text.includes("injury") || text.includes("trauma")) {
      return "Injured Person";
    }
    
    // OB/Childbirth
    if (text.includes("ob") || text.includes("childbirth") || text.includes("pregnancy") || text.includes("pregnant") || text.includes("labor")) {
      return "OB/Childbirth";
    }
    
    // Fire-related
    if (text.includes("fire") || text.includes("smoke") || text.includes("flames")) {
      if (text.includes("residential") || text.includes("house") || text.includes("apartment")) {
        return "Residential Fire";
      }
      return "Fire/Hazmat";
    }
    
    if (text.includes("alarm") && (text.includes("building") || text.includes("fire"))) {
      return "Building Alarm";
    }
    
    // General medical
    if (text.includes("sick person") || (text.includes("sick") && !text.includes("vehicle"))) {
      return "Sick Person";
    }
    
    // Investigation/assist
    if (text.includes("assist") || text.includes("welfare") || text.includes("check")) {
      return "Assist Person";
    }
    
    if (text.includes("investigation") || text.includes("unknown problem")) {
      return "Investigation";
    }
    
    // Mass casualty
    if (text.includes("mass casualty") || text.includes("multiple patients") || text.includes("mci")) {
      return "Mass Casualty";
    }
    
    // If it's a general medical call
    if (callType === "Medical Emergency") {
      // Try to be more specific based on context
      if (text.includes("person")) {
        return "Sick Person";
      }
      return "Medical Emergency";
    }
    
    // Hospital communications
    if (callType === "Hospital-EMS Communications") {
      return "EMS-Hospital Communications";
    }
    
    return callType;
  }

  private formatCallType(callType: string): string {
    // Check if the call type exists in our database map
    const lowerCallType = callType.toLowerCase();
    const dbCallType = this.callTypesMap.get(lowerCallType);
    
    if (dbCallType) {
      return dbCallType.displayName;
    }
    
    // If not found, check for partial matches
    for (const [key, value] of this.callTypesMap.entries()) {
      if (key.includes(lowerCallType) || lowerCallType.includes(key)) {
        return value.displayName;
      }
    }
    
    // Return the original if no match found
    return callType;
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    // Placeholder for embedding generation
    // In production, this would call an embedding service
    return null;
  }

  hasEmergencyContent(transcript: string): boolean {
    if (!transcript || typeof transcript !== 'string') {
      return false;
    }

    const text = transcript.toLowerCase().trim();
    
    // First check if it's just {beeping} or noise
    if (text === '{beeping}' || text === '{beep}' || text === '[beeping]' || text === '[beep]') {
      return false;
    }

    // Check for beeping sound patterns that should be filtered out
    const beepingPatterns = [
      /^\s*\{beeping\}\s*$/i,  // EXACT match for "{beeping}" with optional whitespace
      /^\s*\{beep\}\s*$/i,     // EXACT match for "{beep}" with optional whitespace
      /^\s*\[beeping\]\s*$/i,  // EXACT match for "[beeping]" with optional whitespace
      /^\s*\[beep\]\s*$/i,     // EXACT match for "[beep]" with optional whitespace
      /^\s*beep+\s*$/i,        // Just "beep" or "beeeep"
      /^\s*tone+\s*$/i,        // Just "tone" or "tooone"
      /\{beeping\}/i,          // Any text containing {beeping}
      /\{beep\}/i,             // Any text containing {beep}
      /\[beeping\]/i,          // Any text containing [beeping]
      /\[beep\]/i,             // Any text containing [beep]
      /for more.*videos.*visit/i,
      /for more.*information.*visit/i,
      /www\./i,
      /\.com/i,
      /http/i,
      /thank you for watching/i,
      /thanks for watching/i,
      /please subscribe/i,
      /subscribe to/i,
      /like and subscribe/i,
      /visit our website/i,
      /download.*app/i,
      /follow us/i,
      /social media/i,
      /to be continued/i,
      /stay tuned/i,
      /coming up next/i,
      /previously on/i,
      /the end/i,
      /r\.?i\.?p\.?/i,
      /\[music\]/i,
      /\[applause\]/i,
      /\[laughter\]/i,
      /copyright/i,
      /all rights reserved/i,
      /do not generate text for non-speech audio/i,
      /audio unavailable/i,
      /no speech detected/i,
      /\[inaudible\]/i,
    ];

    // Filter out beeping sounds and other non-emergency content
    for (const pattern of beepingPatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    // Check for other non-emergency patterns
    const nonEmergencyPatterns = [
      /^[\d\s-]+$/,  // Only numbers and spaces
      /^[a-z]{1,10}$/i,  // Only single short word
      /^.{1,5}$/,    // Very short content (less than 5 chars)
      /^\s*$/,        // Empty or whitespace only
      /^(pause|test|click|beep|tone|static|interference|signal|error|timeout|connection|failed|yes|no|ok|uh|um|ah|oh)$/i,
    ];

    for (const pattern of nonEmergencyPatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    // Check for emergency keywords that indicate legitimate content
    const emergencyKeywords = [
      'medic', 'engine', 'ambulance', 'fire', 'rescue', 'squad', 'dispatch', 'unit',
      'cardiac', 'chest pain', 'breathing', 'seizure', 'unconscious', 'bleeding',
      'mvc', 'accident', 'trauma', 'overdose', 'stroke', 'hospital', 'emergency',
      'street', 'avenue', 'road', 'boulevard', 'drive', 'location', 'address', 'lane', 'court', 'place',
      'i-65', 'i-70', 'i-465', 'i-69', 'i-74', 'interstate', 'highway', 'us 31',
      'methodist', 'riley', 'eskenazi', 'st. vincent', 'franciscan', 'community',
      'sick', 'person', 'diabetic', 'mental', 'emotional', 'fall', 'assault',
      'north', 'south', 'east', 'west', 'apartment', 'building', 'room'
    ];

    // If transcript contains emergency keywords, consider it valid
    return emergencyKeywords.some(keyword => text.includes(keyword));
  }
}

export const nlpClassifier = new NLPClassifier();
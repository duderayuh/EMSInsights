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
  private chiefComplaints: string[] = [];
  private keywords: KeywordConfig = {} as KeywordConfig;
  private locationPattern: RegExp;
  private indianapolisLocations: string[];

  constructor() {
    this.loadChiefComplaints();
    this.loadKeywords();
    this.locationPattern =
      /\b\d+\s+[NSEW]?\s*\w+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|way|drive|dr|lane|ln|ct|court|pl|place)\b/gi;
    this.indianapolisLocations = [
      "i-465", "i-65", "i-70", "i-69", "i-74",
      "downtown", "broad ripple", "fountain square", 
      "massachusetts avenue", "meridian", "keystone", 
      "college avenue", "washington street", "market street",
      "circle centre", "monument circle"
    ];
  }

  private loadChiefComplaints() {
    // Load all chief complaints from your provided list
    this.chiefComplaints = [
      "abdominal pain",
      "abdominal pain b",
      "abdominal/back pain",
      "abdominal/back pain b",
      "allergic reaction",
      "allergic reaction b",
      "assault trauma",
      "assault trauma a",
      "assault trauma b",
      "assault trauma c",
      "assist person",
      "assist person b",
      "assist person c",
      "bleeding",
      "bleeding non-traumatic",
      "bleeding non-traumatic b",
      "cardiac arrest",
      "chest pain/heart",
      "diabetic",
      "diabetic b",
      "difficulty breathing",
      "environmental",
      "gunshot",
      "gunshot wound",
      "headache",
      "injured person",
      "injured person b",
      "injured person c",
      "mental/emotional",
      "mental/emotional b",
      "mental-emotional",
      "mental-emotional b",
      "ob/childbirth",
      "ob/childbirth b",
      "overdose",
      "overdose b",
      "overdose c",
      "pediatric cardiac arrest",
      "seizure",
      "seizure b",
      "sick person",
      "sick person a",
      "sick person b",
      "sick person c",
      "stroke/cva",
      "trauma/mvc",
      "trauma/mvc a",
      "trauma/mvc b",
      "trauma/mvc c",
      "unconscious person",
      "unconscious person b",
      "vehicle accident",
      "vehicle accident b",
      "vehicle accident c",
      "mass casualty"
    ];
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
            callType = "EMS-Hospital Communications";
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
    
    // Check each chief complaint from the list
    for (const complaint of this.chiefComplaints) {
      if (text.includes(complaint)) {
        // Return the properly formatted complaint
        return complaint.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
          .replace('/b', ' B')
          .replace('/c', ' C')
          .replace('/a', ' A')
          .replace('/', '/');
      }
    }
    
    // Look for "for [complaint]" pattern common in EMS dispatches
    const forPattern = /for\s+([^,\.]+)/;
    const forMatch = text.match(forPattern);
    if (forMatch) {
      const complaint = forMatch[1].trim();
      // Check if it matches any known complaint
      for (const knownComplaint of this.chiefComplaints) {
        if (complaint.includes(knownComplaint)) {
          return knownComplaint.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
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
    
    // Apply specific EMS terminology corrections
    if (text.includes("diabetic") && callType === "Medical Emergency") {
      return "Sick Person";
    }
    
    if (text.includes("mvc") || text.includes("motor vehicle")) {
      return "Vehicle Accident";
    }
    
    if (text.includes("gsw") || text.includes("gunshot wound")) {
      return "Gunshot Wound";
    }
    
    if (text.includes("ob") || text.includes("childbirth") || text.includes("pregnancy")) {
      return "OB/Childbirth";
    }
    
    return callType;
  }

  private formatCallType(callType: string): string {
    // Ensure proper formatting of call types
    const standardizedCallTypes = [
      "Abdominal Pain", "Abdominal Pain B", "Abdominal/Back Pain", "Abdominal/Back Pain B",
      "Allergic Reaction", "Allergic Reaction B", "Assist Person", "Assist Person B", "Assist Person C",
      "Bleeding", "Bleeding Non-Traumatic", "Bleeding Non-Traumatic B", "Cardiac Arrest",
      "Chest Pain/Heart", "Diabetic", "Diabetic B", "Difficulty Breathing", "Environmental",
      "Gunshot", "Gunshot Wound", "Headache", "Injured Person", "Injured Person B", "Injured Person C",
      "Mental/Emotional", "Mental/Emotional B", "Mental-Emotional", "Mental-Emotional B",
      "OB/Childbirth", "OB/Childbirth B", "Overdose", "Overdose B", "Overdose C",
      "Pediatric Cardiac Arrest", "Seizure", "Seizure B", "Sick Person", "Sick Person A",
      "Sick Person B", "Sick Person C", "Stroke/CVA", "Unconscious Person", "Unconscious Person B",
      "Vehicle Accident", "Vehicle Accident B", "Vehicle Accident C", "Mass Casualty",
      "Medical Emergency", "Fire/Hazmat", "EMS-Hospital Communications", "Unknown Call Type"
    ];
    
    // Find exact match or return as-is
    const match = standardizedCallTypes.find(type => 
      type.toLowerCase() === callType.toLowerCase()
    );
    
    return match || callType;
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
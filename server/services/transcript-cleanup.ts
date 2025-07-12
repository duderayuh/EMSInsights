import { config } from "dotenv";
config();

import OpenAI from 'openai';

/*
Follow these instructions when using this blueprint:
1. Note that the newest OpenAI model is "gpt-4o", not "gpt-4". gpt-4o was released after your knowledge cutoff. Always prefer using gpt-4o as it is the latest model. When copying code from this blueprint, ensure you also mention this information verbatim as a comment so that you don't revert it to "gpt-4": `// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user`
2. Use the response_format: { type: "json_object" } option
3. Request output in JSON format in the prompt
*/

interface CleanupResult {
  cleanedTranscript: string;
  extractedAddress: string | null;
  extractedUnits: string[];
  extractedCallReason: string | null;
  extractedTime: string | null;
  extractedIntersection: string | null;
  confidence: number;
}

export class TranscriptCleanupService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for transcript cleanup');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
    console.log('Transcript cleanup service initialized with OpenAI API');
  }

  async cleanupTranscript(rawTranscript: string): Promise<CleanupResult> {
    try {
      const prompt = `You are an expert emergency dispatch transcript analyst with deep knowledge of EMS radio protocols. Parse this raw dispatch audio transcript with maximum precision.

RAW TRANSCRIPT: "${rawTranscript}"

## CRITICAL SILENCE BREAK RECOGNITION:
Emergency dispatch audio has natural SILENCE BREAKS between components. You must recognize these pauses:

### STANDARD DISPATCH PATTERN:
"Unit X" <SILENCE> "Address" <SILENCE> "Call Type/Code"

### EXAMPLES OF SILENCE BREAK PARSING:
- "Ambulance 337 West 38th Street, 6C" should be parsed as:
  * Unit: "Ambulance 3" (first component)
  * Address: "37 West 38th Street" (after first silence)
  * Call Type: "6C" (after second silence)

- "Engine 26, medics 26, 72, 12, US 31, south, room 41, chest pain" should be parsed as:
  * Units: "Engine 26, Medics 26" (first component)
  * Address: "7212 US 31 South, Room 41" (after first silence)
  * Call Type: "Chest Pain" (after second silence)

- "Medic 18, 55, North Tv on the street, a false trauma B, C and A secure" should be parsed as:
  * Unit: "Medic 18" (first component)
  * Address: "555 North Tremont Street" (after first silence, correcting speech errors)
  * Call Type: "Assault Trauma B. Scene not secure" (after second silence, correcting errors)

### PARSING RULES FOR SILENCE BREAKS:
1. First component = Emergency units
2. Second component = Street address
3. Third component = Call type/medical code
4. DO NOT concatenate numbers across silence breaks
5. Recognize that "337" might be "3" <silence> "37" (unit 3, address starting with 37)

## CRITICAL EMS CONTEXT:
Indianapolis-Marion County EMS dispatch audio contains life-critical information.

### UNIT FORMATS:
- Medical: "ambulance 3", "medics 26", "EMS 93"
- Fire: "engine 26", "ladder 12", "rescue 4"
- Combined: "engine 26, medics 26" (multi-unit response)

### ADDRESS PARSING WITH SILENCE RECOGNITION:
- Fragmented after silence: "72, 12, US 31, south" = "7212 US 31 South"
- With room: "550 University Boulevard, room 41" = "550 University Boulevard"
- Intersections: "location 2700, morph 2500, west" = "2700 Morph & 2500 West"

### ACUITY LEVELS (CRITICAL):
- "A" or "Alpha" = Highest acuity (life-threatening)
- "B" or "Bravo" = Medium acuity  
- "C" or "Charlie" = Lower acuity
- "6C" = Medical emergency code level C

### MEDICAL CHIEF COMPLAINTS:
- Cardiac arrest (critical medical emergency)
- Seizure (A-level acuity)
- Chest pain, stroke, difficulty breathing
- Trauma: "assault trauma B", "MVC A"
- "Sick Person C" = General medical call, acuity C

### SPEECH RECOGNITION CORRECTIONS:
- "cedar" → "seizure"
- "sieg-hurzen" → "sick person"
- "Sieg-Hurzen" → "Sick Person"
- "tessane park" → "chest pain/heart"
- "Tessane Park" → "Chest Pain/Heart"
- "adorno-batain v" → "abdominal/back pain b"
- "Adorno-Batain v" → "Abdominal/Back Pain B"
- "6% C" → "6C" or "Sick Person C"
- "North Tv on the street" → "North Tremont Street"
- "false trauma" → "assault trauma"
- "C and A secure" → "scene not secure"
- "0, 0, 50 hours" → "0050 hours"
- "500, North Tv on the left" → "500 North 2500 West"
- Audio artifacts: filter out repeated phrases
- Static/unclear: mark lower confidence

## OUTPUT REQUIREMENTS:
Provide ONLY valid JSON with these exact fields:
{
  "cleanedTranscript": "Properly formatted dispatch with silence breaks recognized",
  "extractedAddress": "Primary response address",
  "extractedUnits": ["Medic 12", "Engine 4"],
  "extractedCallReason": "call type with severity code if mentioned",
  "extractedTime": "HH:MM if mentioned",
  "extractedIntersection": "cross streets if mentioned",
  "confidence": 0.75,
  "structuredData": {
    "EMS_Units": ["Medic 12", "Engine 4"],
    "Fire_Units": ["Engine 7", "Ladder 3"],
    "Location": "123 Main Street",
    "Call_Type": "Assault/Trauma B",
    "Additional_Details": "Scene status, patient condition, or special instructions"
  }
}

ACCURACY REQUIREMENTS:
- Recognize silence breaks and parse components correctly
- Separate unit numbers from addresses (e.g., "337" = "3" + "37")
- Preserve acuity levels (A/B/C) in call reason if present
- Set confidence based on audio clarity and completeness
- Address must be geocodable (real street format)`;

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a specialized emergency dispatch transcript analyst with expertise in:
- Indianapolis-Marion County EMS protocols
- Emergency medical terminology and acuity classifications
- Address parsing for Indianapolis area geography
- Speech recognition error patterns in emergency radio audio

Your primary responsibility is life-critical accuracy in extracting dispatch information. Always respond with valid JSON only. Apply medical context knowledge to correct obvious speech recognition errors.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.1
      });

      if (!response.choices[0].message.content) {
        throw new Error('Expected content response from OpenAI');
      }
      
      const responseText = response.choices[0].message.content.trim();
      console.log('OpenAI cleanup raw response:', responseText);

      // Clean up response - remove markdown code blocks if present
      let cleanResponse = responseText.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\s*/, '').replace(/```\s*$/, '');
      }
      
      console.log('Cleaned response for parsing:', cleanResponse);

      try {
        const result = JSON.parse(cleanResponse);
        return {
          cleanedTranscript: result.cleanedTranscript || rawTranscript,
          extractedAddress: result.extractedAddress || null,
          extractedUnits: result.extractedUnits || [],
          extractedCallReason: result.extractedCallReason || null,
          extractedTime: result.extractedTime || null,
          extractedIntersection: result.extractedIntersection || null,
          confidence: result.confidence || 0.5
        };
      } catch (parseError) {
        console.error('Failed to parse Anthropic response as JSON:', parseError);
        // Fallback to basic cleanup
        return this.basicCleanup(rawTranscript);
      }

    } catch (error) {
      console.error('Anthropic API error:', error);
      // Fallback to basic cleanup
      return this.basicCleanup(rawTranscript);
    }
  }

  private basicCleanup(rawTranscript: string): CleanupResult {
    // Basic pattern-based cleanup as fallback
    const text = rawTranscript.toLowerCase();
    
    // Extract address pattern: "72, 12, us 31, south" -> "7212 US 31 South"
    const addressMatch = text.match(/(\d+),?\s*(\d+),?\s*(us|state|sr|highway)?\s*(\d+),?\s*(north|south|east|west)?/);
    let extractedAddress = null;
    if (addressMatch) {
      const [, num1, num2, roadType = 'US', roadNum, direction = ''] = addressMatch;
      extractedAddress = `${num1}${num2} ${roadType.toUpperCase()} ${roadNum} ${direction}`.trim();
    }

    // Extract units
    const unitMatches = rawTranscript.match(/(engine|medics|truck|ladder|rescue)\s+\d+/gi) || [];
    const extractedUnits = Array.from(new Set(unitMatches)); // Remove duplicates

    // Extract call reason (look for medical keywords)
    let extractedCallReason = null;
    const medicalKeywords = ['chest pain', 'heart', 'breathing', 'unconscious', 'seizure', 'overdose'];
    for (const keyword of medicalKeywords) {
      if (text.includes(keyword)) {
        extractedCallReason = keyword;
        break;
      }
    }

    // Extract time: "155 hours" -> "01:55"
    const timeMatch = text.match(/(\d{1,4})\s*hours?/);
    let extractedTime = null;
    if (timeMatch) {
      const militaryTime = timeMatch[1].padStart(4, '0');
      extractedTime = `${militaryTime.slice(0, 2)}:${militaryTime.slice(2, 4)}`;
    }

    // Extract intersection
    const intersectionMatch = text.match(/location\s+(\d+),?\s*(south|north|east|west)?\s*(\d+),?\s*(south|north|east|west)?/);
    let extractedIntersection = null;
    if (intersectionMatch) {
      const [, num1, dir1 = '', num2, dir2 = ''] = intersectionMatch;
      extractedIntersection = `${num1} ${dir1} & ${num2} ${dir2}`.trim().replace(/\s+/g, ' ');
    }

    return {
      cleanedTranscript: rawTranscript, // Keep original if basic cleanup
      extractedAddress,
      extractedUnits,
      extractedCallReason,
      extractedTime,
      extractedIntersection,
      confidence: 0.6
    };
  }
}

export const transcriptCleanupService = new TranscriptCleanupService();
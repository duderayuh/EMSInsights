interface EMSTermCorrection {
  pattern: RegExp;
  replacement: string;
  context?: string;
  confidence?: number;
}

interface PhoneticCorrection {
  sounds: string[];
  correct: string;
  type: 'unit' | 'location' | 'medical' | 'code';
}

export class EMSDictionary {
  // Common EMS unit patterns and corrections
  private readonly unitCorrections: EMSTermCorrection[] = [
    // Medic units
    { pattern: /\bmedical?\s*(\d+)\b/gi, replacement: 'Medic $1' },
    { pattern: /\bmetic\s*(\d+)\b/gi, replacement: 'Medic $1' },
    { pattern: /\bmedix\s*(\d+)\b/gi, replacement: 'Medic $1' },
    { pattern: /\bmedicine\s*(\d+)\b/gi, replacement: 'Medic $1' },
    
    // Engine units
    { pattern: /\bengin\s*(\d+)\b/gi, replacement: 'Engine $1' },
    { pattern: /\binjun\s*(\d+)\b/gi, replacement: 'Engine $1' },
    { pattern: /\bengage\s*(\d+)\b/gi, replacement: 'Engine $1' },
    
    // Ambulance units
    { pattern: /\bambulant\s*(\d+)\b/gi, replacement: 'Ambulance $1' },
    { pattern: /\bambulans\s*(\d+)\b/gi, replacement: 'Ambulance $1' },
    { pattern: /\bambience\s*(\d+)\b/gi, replacement: 'Ambulance $1' },
    
    // Squad units
    { pattern: /\bsquad\s*(\d+)\b/gi, replacement: 'Squad $1' },
    { pattern: /\bsquat\s*(\d+)\b/gi, replacement: 'Squad $1' },
    { pattern: /\bsquawk\s*(\d+)\b/gi, replacement: 'Squad $1' },
    
    // Battalion units
    { pattern: /\bbattalion\s*(\d+)\b/gi, replacement: 'Battalion $1' },
    { pattern: /\bbatillion\s*(\d+)\b/gi, replacement: 'Battalion $1' },
    { pattern: /\bbat\s*(\d+)\b/gi, replacement: 'Battalion $1' },
    
    // Ladder units
    { pattern: /\bladder\s*(\d+)\b/gi, replacement: 'Ladder $1' },
    { pattern: /\blatter\s*(\d+)\b/gi, replacement: 'Ladder $1' },
    
    // Rescue units
    { pattern: /\brescue\s*(\d+)\b/gi, replacement: 'Rescue $1' },
    { pattern: /\bresque\s*(\d+)\b/gi, replacement: 'Rescue $1' },
    
    // Truck units
    { pattern: /\btruck\s*(\d+)\b/gi, replacement: 'Truck $1' },
    { pattern: /\btrack\s*(\d+)\b/gi, replacement: 'Truck $1' }
  ];

  // Hospital name corrections
  private readonly hospitalCorrections: EMSTermCorrection[] = [
    // Eskenazi
    { pattern: /\beskenazy\b/gi, replacement: 'Eskenazi' },
    { pattern: /\baskenazi\b/gi, replacement: 'Eskenazi' },
    { pattern: /\besconazi\b/gi, replacement: 'Eskenazi' },
    { pattern: /\beskinazi\b/gi, replacement: 'Eskenazi' },
    { pattern: /\bwishard\b/gi, replacement: 'Eskenazi' }, // Old name
    
    // Methodist
    { pattern: /\bmethodest\b/gi, replacement: 'Methodist' },
    { pattern: /\bmethodis\b/gi, replacement: 'Methodist' },
    { pattern: /\bmeth\b(?!\s*(lab|clinic))/gi, replacement: 'Methodist' },
    { pattern: /\bIU\s*health\s*methodist\b/gi, replacement: 'IU Health Methodist' },
    
    // Riley
    { pattern: /\briley's\b/gi, replacement: 'Riley' },
    { pattern: /\brily\b/gi, replacement: 'Riley' },
    { pattern: /\breiley\b/gi, replacement: 'Riley' },
    { pattern: /\briley\s*children/gi, replacement: "Riley Children's" },
    
    // St. Vincent
    { pattern: /\bsaint\s*vincent\b/gi, replacement: 'St. Vincent' },
    { pattern: /\bst\s*vincents\b/gi, replacement: 'St. Vincent' },
    { pattern: /\bascension\s*st\s*vincent\b/gi, replacement: 'Ascension St. Vincent' },
    
    // Community
    { pattern: /\bcommunity\s*east\b/gi, replacement: 'Community East' },
    { pattern: /\bcommunity\s*north\b/gi, replacement: 'Community North' },
    { pattern: /\bcommunity\s*south\b/gi, replacement: 'Community South' },
    { pattern: /\bcommunity\s*heart\b/gi, replacement: 'Community Heart' },
    
    // Franciscan
    { pattern: /\bfranciscan\s*health\b/gi, replacement: 'Franciscan Health' },
    { pattern: /\bfranciskan\b/gi, replacement: 'Franciscan' }
  ];

  // Medical terminology corrections
  private readonly medicalCorrections: EMSTermCorrection[] = [
    // Conditions
    { pattern: /\bdifficulty\s*breathing\b/gi, replacement: 'difficulty breathing' },
    { pattern: /\bshortness\s*of\s*breath\b/gi, replacement: 'shortness of breath' },
    { pattern: /\bSOB\b/g, replacement: 'shortness of breath' },
    { pattern: /\bchest\s*pains?\b/gi, replacement: 'chest pain' },
    { pattern: /\bMI\b/g, replacement: 'myocardial infarction' },
    { pattern: /\bCVA\b/g, replacement: 'cerebrovascular accident' },
    { pattern: /\bMVA\b/g, replacement: 'motor vehicle accident' },
    { pattern: /\bMVC\b/g, replacement: 'motor vehicle collision' },
    { pattern: /\bPD\b(?!\s*\d)/g, replacement: 'police department' },
    { pattern: /\bFD\b(?!\s*\d)/g, replacement: 'fire department' },
    { pattern: /\bEMS\b/g, replacement: 'EMS' },
    { pattern: /\bCPR\b/g, replacement: 'CPR' },
    { pattern: /\bAED\b/g, replacement: 'AED' },
    { pattern: /\bDOA\b/g, replacement: 'dead on arrival' },
    { pattern: /\bGCS\b/g, replacement: 'Glasgow Coma Scale' },
    { pattern: /\bLOC\b/g, replacement: 'loss of consciousness' },
    { pattern: /\bBP\b(?!\s*\d)/g, replacement: 'blood pressure' },
    { pattern: /\bHR\b(?!\s*\d)/g, replacement: 'heart rate' },
    { pattern: /\bRR\b(?!\s*\d)/g, replacement: 'respiratory rate' },
    { pattern: /\bO2\s*sat/gi, replacement: 'oxygen saturation' },
    { pattern: /\bETA\b/g, replacement: 'estimated time of arrival' },
    { pattern: /\bPT\b(?!\s*\d)/g, replacement: 'patient' },
    { pattern: /\btrauma\s*alert\b/gi, replacement: 'trauma alert' },
    { pattern: /\bstroke\s*alert\b/gi, replacement: 'stroke alert' },
    { pattern: /\bSTEMI\s*alert\b/gi, replacement: 'STEMI alert' }
  ];

  // Street suffix corrections
  private readonly streetCorrections: EMSTermCorrection[] = [
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+st\b/gi, replacement: '$1 Street' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+ave\b/gi, replacement: '$1 Avenue' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+rd\b/gi, replacement: '$1 Road' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+blvd\b/gi, replacement: '$1 Boulevard' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+dr\b/gi, replacement: '$1 Drive' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+ct\b/gi, replacement: '$1 Court' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+pl\b/gi, replacement: '$1 Place' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+ln\b/gi, replacement: '$1 Lane' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+pkwy\b/gi, replacement: '$1 Parkway' },
    { pattern: /\b(\d+\s+[NSEW]?\s*\w+)\s+cir\b/gi, replacement: '$1 Circle' }
  ];

  // Code corrections
  private readonly codeCorrections: EMSTermCorrection[] = [
    // Priority levels
    { pattern: /\bcode\s*3\b/gi, replacement: 'Code 3' },
    { pattern: /\bcode\s*2\b/gi, replacement: 'Code 2' },
    { pattern: /\bcode\s*1\b/gi, replacement: 'Code 1' },
    { pattern: /\balpha\s*response\b/gi, replacement: 'Alpha response' },
    { pattern: /\bbravo\s*response\b/gi, replacement: 'Bravo response' },
    { pattern: /\bcharlie\s*response\b/gi, replacement: 'Charlie response' },
    { pattern: /\bdelta\s*response\b/gi, replacement: 'Delta response' },
    { pattern: /\becho\s*response\b/gi, replacement: 'Echo response' },
    
    // Status codes
    { pattern: /\b10-4\b/g, replacement: '10-4' },
    { pattern: /\b10-8\b/g, replacement: '10-8' },
    { pattern: /\b10-23\b/g, replacement: '10-23' },
    { pattern: /\b10-97\b/g, replacement: '10-97' }
  ];

  // Phonetic corrections for commonly misheard terms
  private readonly phoneticCorrections: PhoneticCorrection[] = [
    // Units
    { sounds: ['medic one', 'medical one', 'medicine one'], correct: 'Medic 1', type: 'unit' },
    { sounds: ['medic to', 'medic too', 'medical two'], correct: 'Medic 2', type: 'unit' },
    { sounds: ['engine won', 'injun one'], correct: 'Engine 1', type: 'unit' },
    
    // Common locations
    { sounds: ['mass ave', 'mass avenue'], correct: 'Massachusetts Avenue', type: 'location' },
    { sounds: ['wash street', 'washington st'], correct: 'Washington Street', type: 'location' },
    { sounds: ['meridian st', 'meridian street'], correct: 'Meridian Street', type: 'location' },
    { sounds: ['sixty five', 'i sixty five'], correct: 'I-65', type: 'location' },
    { sounds: ['four sixty five', 'i four sixty five'], correct: 'I-465', type: 'location' },
    
    // Medical terms
    { sounds: ['difficulty breathing', 'diff breathing'], correct: 'difficulty breathing', type: 'medical' },
    { sounds: ['chest pains', 'chest pain'], correct: 'chest pain', type: 'medical' },
    { sounds: ['unconscious', 'unresponsive'], correct: 'unconscious/unresponsive', type: 'medical' }
  ];

  /**
   * Apply all corrections to a transcript
   */
  correctTranscript(transcript: string): string {
    let corrected = transcript;
    
    // Apply corrections in order of importance
    corrected = this.applyCorrections(corrected, this.unitCorrections);
    corrected = this.applyCorrections(corrected, this.hospitalCorrections);
    corrected = this.applyCorrections(corrected, this.medicalCorrections);
    corrected = this.applyCorrections(corrected, this.streetCorrections);
    corrected = this.applyCorrections(corrected, this.codeCorrections);
    corrected = this.applyPhoneticCorrections(corrected);
    
    // Clean up spacing and capitalization
    corrected = this.cleanupTranscript(corrected);
    
    return corrected;
  }

  /**
   * Apply a set of corrections to text
   */
  private applyCorrections(text: string, corrections: EMSTermCorrection[]): string {
    let result = text;
    for (const correction of corrections) {
      result = result.replace(correction.pattern, correction.replacement);
    }
    return result;
  }

  /**
   * Apply phonetic corrections for commonly misheard terms
   */
  private applyPhoneticCorrections(text: string): string {
    let result = text.toLowerCase();
    
    for (const correction of this.phoneticCorrections) {
      for (const sound of correction.sounds) {
        const regex = new RegExp(`\\b${sound}\\b`, 'gi');
        result = result.replace(regex, correction.correct);
      }
    }
    
    return result;
  }

  /**
   * Clean up transcript formatting
   */
  private cleanupTranscript(text: string): string {
    let result = text;
    
    // Fix multiple spaces
    result = result.replace(/\s+/g, ' ');
    
    // Capitalize sentences
    result = result.replace(/^\w|\.\s+\w/g, letter => letter.toUpperCase());
    
    // Ensure proper spacing around punctuation
    result = result.replace(/\s+([.,!?])/g, '$1');
    result = result.replace(/([.,!?])(?=[A-Za-z])/g, '$1 ');
    
    // Fix unit number spacing
    result = result.replace(/(Medic|Engine|Ambulance|Squad|Battalion|Ladder|Rescue|Truck)\s+(\d+)/gi, '$1 $2');
    
    // Ensure addresses are properly formatted
    result = result.replace(/(\d+)\s+([NSEW])\s+(\w+)/g, '$1 $2 $3');
    
    return result.trim();
  }

  /**
   * Get confidence boost based on corrections applied
   */
  getConfidenceBoost(original: string, corrected: string): number {
    if (original === corrected) return 0;
    
    let boost = 0;
    
    // Check for unit corrections
    if (/(Medic|Engine|Ambulance|Squad|Battalion|Ladder|Rescue|Truck)\s+\d+/i.test(corrected) &&
        !/(Medic|Engine|Ambulance|Squad|Battalion|Ladder|Rescue|Truck)\s+\d+/i.test(original)) {
      boost += 0.05;
    }
    
    // Check for hospital corrections
    if (/(Eskenazi|Methodist|Riley|St\.\s*Vincent|Community|Franciscan)/i.test(corrected) &&
        !/(Eskenazi|Methodist|Riley|St\.\s*Vincent|Community|Franciscan)/i.test(original)) {
      boost += 0.03;
    }
    
    // Check for address corrections
    if (/\d+\s+[NSEW]?\s*\w+\s+(Street|Avenue|Road|Boulevard|Drive)/i.test(corrected) &&
        !/\d+\s+[NSEW]?\s*\w+\s+(Street|Avenue|Road|Boulevard|Drive)/i.test(original)) {
      boost += 0.04;
    }
    
    return Math.min(0.1, boost); // Cap at 10% boost
  }

  /**
   * Extract key entities from corrected transcript
   */
  extractEntities(transcript: string): {
    units: string[];
    hospitals: string[];
    addresses: string[];
    codes: string[];
    medical: string[];
  } {
    const entities = {
      units: [] as string[],
      hospitals: [] as string[],
      addresses: [] as string[],
      codes: [] as string[],
      medical: [] as string[]
    };

    // Extract units
    const unitPattern = /(Medic|Engine|Ambulance|Squad|Battalion|Ladder|Rescue|Truck)\s+\d+/gi;
    const units = transcript.match(unitPattern);
    if (units) {
      entities.units = [...new Set(units.map(u => u.replace(/\s+/g, ' ')))];
    }

    // Extract hospitals
    const hospitalPattern = /(Eskenazi|Methodist|Riley|St\.\s*Vincent|Community\s*(East|North|South|Heart)?|Franciscan|Ascension)/gi;
    const hospitals = transcript.match(hospitalPattern);
    if (hospitals) {
      entities.hospitals = [...new Set(hospitals.map(h => h.replace(/\s+/g, ' ')))];
    }

    // Extract addresses
    const addressPattern = /\d+\s+[NSEW]?\s*\w+\s+(Street|Avenue|Road|Boulevard|Drive|Court|Place|Lane|Parkway|Circle)/gi;
    const addresses = transcript.match(addressPattern);
    if (addresses) {
      entities.addresses = [...new Set(addresses.map(a => a.replace(/\s+/g, ' ')))];
    }

    // Extract codes
    const codePattern = /(Code\s+[123]|Alpha|Bravo|Charlie|Delta|Echo)\s*response|10-\d+/gi;
    const codes = transcript.match(codePattern);
    if (codes) {
      entities.codes = [...new Set(codes.map(c => c.replace(/\s+/g, ' ')))];
    }

    // Extract medical terms
    const medicalPattern = /(difficulty breathing|shortness of breath|chest pain|trauma alert|stroke alert|STEMI alert|unconscious|unresponsive|cardiac arrest)/gi;
    const medical = transcript.match(medicalPattern);
    if (medical) {
      entities.medical = [...new Set(medical.map(m => m.toLowerCase()))];
    }

    return entities;
  }

  /**
   * Generate Whisper prompt with EMS context
   */
  generateWhisperPrompt(): string {
    return `Indianapolis-Marion County EMS dispatch communication. 
Common units: ${this.getCommonUnits()}.
Hospitals: ${this.getHospitalList()}.
Listen for: addresses with street names, unit numbers, medical terminology, dispatch codes.
Common street suffixes: Street, Avenue, Road, Boulevard, Drive, Court, Place, Lane, Parkway, Circle.
Priority levels: Alpha, Bravo, Charlie, Delta, Echo responses.
Transcribe verbatim including all pauses and radio artifacts.`;
  }

  private getCommonUnits(): string {
    return 'Medic 1-100, Engine 1-100, Ambulance 1-100, Squad 1-100, Battalion 1-10, Ladder 1-50, Rescue 1-20, Truck 1-50';
  }

  private getHospitalList(): string {
    return 'Eskenazi, IU Health Methodist, Riley Children\'s, St. Vincent, Community East/North/South, Franciscan Health';
  }

  /**
   * Check if transcript contains valid EMS content
   */
  isValidEMSTranscript(transcript: string): boolean {
    if (!transcript || transcript.length < 10) return false;
    
    // Check for at least one EMS indicator
    const hasUnit = /(Medic|Engine|Ambulance|Squad|Battalion|Ladder|Rescue|Truck)\s+\d+/i.test(transcript);
    const hasHospital = /(Eskenazi|Methodist|Riley|Vincent|Community|Franciscan)/i.test(transcript);
    const hasAddress = /\d+\s+\w+\s+(Street|Avenue|Road|Boulevard|Drive)/i.test(transcript);
    const hasCode = /(Code\s+[123]|Alpha|Bravo|Charlie|Delta|Echo|10-\d+)/i.test(transcript);
    const hasMedical = /(breathing|chest|pain|trauma|stroke|cardiac|unconscious|patient|transport)/i.test(transcript);
    
    return hasUnit || hasHospital || hasAddress || hasCode || hasMedical;
  }
}

export const emsDictionary = new EMSDictionary();
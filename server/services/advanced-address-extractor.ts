import { db } from '../db.js';
import { transcriptionDictionary } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

export interface AddressExtractionResult {
  address?: string;
  confidence: number;
  method: string;
  alternativeAddresses?: string[];
  error?: string;
}

export class AdvancedAddressExtractor {
  private indianapolisStreets: Set<string> = new Set();
  private commonDirections = ['north', 'south', 'east', 'west', 'n', 's', 'e', 'w'];
  private streetTypes = [
    'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
    'place', 'pl', 'court', 'ct', 'circle', 'cir', 'boulevard', 'blvd', 'parkway', 'pkwy',
    'way', 'trail', 'terrace', 'ter', 'alley', 'loop', 'row', 'plaza', 'square'
  ];

  constructor() {
    this.loadIndianapolisStreets();
  }

  private loadIndianapolisStreets() {
    // Major Indianapolis streets for validation
    this.indianapolisStreets = new Set([
      'meridian', 'illinois', 'pennsylvania', 'delaware', 'alabama', 'new jersey',
      'capitol', 'senate', 'michigan', 'massachusetts', 'north', 'south', 'east', 'west',
      'washington', 'market', 'georgia', 'louisiana', 'kentucky', 'tennessee',
      'maryland', 'new york', 'college', 'central', 'rural', 'keystone', 'shadeland',
      'post', 'arlington', 'franklin', 'shelby', 'emerson', 'madison', 'sherman',
      'brookville', 'english', 'stop', 'thompson', 'troy', 'holt', 'german church',
      'southeastern', 'southwestern', 'northwestern', 'northeastern', 'pendleton pike',
      'fall creek', 'monon', 'kessler', 'broad ripple', 'carmel', 'westfield',
      'fishers', 'noblesville', 'greenwood', 'beech grove', 'speedway', 'lawrence',
      'castleton', 'fountain square', 'irvington', 'mars hill', 'haughville',
      'riverside', 'woodruff place', 'herron morton', 'old northside', 'lockerbie',
      'chatham arch', 'fountain square', 'fletcher place', 'holy cross', 'near eastside'
    ]);
  }

  async extractAddress(transcript: string): Promise<AddressExtractionResult> {
    // Clean and normalize the transcript
    const cleanedTranscript = this.cleanTranscript(transcript);
    
    // Multiple extraction methods in priority order (highest confidence first)
    const methods = [
      () => this.extractByUnitSequencePattern(cleanedTranscript),  // Highest priority: after units
      () => this.extractByContextualPattern(cleanedTranscript),     // Second: explicit location context
      () => this.extractByStandardPattern(cleanedTranscript),       // Third: standard addresses
      () => this.extractByIntersectionPattern(cleanedTranscript),   // Fourth: intersections
      () => this.extractByGridPattern(cleanedTranscript),           // Fifth: grid coordinates
      () => this.extractByNumericalPattern(cleanedTranscript),      // Sixth: fix broken numbers
      () => this.extractByLandmarkPattern(cleanedTranscript),       // Seventh: landmarks
      () => this.extractByBusinessPattern(cleanedTranscript)        // Eighth: business names
    ];

    const results: AddressExtractionResult[] = [];
    
    for (const method of methods) {
      try {
        const result = method();
        if (result.address && result.confidence > 0.6) {
          results.push(result);
        }
      } catch (error) {
        console.error('Address extraction method failed:', error);
      }
    }

    // If we have multiple results, pick the best one
    if (results.length === 0) {
      return {
        confidence: 0,
        method: 'none',
        error: 'No address pattern found in transcript'
      };
    }

    // Sort by confidence and pick the best
    results.sort((a, b) => b.confidence - a.confidence);
    const bestResult = results[0];
    
    // Add alternative addresses if available and they're good quality
    if (results.length > 1) {
      bestResult.alternativeAddresses = results.slice(1)
        .filter(r => r.confidence > 0.7)
        .map(r => r.address!);
    }

    return bestResult;
  }

  private cleanTranscript(transcript: string): string {
    return transcript
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\b(\d+),(\d+)\b/g, '$1$2')  // Fix comma-separated numbers like "10,301" -> "10301"
      .replace(/[,\-]\s*/g, ', ')  // Normalize punctuation but preserve separation
      .replace(/\b(\d+)\s*-\s*(\d+)\b/g, '$1$2') // Fix broken numbers like "78-47" -> "7847"
      .replace(/\b(\d+)\s*(\d+)\s*(\d+)\b/g, '$1$2$3') // Fix split numbers like "78 47" -> "7847"
      .trim();
  }

  private extractByStandardPattern(transcript: string): AddressExtractionResult {
    // Enhanced pattern for standard addresses with better unit separation
    const patterns = [
      // Pattern 1: Number + Direction + Street Name + Type (comprehensive)
      /\b(\d{1,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
      
      // Pattern 2: Number + Street Name + Type (no direction)
      /\b(\d{1,5})\s+([a-zA-Z][a-zA-Z0-9\s]*?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
      
      // Pattern 3: Number + Direction + Ordinal Street (e.g., "1234 East 30th Street")
      /\b(\d{1,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+(\d{1,3}(?:st|nd|rd|th))\s+(street|st|avenue|ave)\b/gi,
      
      // Pattern 4: Number + Ordinal Street (no direction)
      /\b(\d{1,5})\s+(\d{1,3}(?:st|nd|rd|th))\s+(street|st|avenue|ave)\b/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(transcript.matchAll(pattern));
      for (const match of matches) {
        const fullMatch = match[0].trim();
        const matchIndex = match.index || 0;
        
        // Check if this is immediately preceded by a unit designation (would indicate unit number, not address)
        const before = transcript.substring(Math.max(0, matchIndex - 15), matchIndex);
        
        // Skip ONLY if this number is the unit number itself (immediate proximity)
        if (/(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*$/i.test(before.trim())) {
          continue;
        }
        
        if (this.isValidAddress(fullMatch)) {
          return {
            address: this.normalizeAddress(fullMatch),
            confidence: 0.9,
            method: 'standard_pattern'
          };
        }
      }
    }

    return { confidence: 0, method: 'standard_pattern' };
  }

  private extractByIntersectionPattern(transcript: string): AddressExtractionResult {
    // Enhanced intersection patterns
    const patterns = [
      // Pattern 1: Street1 and Street2
      /\b([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\s+(?:and|&|\bat\b|near|at)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
      
      // Pattern 2: Direction + Street1 and Direction + Street2
      /\b(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\s+(?:and|&|\bat\b|near|at)\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\b/gi,
      
      // Pattern 3: Ordinal streets (e.g., "30th and College")
      /\b(\d{1,3}(?:st|nd|rd|th))\s+(?:and|&|\bat\b|near|at)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s*(?:street|st|avenue|ave|road|rd|drive|dr)?\b/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(transcript.matchAll(pattern));
      for (const match of matches) {
        if (this.isValidIntersection(match[0])) {
          return {
            address: this.normalizeAddress(match[0]),
            confidence: 0.85,
            method: 'intersection_pattern'
          };
        }
      }
    }

    return { confidence: 0, method: 'intersection_pattern' };
  }

  private extractByGridPattern(transcript: string): AddressExtractionResult {
    // Indianapolis grid system patterns
    const patterns = [
      // Pattern 1: 3900 North, 5500 West
      /\b(\d{3,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s*[,&]\s*(\d{3,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\b/gi,
      
      // Pattern 2: Location grid references
      /\blocation\s+(\d{3,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s*[,&]\s*(\d{3,5})\s+(north|south|east|west|n\.?|s\.?|e\.?|w\.?)\b/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(transcript.matchAll(pattern));
      for (const match of matches) {
        return {
          address: this.normalizeAddress(match[0]),
          confidence: 0.8,
          method: 'grid_pattern'
        };
      }
    }

    return { confidence: 0, method: 'grid_pattern' };
  }

  private extractByLandmarkPattern(transcript: string): AddressExtractionResult {
    // Business and landmark patterns
    const patterns = [
      // Pattern 1: Business names
      /\b(?:at|to|location)\s+([A-Z][a-zA-Z\s]{3,}(?:hospital|center|centre|mall|plaza|park|cafe|restaurant|store|school|church|station|hotel|motel|inn|market|pharmacy|bank|library|theater|theatre|museum|clinic|office|building|tower|complex|apartments|condos|village|heights|ridge|grove|gardens|square|place|court|manor|estates|woods|creek|crossing|landing|pointe|point|shores|hills|valley|meadows|fields|springs|lakes|ponds|rivers|streams|bridge|tunnel|overpass|underpass|ramp|exit|interchange|rest area|gas station|truck stop|shopping center|strip mall|outlet|factory|warehouse|distribution center|depot|terminal|airport|station|port|harbor|marina|dock|pier|wharf|ferry|bridge|tunnel|overpass|underpass|ramp|exit|interchange|rest area|gas station|truck stop))\b/gi,
      
      // Pattern 2: Well-known Indianapolis locations
      /\b(circle centre|monument circle|soldiers and sailors|indianapolis motor speedway|lucas oil stadium|bankers life fieldhouse|indianapolis zoo|white river state park|canal walk|mass ave|broad ripple|fountain square|irvington|lockerbie square|old northside|chatham arch|fletcher place|holy cross|near eastside|mars hill|riverside|woodruff place|herron morton|haughville|riverside|speedway|beech grove|lawrence|castleton|noblesville|carmel|westfield|fishers|greenwood|franklin|whitestown|zionsville|plainfield|avon|brownsburg|danville|mooresville|martinsville|shelbyville|greenfield|fortville|mccordsville|ingalls|new palestine|cumberland|warren park|ben davis|clermont|eagle creek|geist|meridian hills|north crows nest|rocky ripple|spring hill|williams creek|wynnedale)\b/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(transcript.matchAll(pattern));
      for (const match of matches) {
        return {
          address: this.normalizeAddress(match[0]),
          confidence: 0.75,
          method: 'landmark_pattern'
        };
      }
    }

    return { confidence: 0, method: 'landmark_pattern' };
  }

  private extractByUnitSequencePattern(transcript: string): AddressExtractionResult {
    // Extract address that comes after emergency units
    const unitPattern = /(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+(?:[,\s]+)/gi;
    const matches = Array.from(transcript.matchAll(unitPattern));
    
    if (matches.length === 0) return { confidence: 0, method: 'unit_sequence' };
    
    // Get the position after the last unit
    const lastMatch = matches[matches.length - 1];
    let afterUnits = transcript.substring(lastMatch.index! + lastMatch[0].length);
    
    // Clean up the text after units - remove leading punctuation and normalize
    afterUnits = afterUnits.replace(/^[,\-\s]+/, '').replace(/(\d+),\s*([a-zA-Z])/g, '$1 $2').replace(/[,\-]\s*/g, ', ').trim();
    
    // Try to extract address from the text after units
    const addressPatterns = [
      /^(\d{1,5})\s+((?:north|south|east|west|n\.?|s\.?|e\.?|w\.?)\s+)?([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)/i,
      /^([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)\s+(?:and|&|\bat\b)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr)/i
    ];

    for (const pattern of addressPatterns) {
      const match = afterUnits.match(pattern);
      if (match && this.isValidAddress(match[0])) {
        return {
          address: this.normalizeAddress(match[0]),
          confidence: 0.95,
          method: 'unit_sequence'
        };
      }
    }

    return { confidence: 0, method: 'unit_sequence' };
  }

  private extractByContextualPattern(transcript: string): AddressExtractionResult {
    // Look for addresses in context of location indicators
    const contextPatterns = [
      /\b(?:location|address|at|to|respond to|dispatched to|en route to|arriving at)\s+(\d{1,5}(?:\s+(?:north|south|east|west|n\.?|s\.?|e\.?|w\.?))?\s+[a-zA-Z][a-zA-Z0-9\s]{1,25}?\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter))/gi,
      /\b(?:location|address|at|to|respond to|dispatched to|en route to|arriving at)\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?\s+(?:street|st|avenue|ave|road|rd|drive|dr)\s+(?:and|&|\bat\b)\s+[a-zA-Z][a-zA-Z0-9\s]{1,25}?\s+(?:street|st|avenue|ave|road|rd|drive|dr))/gi
    ];

    for (const pattern of contextPatterns) {
      const matches = Array.from(transcript.matchAll(pattern));
      for (const match of matches) {
        if (this.isValidAddress(match[1])) {
          return {
            address: this.normalizeAddress(match[1]),
            confidence: 0.88,
            method: 'contextual_pattern'
          };
        }
      }
    }

    return { confidence: 0, method: 'contextual_pattern' };
  }

  private extractByNumericalPattern(transcript: string): AddressExtractionResult {
    // Handle broken numbers in addresses with various patterns
    const patterns = [
      // Pattern 1: Numbers with dashes before street (e.g., "38-66 arquette" -> "3866 arquette")
      {
        pattern: /\b(\d{1,2})[\s\-]+(\d{2})[\s,]+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
        reconstruct: (m: RegExpMatchArray) => `${m[1]}${m[2]} ${m[3]} ${m[4]}`
      },
      // Pattern 2: Three number segments with dashes (e.g., "42-38-66 arquette" -> "3866 arquette", skipping first segment as unit)
      {
        pattern: /\b\d{1,2}[\s\-]+(\d{2})[\s\-]+(\d{2})[\s,]+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
        reconstruct: (m: RegExpMatchArray) => `${m[1]}${m[2]} ${m[3]} ${m[4]}`
      },
      // Pattern 3: Numbers with spaces (e.g., "78 47 Roy Road" -> "7847 Roy Road")
      {
        pattern: /\b(\d{1,2})\s+(\d{1,2})\s+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
        reconstruct: (m: RegExpMatchArray) => `${m[1]}${m[2]} ${m[3]} ${m[4]}`
      },
      // Pattern 4: Single digit followed by three digits (e.g., "3 866 arquette" -> "3866 arquette")
      {
        pattern: /\b(\d)[\s\-]+(\d{3})[\s,]+([a-zA-Z][a-zA-Z0-9\s]{1,25}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl|court|ct|circle|cir|boulevard|blvd|parkway|pkwy|way|trail|terrace|ter)\b/gi,
        reconstruct: (m: RegExpMatchArray) => `${m[1]}${m[2]} ${m[3]} ${m[4]}`
      }
    ];
    
    for (const { pattern, reconstruct } of patterns) {
      const matches = Array.from(transcript.matchAll(pattern));
      for (const match of matches) {
        const reconstructedAddress = reconstruct(match);
        if (this.isValidAddress(reconstructedAddress)) {
          return {
            address: this.normalizeAddress(reconstructedAddress),
            confidence: 0.82,
            method: 'numerical_pattern'
          };
        }
      }
    }

    return { confidence: 0, method: 'numerical_pattern' };
  }

  private extractByBusinessPattern(transcript: string): AddressExtractionResult {
    // Extract well-known business names and landmarks in Indianapolis
    const businessPatterns = [
      // Hospitals and medical centers
      /\b(methodist hospital|iu methodist|riley hospital|riley children|eskenazi|st\.?\s*vincent|franciscan|community hospital|indiana university hospital|wishard memorial)\b/gi,
      
      // Major shopping centers and malls
      /\b(circle centre mall|fashion mall|castleton square|greenwood park mall|lafayette square mall|washington square)\b/gi,
      
      // Major hotels and venues
      /\b(lucas oil stadium|bankers life fieldhouse|victory field|indianapolis motor speedway|fairgrounds|state fairgrounds|indiana state fair|convention center|indiana convention center|jw marriott|hyatt regency|omni severin|embassy suites|downtown marriott)\b/gi,
      
      // Universities and schools
      /\b(butler university|iupui|university of indianapolis|marian university|ivy tech|ben davis high school|north central high school|carmel high school|pike high school|warren central high school)\b/gi,
      
      // Major landmarks
      /\b(monument circle|soldiers and sailors monument|canal walk|white river state park|indianapolis zoo|children's museum|newfields|indianapolis museum of art|crown hill cemetery|broad ripple village|fountain square|mass ave|massachusetts avenue)\b/gi
    ];

    for (const pattern of businessPatterns) {
      const matches = Array.from(transcript.matchAll(pattern));
      for (const match of matches) {
        return {
          address: this.normalizeAddress(match[1]),
          confidence: 0.75,
          method: 'business_pattern'
        };
      }
    }

    return { confidence: 0, method: 'business_pattern' };
  }

  private isValidAddress(address: string): boolean {
    // Validate that this looks like a real address
    const trimmed = address.trim();
    
    // Must have at least 3 characters
    if (trimmed.length < 3) return false;
    
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(trimmed)) return false;
    
    // Must contain a street type or be an intersection
    const hasStreetType = this.streetTypes.some(type => 
      new RegExp(`\\b${type}\\b`, 'i').test(trimmed)
    );
    const hasIntersection = /\b(?:and|&|\bat\b)\b/.test(trimmed);
    
    if (!hasStreetType && !hasIntersection) return false;
    
    // Should not contain obvious unit numbers (like "Engine 26")
    if (/\b(?:engine|medic|ambulance|squad|rescue|ladder|ems)\s*\d+\b/i.test(trimmed)) {
      return false;
    }
    
    // Should not contain call types (but be lenient - only reject if they appear in the extracted address itself)
    const callTypes = ['sick person', 'difficulty breathing', 'chest pain', 'cardiac arrest', 'trauma', 'mvc'];
    const addressWords = trimmed.toLowerCase().split(/\s+/);
    
    // Only reject if call type words appear as part of the address itself (not just nearby)
    for (const callType of callTypes) {
      const callTypeWords = callType.split(/\s+/);
      if (callTypeWords.every(word => addressWords.includes(word))) {
        return false;
      }
    }
    
    return true;
  }

  private isValidIntersection(intersection: string): boolean {
    return /\b(?:and|&|\bat\b)\b/.test(intersection) && this.isValidAddress(intersection);
  }

  private normalizeAddress(address: string): string {
    let normalized = address
      .replace(/\s+/g, ' ')
      .replace(/[,\-]\s*/g, ', ')
      .trim();

    // Expand common abbreviations
    const abbreviations: [RegExp, string][] = [
      [/\bst\.?\b/gi, 'Street'],
      [/\bave\.?\b/gi, 'Avenue'],
      [/\brd\.?\b/gi, 'Road'],
      [/\bdr\.?\b/gi, 'Drive'],
      [/\bln\.?\b/gi, 'Lane'],
      [/\bpl\.?\b/gi, 'Place'],
      [/\bct\.?\b/gi, 'Court'],
      [/\bcir\.?\b/gi, 'Circle'],
      [/\bblvd\.?\b/gi, 'Boulevard'],
      [/\bpkwy\.?\b/gi, 'Parkway'],
      [/\bter\.?\b/gi, 'Terrace'],
      [/\bhwy\.?\b/gi, 'Highway'],
      [/\bn\.?\b(?=\s)/gi, 'North'],
      [/\bs\.?\b(?=\s)/gi, 'South'],
      [/\be\.?\b(?=\s)/gi, 'East'],
      [/\bw\.?\b(?=\s)/gi, 'West'],
      [/\b&\b/g, 'and']
    ];

    for (const [pattern, replacement] of abbreviations) {
      normalized = normalized.replace(pattern, replacement);
    }

    // Clean up extra spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Title case the address
    normalized = normalized.replace(/\b\w+/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    return normalized;
  }
}

export const advancedAddressExtractor = new AdvancedAddressExtractor();
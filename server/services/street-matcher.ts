import { distance } from 'fastest-levenshtein';

interface StreetMatch {
  originalStreet: string;
  matchedStreet: string;
  confidence: number;
  distance: number;
}

export class StreetMatcher {
  private indianapolisStreets: string[] = [];
  private streetIndex: Map<string, string[]> = new Map();

  constructor() {
    // Will be populated with your street list
    this.buildStreetIndex();
  }

  loadStreetsFromList(streets: string[]) {
    this.indianapolisStreets = streets.map(s => s.toLowerCase().trim());
    this.buildStreetIndex();
    console.log(`Loaded ${this.indianapolisStreets.length} Indianapolis streets for fuzzy matching`);
  }

  private buildStreetIndex() {
    // Create index for faster lookups by first few characters
    this.streetIndex.clear();
    
    for (const street of this.indianapolisStreets) {
      const prefix = street.substring(0, 3);
      if (!this.streetIndex.has(prefix)) {
        this.streetIndex.set(prefix, []);
      }
      this.streetIndex.get(prefix)!.push(street);
    }
  }

  findBestStreetMatch(inputStreet: string): StreetMatch | null {
    if (!inputStreet || this.indianapolisStreets.length === 0) {
      return null;
    }

    const normalizedInput = inputStreet.toLowerCase().trim();
    
    // First try exact match
    if (this.indianapolisStreets.includes(normalizedInput)) {
      return {
        originalStreet: inputStreet,
        matchedStreet: inputStreet,
        confidence: 1.0,
        distance: 0
      };
    }

    // Extract just the street name (remove common suffixes for better matching)
    const cleanInput = this.extractStreetName(normalizedInput);
    
    let bestMatch: StreetMatch | null = null;
    let bestScore = Infinity;

    // Use index to reduce search space
    const candidates = this.getCandidateStreets(cleanInput);
    
    for (const street of candidates) {
      const cleanStreet = this.extractStreetName(street);
      const editDistance = distance(cleanInput, cleanStreet);
      
      // Calculate similarity score (lower is better)
      const maxLength = Math.max(cleanInput.length, cleanStreet.length);
      const similarity = 1 - (editDistance / maxLength);
      
      // Only consider matches with reasonable similarity
      if (similarity >= 0.6 && editDistance < bestScore) {
        bestScore = editDistance;
        bestMatch = {
          originalStreet: inputStreet,
          matchedStreet: this.toTitleCase(street),
          confidence: similarity,
          distance: editDistance
        };
      }
    }

    // Also try phonetic matching for common transcription errors
    if (!bestMatch || bestMatch.confidence < 0.8) {
      const phoneticMatch = this.findPhoneticMatch(cleanInput);
      if (phoneticMatch && (!bestMatch || phoneticMatch.confidence > bestMatch.confidence)) {
        bestMatch = phoneticMatch;
      }
    }

    return bestMatch;
  }

  private getCandidateStreets(input: string): string[] {
    const candidates = new Set<string>();
    
    // Get streets with similar prefixes
    for (let i = 2; i <= Math.min(4, input.length); i++) {
      const prefix = input.substring(0, i);
      const matches = this.streetIndex.get(prefix) || [];
      matches.forEach(street => candidates.add(street));
    }

    // If not enough candidates, expand search
    if (candidates.size < 50) {
      // Add streets that contain any word from the input
      const words = input.split(/\s+/);
      for (const word of words) {
        if (word.length >= 3) {
          for (const street of this.indianapolisStreets) {
            if (street.includes(word)) {
              candidates.add(street);
            }
          }
        }
      }
    }

    return Array.from(candidates);
  }

  private extractStreetName(street: string): string {
    // Remove common street suffixes for better matching
    const suffixes = [
      'street', 'st', 'avenue', 'ave', 'road', 'rd', 'boulevard', 'blvd',
      'drive', 'dr', 'lane', 'ln', 'way', 'circle', 'cir', 'court', 'ct',
      'place', 'pl', 'parkway', 'pkwy', 'trail', 'tr'
    ];
    
    let cleaned = street.toLowerCase().trim();
    
    for (const suffix of suffixes) {
      const pattern = new RegExp(`\\s+${suffix}$`, 'i');
      cleaned = cleaned.replace(pattern, '');
    }
    
    return cleaned.trim();
  }

  private findPhoneticMatch(input: string): StreetMatch | null {
    // Common transcription error patterns in emergency dispatch
    const phoneticMappings = [
      { from: /vickler/i, to: 'vickery' },
      { from: /wickler/i, to: 'wicklow' },
      { from: /meridian/i, to: 'meridian' },
      { from: /keystone/i, to: 'keystone' },
      { from: /washington/i, to: 'washington' },
      { from: /shadeland/i, to: 'shadeland' },
      { from: /brookville/i, to: 'brookville' },
      // Add more based on common Indianapolis street transcription errors
    ];

    for (const mapping of phoneticMappings) {
      if (mapping.from.test(input)) {
        const phoneticInput = input.replace(mapping.from, mapping.to);
        
        // Find best match for phonetic variant
        for (const street of this.indianapolisStreets) {
          if (street.includes(phoneticInput)) {
            const editDistance = distance(phoneticInput, this.extractStreetName(street));
            const maxLength = Math.max(phoneticInput.length, street.length);
            const similarity = 1 - (editDistance / maxLength);
            
            if (similarity >= 0.7) {
              return {
                originalStreet: input,
                matchedStreet: this.toTitleCase(street),
                confidence: similarity * 0.9, // Slightly lower confidence for phonetic matches
                distance: editDistance
              };
            }
          }
        }
      }
    }

    return null;
  }

  private toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  enhanceAddress(address: string): string {
    // Extract street name from full address
    const streetMatch = address.match(/\d+\s+(.+?)(?:,|$)/);
    if (!streetMatch) return address;

    const streetPart = streetMatch[1].trim();
    const match = this.findBestStreetMatch(streetPart);
    
    if (match && match.confidence >= 0.7) {
      const houseNumber = address.match(/^\d+/)?.[0] || '';
      return `${houseNumber} ${match.matchedStreet}`.trim();
    }

    return address;
  }

  getStats() {
    return {
      totalStreets: this.indianapolisStreets.length,
      indexedPrefixes: this.streetIndex.size
    };
  }
}

export const streetMatcher = new StreetMatcher();
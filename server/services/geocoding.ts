import { storage } from '../storage';
import { streetMatcher } from './street-matcher';
import { googleAddressValidation } from './address-validation';

interface GeocodingResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  confidence: number;
}

export class GeocodingService {
  private cache: Map<string, GeocodingResult> = new Map();
  private rateLimitDelay = 1000; // 1 second between requests
  private lastRequestTime = 0;

  constructor() {
    console.log('Geocoding service initialized with OpenStreetMap Nominatim');
  }

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    if (!address || address.trim() === '') {
      return null;
    }

    const cacheKey = address.toLowerCase().trim();
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Try Google Address Validation first for better accuracy
    try {
      const googleResult = await googleAddressValidation.validateAddress(address);
      if (googleResult.isValid && googleResult.coordinates && googleResult.formattedAddress) {
        const result: GeocodingResult = {
          latitude: googleResult.coordinates.latitude,
          longitude: googleResult.coordinates.longitude,
          formatted_address: googleResult.formattedAddress,
          confidence: googleResult.confidence === 'PREMISE' || googleResult.confidence === 'STREET' ? 0.9 : 0.7
        };
        
        this.cache.set(cacheKey, result);
        console.log(`Geocoded '${address}' using Google Address Validation: ${result.formatted_address}`);
        return result;
      }
    } catch (error) {
      console.warn('Google Address Validation failed, falling back to Nominatim:', error);
    }

    try {
      // Try multiple geocoding strategies
      let result = await this.tryGeocodingStrategies(address);
      
      if (result) {
        // Cache the result
        this.cache.set(cacheKey, result);
        console.log(`Geocoded "${address}" to [${result.latitude}, ${result.longitude}]`);
        return result;
      }

      console.log(`No geocoding results for: ${address}`);
      return null;

    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  private async tryGeocodingStrategies(address: string): Promise<GeocodingResult | null> {
    const strategies = [
      // Strategy 1: Full address as-is with Indianapolis context
      () => this.formatAddressForIndianapolis(address),
      
      // Strategy 2: Try with street name correction using fuzzy matching
      () => this.tryStreetNameCorrection(address),
      
      // Strategy 3: Extract main road/street and add Indianapolis
      () => this.extractMainRoad(address),
      
      // Strategy 4: Extract major intersection if available
      () => this.extractIntersection(address),
      
      // Strategy 5: General area geocoding
      () => `${this.extractGeneralArea(address)}, Indianapolis, IN, USA`
    ];

    for (const strategy of strategies) {
      const formattedAddress = strategy();
      if (!formattedAddress) continue;

      const result = await this.performGeocodingRequest(formattedAddress);
      if (result) {
        console.log(`Successfully geocoded "${address}" using strategy: "${formattedAddress}"`);
        return result;
      }
    }

    // Fallback: Return downtown Indianapolis location with low confidence
    // This ensures calls appear on the map even if address can't be geocoded
    console.log(`Using Indianapolis fallback location for: ${address}`);
    return {
      latitude: 39.7684,  // Downtown Indianapolis
      longitude: -86.1581,
      formatted_address: `${address} (approximate location - address not found)`,
      confidence: 0.1  // Very low confidence to indicate uncertainty
    };
  }

  private async performGeocodingRequest(formattedAddress: string): Promise<GeocodingResult | null> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await this.sleep(this.rateLimitDelay - timeSinceLastRequest);
    }

    // Use OpenStreetMap Nominatim (free service)
    const encodedAddress = encodeURIComponent(formattedAddress);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EMS-Insight/1.0 (Emergency Service)'
      }
    });

    this.lastRequestTime = Date.now();

    if (!response.ok) {
      console.error('Geocoding request failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      formatted_address: result.display_name,
      confidence: this.calculateConfidence(result)
    };
  }

  private extractMainRoad(address: string): string | null {
    // Extract main roads like "US 31", "I-65", "Meridian St", etc.
    const roadPatterns = [
      /\b(US|I-?|SR|IN)\s*\d+/i,          // US 31, I-65, SR 37, etc.
      /\b\w+\s+(st|street|rd|road|ave|avenue|blvd|boulevard|way|dr|drive|ln|lane)\b/i
    ];

    for (const pattern of roadPatterns) {
      const match = address.match(pattern);
      if (match) {
        const road = match[0];
        return `${road}, Indianapolis, IN, USA`;
      }
    }

    return null;
  }

  private extractIntersection(address: string): string | null {
    // Enhanced intersection patterns for emergency dispatch addresses
    const patterns = [
      // Pattern 1: Explicit "&" or "and" intersections
      /(\w+(?:\s+\w+)*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))\s*(?:&|and|\s+and\s+|\s+&\s+)\s*(\w+(?:\s+\w+)*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/i,
      
      // Pattern 2: Near/at patterns like "near Main Street and 5th Avenue"
      /(?:near|at|by)\s+(\w+(?:\s+\w+)*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))\s+(?:and|&)\s+(\w+(?:\s+\w+)*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/i,
      
      // Pattern 3: Cross street patterns like "Main St cross 5th Ave"
      /(\w+(?:\s+\w+)*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))\s+(?:cross|crosses|crossing)\s+(\w+(?:\s+\w+)*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/i,
      
      // Pattern 4: Highway intersections like "I-70 and Meridian Street"
      /((?:I-|US-|SR-)\d+)\s+(?:and|&)\s+(\w+(?:\s+\w+)*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl))/i,
      
      // Pattern 5: Mile marker intersections like "Mile Marker 89.6 I-70 Eastbound"
      /Mile\s+Marker\s+[\d.]+\s+((?:I-|US-|SR-)\d+)\s+(?:Eastbound|Westbound|Northbound|Southbound)/i,
      
      // Pattern 6: Simple & without street types (for numbered streets)
      /(\w+(?:\s+\w+)*?)\s*&\s*(\w+(?:\s+\w+)*?)/
    ];

    for (const pattern of patterns) {
      const match = address.match(pattern);
      if (match) {
        if (pattern === patterns[4]) {
          // Special handling for mile marker intersections
          const highway = match[1];
          return `${highway}, Indianapolis, IN, USA`;
        } else if (match[1] && match[2]) {
          const street1 = this.normalizeStreetName(match[1].trim());
          const street2 = this.normalizeStreetName(match[2].trim());
          return `${street1} & ${street2}, Indianapolis, IN, USA`;
        }
      }
    }

    // Check for major Indianapolis intersections without explicit markers
    const majorIntersections = this.identifyMajorIntersection(address);
    if (majorIntersections) {
      return majorIntersections;
    }

    return null;
  }

  private normalizeStreetName(street: string): string {
    // Normalize street names for better geocoding
    let normalized = street.trim();
    
    // Expand common abbreviations for better Google Maps recognition
    const abbreviations: { [key: string]: string } = {
      'St': 'Street',
      'Ave': 'Avenue', 
      'Rd': 'Road',
      'Blvd': 'Boulevard',
      'Dr': 'Drive',
      'Ln': 'Lane',
      'Ct': 'Court',
      'Pl': 'Place',
      'Cir': 'Circle'
    };
    
    // Apply abbreviation expansions
    for (const [abbrev, full] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbrev}\\b$`, 'i');
      normalized = normalized.replace(regex, full);
    }
    
    return normalized;
  }

  private identifyMajorIntersection(address: string): string | null {
    // Identify major Indianapolis intersections from partial information
    const majorStreets = [
      'Meridian', 'Pennsylvania', 'Delaware', 'Capitol', 'Illinois', 'Senate',
      'Washington', 'Market', 'Ohio', 'New York', 'Vermont', 'North',
      'Monument Circle', 'Massachusetts Avenue', 'Virginia Avenue',
      'Keystone', 'College', 'Central', 'Sherman', 'Emerson',
      'Post Road', 'Shadeland', 'Franklin Road', 'Madison Avenue'
    ];
    
    const foundStreets = majorStreets.filter(street => 
      address.toLowerCase().includes(street.toLowerCase())
    );
    
    if (foundStreets.length >= 2) {
      return `${foundStreets[0]} & ${foundStreets[1]}, Indianapolis, IN, USA`;
    }
    
    // Check for numbered streets
    const numberPattern = /(\d+(?:st|nd|rd|th)?\s+(?:Street|St))/gi;
    const numberMatches = address.match(numberPattern);
    
    if (numberMatches && numberMatches.length >= 1 && foundStreets.length >= 1) {
      return `${foundStreets[0]} & ${numberMatches[0]}, Indianapolis, IN, USA`;
    }
    
    return null;
  }

  private extractGeneralArea(address: string): string {
    // Extract the most significant part of the address
    const cleaned = address.trim();
    
    // If it contains a major highway, use that
    const highwayMatch = cleaned.match(/\b(US|I-?|SR|IN)\s*\d+/i);
    if (highwayMatch) {
      return highwayMatch[0];
    }

    // Otherwise, try to get the first meaningful part
    const parts = cleaned.split(',')[0].split(' ');
    if (parts.length > 1) {
      return parts.slice(0, 2).join(' '); // Take first two words
    }

    return cleaned;
  }

  private tryStreetNameCorrection(address: string): string | null {
    // Use street matcher to correct potential transcription errors
    const correctedAddress = streetMatcher.enhanceAddress(address);
    
    if (correctedAddress !== address) {
      console.log(`Street name corrected: "${address}" -> "${correctedAddress}"`);
      return this.formatAddressForIndianapolis(correctedAddress);
    }
    
    return null;
  }

  private formatAddressForIndianapolis(address: string): string {
    // Clean up the address and add Indianapolis context
    let cleaned = address.trim();
    
    // Add Indianapolis context if not already present
    if (!cleaned.toLowerCase().includes('indianapolis') && 
        !cleaned.toLowerCase().includes('indy') && 
        !cleaned.toLowerCase().includes('marion')) {
      cleaned += ', Indianapolis, IN, USA';
    }
    
    return cleaned;
  }

  private calculateConfidence(result: any): number {
    // Calculate confidence based on result quality
    let confidence = 0.5; // base confidence
    
    // Higher confidence for exact matches
    if (result.class === 'place' && result.type === 'house') {
      confidence = 0.9;
    } else if (result.class === 'highway' || result.class === 'place') {
      confidence = 0.8;
    } else if (result.class === 'amenity') {
      confidence = 0.7;
    }

    // Adjust based on importance score
    if (result.importance) {
      confidence = Math.max(confidence, result.importance);
    }

    return Math.min(confidence, 1.0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async geocodeAndUpdateCall(callId: number): Promise<boolean> {
    try {
      const call = await storage.getCall(callId);
      if (!call || !call.location) {
        return false;
      }

      // Skip EMS-Hospital Communications - they don't need addresses
      if (call.callType === "EMS-Hospital Communications") {
        console.log(`Skipping geocoding for EMS-Hospital Communication call ${callId}`);
        return false;
      }

      // Skip if already geocoded
      if (call.latitude && call.longitude) {
        return true;
      }

      const geocodingResult = await this.geocodeAddress(call.location);
      if (!geocodingResult) {
        return false;
      }

      // Update the call with coordinates
      await storage.updateCall(callId, {
        latitude: geocodingResult.latitude,
        longitude: geocodingResult.longitude
      });

      console.log(`Updated call ${callId} with coordinates: [${geocodingResult.latitude}, ${geocodingResult.longitude}]`);
      return true;

    } catch (error) {
      console.error('Error geocoding and updating call:', error);
      return false;
    }
  }

  // Batch geocode multiple calls
  async geocodeMultipleCalls(calls: any[]): Promise<void> {
    const callsToGeocode = calls.filter(call => 
      call.location && 
      (!call.latitude || !call.longitude) &&
      call.callType !== "EMS-Hospital Communications"
    );

    console.log(`Geocoding ${callsToGeocode.length} calls...`);

    for (const call of callsToGeocode) {
      try {
        await this.geocodeAndUpdateCall(call.id);
        // Add delay between requests to respect rate limits
        await this.sleep(this.rateLimitDelay);
      } catch (error) {
        console.error(`Failed to geocode call ${call.id}:`, error);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
    console.log('Geocoding cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export const geocodingService = new GeocodingService();
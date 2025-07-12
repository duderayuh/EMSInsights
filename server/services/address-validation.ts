import { config } from 'dotenv';

config();

interface AddressValidationRequest {
  address: {
    addressLines: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode: string;
  };
}

interface AddressValidationResponse {
  result: {
    verdict: {
      inputGranularity: string;
      validationGranularity: string;
      geocodeGranularity: string;
      addressComplete: boolean;
    };
    address: {
      formattedAddress: string;
      postalAddress: {
        addressLines: string[];
        locality: string;
        administrativeArea: string;
        postalCode: string;
        regionCode: string;
      };
    };
    geocode: {
      location: {
        latitude: number;
        longitude: number;
      };
      plusCode: {
        globalCode: string;
      };
    };
  };
}

export class GoogleAddressValidationService {
  private apiKey: string;
  private baseUrl = 'https://addressvalidation.googleapis.com/v1:validateAddress';

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('Google Maps API key not configured for address validation');
    }
  }

  async validateAddress(addressString: string): Promise<{
    isValid: boolean;
    formattedAddress?: string;
    coordinates?: { latitude: number; longitude: number };
    confidence?: string;
    error?: string;
  }> {
    if (!this.apiKey) {
      return {
        isValid: false,
        error: 'Google Maps API key not configured'
      };
    }

    // First try the original address with component parsing
    let result = await this.tryComponentBasedValidation(addressString);
    if (result.isValid) {
      return result;
    }

    // If original fails, try intersection-specific strategies
    result = await this.tryIntersectionValidation(addressString);
    if (result.isValid) {
      return result;
    }

    // Finally try simple address line approach
    result = await this.trySimpleValidation(addressString);
    return result;
  }

  private async tryComponentBasedValidation(addressString: string): Promise<{
    isValid: boolean;
    formattedAddress?: string;
    coordinates?: { latitude: number; longitude: number };
    confidence?: string;
    error?: string;
  }> {
    try {
      // Parse the address string into components
      const addressComponents = this.parseAddressString(addressString);
      
      const requestBody: AddressValidationRequest = {
        address: {
          addressLines: [addressComponents.street],
          locality: addressComponents.city,
          administrativeArea: addressComponents.state,
          postalCode: addressComponents.zipCode,
          regionCode: 'US'
        }
      };

      return await this.performValidationRequest(requestBody);

    } catch (error) {
      console.error('Component-based validation error:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async tryIntersectionValidation(addressString: string): Promise<{
    isValid: boolean;
    formattedAddress?: string;
    coordinates?: { latitude: number; longitude: number };
    confidence?: string;
    error?: string;
  }> {
    const intersectionVariations = this.generateIntersectionVariations(addressString);
    
    for (const variation of intersectionVariations) {
      console.log(`Trying intersection variation: "${variation}"`);
      
      const requestBody: AddressValidationRequest = {
        address: {
          addressLines: [variation],
          locality: 'Indianapolis',
          administrativeArea: 'IN',
          regionCode: 'US'
        }
      };

      const result = await this.performValidationRequest(requestBody);
      if (result.isValid) {
        console.log(`Successfully validated intersection: "${addressString}" → "${variation}"`);
        return result;
      }
    }

    return { isValid: false, error: 'No intersection variations found valid addresses' };
  }

  private async trySimpleValidation(addressString: string): Promise<{
    isValid: boolean;
    formattedAddress?: string;
    coordinates?: { latitude: number; longitude: number };
    confidence?: string;
    error?: string;
  }> {
    try {
      const requestBody: AddressValidationRequest = {
        address: {
          addressLines: [`${addressString}, Indianapolis, IN`],
          regionCode: 'US'
        }
      };

      return await this.performValidationRequest(requestBody);

    } catch (error) {
      console.error('Simple validation error:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async performValidationRequest(requestBody: AddressValidationRequest): Promise<{
    isValid: boolean;
    formattedAddress?: string;
    coordinates?: { latitude: number; longitude: number };
    confidence?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Address validation failed: ${response.status}`);
      }

      const data: AddressValidationResponse = await response.json();
      
      if (!data.result) {
        return {
          isValid: false,
          error: 'No validation result returned'
        };
      }

      const { verdict, address, geocode } = data.result;

      // Accept lower confidence for intersections
      const isValid = geocode?.location && (
        verdict.addressComplete || 
        verdict.validationGranularity === 'ROUTE' ||
        verdict.geocodeGranularity === 'GEOMETRIC_CENTER'
      );

      return {
        isValid: !!isValid,
        formattedAddress: address.formattedAddress,
        coordinates: geocode?.location ? {
          latitude: geocode.location.latitude,
          longitude: geocode.location.longitude
        } : undefined,
        confidence: verdict.validationGranularity || verdict.geocodeGranularity
      };

    } catch (error) {
      console.error('Google Address Validation request error:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Parse a free-form address string into components
   * Handles common EMS dispatch formats like "7212 US 31 South" or "450 Vickler Road"
   */
  private parseAddressString(addressString: string): {
    street: string;
    city?: string;
    state?: string;
    zipCode?: string;
  } {
    // Clean up the address string
    const cleaned = addressString
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/,+/g, ',');

    // Default to Indianapolis, IN for EMS dispatch addresses
    const defaultCity = 'Indianapolis';
    const defaultState = 'IN';

    // Check if address already contains city/state
    const parts = cleaned.split(',').map(part => part.trim());
    
    if (parts.length > 1) {
      // Address likely contains city/state info
      return {
        street: parts[0],
        city: parts[1] || defaultCity,
        state: parts[2] || defaultState
      };
    }

    // Single line address - assume it's just the street in Indianapolis
    return {
      street: cleaned,
      city: defaultCity,
      state: defaultState
    };
  }

  /**
   * Validate multiple addresses in batch
   */
  async validateAddresses(addresses: string[]): Promise<Array<{
    originalAddress: string;
    isValid: boolean;
    formattedAddress?: string;
    coordinates?: { latitude: number; longitude: number };
    confidence?: string;
    error?: string;
  }>> {
    const results = await Promise.all(
      addresses.map(async (address) => {
        const result = await this.validateAddress(address);
        return {
          originalAddress: address,
          ...result
        };
      })
    );

    return results;
  }

  private generateIntersectionVariations(address: string): string[] {
    const variations: string[] = [];
    
    // Pattern 1: Detect & format intersections
    const ampersandPattern = /(.+?)\s*&\s*(.+)/;
    const andPattern = /(.+?)\s+and\s+(.+)/i;
    
    let match = address.match(ampersandPattern) || address.match(andPattern);
    if (match) {
      const street1 = match[1].trim();
      const street2 = match[2].trim();
      
      // Try different intersection formats for Google Maps
      variations.push(`${street1} & ${street2}, Indianapolis, IN`);
      variations.push(`${street1} and ${street2}, Indianapolis, IN`);
      variations.push(`${street1} at ${street2}, Indianapolis, IN`);
      variations.push(`intersection of ${street1} and ${street2}, Indianapolis, IN`);
      
      // Try with "Street" appended if not present
      const addStreet = (str: string) => {
        if (!/\b(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl)\b/i.test(str)) {
          return `${str} Street`;
        }
        return str;
      };
      
      const street1WithType = addStreet(street1);
      const street2WithType = addStreet(street2);
      
      if (street1WithType !== street1 || street2WithType !== street2) {
        variations.push(`${street1WithType} & ${street2WithType}, Indianapolis, IN`);
        variations.push(`${street1WithType} and ${street2WithType}, Indianapolis, IN`);
      }
    }
    
    // Pattern 2: Look for major Indianapolis streets and create intersections
    const majorStreets = [
      'Meridian Street', 'Pennsylvania Street', 'Delaware Street', 'Capitol Avenue',
      'Illinois Street', 'Senate Avenue', 'Washington Street', 'Market Street',
      'Ohio Street', 'New York Street', 'Vermont Street', 'North Street',
      'Massachusetts Avenue', 'Virginia Avenue', 'Keystone Avenue',
      'College Avenue', 'Central Avenue', 'Sherman Drive', 'Emerson Avenue',
      'Post Road', 'Shadeland Avenue', 'Franklin Road', 'Madison Avenue'
    ];
    
    const foundStreets = majorStreets.filter(street => 
      address.toLowerCase().includes(street.toLowerCase().replace(' street', '').replace(' avenue', '').replace(' road', '').replace(' drive', ''))
    );
    
    if (foundStreets.length >= 2) {
      variations.push(`${foundStreets[0]} & ${foundStreets[1]}, Indianapolis, IN`);
      variations.push(`intersection of ${foundStreets[0]} and ${foundStreets[1]}, Indianapolis, IN`);
    }
    
    // Pattern 3: Highway intersections
    const highwayPattern = /(I-\d+|US-\d+|SR-\d+)/i;
    const highwayMatch = address.match(highwayPattern);
    if (highwayMatch && foundStreets.length > 0) {
      variations.push(`${highwayMatch[1]} & ${foundStreets[0]}, Indianapolis, IN`);
      variations.push(`${foundStreets[0]} at ${highwayMatch[1]}, Indianapolis, IN`);
    }
    
    // Pattern 4: Mile marker handling
    const mileMarkerPattern = /Mile\s+Marker\s+([\d.]+)\s+(I-\d+|US-\d+|SR-\d+)/i;
    const mileMatch = address.match(mileMarkerPattern);
    if (mileMatch) {
      const highway = mileMatch[2];
      variations.push(`${highway} Mile Marker ${mileMatch[1]}, Indianapolis, IN`);
      variations.push(`${highway} at mile ${mileMatch[1]}, Indianapolis, IN`);
    }
    
    return variations;
  }
}

export const googleAddressValidation = new GoogleAddressValidationService();
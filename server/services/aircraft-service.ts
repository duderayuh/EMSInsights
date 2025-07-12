import axios from 'axios';

export interface FlightRadar24Aircraft {
  id: string;
  registration: string;
  flight: string;
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  heading: number;
  aircraft_code: string;
  aircraft_model: string;
  origin_airport: string;
  destination_airport: string;
  departure_time: number;
  status: string;
  squawk: string;
}

export interface FlightPathPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
  speed?: number;
  heading?: number;
}

export interface ProcessedAircraft {
  id: string;
  callsign: string;
  registration: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  isHelicopter: boolean;
  aircraftType: string;
  originAirport: string;
  departureTime: string;
  timeAgo: string;
  country: string;
  lastContact: Date;
  flightPath?: FlightPathPoint[];
}

export class AircraftService {
  private apiKey = '0197d996-0e8e-70bb-9563-5d79179583de|BpDQp9z1y33QL1VhSktQO1pTIkJ9TiOgERhFLFU2ba6c8f14';
  private baseUrl = 'https://data-live.flightradar24.com/zones/fcgi/feed.js';

  constructor() {
    // FlightRadar24 API initialized
  }

  async getFlightPath(flightId: string): Promise<FlightPathPoint[]> {
    try {
      console.log(`Fetching flight path for aircraft: ${flightId}`);
      

      
      const response = await axios.get(`https://data-live.flightradar24.com/clickhandler/?flight=${flightId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      });

      if (response.data && response.data.trail) {
        return response.data.trail.map((point: any) => ({
          latitude: point.lat,
          longitude: point.lng,
          altitude: point.alt || 0,
          timestamp: point.ts,
          speed: point.spd,
          heading: point.hd
        }));
      }

      return [];
    } catch (error: any) {
      console.error(`Failed to fetch flight path for ${flightId}:`, error.message);
      return [];
    }
  }

  // Calculate distance between two points in miles
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Check if aircraft is a helicopter based on aircraft code/model
  private isHelicopter(aircraftCode: string, aircraftModel: string): boolean {
    const helicopterCodes = [
      'H60', 'H47', 'H64', 'H1', 'H500', 'H125', 'H130', 'H135', 'H145', 'H155', 'H175', 'H225',
      'AS50', 'AS55', 'AS65', 'AS32', 'AS35', 'AS55', 'AS65', 'AS32', 'AS35', 'AS50', 'AS55', 'AS65',
      'B06', 'B407', 'B412', 'B429', 'B505', 'BH06', 'BHT1',
      'EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC65', 'EC75', 'EC88', 'EC20', 'EC25', 'EC30',
      'R22', 'R44', 'R66',
      'S76', 'S92',
      'UH1', 'UH60'
    ];
    
    const helicopterKeywords = [
      'helicopter', 'heli', 'chopper', 'rotorcraft', 'bell', 'robinson', 'sikorsky', 'eurocopter', 
      'airbus helicopters', 'md helicopters', 'augusta', 'westland', 'boeing rotorcraft'
    ];

    const codeMatch = helicopterCodes.some(code => 
      aircraftCode.toUpperCase().includes(code.toUpperCase())
    );
    
    const modelMatch = helicopterKeywords.some(keyword => 
      aircraftModel.toLowerCase().includes(keyword.toLowerCase())
    );

    return codeMatch || modelMatch;
  }

  private formatTimeAgo(departureTimestamp: number): string {
    const now = Date.now() / 1000;
    const diffSeconds = now - departureTimestamp;
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes % 60}m ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}m ago`;
    } else {
      return 'Just departed';
    }
  }

  private formatDepartureTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  }

  async getAircraftInBounds(minLat: number, maxLat: number, minLon: number, maxLon: number): Promise<ProcessedAircraft[]> {
    try {
      // Indianapolis coordinates for distance calculation
      const indianapolisLat = 39.7684;
      const indianapolisLon = -86.1581;
      const maxDistance = 150; // 150 mile radius for better coverage

      console.log(`FlightRadar24 API request for helicopters within 150 miles of Indianapolis`);
      
      // Try multiple approaches for better data coverage
      let response;
      try {
        // First attempt with simplified parameters
        response = await axios.get(this.baseUrl, {
          params: {
            bounds: `${maxLat},${minLat},${minLon},${maxLon}`,
            faa: '1',
            satellite: '1',
            mlat: '1',
            flarm: '1', 
            adsb: '1',
            gnd: '0',
            air: '1',
            vehicles: '0',
            estimated: '1', // Include estimated positions
            maxage: '900', // Shorter timeout for fresher data
            gliders: '0',
            stats: '0'
          },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 15000
      });
      } catch (error) {
        console.log('Primary endpoint failed, trying fallback...');
        // Fallback to alternative endpoint
        response = await axios.get('https://data-live.flightradar24.com/zones/fcgi/feed.js', {
          params: {
            bounds: `${maxLat},${minLat},${minLon},${maxLon}`,
            faa: '1',
            satellite: '1',
            mlat: '1',
            flarm: '1',
            adsb: '1',
            gnd: '0',
            air: '1',
            vehicles: '0',
            estimated: '1',
            maxage: '3600',
            gliders: '0',
            stats: '0'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 10000
        });
      }

      console.log(`FlightRadar24 API response status: ${response.status}`);
      console.log(`FlightRadar24 API response data keys:`, Object.keys(response.data || {}).length);
      
      // Log raw response for debugging
      if (response.data && Object.keys(response.data).length > 0) {
        console.log('Raw API response keys:', Object.keys(response.data).slice(0, 5));
        const firstKey = Object.keys(response.data)[0];
        if (firstKey) {
          console.log(`First entry (${firstKey}):`, response.data[firstKey]);
        }
      }
      
      if (!response.data) {
        console.log('No aircraft data in FlightRadar24 response');
        return [];
      }

      // Handle both old and new API response formats
      let aircraftData = response.data;
      
      // New API format returns {aircraft: [], full_count: N, version: X}
      if (aircraftData.aircraft && Array.isArray(aircraftData.aircraft)) {
        console.log(`New API format detected: ${aircraftData.aircraft.length} aircraft in array`);
        aircraftData = aircraftData.aircraft;
        
        // If it's an array format, convert to object format for processing
        const aircraftObj: any = {};
        aircraftData.forEach((flight: any, index: number) => {
          if (Array.isArray(flight) && flight.length >= 18) {
            aircraftObj[`flight_${index}`] = flight;
          }
        });
        aircraftData = aircraftObj;
      }
      
      const helicopters: ProcessedAircraft[] = [];
      const allAircraft: ProcessedAircraft[] = [];

      console.log(`Processing ${Object.keys(aircraftData).length} aircraft entries`);

      // Process each aircraft in the response
      Object.keys(aircraftData).forEach(flightId => {
        const flight = aircraftData[flightId];
        
        // Skip non-aircraft entries (metadata, stats, etc.)
        if (!Array.isArray(flight) || flight.length < 18) {
          return;
        }

        // FlightRadar24 data structure: [lat, lon, heading, altitude, speed, squawk, radar, aircraft_code, registration, timestamp, origin, destination, flight_number, ?, ?, callsign, ?, aircraft_model]
        const [
          latitude, longitude, heading, altitude, speed, squawk, radar, aircraftCode, 
          registration, timestamp, origin, destination, flightNumber, , , callsign, , aircraftModel
        ] = flight;

        // Check distance from Indianapolis first
        const distanceFromIndy = this.calculateDistance(indianapolisLat, indianapolisLon, latitude, longitude);
        
        // Add all aircraft for debugging
        allAircraft.push({
          id: flightId,
          callsign: callsign || flightNumber || 'Unknown',
          registration: registration || 'N/A',
          latitude: latitude,
          longitude: longitude,
          altitude: altitude || 0,
          velocity: speed || 0,
          heading: heading || 0,
          isHelicopter: this.isHelicopter(aircraftCode || '', aircraftModel || ''),
          aircraftType: aircraftModel || aircraftCode || 'Unknown',
          originAirport: origin || 'Unknown',
          departureTime: this.formatDepartureTime(timestamp || Date.now() / 1000),
          timeAgo: this.formatTimeAgo(timestamp || Date.now() / 1000),
          country: 'USA',
          lastContact: new Date()
        });

        // Check if it's a helicopter (but continue processing all aircraft for debugging)
        const isHeli = this.isHelicopter(aircraftCode || '', aircraftModel || '');
        if (!isHeli) {
          return; // Skip non-helicopters for the main return, but continue logging
        }

        // Check distance from Indianapolis
        const distance = this.calculateDistance(indianapolisLat, indianapolisLon, latitude, longitude);
        if (distance > maxDistance) {
          return;
        }

        // Only include aircraft with valid position data
        if (!latitude || !longitude || latitude === 0 || longitude === 0) {
          return;
        }

        helicopters.push({
          id: flightId,
          callsign: callsign || flightNumber || 'Unknown',
          registration: registration || 'N/A',
          latitude: latitude,
          longitude: longitude,
          altitude: altitude || 0,
          velocity: speed || 0,
          heading: heading || 0,
          isHelicopter: true,
          aircraftType: aircraftModel || aircraftCode || 'Helicopter',
          originAirport: origin || 'Unknown',
          departureTime: this.formatDepartureTime(timestamp || Date.now() / 1000),
          timeAgo: this.formatTimeAgo(timestamp || Date.now() / 1000),
          country: 'USA',
          lastContact: new Date()
        });
      });

      console.log(`Found ${allAircraft.length} total aircraft, ${helicopters.length} helicopters within 150 miles of Indianapolis`);
      
      // Log all aircraft for debugging
      if (allAircraft.length > 0) {
        console.log('All aircraft found:');
        allAircraft.forEach(aircraft => {
          console.log(`- ${aircraft.callsign}: ${aircraft.aircraftType} (isHelicopter: ${aircraft.isHelicopter}) at ${aircraft.latitude}, ${aircraft.longitude}`);
        });
      } else {
        console.log('No aircraft found - FlightRadar24 API may be experiencing issues or no aircraft currently airborne in area');
        

      }
      
      return helicopters;

    } catch (error: any) {
      console.error('FlightRadar24 API error:', error.message);
      return [];
    }
  }

  async getHelicoptersNearIndianapolis(radiusMiles: number = 150): Promise<ProcessedAircraft[]> {
    // Indianapolis coordinates
    const indianapolisLat = 39.7684;
    const indianapolisLon = -86.1581;
    
    // Calculate bounding box (approximately 1 degree = 69 miles)
    const latOffset = radiusMiles / 69;
    const lonOffset = radiusMiles / (69 * Math.cos(indianapolisLat * Math.PI / 180));
    
    const minLat = indianapolisLat - latOffset;
    const maxLat = indianapolisLat + latOffset;
    const minLon = indianapolisLon - lonOffset;
    const maxLon = indianapolisLon + lonOffset;
    
    return this.getAircraftInBounds(minLat, maxLat, minLon, maxLon);
  }
}

export const aircraftService = new AircraftService();
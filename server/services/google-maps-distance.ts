interface DistanceResult {
  distanceInMiles: number;
  durationInMinutes: number;
  distanceText: string;
  durationText: string;
}

export class GoogleMapsDistanceService {
  private apiKey: string;
  private baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('Google Maps API key not configured for distance calculations');
    }
  }

  async calculateDistance(
    originLat: number,
    originLng: number,
    destinationAddress: string
  ): Promise<DistanceResult | null> {
    if (!this.apiKey) {
      console.error('Google Maps API key not configured');
      return null;
    }

    try {
      const origin = `${originLat},${originLng}`;
      const params = new URLSearchParams({
        origins: origin,
        destinations: destinationAddress,
        units: 'imperial',
        mode: 'driving',
        key: this.apiKey
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Distance Matrix API failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
        console.error('Distance Matrix API error:', data.status, data.error_message);
        return null;
      }

      const element = data.rows[0].elements[0];
      
      if (element.status !== 'OK') {
        console.error('Route not found:', element.status);
        return null;
      }

      // Convert meters to miles
      const distanceInMiles = element.distance.value * 0.000621371;
      
      // Convert seconds to minutes
      const durationInMinutes = Math.round(element.duration.value / 60);

      return {
        distanceInMiles: parseFloat(distanceInMiles.toFixed(1)),
        durationInMinutes,
        distanceText: element.distance.text,
        durationText: element.duration.text
      };

    } catch (error) {
      console.error('Google Maps Distance calculation error:', error);
      return null;
    }
  }
}

export const googleMapsDistance = new GoogleMapsDistanceService();
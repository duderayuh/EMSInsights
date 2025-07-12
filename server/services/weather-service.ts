import axios from 'axios';

export interface WeatherData {
  location: {
    lat: number;
    lon: number;
  };
  current: {
    temp: number;
    humidity: number;
    pressure: number;
    visibility: number;
    wind_speed: number;
    wind_deg: number;
    weather: {
      main: string;
      description: string;
      icon: string;
    }[];
  };
  alerts?: {
    sender_name: string;
    event: string;
    start: number;
    end: number;
    description: string;
    tags: string[];
  }[];
}

export interface WeatherOverlayData {
  precipitation: string;
  temperature: string;
  pressure: string;
  wind: string;
  clouds: string;
}

export class WeatherService {
  private apiKey: string;
  private baseUrl = 'https://api.openweathermap.org/data/2.5';
  private mapUrl = 'https://tile.openweathermap.org/map';

  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY || '';
  }

  async getCurrentWeather(lat: number, lon: number): Promise<WeatherData | null> {
    if (!this.apiKey) {
      console.warn('OpenWeatherMap API key not configured');
      return null;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/weather`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'imperial'
        }
      });

      // Get weather alerts if available
      let alerts = [];
      try {
        const alertsResponse = await axios.get(`${this.baseUrl}/onecall`, {
          params: {
            lat,
            lon,
            appid: this.apiKey,
            exclude: 'minutely,hourly,daily'
          }
        });
        alerts = alertsResponse.data.alerts || [];
      } catch (error) {
        console.warn('Weather alerts not available');
      }

      return {
        location: { lat, lon },
        current: {
          temp: response.data.main.temp,
          humidity: response.data.main.humidity,
          pressure: response.data.main.pressure,
          visibility: response.data.visibility / 1000, // Convert to km
          wind_speed: response.data.wind.speed,
          wind_deg: response.data.wind.deg,
          weather: response.data.weather
        },
        alerts
      };
    } catch (error) {
      console.error('Error fetching weather data:', error);
      return null;
    }
  }

  getWeatherOverlayUrls(zoom: number): WeatherOverlayData {
    return {
      precipitation: `${this.mapUrl}/precipitation_new/{z}/{x}/{y}.png?appid=${this.apiKey}`,
      temperature: `${this.mapUrl}/temp_new/{z}/{x}/{y}.png?appid=${this.apiKey}`,
      pressure: `${this.mapUrl}/pressure_new/{z}/{x}/{y}.png?appid=${this.apiKey}`,
      wind: `${this.mapUrl}/wind_new/{z}/{x}/{y}.png?appid=${this.apiKey}`,
      clouds: `${this.mapUrl}/clouds_new/{z}/{x}/{y}.png?appid=${this.apiKey}`
    };
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

export const weatherService = new WeatherService();
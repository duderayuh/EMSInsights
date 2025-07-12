// Hospital proximity calculation service
export interface Hospital {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// Cache for hospital data
let hospitalDataCache: Hospital[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to fetch hospital data from database
async function fetchHospitalData(): Promise<Hospital[]> {
  try {
    const response = await fetch('/api/hospitals');
    if (!response.ok) {
      throw new Error('Failed to fetch hospitals');
    }
    const hospitals = await response.json();
    
    // Transform database hospitals to the expected format
    return hospitals.map((hospital: any) => ({
      name: hospital.hospitalName || hospital.hospital_name,
      address: `${hospital.address}, ${hospital.city}, ${hospital.state} ${hospital.zipCode || hospital.zip_code}`,
      lat: hospital.latitude || 0,
      lng: hospital.longitude || 0
    })).filter((hospital: Hospital) => hospital.lat !== 0 && hospital.lng !== 0);
  } catch (error) {
    console.error('Error fetching hospital data:', error);
    // Fallback to static data if database fails
    return [
      { name: "Eskenazi Hospital", address: "720 Eskenazi Avenue, Indianapolis, IN 46202", lat: 39.7892, lng: -86.1655 },
      { name: "IU Health Methodist Hospital", address: "1701 N Senate Blvd, Indianapolis, IN 46202", lat: 39.7847, lng: -86.1714 },
      { name: "Community Hospital East", address: "1500 N Ritter Ave, Indianapolis, IN 46219", lat: 39.7886, lng: -86.0975 },
      { name: "Riley Hospital for Children", address: "705 Riley Hospital Dr, Indianapolis, IN 46202", lat: 39.7776, lng: -86.1813 },
      { name: "St. Vincent Indianapolis", address: "2001 W 86th St, Indianapolis, IN 46260", lat: 39.8758, lng: -86.2119 },
    ];
  }
}

// Function to get fresh hospital data with caching
async function getHospitalData(): Promise<Hospital[]> {
  const now = Date.now();
  
  // Use cached data if it's still fresh
  if (hospitalDataCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return hospitalDataCache;
  }
  
  // Fetch fresh data
  hospitalDataCache = await fetchHospitalData();
  cacheTimestamp = now;
  
  return hospitalDataCache;
}

/**
 * Calculate the distance between two coordinates using the Haversine formula
 * @param lat1 Latitude of first point
 * @param lng1 Longitude of first point  
 * @param lat2 Latitude of second point
 * @param lng2 Longitude of second point
 * @returns Distance in miles
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Radius of the Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

/**
 * Find the closest hospital to given coordinates
 * @param latitude Emergency call latitude
 * @param longitude Emergency call longitude
 * @returns Promise with object containing hospital info and distance, or null if coordinates are invalid
 */
export async function findClosestHospital(latitude: number | null, longitude: number | null): Promise<{
  hospital: Hospital;
  distance: number;
} | null> {
  if (!latitude || !longitude) {
    return null;
  }

  const hospitals = await getHospitalData();
  
  if (hospitals.length === 0) {
    return null;
  }

  let closestHospital = hospitals[0];
  let shortestDistance = calculateDistance(latitude, longitude, closestHospital.lat, closestHospital.lng);

  for (let i = 1; i < hospitals.length; i++) {
    const hospital = hospitals[i];
    const distance = calculateDistance(latitude, longitude, hospital.lat, hospital.lng);
    
    if (distance < shortestDistance) {
      shortestDistance = distance;
      closestHospital = hospital;
    }
  }

  return {
    hospital: closestHospital,
    distance: shortestDistance
  };
}

/**
 * Format distance for display
 * @param distance Distance in miles
 * @returns Formatted distance string
 */
export function formatDistance(distance: number): string {
  return `${distance.toFixed(1)} mi`;
}
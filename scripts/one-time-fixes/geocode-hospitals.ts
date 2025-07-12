import { db } from './server/db';
import { customHospitals } from './shared/schema';
import { eq, isNull } from 'drizzle-orm';

// Geocoding function using Nominatim
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&countrycodes=us&limit=1`);
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
    }
  } catch (error) {
    console.error('Nominatim geocoding failed:', error);
  }

  return null;
}

async function geocodeHospitals() {
  try {
    console.log('Starting hospital geocoding...');
    
    // Get all hospitals without coordinates
    const hospitals = await db.select().from(customHospitals).where(isNull(customHospitals.latitude));
    
    console.log(`Found ${hospitals.length} hospitals without coordinates`);
    
    let geocoded = 0;
    let failed = 0;
    
    for (const hospital of hospitals) {
      if (!hospital.address || !hospital.city || !hospital.state) {
        console.log(`Skipping ${hospital.hospital_name} - incomplete address`);
        continue;
      }
      
      const fullAddress = `${hospital.address}, ${hospital.city}, ${hospital.state} ${hospital.zip_code}`;
      console.log(`Geocoding: ${hospital.hospital_name} - ${fullAddress}`);
      
      const coordinates = await geocodeAddress(fullAddress);
      
      if (coordinates) {
        await db.update(customHospitals)
          .set({
            latitude: coordinates.lat,
            longitude: coordinates.lng,
            updatedAt: new Date()
          })
          .where(eq(customHospitals.id, hospital.id));
        
        console.log(`✓ Updated ${hospital.hospital_name}: ${coordinates.lat}, ${coordinates.lng}`);
        geocoded++;
        
        // Rate limiting - wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log(`✗ Failed to geocode ${hospital.hospital_name}`);
        failed++;
      }
    }
    
    console.log(`\nGeocoding complete:`);
    console.log(`- Successfully geocoded: ${geocoded}`);
    console.log(`- Failed: ${failed}`);
    
  } catch (error) {
    console.error('Error geocoding hospitals:', error);
  }
}

// Run the geocoding
geocodeHospitals();
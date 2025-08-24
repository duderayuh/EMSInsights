import { db } from './db';
import { unitTags } from '@shared/schema';
import { sql } from 'drizzle-orm';

interface UnitTypeConfig {
  type: string;
  prefix: string;
  color: string;
  count: number;
}

const unitTypeConfigs: UnitTypeConfig[] = [
  // Medical Units
  { type: 'ambulance', prefix: 'Ambulance', color: '#DC2626', count: 100 },  // Red
  { type: 'ems', prefix: 'EMS', color: '#EF4444', count: 100 },              // Light Red
  { type: 'medic', prefix: 'Medic', color: '#B91C1C', count: 100 },          // Dark Red
  { type: 'rescue', prefix: 'Rescue', color: '#F87171', count: 100 },        // Pink Red
  
  // Fire Units
  { type: 'fire', prefix: 'Fire', color: '#EA580C', count: 100 },           // Orange
  { type: 'engine', prefix: 'Engine', color: '#F97316', count: 100 },        // Light Orange
  { type: 'ladder', prefix: 'Ladder', color: '#FB923C', count: 100 },        // Peach
  { type: 'truck', prefix: 'Truck', color: '#FDBA74', count: 100 },         // Light Peach
  
  // Command Units
  { type: 'battalion', prefix: 'Battalion', color: '#7C3AED', count: 100 },  // Purple
  { type: 'chief', prefix: 'Chief', color: '#8B5CF6', count: 50 },           // Light Purple
  { type: 'command', prefix: 'Command', color: '#A78BFA', count: 50 },       // Lighter Purple
  { type: 'supervisor', prefix: 'Supervisor', color: '#6D28D9', count: 50 }, // Dark Purple
  
  // Support Units
  { type: 'squad', prefix: 'Squad', color: '#2563EB', count: 100 },         // Blue
  { type: 'utility', prefix: 'Utility', color: '#3B82F6', count: 50 },       // Light Blue
  { type: 'hazmat', prefix: 'HazMat', color: '#FACC15', count: 30 },         // Yellow
  { type: 'tanker', prefix: 'Tanker', color: '#0EA5E9', count: 50 },         // Sky Blue
  
  // Specialized Units
  { type: 'dive', prefix: 'Dive', color: '#06B6D4', count: 20 },            // Cyan
  { type: 'air', prefix: 'Air', color: '#84CC16', count: 20 },              // Lime
  { type: 'marine', prefix: 'Marine', color: '#0891B2', count: 30 },         // Teal
  { type: 'brush', prefix: 'Brush', color: '#10B981', count: 50 },          // Green
  
  // Law Enforcement Support
  { type: 'tactical', prefix: 'Tactical', color: '#1F2937', count: 30 },     // Dark Gray
  { type: 'swat', prefix: 'SWAT', color: '#374151', count: 30 },            // Gray
  { type: 'k9', prefix: 'K9', color: '#6B7280', count: 30 },                // Medium Gray
  
  // Additional Medical
  { type: 'als', prefix: 'ALS', color: '#DC2626', count: 50 },              // Advanced Life Support
  { type: 'bls', prefix: 'BLS', color: '#EF4444', count: 50 },              // Basic Life Support
  { type: 'paramedic', prefix: 'Paramedic', color: '#B91C1C', count: 50 },  // Paramedic units
  
  // Special Operations
  { type: 'technical', prefix: 'Technical', color: '#F59E0B', count: 30 },   // Amber
  { type: 'foam', prefix: 'Foam', color: '#F3F4F6', count: 20 },            // Light Gray
  { type: 'crash', prefix: 'Crash', color: '#D97706', count: 20 },          // Dark Amber
  { type: 'airport', prefix: 'Airport', color: '#92400E', count: 20 },       // Brown
];

async function populateUnitTags() {
  console.log('Starting to populate unit tags...');
  
  try {
    // Clear existing unit tags first
    console.log('Clearing existing unit tags...');
    await db.delete(unitTags);
    
    let totalInserted = 0;
    
    for (const config of unitTypeConfigs) {
      const units = [];
      
      for (let i = 1; i <= config.count; i++) {
        units.push({
          unitType: config.type,
          unitNumber: i,
          displayName: `${config.prefix} ${i}`,
          color: config.color,
          isActive: true,
          notes: `${config.prefix} unit ${i}`
        });
      }
      
      // Insert in batches of 100
      for (let i = 0; i < units.length; i += 100) {
        const batch = units.slice(i, i + 100);
        await db.insert(unitTags).values(batch);
        totalInserted += batch.length;
        console.log(`Inserted ${batch.length} ${config.type} units (${i + batch.length}/${config.count})`);
      }
      
      console.log(`✓ Completed ${config.type}: ${config.count} units`);
    }
    
    console.log(`\n✅ Successfully populated ${totalInserted} unit tags!`);
    
    // Show summary
    const summary = await db.execute(sql`
      SELECT unit_type, COUNT(*) as count 
      FROM unit_tags 
      GROUP BY unit_type 
      ORDER BY unit_type
    `);
    
    console.log('\nUnit Tag Summary:');
    console.log('=================');
    for (const row of summary.rows) {
      console.log(`${row.unit_type}: ${row.count} units`);
    }
    
  } catch (error) {
    console.error('Error populating unit tags:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  populateUnitTags()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

export { populateUnitTags };
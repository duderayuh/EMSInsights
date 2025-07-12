import { storage } from '../storage';

const unitColors = {
  ambulance: '#ef4444', // red
  ems: '#10b981', // green
  squad: '#3b82f6', // blue
  engine: '#f59e0b', // orange
  medic: '#8b5cf6', // purple
};

async function populateUnitTags() {
  console.log('Starting to populate unit tags...');
  
  // Ambulances (1-99)
  for (let i = 1; i <= 99; i++) {
    try {
      await storage.createUnitTag({
        unitType: 'ambulance',
        unitNumber: i,
        displayName: `Ambulance ${i}`,
        color: unitColors.ambulance,
        isActive: true,
        notes: `Indianapolis EMS Ambulance Unit ${i}`
      });
    } catch (error) {
      console.error(`Error creating Ambulance ${i}:`, error);
    }
  }
  console.log('Created 99 ambulance units');

  // EMS units (1-99)
  for (let i = 1; i <= 99; i++) {
    try {
      await storage.createUnitTag({
        unitType: 'ems',
        unitNumber: i,
        displayName: `EMS ${i}`,
        color: unitColors.ems,
        isActive: true,
        notes: `Indianapolis EMS Unit ${i}`
      });
    } catch (error) {
      console.error(`Error creating EMS ${i}:`, error);
    }
  }
  console.log('Created 99 EMS units');

  // Squads (1-99)
  for (let i = 1; i <= 99; i++) {
    try {
      await storage.createUnitTag({
        unitType: 'squad',
        unitNumber: i,
        displayName: `Squad ${i}`,
        color: unitColors.squad,
        isActive: true,
        notes: `Indianapolis Fire Department Squad ${i}`
      });
    } catch (error) {
      console.error(`Error creating Squad ${i}:`, error);
    }
  }
  console.log('Created 99 squad units');

  // Engines (1-99)
  for (let i = 1; i <= 99; i++) {
    try {
      await storage.createUnitTag({
        unitType: 'engine',
        unitNumber: i,
        displayName: `Engine ${i}`,
        color: unitColors.engine,
        isActive: true,
        notes: `Indianapolis Fire Department Engine ${i}`
      });
    } catch (error) {
      console.error(`Error creating Engine ${i}:`, error);
    }
  }
  console.log('Created 99 engine units');

  // Medics (1-99)
  for (let i = 1; i <= 99; i++) {
    try {
      await storage.createUnitTag({
        unitType: 'medic',
        unitNumber: i,
        displayName: `Medic ${i}`,
        color: unitColors.medic,
        isActive: true,
        notes: `Indianapolis EMS Medic ${i}`
      });
    } catch (error) {
      console.error(`Error creating Medic ${i}:`, error);
    }
  }
  console.log('Created medic units');

  console.log('Unit tag population complete!');
  console.log('Total units created: ~495');
}

// Run the population script
populateUnitTags().then(() => {
  console.log('Done populating unit tags');
  process.exit(0);
}).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
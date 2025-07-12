import { unitExtractor } from '../services/unit-extractor.js';

async function extractUnitsFromExistingCalls() {
  console.log('Starting unit extraction from existing dispatch calls...');
  
  try {
    await unitExtractor.processExistingCalls();
    console.log('Unit extraction completed successfully!');
  } catch (error) {
    console.error('Error during unit extraction:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the extraction
extractUnitsFromExistingCalls();
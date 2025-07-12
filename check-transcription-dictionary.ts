import { db } from './server/db.js';
import { transcriptionDictionary } from './shared/schema.js';

async function checkTranscriptionDictionary() {
  try {
    const entries = await db.select().from(transcriptionDictionary);
    console.log('Current transcription dictionary entries:');
    console.log('Total entries:', entries.length);
    
    entries.forEach(entry => {
      console.log(`- ${entry.wrongWord} → ${entry.correctWord} (Category: ${entry.category}, Active: ${entry.isActive}, Usage: ${entry.usageCount})`);
    });
  } catch (error) {
    console.error('Error checking transcription dictionary:', error);
  }
  process.exit(0);
}

checkTranscriptionDictionary();
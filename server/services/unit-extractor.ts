import { DatabaseStorage } from '../database-storage.js';
import { UnitTag } from '../../shared/schema.js';

interface ExtractedUnit {
  unitType: string;
  unitNumber: number;
  rawText: string;
}

export class UnitExtractor {
  private storage: DatabaseStorage;
  private unitCache: Map<string, UnitTag[]> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.storage = new DatabaseStorage();
  }

  async extractUnitsFromTranscript(transcript: string): Promise<ExtractedUnit[]> {
    if (!transcript) return [];
    
    const units: ExtractedUnit[] = [];
    const normalizedTranscript = transcript.toLowerCase();
    
    // Unit type patterns with their variations
    const unitPatterns = [
      { type: 'ambulance', patterns: ['ambulance', 'amb'] },
      { type: 'ems', patterns: ['ems'] },
      { type: 'medic', patterns: ['medic', 'med'] },
      { type: 'squad', patterns: ['squad', 'sq'] },
      { type: 'engine', patterns: ['engine', 'eng'] },
      { type: 'ladder', patterns: ['ladder', 'lad'] },
      { type: 'rescue', patterns: ['rescue', 'res'] },
      { type: 'truck', patterns: ['truck', 'trk'] },
      { type: 'battalion', patterns: ['battalion', 'bat'] },
      { type: 'chief', patterns: ['chief'] }
    ];
    
    for (const { type, patterns } of unitPatterns) {
      for (const pattern of patterns) {
        // Look for pattern followed by a number (with or without space, dash, or comma)
        // Handle cases like "Medic 64-5045" or "Ambulance 432318" or "Medic 32, 4"
        const regex = new RegExp(`\\b${pattern}\\s*([1-9]\\d?)(?:[-,\\s]\\d+)?\\b`, 'gi');
        let match;
        
        while ((match = regex.exec(transcript)) !== null) {
          const unitNumber = parseInt(match[1]);
          if (unitNumber > 0 && unitNumber <= 99) {
            units.push({
              unitType: type,
              unitNumber,
              rawText: match[0].split(/[-,]/)[0].trim() // Get only unit and first number
            });
          }
        }
      }
    }
    
    // Remove duplicates
    const uniqueUnits = this.removeDuplicates(units);
    
    return uniqueUnits;
  }

  private removeDuplicates(units: ExtractedUnit[]): ExtractedUnit[] {
    const seen = new Set<string>();
    return units.filter(unit => {
      const key = `${unit.unitType}-${unit.unitNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async matchUnitsToTags(extractedUnits: ExtractedUnit[]): Promise<number[]> {
    const unitTags = await this.getCachedUnitTags();
    const matchedTagIds: number[] = [];
    
    for (const extracted of extractedUnits) {
      const matchingTag = unitTags.find(tag => 
        tag.unitType.toLowerCase() === extracted.unitType.toLowerCase() && 
        tag.unitNumber === extracted.unitNumber &&
        tag.isActive
      );
      
      if (matchingTag) {
        matchedTagIds.push(matchingTag.id);
        console.log(`Matched unit ${extracted.unitType} ${extracted.unitNumber} to tag ID ${matchingTag.id}`);
      } else {
        console.log(`No match found for unit ${extracted.unitType} ${extracted.unitNumber}`);
      }
    }
    
    return matchedTagIds;
  }

  private async getCachedUnitTags(): Promise<UnitTag[]> {
    const now = Date.now();
    
    // Check if cache is valid
    if (this.unitCache.has('all') && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
      return this.unitCache.get('all')!;
    }
    
    // Refresh cache
    const tags = await this.storage.getActiveUnitTags();
    this.unitCache.set('all', tags);
    this.lastCacheUpdate = now;
    
    return tags;
  }

  async tagCallWithUnits(callId: number, transcript: string): Promise<void> {
    try {
      // Extract units from transcript
      const extractedUnits = await this.extractUnitsFromTranscript(transcript);
      
      if (extractedUnits.length === 0) {
        console.log(`No units found in transcript for call ${callId}`);
        return;
      }
      
      // Match to existing unit tags
      const unitTagIds = await this.matchUnitsToTags(extractedUnits);
      
      if (unitTagIds.length === 0) {
        console.log(`No matching unit tags found for call ${callId}`);
        return;
      }
      
      // Get existing units to avoid duplicates
      const existingUnits = await this.storage.getCallUnits(callId);
      const existingUnitIds = new Set(existingUnits.map(unit => unit.id));
      
      // Filter out units that are already tagged
      const newUnitIds = unitTagIds.filter(id => !existingUnitIds.has(id));
      
      if (newUnitIds.length > 0) {
        // Add units to call
        await this.storage.addUnitsToCall(callId, newUnitIds);
        console.log(`Tagged call ${callId} with ${newUnitIds.length} units`);
      }
    } catch (error) {
      console.error(`Error tagging call ${callId} with units:`, error);
    }
  }

  async processExistingCalls(): Promise<void> {
    console.log('Starting unit extraction for existing dispatch calls...');
    
    try {
      // Get all dispatch calls (talkgroups 10202 and 10244)
      const dispatchCalls = await this.storage.searchCalls({
        limit: 5000 // Process up to 5000 calls
      });
      
      const filteredCalls = dispatchCalls.filter(call => 
        call.talkgroup === '10202' || call.talkgroup === '10244'
      );
      
      console.log(`Found ${filteredCalls.length} dispatch calls to process`);
      
      let processedCount = 0;
      let taggedCount = 0;
      
      for (const call of filteredCalls) {
        if (call.transcript) {
          await this.tagCallWithUnits(call.id, call.transcript);
          processedCount++;
          
          // Check if call has units
          const units = await this.storage.getCallUnits(call.id);
          if (units.length > 0) {
            taggedCount++;
          }
          
          if (processedCount % 100 === 0) {
            console.log(`Processed ${processedCount} calls, tagged ${taggedCount} with units`);
          }
        }
      }
      
      console.log(`Unit extraction complete. Processed ${processedCount} calls, tagged ${taggedCount} with units`);
    } catch (error) {
      console.error('Error processing existing calls:', error);
    }
  }
}

export const unitExtractor = new UnitExtractor();
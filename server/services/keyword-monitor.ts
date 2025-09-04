import { storage } from '../storage';
import { Call, HospitalCall, NotificationKeyword } from '@shared/schema';

export class KeywordMonitorService {
  private keywords: NotificationKeyword[] = [];
  private lastRefresh: Date = new Date();
  private refreshInterval = 60000; // Refresh keywords every minute
  
  constructor() {
    this.initialize();
  }
  
  private async initialize() {
    await this.refreshKeywords();
    // Periodically refresh keywords
    setInterval(() => this.refreshKeywords(), this.refreshInterval);
  }
  
  private async refreshKeywords() {
    try {
      this.keywords = await storage.getActiveNotificationKeywords();
      this.lastRefresh = new Date();
      console.log(`Loaded ${this.keywords.length} active notification keywords`);
    } catch (error) {
      console.error('Error refreshing notification keywords:', error);
    }
  }
  
  async checkCallForKeywords(call: Call): Promise<NotificationKeyword[]> {
    if (!call.transcript || call.transcript.length < 3) {
      return [];
    }
    
    const triggeredKeywords: NotificationKeyword[] = [];
    const transcript = this.normalizeText(call.transcript);
    
    for (const keyword of this.keywords) {
      if (this.matchesKeyword(transcript, keyword)) {
        triggeredKeywords.push(keyword);
        
        // Increment trigger count
        try {
          await storage.incrementKeywordTriggerCount(keyword.id);
        } catch (error) {
          console.error(`Error incrementing trigger count for keyword ${keyword.id}:`, error);
        }
      }
    }
    
    if (triggeredKeywords.length > 0) {
      console.log(`Call ${call.id} triggered ${triggeredKeywords.length} keywords:`, 
        triggeredKeywords.map(k => k.keyword).join(', '));
    }
    
    return triggeredKeywords;
  }
  
  async checkHospitalCallForKeywords(hospitalCall: HospitalCall): Promise<NotificationKeyword[]> {
    if (!hospitalCall.transcript || hospitalCall.transcript.length < 3) {
      return [];
    }
    
    const triggeredKeywords: NotificationKeyword[] = [];
    const transcript = this.normalizeText(hospitalCall.transcript);
    
    // Only check keywords that have notifyHospitalCalls enabled
    const hospitalKeywords = this.keywords.filter(k => k.notifyHospitalCalls);
    
    for (const keyword of hospitalKeywords) {
      if (this.matchesKeyword(transcript, keyword)) {
        triggeredKeywords.push(keyword);
        
        // Increment trigger count
        try {
          await storage.incrementKeywordTriggerCount(keyword.id);
        } catch (error) {
          console.error(`Error incrementing trigger count for keyword ${keyword.id}:`, error);
        }
      }
    }
    
    if (triggeredKeywords.length > 0) {
      console.log(`Hospital call ${hospitalCall.id} triggered ${triggeredKeywords.length} keywords:`, 
        triggeredKeywords.map(k => k.keyword).join(', '));
    }
    
    return triggeredKeywords;
  }
  
  private matchesKeyword(transcript: string, keyword: NotificationKeyword): boolean {
    const keywordText = keyword.caseSensitive ? 
      keyword.keyword : 
      keyword.keyword.toLowerCase();
      
    const searchText = keyword.caseSensitive ? 
      transcript : 
      transcript.toLowerCase();
    
    switch (keyword.matchType) {
      case 'exact':
        // Match exact word boundaries
        const exactRegex = new RegExp(`\\b${this.escapeRegex(keywordText)}\\b`, 
          keyword.caseSensitive ? 'g' : 'gi');
        return exactRegex.test(searchText);
        
      case 'contains':
        // Simple substring match
        return searchText.includes(keywordText);
        
      case 'regex':
        // Use keyword as regex pattern
        try {
          const regex = new RegExp(keyword.keyword, 
            keyword.caseSensitive ? 'g' : 'gi');
          return regex.test(transcript);
        } catch (error) {
          console.error(`Invalid regex pattern for keyword ${keyword.id}: ${keyword.keyword}`, error);
          return false;
        }
        
      default:
        return searchText.includes(keywordText);
    }
  }
  
  private normalizeText(text: string): string {
    // Remove extra whitespace and normalize
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .trim();
  }
  
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  async getKeywordsByCategory(category: string): Promise<NotificationKeyword[]> {
    return this.keywords.filter(k => k.category === category);
  }
  
  async getHighSeverityKeywords(): Promise<NotificationKeyword[]> {
    return this.keywords.filter(k => k.severity === 'high');
  }
  
  async checkMultipleTranscripts(transcripts: string[]): Promise<NotificationKeyword[]> {
    const allTriggeredKeywords = new Set<NotificationKeyword>();
    const combinedTranscript = transcripts.join(' ');
    const normalizedTranscript = this.normalizeText(combinedTranscript);
    
    for (const keyword of this.keywords) {
      if (this.matchesKeyword(normalizedTranscript, keyword)) {
        allTriggeredKeywords.add(keyword);
      }
    }
    
    return Array.from(allTriggeredKeywords);
  }
  
  getStatus() {
    return {
      activeKeywords: this.keywords.length,
      lastRefresh: this.lastRefresh,
      categories: [...new Set(this.keywords.map(k => k.category).filter(Boolean))],
      highSeverityCount: this.keywords.filter(k => k.severity === 'high').length,
      mediumSeverityCount: this.keywords.filter(k => k.severity === 'medium').length,
      lowSeverityCount: this.keywords.filter(k => k.severity === 'low').length
    };
  }
}

// Export singleton instance
export const keywordMonitor = new KeywordMonitorService();
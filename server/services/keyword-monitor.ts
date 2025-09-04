import { EventEmitter } from 'events';
import { storage } from '../storage';
import { distance as levenshtein } from 'fastest-levenshtein';

export interface KeywordMatch {
  keywordId: number;
  keyword: string;
  matchType: string;
  priority: string;
  matched: string;
  confidence: number;
  channelId?: string;
}

export interface CallData {
  id: number;
  transcript: string;
  confidence: number;
  location?: string;
  callType?: string;
  units?: string[];
  timestamp: Date;
  audioPath?: string;
  talkgroup?: string;
  latitude?: number;
  longitude?: number;
}

export class KeywordMonitorService extends EventEmitter {
  private keywords: Map<number, any> = new Map();
  private regexCache: Map<string, RegExp> = new Map();
  private lastKeywordRefresh = 0;
  private readonly KEYWORD_REFRESH_INTERVAL = 60000; // Refresh keywords every minute
  private readonly FUZZY_MATCH_THRESHOLD = 2; // Maximum Levenshtein distance for fuzzy matching

  constructor() {
    super();
    this.refreshKeywords();
    // Set up periodic refresh
    setInterval(() => this.refreshKeywords(), this.KEYWORD_REFRESH_INTERVAL);
  }

  async refreshKeywords(): Promise<void> {
    try {
      const result = await storage.query(
        'SELECT * FROM notification_keywords WHERE is_active = true'
      );
      
      this.keywords.clear();
      this.regexCache.clear();
      
      for (const keyword of result.rows) {
        this.keywords.set(keyword.id, keyword);
        
        // Pre-compile regex patterns
        if (keyword.match_type === 'regex') {
          try {
            this.regexCache.set(keyword.keyword, new RegExp(keyword.keyword, 'gi'));
          } catch (error) {
            console.error(`Invalid regex pattern for keyword ${keyword.id}: ${keyword.keyword}`, error);
          }
        }
      }
      
      this.lastKeywordRefresh = Date.now();
      console.log(`Loaded ${this.keywords.size} active keywords for monitoring`);
    } catch (error) {
      console.error('Failed to refresh keywords:', error);
    }
  }

  async checkForKeywords(callData: CallData): Promise<KeywordMatch[]> {
    // Skip if transcript confidence is too low
    if (callData.confidence < 0.5) {
      return [];
    }
    
    // Skip if transcript is just static or noise
    if (callData.transcript === '[Static]' || callData.transcript === '[Unable to transcribe]' || callData.transcript === '{beeping}') {
      return [];
    }

    const matches: KeywordMatch[] = [];
    const transcriptLower = callData.transcript.toLowerCase();
    const words = transcriptLower.split(/\s+/);

    for (const [keywordId, keyword] of this.keywords) {
      // Check if minimum confidence is met
      if (keyword.min_confidence && callData.confidence < keyword.min_confidence) {
        continue;
      }

      let matched = false;
      let matchedText = '';

      switch (keyword.match_type) {
        case 'exact':
          // Exact match - the entire transcript must match the keyword
          if (transcriptLower === keyword.keyword.toLowerCase()) {
            matched = true;
            matchedText = keyword.keyword;
          }
          break;

        case 'contains':
          // Contains - keyword appears anywhere in transcript
          if (transcriptLower.includes(keyword.keyword.toLowerCase())) {
            matched = true;
            matchedText = keyword.keyword;
          }
          break;

        case 'fuzzy':
          // Fuzzy match - use Levenshtein distance
          for (const word of words) {
            if (this.fuzzyMatch(word, keyword.keyword.toLowerCase())) {
              matched = true;
              matchedText = word;
              break;
            }
          }
          break;

        case 'regex':
          // Regex pattern matching
          const regex = this.regexCache.get(keyword.keyword);
          if (regex) {
            const match = callData.transcript.match(regex);
            if (match) {
              matched = true;
              matchedText = match[0];
            }
          }
          break;

        default:
          // Default to contains
          if (transcriptLower.includes(keyword.keyword.toLowerCase())) {
            matched = true;
            matchedText = keyword.keyword;
          }
      }

      if (matched) {
        matches.push({
          keywordId,
          keyword: keyword.keyword,
          matchType: keyword.match_type,
          priority: keyword.priority || 'normal',
          matched: matchedText,
          confidence: callData.confidence,
          channelId: keyword.telegram_channel_id
        });

        console.log(`Keyword match found: "${keyword.keyword}" (${keyword.match_type}) in call ${callData.id}`);
        
        // Record the match in history
        await this.recordMatch(callData.id, keywordId, matchedText);
      }
    }

    // Sort matches by priority (critical > high > normal > low)
    matches.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - 
             (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
    });

    if (matches.length > 0) {
      this.emit('keywordMatched', { callData, matches });
    }

    return matches;
  }

  private fuzzyMatch(str1: string, str2: string): boolean {
    // Don't fuzzy match very short strings to avoid false positives
    if (str1.length < 3 || str2.length < 3) {
      return false;
    }

    const distance = levenshtein(str1, str2);
    
    // Dynamic threshold based on string length
    const threshold = Math.min(this.FUZZY_MATCH_THRESHOLD, Math.floor(Math.max(str1.length, str2.length) * 0.2));
    
    return distance <= threshold;
  }

  private async recordMatch(callId: number, keywordId: number, matchedText: string): Promise<void> {
    try {
      await storage.query(
        `INSERT INTO notification_history (call_id, keyword_id, keyword_matched, status) 
         VALUES ($1, $2, $3, 'queued')`,
        [callId, keywordId, matchedText]
      );
    } catch (error) {
      console.error('Failed to record keyword match:', error);
    }
  }

  async addKeyword(
    keyword: string,
    matchType: string = 'contains',
    priority: string = 'normal',
    channelId?: string,
    minConfidence: number = 0.7
  ): Promise<boolean> {
    try {
      const result = await storage.query(
        `INSERT INTO notification_keywords 
         (keyword, match_type, priority, telegram_channel_id, min_confidence) 
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [keyword.toLowerCase(), matchType, priority, channelId, minConfidence]
      );

      if (result.rows.length > 0) {
        await this.refreshKeywords();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to add keyword:', error);
      return false;
    }
  }

  async removeKeyword(keywordId: number): Promise<boolean> {
    try {
      const result = await storage.query(
        'UPDATE notification_keywords SET is_active = false WHERE id = $1',
        [keywordId]
      );

      if (result.rowCount > 0) {
        await this.refreshKeywords();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to remove keyword:', error);
      return false;
    }
  }

  async updateKeyword(
    keywordId: number,
    updates: Partial<{
      keyword: string;
      matchType: string;
      priority: string;
      channelId: string;
      minConfidence: number;
      isActive: boolean;
    }>
  ): Promise<boolean> {
    try {
      const setClauses = [];
      const values = [];
      let paramCount = 1;

      if (updates.keyword !== undefined) {
        setClauses.push(`keyword = $${paramCount++}`);
        values.push(updates.keyword.toLowerCase());
      }
      if (updates.matchType !== undefined) {
        setClauses.push(`match_type = $${paramCount++}`);
        values.push(updates.matchType);
      }
      if (updates.priority !== undefined) {
        setClauses.push(`priority = $${paramCount++}`);
        values.push(updates.priority);
      }
      if (updates.channelId !== undefined) {
        setClauses.push(`telegram_channel_id = $${paramCount++}`);
        values.push(updates.channelId);
      }
      if (updates.minConfidence !== undefined) {
        setClauses.push(`min_confidence = $${paramCount++}`);
        values.push(updates.minConfidence);
      }
      if (updates.isActive !== undefined) {
        setClauses.push(`is_active = $${paramCount++}`);
        values.push(updates.isActive);
      }

      if (setClauses.length === 0) {
        return false;
      }

      setClauses.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(keywordId);

      const result = await storage.query(
        `UPDATE notification_keywords 
         SET ${setClauses.join(', ')} 
         WHERE id = $${paramCount}`,
        values
      );

      if (result.rowCount > 0) {
        await this.refreshKeywords();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to update keyword:', error);
      return false;
    }
  }

  async getKeywords(activeOnly: boolean = true): Promise<any[]> {
    try {
      const query = activeOnly
        ? 'SELECT * FROM notification_keywords WHERE is_active = true ORDER BY created_at DESC'
        : 'SELECT * FROM notification_keywords ORDER BY created_at DESC';
      
      const result = await storage.query(query);
      return result.rows;
    } catch (error) {
      console.error('Failed to get keywords:', error);
      return [];
    }
  }

  getActiveKeywordCount(): number {
    return this.keywords.size;
  }
}

export const keywordMonitor = new KeywordMonitorService();
import { db } from './db';
import { 
  calls, audioSegments, callStats, systemHealth, users, hospitalCalls, hospitalCallSegments,
  systemSettings, customHospitals, customTalkgroups, transcriptionDictionary,
  alerts, alertRules, userAlertPreferences, unitTags, callUnitTags, incidents,
  type Call, type InsertCall, type AudioSegment, type InsertAudioSegment,
  type CallStats, type InsertCallStats, type SystemHealth, type InsertSystemHealth,
  type User, type InsertUser, type HospitalCall, type InsertHospitalCall,
  type HospitalCallSegment, type InsertHospitalCallSegment, CallStatus,
  type SystemSetting, type InsertSystemSetting, type CustomHospital, type InsertCustomHospital,
  type CustomTalkgroup, type InsertCustomTalkgroup, type TranscriptionDictionary, type InsertTranscriptionDictionary,
  type Alert, type InsertAlert, type AlertRule, type InsertAlertRule,
  type UserAlertPreferences, type InsertUserAlertPreferences,
  type UnitTag, type InsertUnitTag, type CallUnitTag, type InsertCallUnitTag,
  type Incident, type InsertIncident
} from '@shared/schema';
import { eq, desc, like, and, or, gte, lte, sql, inArray, count, notInArray } from 'drizzle-orm';
import type { IStorage } from './storage';

interface SearchParams {
  query?: string;
  priority?: string;
  callType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export class DatabaseStorage implements IStorage {
  
  constructor() {
    this.initializeDefaultData();
  }

  private async initializeDefaultData() {
    try {
      // Initialize system health
      await this.updateSystemHealth({
        component: 'audio_processor',
        status: 'healthy',
        metadata: { active: true }
      });
      
      await this.updateSystemHealth({
        component: 'transcription_service',
        status: 'healthy',
        metadata: { model: 'whisper-base' }
      });
      
      await this.updateSystemHealth({
        component: 'nlp_classifier',
        status: 'healthy',
        metadata: { keywords_loaded: true }
      });

      // Database initialized - ready for real emergency calls
    } catch (error) {
      console.error('Error initializing default data:', error);
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  // Call methods
  async createCall(insertCall: InsertCall): Promise<Call> {
    const result = await db.insert(calls).values(insertCall).returning();
    return result[0];
  }

  async getCall(id: number): Promise<Call | undefined> {
    const result = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
    return result[0];
  }

  async getRecentCalls(limit: number): Promise<Call[]> {
    return await db.select().from(calls).orderBy(desc(calls.timestamp)).limit(limit);
  }

  async getActiveCalls(): Promise<Call[]> {
    const result = await db.select().from(calls)
      .where(eq(calls.status, CallStatus.ACTIVE))
      .orderBy(desc(calls.timestamp));
    
    // Filter out deleted calls in JavaScript to avoid SQL issues
    return result.filter(call => call.status !== 'deleted');
  }

  async updateCallStatus(id: number, status: string): Promise<Call | undefined> {
    const result = await db.update(calls)
      .set({ status, updatedAt: new Date() })
      .where(eq(calls.id, id))
      .returning();
    return result[0];
  }

  async updateCall(id: number, updates: Partial<Call>): Promise<Call | undefined> {
    const result = await db.update(calls)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(calls.id, id))
      .returning();
    return result[0];
  }

  async updateCallByAudioSegmentId(audioSegmentId: string, updates: Partial<Call>): Promise<Call | undefined> {
    const result = await db.update(calls)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(calls.audioSegmentId, audioSegmentId))
      .returning();
    return result[0];
  }

  async getCallByAudioSegmentId(audioSegmentId: string): Promise<Call | undefined> {
    const [call] = await db.select().from(calls)
      .where(eq(calls.audioSegmentId, audioSegmentId))
      .limit(1);
    return call;
  }

  async deleteCall(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(calls)
        .where(eq(calls.id, id));
      return true; // Assume successful if no error thrown
    } catch (error) {
      console.error('Error deleting call:', error);
      return false;
    }
  }

  async searchCalls(params: SearchParams): Promise<Call[]> {
    const conditions = [];

    if (params.query) {
      const searchQuery = `%${params.query}%`;
      conditions.push(
        sql`(${calls.transcript} ILIKE ${searchQuery} OR ${calls.callType} ILIKE ${searchQuery} OR ${calls.location} ILIKE ${searchQuery})`
      );
    }

    if (params.priority) {
      conditions.push(eq(calls.priority, params.priority));
    }

    if (params.callType) {
      conditions.push(eq(calls.callType, params.callType));
    }

    if (params.dateFrom) {
      conditions.push(gte(calls.timestamp, params.dateFrom));
    }

    if (params.dateTo) {
      conditions.push(lte(calls.timestamp, params.dateTo));
    }

    let query = db.select().from(calls);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query
      .orderBy(desc(calls.timestamp))
      .limit(params.limit || 50);

    return result;
  }

  // Audio Segment methods
  async createAudioSegment(insertSegment: InsertAudioSegment): Promise<AudioSegment> {
    const result = await db.insert(audioSegments).values(insertSegment).returning();
    return result[0];
  }

  async getAudioSegment(id: string): Promise<AudioSegment | undefined> {
    const result = await db.select().from(audioSegments).where(eq(audioSegments.id, id)).limit(1);
    return result[0];
  }

  async updateAudioSegment(id: string, updates: Partial<AudioSegment>): Promise<AudioSegment | undefined> {
    const result = await db.update(audioSegments)
      .set(updates)
      .where(eq(audioSegments.id, id))
      .returning();
    return result[0];
  }

  async getUnprocessedSegments(): Promise<AudioSegment[]> {
    return await db.select().from(audioSegments)
      .where(eq(audioSegments.processed, false))
      .orderBy(audioSegments.timestamp);
  }

  // Stats methods
  async createCallStats(insertStats: InsertCallStats): Promise<CallStats> {
    const result = await db.insert(callStats).values(insertStats).returning();
    return result[0];
  }

  async getCurrentStats(): Promise<any> {
    const [activeCalls, allCalls] = await Promise.all([
      this.getActiveCalls(),
      db.select().from(calls)
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysCalls = allCalls.filter(call => 
      new Date(call.timestamp) >= today
    );

    const priorityCounts = {
      echo: 0,
      delta: 0,
      charlie: 0,
      bravo: 0,
      alpha: 0
    };

    return {
      totalCalls: allCalls.length,
      activeCalls: activeCalls.length,
      todayTotal: todaysCalls.length,
      activeEmergency: priorityCounts.echo,
      activeHigh: priorityCounts.delta,
      avgResponse: 6.2, // Mock average response time for now
      priorityCounts,
      callTypes: this.getCallTypeDistribution(todaysCalls)
    };
  }

  async getStatsForPeriod(startDate: Date, endDate: Date): Promise<CallStats[]> {
    return await db.select().from(callStats)
      .where(and(
        gte(callStats.date, startDate),
        lte(callStats.date, endDate)
      ))
      .orderBy(callStats.date);
  }

  private getCallTypeDistribution(calls: Call[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    calls.forEach(call => {
      if (call.callType) {
        distribution[call.callType] = (distribution[call.callType] || 0) + 1;
      }
    });
    return distribution;
  }

  // System Health methods
  async updateSystemHealth(insertHealth: InsertSystemHealth): Promise<SystemHealth> {
    try {
      // Try to update existing record first
      const existing = await db.select().from(systemHealth)
        .where(eq(systemHealth.component, insertHealth.component))
        .limit(1);

      if (existing.length > 0) {
        const result = await db.update(systemHealth)
          .set({
            status: insertHealth.status,
            metadata: insertHealth.metadata,
            lastCheck: new Date()
          })
          .where(eq(systemHealth.component, insertHealth.component))
          .returning();
        return result[0];
      } else {
        // Create new record
        const result = await db.insert(systemHealth).values(insertHealth).returning();
        return result[0];
      }
    } catch (error) {
      console.error('Error updating system health:', error);
      throw error;
    }
  }

  async getSystemHealth(): Promise<SystemHealth[]> {
    return await db.select().from(systemHealth).orderBy(systemHealth.component);
  }

  // Hospital Calls
  async createHospitalCall(insertCall: InsertHospitalCall): Promise<HospitalCall> {
    // Auto-detect hospital name based on talkgroup if not provided
    const hospitalName = insertCall.hospitalName || this.detectHospitalFromTalkgroup(insertCall.talkgroup);
    
    const [call] = await db.insert(hospitalCalls).values({
      ...insertCall,
      hospitalName
    }).returning();
    return call;
  }

  private detectHospitalFromTalkgroup(talkgroup: string): string {
    // Map talkgroups to hospital names
    const hospitalMap: { [key: string]: string } = {
      '10255': 'Eskenazi',
      '10256': 'Methodist',
      '10257': 'Community East',
      '10258': 'Riley',
      '10259': 'St. Vincent 86th',
      '10260': 'St. Vincent Castleton',
      '10261': 'Community North',
      '10262': 'Community South',
      '10263': 'IU Health West',
      '10264': 'IU Health North',
      '10265': 'St. Vincent Fishers',
      '10266': 'Hendricks Regional',
      '10267': 'Johnson Memorial',
      '10268': 'Major Hospital',
      '10269': 'Hancock Regional',
      '10270': 'St. Francis',
      '10271': 'Riverview',
      '10272': 'St. Vincent Carmel',
      '10273': 'Franciscan Health'
    };
    
    return hospitalMap[talkgroup] || 'Unknown';
  }

  async getHospitalCall(id: number): Promise<HospitalCall | undefined> {
    const [call] = await db.select().from(hospitalCalls).where(eq(hospitalCalls.id, id));
    return call;
  }

  async getHospitalCalls(limit = 50, hospitalFilter?: string, offset = 0, search?: string, sorOnly = false): Promise<HospitalCall[]> {
    // Build where conditions
    const conditions = [];
    
    // Apply hospital filter if provided
    if (hospitalFilter && hospitalFilter !== 'all') {
      const hospitalTalkgroups: Record<string, string[]> = {
        'Methodist': ['10256'], 
        'Riley': ['10257'],  
        'Eskenazi': ['10261']
      };
      
      const talkgroups = hospitalTalkgroups[hospitalFilter];
      if (talkgroups && talkgroups.length > 0) {
        conditions.push(inArray(hospitalCalls.talkgroup, talkgroups));
      }
    }
    
    // Apply SOR filter
    if (sorOnly) {
      conditions.push(eq(hospitalCalls.sorDetected, true));
    }
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      conditions.push(
        or(
          sql`LOWER(${hospitalCalls.conversationId}) LIKE ${`%${searchLower}%`}`,
          sql`LOWER(${hospitalCalls.hospitalName}) LIKE ${`%${searchLower}%`}`,
          sql`LOWER(${hospitalCalls.sorPhysician}) LIKE ${`%${searchLower}%`}`,
          sql`LOWER(${hospitalCalls.conversationAnalysis}::text) LIKE ${`%${searchLower}%`}`
        )!
      );
    }
    
    // Build the query
    const baseQuery = db
      .select({
        id: hospitalCalls.id,
        conversationId: hospitalCalls.conversationId,
        hospitalName: hospitalCalls.hospitalName,
        talkgroup: hospitalCalls.talkgroup,
        system: hospitalCalls.system,
        timestamp: hospitalCalls.timestamp,
        status: hospitalCalls.status,
        voiceType: hospitalCalls.voiceType,
        sorDetected: hospitalCalls.sorDetected,
        sorPhysician: hospitalCalls.sorPhysician,
        mergedAudioPath: hospitalCalls.mergedAudioPath,
        totalSegments: hospitalCalls.totalSegments,
        conversationAnalysis: hospitalCalls.conversationAnalysis,
        analysisCompletedAt: hospitalCalls.analysisCompletedAt,
        createdAt: hospitalCalls.createdAt,
        updatedAt: hospitalCalls.updatedAt,
        segmentCount: count(hospitalCallSegments.id)
      })
      .from(hospitalCalls)
      .leftJoin(hospitalCallSegments, eq(hospitalCalls.id, hospitalCallSegments.hospitalCallId))
      .groupBy(hospitalCalls.id, hospitalCalls.conversationId, hospitalCalls.hospitalName, 
               hospitalCalls.talkgroup, hospitalCalls.system, hospitalCalls.timestamp,
               hospitalCalls.status, hospitalCalls.voiceType, hospitalCalls.sorDetected, hospitalCalls.sorPhysician,
               hospitalCalls.mergedAudioPath, hospitalCalls.totalSegments, hospitalCalls.conversationAnalysis,
               hospitalCalls.analysisCompletedAt, hospitalCalls.createdAt, hospitalCalls.updatedAt);
    
    // Apply conditions if any
    const query = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    
    // Order by timestamp descending and apply pagination
    const results = await query
      .orderBy(desc(hospitalCalls.timestamp))
      .limit(limit)
      .offset(offset);
    
    return results;
  }

  async getHospitalCallsCount(hospitalFilter?: string, search?: string, sorOnly = false): Promise<number> {
    // Build where conditions
    const conditions = [];
    
    // Apply hospital filter if provided
    if (hospitalFilter && hospitalFilter !== 'all') {
      const hospitalTalkgroups: Record<string, string[]> = {
        'Methodist': ['10256'], 
        'Riley': ['10257'],  
        'Eskenazi': ['10261']
      };
      
      const talkgroups = hospitalTalkgroups[hospitalFilter];
      if (talkgroups && talkgroups.length > 0) {
        conditions.push(inArray(hospitalCalls.talkgroup, talkgroups));
      }
    }
    
    // Apply SOR filter
    if (sorOnly) {
      conditions.push(eq(hospitalCalls.sorDetected, true));
    }
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      conditions.push(
        or(
          sql`LOWER(${hospitalCalls.conversationId}) LIKE ${`%${searchLower}%`}`,
          sql`LOWER(${hospitalCalls.hospitalName}) LIKE ${`%${searchLower}%`}`,
          sql`LOWER(${hospitalCalls.sorPhysician}) LIKE ${`%${searchLower}%`}`,
          sql`LOWER(${hospitalCalls.conversationAnalysis}::text) LIKE ${`%${searchLower}%`}`
        )!
      );
    }
    
    // Build the base query for counting
    const baseQuery = db
      .select({ count: count() })
      .from(hospitalCalls);
    
    // Apply conditions if any
    const query = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;
    
    const [result] = await query;
    return result?.count || 0;
  }

  async updateHospitalCall(id: number, updates: Partial<HospitalCall>): Promise<HospitalCall | undefined> {
    const [call] = await db
      .update(hospitalCalls)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(hospitalCalls.id, id))
      .returning();
    return call;
  }

  async deleteHospitalCall(id: number): Promise<boolean> {
    try {
      // First check if the hospital call exists
      const hospitalCall = await db.select().from(hospitalCalls).where(eq(hospitalCalls.id, id)).limit(1);
      if (hospitalCall.length === 0) {
        return false;
      }
      
      // Delete related segments first
      await db.delete(hospitalCallSegments).where(eq(hospitalCallSegments.hospitalCallId, id));
      
      // Delete the hospital call
      await db.delete(hospitalCalls).where(eq(hospitalCalls.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting hospital call:', error);
      return false;
    }
  }

  // Hospital Call Segments
  async createHospitalCallSegment(insertSegment: InsertHospitalCallSegment): Promise<HospitalCallSegment> {
    const [segment] = await db.insert(hospitalCallSegments).values(insertSegment).returning();
    return segment;
  }

  async getHospitalCallSegments(hospitalCallId: number): Promise<HospitalCallSegment[]> {
    // First get the segments with their basic information
    const segments = await db
      .select()
      .from(hospitalCallSegments)
      .where(eq(hospitalCallSegments.hospitalCallId, hospitalCallId))
      .orderBy(hospitalCallSegments.sequenceNumber);

    // For each segment, try to get the actual transcript from the calls table
    const segmentsWithTranscripts = await Promise.all(
      segments.map(async (segment) => {
        // Try to find the corresponding call with transcript
        const [callWithTranscript] = await db
          .select()
          .from(calls)
          .where(eq(calls.audioSegmentId, segment.audioSegmentId))
          .limit(1);

        // If we found a call with transcript, use it; otherwise keep the original segment data
        if (callWithTranscript && callWithTranscript.transcript && callWithTranscript.transcript !== "Transcription pending...") {
          return {
            ...segment,
            transcript: callWithTranscript.transcript,
            confidence: callWithTranscript.confidence,
            metadata: {
              ...(segment.metadata as any),
              processingStatus: 'transcribed',
              callId: callWithTranscript.id
            }
          };
        }
        
        return segment;
      })
    );

    return segmentsWithTranscripts;
  }

  async getHospitalCallSegmentById(id: number): Promise<HospitalCallSegment | undefined> {
    const [segment] = await db
      .select()
      .from(hospitalCallSegments)
      .where(eq(hospitalCallSegments.id, id))
      .limit(1);
    return segment;
  }

  async getHospitalCallSegmentByAudioId(audioSegmentId: string): Promise<HospitalCallSegment | undefined> {
    const [segment] = await db
      .select()
      .from(hospitalCallSegments)
      .where(eq(hospitalCallSegments.audioSegmentId, audioSegmentId))
      .limit(1);
    return segment;
  }

  async updateHospitalCallSegment(id: number, updates: Partial<HospitalCallSegment>): Promise<HospitalCallSegment | undefined> {
    const [segment] = await db
      .update(hospitalCallSegments)
      .set(updates)
      .where(eq(hospitalCallSegments.id, id))
      .returning();
    return segment;
  }

  async getUnlinkedSegments(): Promise<HospitalCallSegment[]> {
    try {
      // Get segments from "unlinked" hospital calls using a join
      const unlinkedSegments = await db
        .select()
        .from(hospitalCallSegments)
        .innerJoin(hospitalCalls, eq(hospitalCallSegments.hospitalCallId, hospitalCalls.id))
        .where(eq(hospitalCalls.status, 'unlinked'))
        .orderBy(desc(hospitalCallSegments.timestamp));
      
      return unlinkedSegments.map(row => row.hospital_call_segments);
    } catch (error) {
      console.error('Error fetching unlinked segments:', error);
      return [];
    }
  }

  // System Settings Methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return setting;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings).orderBy(systemSettings.category, systemSettings.key);
  }

  async updateSystemSetting(key: string, value: string, updatedBy: number): Promise<SystemSetting> {
    const [setting] = await db
      .update(systemSettings)
      .set({ value, updatedAt: new Date(), updatedBy })
      .where(eq(systemSettings.key, key))
      .returning();
    return setting;
  }

  async createSystemSetting(insertSetting: InsertSystemSetting): Promise<SystemSetting> {
    const [setting] = await db.insert(systemSettings).values(insertSetting).returning();
    return setting;
  }

  // Custom Hospitals Methods
  async getAllCustomHospitals(): Promise<CustomHospital[]> {
    return await db.select().from(customHospitals).orderBy(customHospitals.hospitalName);
  }

  async getCustomHospital(id: number): Promise<CustomHospital | undefined> {
    const [hospital] = await db
      .select()
      .from(customHospitals)
      .where(eq(customHospitals.id, id))
      .limit(1);
    return hospital;
  }

  async createCustomHospital(insertHospital: InsertCustomHospital): Promise<CustomHospital> {
    const [hospital] = await db.insert(customHospitals).values(insertHospital).returning();
    return hospital;
  }

  async updateCustomHospital(id: number, updates: Partial<CustomHospital>): Promise<CustomHospital | undefined> {
    // Remove updatedAt from updates to prevent timestamp conflicts
    const { updatedAt, ...cleanUpdates } = updates;
    
    const [hospital] = await db
      .update(customHospitals)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(customHospitals.id, id))
      .returning();
    return hospital;
  }

  async deleteCustomHospital(id: number): Promise<boolean> {
    try {
      // First check if the hospital exists
      const hospital = await db.select().from(customHospitals).where(eq(customHospitals.id, id)).limit(1);
      if (hospital.length === 0) {
        return false;
      }
      
      // Delete the hospital
      await db.delete(customHospitals).where(eq(customHospitals.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting custom hospital:', error);
      return false;
    }
  }

  // Custom Talkgroups Methods
  async getAllCustomTalkgroups(): Promise<CustomTalkgroup[]> {
    return await db.select().from(customTalkgroups).orderBy(customTalkgroups.priority, customTalkgroups.displayName);
  }

  async getCustomTalkgroup(id: number): Promise<CustomTalkgroup | undefined> {
    const [talkgroup] = await db
      .select()
      .from(customTalkgroups)
      .where(eq(customTalkgroups.id, id))
      .limit(1);
    return talkgroup;
  }

  async createCustomTalkgroup(insertTalkgroup: InsertCustomTalkgroup): Promise<CustomTalkgroup> {
    const [talkgroup] = await db.insert(customTalkgroups).values(insertTalkgroup).returning();
    return talkgroup;
  }

  async updateCustomTalkgroup(id: number, updates: Partial<CustomTalkgroup>): Promise<CustomTalkgroup | undefined> {
    // Remove updatedAt from updates to prevent timestamp conflicts
    const { updatedAt, ...cleanUpdates } = updates;
    
    const [talkgroup] = await db
      .update(customTalkgroups)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(customTalkgroups.id, id))
      .returning();
    return talkgroup;
  }

  async deleteCustomTalkgroup(id: number): Promise<boolean> {
    try {
      // First check if the talkgroup exists
      const talkgroup = await db.select().from(customTalkgroups).where(eq(customTalkgroups.id, id)).limit(1);
      if (talkgroup.length === 0) {
        return false;
      }
      
      // Delete the talkgroup
      await db.delete(customTalkgroups).where(eq(customTalkgroups.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting custom talkgroup:', error);
      return false;
    }
  }

  // Transcription Dictionary Methods
  async getAllTranscriptionEntries(): Promise<TranscriptionDictionary[]> {
    return await db.select().from(transcriptionDictionary)
      .where(eq(transcriptionDictionary.isActive, true))
      .orderBy(transcriptionDictionary.category, transcriptionDictionary.wrongWord);
  }

  async getTranscriptionEntry(id: number): Promise<TranscriptionDictionary | undefined> {
    const [entry] = await db
      .select()
      .from(transcriptionDictionary)
      .where(eq(transcriptionDictionary.id, id))
      .limit(1);
    return entry;
  }

  async createTranscriptionEntry(insertEntry: InsertTranscriptionDictionary): Promise<TranscriptionDictionary> {
    const [entry] = await db.insert(transcriptionDictionary).values(insertEntry).returning();
    return entry;
  }

  async updateTranscriptionEntry(id: number, updates: Partial<TranscriptionDictionary>): Promise<TranscriptionDictionary | undefined> {
    // Remove updatedAt from updates to prevent timestamp conflicts
    const { updatedAt, ...cleanUpdates } = updates;
    
    const [entry] = await db
      .update(transcriptionDictionary)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(transcriptionDictionary.id, id))
      .returning();
    return entry;
  }

  async deleteTranscriptionEntry(id: number): Promise<boolean> {
    const result = await db.delete(transcriptionDictionary).where(eq(transcriptionDictionary.id, id));
    return Array.isArray(result) ? result.length > 0 : true;
  }

  async incrementTranscriptionUsage(id: number): Promise<void> {
    await db
      .update(transcriptionDictionary)
      .set({ usageCount: sql`${transcriptionDictionary.usageCount} + 1` })
      .where(eq(transcriptionDictionary.id, id));
  }

  // Alert Management Methods
  async createAlert(insertAlert: InsertAlert): Promise<Alert> {
    const [alert] = await db.insert(alerts).values(insertAlert).returning();
    return alert;
  }

  async getAlert(id: number): Promise<Alert | undefined> {
    const result = await db.select().from(alerts).where(eq(alerts.id, id));
    return result[0];
  }

  async getAllAlerts(limit = 100, userId?: number): Promise<Alert[]> {
    return await db
      .select()
      .from(alerts)
      .orderBy(desc(alerts.createdAt))
      .limit(limit);
  }

  async getUnreadAlerts(userId?: number): Promise<Alert[]> {
    console.log('Debug getUnreadAlerts - querying for isRead = false');
    const result = await db
      .select()
      .from(alerts)
      .where(eq(alerts.isRead, false))
      .orderBy(desc(alerts.createdAt));
    
    console.log('Debug getUnreadAlerts - result count:', result.length);
    console.log('Debug getUnreadAlerts - first alert:', result[0]);
    return result;
  }

  async markAlertAsRead(id: number, userId?: number): Promise<Alert | undefined> {
    const [alert] = await db
      .update(alerts)
      .set({ 
        isRead: true,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(alerts.id, id))
      .returning();
    return alert;
  }

  async acknowledgeAlert(id: number, userId: number): Promise<Alert | undefined> {
    const [alert] = await db
      .update(alerts)
      .set({ 
        isAcknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(alerts.id, id))
      .returning();
    return alert;
  }

  async deleteAlert(id: number): Promise<boolean> {
    const result = await db.delete(alerts).where(eq(alerts.id, id));
    return Array.isArray(result) ? result.length > 0 : true;
  }

  async deleteExpiredAlerts(): Promise<number> {
    const result = await db
      .delete(alerts)
      .where(
        and(
          sql`${alerts.expiresAt} IS NOT NULL`,
          sql`${alerts.expiresAt} < CURRENT_TIMESTAMP`
        )
      );
    return Array.isArray(result) ? result.length : 0;
  }

  // Alert Rules Methods
  async createAlertRule(insertRule: InsertAlertRule): Promise<AlertRule> {
    const [rule] = await db.insert(alertRules).values(insertRule).returning();
    return rule;
  }

  async getAlertRule(id: number): Promise<AlertRule | undefined> {
    const result = await db.select().from(alertRules).where(eq(alertRules.id, id));
    return result[0];
  }

  async getAllAlertRules(): Promise<AlertRule[]> {
    return await db
      .select()
      .from(alertRules)
      .orderBy(alertRules.priority, desc(alertRules.createdAt));
  }

  async getActiveAlertRules(): Promise<AlertRule[]> {
    return await db
      .select()
      .from(alertRules)
      .where(eq(alertRules.isActive, true))
      .orderBy(alertRules.priority, desc(alertRules.createdAt));
  }

  async updateAlertRule(id: number, updates: Partial<AlertRule>): Promise<AlertRule | undefined> {
    const [rule] = await db
      .update(alertRules)
      .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(alertRules.id, id))
      .returning();
    return rule;
  }

  async deleteAlertRule(id: number): Promise<boolean> {
    const result = await db.delete(alertRules).where(eq(alertRules.id, id));
    return Array.isArray(result) ? result.length > 0 : true;
  }

  async incrementRuleTriggerCount(id: number): Promise<void> {
    await db
      .update(alertRules)
      .set({ 
        triggerCount: sql`${alertRules.triggerCount} + 1`,
        lastTriggered: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(alertRules.id, id));
  }

  // User Alert Preferences Methods
  async getUserAlertPreferences(userId: number): Promise<UserAlertPreferences[]> {
    return await db
      .select()
      .from(userAlertPreferences)
      .where(eq(userAlertPreferences.userId, userId));
  }

  async updateUserAlertPreferences(userId: number, alertType: string, preferences: Partial<UserAlertPreferences>): Promise<UserAlertPreferences> {
    // Try to update existing preference
    const [existing] = await db
      .update(userAlertPreferences)
      .set({ ...preferences, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(
        eq(userAlertPreferences.userId, userId),
        eq(userAlertPreferences.alertType, alertType)
      ))
      .returning();

    if (existing) {
      return existing;
    }

    // Create new preference if none exists
    const [newPreference] = await db
      .insert(userAlertPreferences)
      .values({
        userId,
        alertType,
        ...preferences
      })
      .returning();

    return newPreference;
  }

  async createUserAlertPreferences(insertPreferences: InsertUserAlertPreferences): Promise<UserAlertPreferences> {
    const [preferences] = await db
      .insert(userAlertPreferences)
      .values(insertPreferences)
      .returning();
    return preferences;
  }

  // Unit Tags
  async createUnitTag(tag: InsertUnitTag): Promise<UnitTag> {
    const [unitTag] = await db
      .insert(unitTags)
      .values(tag)
      .returning();
    return unitTag;
  }

  async getUnitTag(id: number): Promise<UnitTag | undefined> {
    const [unitTag] = await db
      .select()
      .from(unitTags)
      .where(eq(unitTags.id, id));
    return unitTag;
  }

  async getAllUnitTags(): Promise<UnitTag[]> {
    return await db
      .select()
      .from(unitTags)
      .orderBy(unitTags.displayName);
  }

  async getActiveUnitTags(): Promise<UnitTag[]> {
    return await db
      .select()
      .from(unitTags)
      .where(eq(unitTags.isActive, true))
      .orderBy(unitTags.displayName);
  }

  async updateUnitTag(id: number, updates: Partial<UnitTag>): Promise<UnitTag | undefined> {
    const [updated] = await db
      .update(unitTags)
      .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(unitTags.id, id))
      .returning();
    return updated;
  }

  async deleteUnitTag(id: number): Promise<boolean> {
    const result = await db
      .delete(unitTags)
      .where(eq(unitTags.id, id));
    return result.rowCount > 0;
  }

  // Call Unit Tags
  async addUnitsToCall(callId: number, unitIds: number[]): Promise<void> {
    if (unitIds.length === 0) return;

    const values = unitIds.map(unitId => ({
      callId,
      unitTagId: unitId
    }));

    await db
      .insert(callUnitTags)
      .values(values)
      .onConflictDoNothing(); // Ignore duplicates
  }

  async removeUnitsFromCall(callId: number, unitIds: number[]): Promise<void> {
    if (unitIds.length === 0) return;

    await db
      .delete(callUnitTags)
      .where(and(
        eq(callUnitTags.callId, callId),
        inArray(callUnitTags.unitTagId, unitIds)
      ));
  }

  async getCallUnits(callId: number): Promise<UnitTag[]> {
    const results = await db
      .select({
        unitTag: unitTags
      })
      .from(callUnitTags)
      .innerJoin(unitTags, eq(callUnitTags.unitTagId, unitTags.id))
      .where(eq(callUnitTags.callId, callId));

    return results.map(r => r.unitTag);
  }

  async getBatchCallUnits(callIds: number[]): Promise<Record<number, UnitTag[]>> {
    if (callIds.length === 0) return {};

    const results = await db
      .select({
        callId: callUnitTags.callId,
        unitTag: unitTags
      })
      .from(callUnitTags)
      .innerJoin(unitTags, eq(callUnitTags.unitTagId, unitTags.id))
      .where(inArray(callUnitTags.callId, callIds));

    // Group results by callId
    const unitsMap: Record<number, UnitTag[]> = {};
    
    // Initialize all callIds with empty arrays
    callIds.forEach(callId => {
      unitsMap[callId] = [];
    });

    // Populate with actual results
    results.forEach(result => {
      unitsMap[result.callId].push(result.unitTag);
    });

    return unitsMap;
  }

  async getCallsByUnit(unitId: number): Promise<Call[]> {
    const results = await db
      .select({
        call: calls
      })
      .from(callUnitTags)
      .innerJoin(calls, eq(callUnitTags.callId, calls.id))
      .where(eq(callUnitTags.unitTagId, unitId))
      .orderBy(desc(calls.timestamp));

    return results.map(r => r.call);
  }

  // Incident Methods
  async createIncident(insertIncident: InsertIncident): Promise<Incident> {
    const [newIncident] = await db.insert(incidents).values(insertIncident).returning();
    return newIncident;
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    const [incident] = await db.select().from(incidents).where(eq(incidents.id, id));
    return incident;
  }

  async getIncidentsByUnit(unitId: string): Promise<Incident[]> {
    return db.select()
      .from(incidents)
      .where(eq(incidents.unitId, unitId))
      .orderBy(desc(incidents.dispatchTime));
  }

  async getActiveIncidents(): Promise<Incident[]> {
    return db.select()
      .from(incidents)
      .where(notInArray(incidents.status, ['completed', 'archived']))
      .orderBy(desc(incidents.dispatchTime));
  }

  async updateIncident(id: number, updates: Partial<Incident>): Promise<Incident | undefined> {
    const cleanedUpdates = { ...updates };
    delete cleanedUpdates.id;
    delete cleanedUpdates.createdAt;
    
    const [updatedIncident] = await db.update(incidents)
      .set({
        ...cleanedUpdates,
        updatedAt: new Date()
      })
      .where(eq(incidents.id, id))
      .returning();
    
    return updatedIncident;
  }

  async deleteIncident(id: number): Promise<boolean> {
    const result = await db.delete(incidents).where(eq(incidents.id, id));
    return !!result;
  }

  async getIncidentByDispatchCall(callId: number): Promise<Incident | undefined> {
    const [incident] = await db.select()
      .from(incidents)
      .where(eq(incidents.transcriptDispatchId, callId));
    return incident;
  }

  async getIncidentByHospitalCall(hospitalCallId: number): Promise<Incident | undefined> {
    const [incident] = await db.select()
      .from(incidents)
      .where(eq(incidents.transcriptHospitalId, hospitalCallId));
    return incident;
  }

  async getIncidentsByTimeRange(startTime: Date, endTime: Date): Promise<Incident[]> {
    return db.select()
      .from(incidents)
      .where(
        and(
          gte(incidents.dispatchTime, startTime),
          lte(incidents.dispatchTime, endTime)
        )
      )
      .orderBy(desc(incidents.dispatchTime));
  }
}
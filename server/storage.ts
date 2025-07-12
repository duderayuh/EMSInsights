import { 
  calls, audioSegments, callStats, systemHealth, users, hospitalCalls, hospitalCallSegments,
  alerts, alertRules, userAlertPreferences, unitTags, callUnitTags, incidents,
  type Call, type InsertCall, type AudioSegment, type InsertAudioSegment,
  type CallStats, type InsertCallStats, type SystemHealth, type InsertSystemHealth,
  type User, type InsertUser, type HospitalCall, type InsertHospitalCall,
  type HospitalCallSegment, type InsertHospitalCallSegment, CallStatus,
  type Alert, type InsertAlert, type AlertRule, type InsertAlertRule,
  type UserAlertPreferences, type InsertUserAlertPreferences,
  type UnitTag, type InsertUnitTag, type CallUnitTag, type InsertCallUnitTag,
  type Incident, type InsertIncident
} from '@shared/schema';
import { eq, desc, like, and, gte, lte, sql } from 'drizzle-orm';

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;

  // Calls
  createCall(call: InsertCall): Promise<Call>;
  getCall(id: number): Promise<Call | undefined>;
  getRecentCalls(limit: number): Promise<Call[]>;
  getActiveCalls(): Promise<Call[]>;
  updateCallStatus(id: number, status: string): Promise<Call | undefined>;
  updateCall(id: number, updates: Partial<Call>): Promise<Call | undefined>;
  updateCallByAudioSegmentId(audioSegmentId: string, updates: Partial<Call>): Promise<Call | undefined>;
  getCallByAudioSegmentId(audioSegmentId: string): Promise<Call | undefined>;
  deleteCall(id: number): Promise<boolean>;
  searchCalls(params: SearchParams): Promise<Call[]>;

  // Audio Segments
  createAudioSegment(segment: InsertAudioSegment): Promise<AudioSegment>;
  getAudioSegment(id: string): Promise<AudioSegment | undefined>;
  updateAudioSegment(id: string, updates: Partial<AudioSegment>): Promise<AudioSegment | undefined>;
  getUnprocessedSegments(): Promise<AudioSegment[]>;

  // Stats
  createCallStats(stats: InsertCallStats): Promise<CallStats>;
  getCurrentStats(): Promise<any>;
  getStatsForPeriod(startDate: Date, endDate: Date): Promise<CallStats[]>;

  // System Health
  updateSystemHealth(health: InsertSystemHealth): Promise<SystemHealth>;
  getSystemHealth(): Promise<SystemHealth[]>;

  // Hospital Calls
  createHospitalCall(call: InsertHospitalCall): Promise<HospitalCall>;
  getHospitalCall(id: number): Promise<HospitalCall | undefined>;
  getHospitalCalls(limit?: number, hospitalFilter?: string, offset?: number, search?: string, sorOnly?: boolean): Promise<HospitalCall[]>;
  getHospitalCallsCount(hospitalFilter?: string, search?: string, sorOnly?: boolean): Promise<number>;
  updateHospitalCall(id: number, updates: Partial<HospitalCall>): Promise<HospitalCall | undefined>;
  deleteHospitalCall(id: number): Promise<boolean>;
  
  // Hospital Call Segments
  createHospitalCallSegment(segment: InsertHospitalCallSegment): Promise<HospitalCallSegment>;
  getHospitalCallSegments(hospitalCallId: number): Promise<HospitalCallSegment[]>;
  getHospitalCallSegmentById(id: number): Promise<HospitalCallSegment | undefined>;
  updateHospitalCallSegment(id: number, updates: Partial<HospitalCallSegment>): Promise<HospitalCallSegment | undefined>;
  getUnlinkedSegments(): Promise<HospitalCallSegment[]>;

  // Alert Management
  createAlert(alert: InsertAlert): Promise<Alert>;
  getAlert(id: number): Promise<Alert | undefined>;
  getAllAlerts(limit?: number, userId?: number): Promise<Alert[]>;
  getUnreadAlerts(userId?: number): Promise<Alert[]>;
  markAlertAsRead(id: number, userId?: number): Promise<Alert | undefined>;
  acknowledgeAlert(id: number, userId: number): Promise<Alert | undefined>;
  deleteAlert(id: number): Promise<boolean>;
  deleteExpiredAlerts(): Promise<number>;

  // Alert Rules
  createAlertRule(rule: InsertAlertRule): Promise<AlertRule>;
  getAlertRule(id: number): Promise<AlertRule | undefined>;
  getAllAlertRules(): Promise<AlertRule[]>;
  getActiveAlertRules(): Promise<AlertRule[]>;
  updateAlertRule(id: number, updates: Partial<AlertRule>): Promise<AlertRule | undefined>;
  deleteAlertRule(id: number): Promise<boolean>;
  incrementRuleTriggerCount(id: number): Promise<void>;

  // User Alert Preferences
  getUserAlertPreferences(userId: number): Promise<UserAlertPreferences[]>;
  updateUserAlertPreferences(userId: number, alertType: string, preferences: Partial<UserAlertPreferences>): Promise<UserAlertPreferences>;
  createUserAlertPreferences(preferences: InsertUserAlertPreferences): Promise<UserAlertPreferences>;

  // Unit Tags
  createUnitTag(tag: InsertUnitTag): Promise<UnitTag>;
  getUnitTag(id: number): Promise<UnitTag | undefined>;
  getAllUnitTags(): Promise<UnitTag[]>;
  getActiveUnitTags(): Promise<UnitTag[]>;
  updateUnitTag(id: number, updates: Partial<UnitTag>): Promise<UnitTag | undefined>;
  deleteUnitTag(id: number): Promise<boolean>;
  
  // Call Unit Tags
  addUnitsToCall(callId: number, unitIds: number[]): Promise<void>;
  removeUnitsFromCall(callId: number, unitIds: number[]): Promise<void>;
  getCallUnits(callId: number): Promise<UnitTag[]>;
  getBatchCallUnits(callIds: number[]): Promise<Record<number, UnitTag[]>>;
  getCallsByUnit(unitId: number): Promise<Call[]>;

  // Incidents
  createIncident(incident: InsertIncident): Promise<Incident>;
  getIncident(id: number): Promise<Incident | undefined>;
  getIncidentsByUnit(unitId: string): Promise<Incident[]>;
  getActiveIncidents(): Promise<Incident[]>;
  updateIncident(id: number, updates: Partial<Incident>): Promise<Incident | undefined>;
  deleteIncident(id: number): Promise<boolean>;
  getIncidentByDispatchCall(callId: number): Promise<Incident | undefined>;
  getIncidentByHospitalCall(hospitalCallId: number): Promise<Incident | undefined>;
  getIncidentsByTimeRange(startTime: Date, endTime: Date): Promise<Incident[]>;
}

interface SearchParams {
  query?: string;
  priority?: string;
  callType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private callsMap: Map<number, Call> = new Map();
  private audioSegmentsMap: Map<string, AudioSegment> = new Map();
  private callStatsMap: Map<number, CallStats> = new Map();
  private systemHealthMap: Map<string, SystemHealth> = new Map();
  
  private userIdCounter = 1;
  private callIdCounter = 1;
  private statsIdCounter = 1;
  private healthIdCounter = 1;

  constructor() {
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    // Initialize system health
    this.updateSystemHealth({
      component: 'audio_processor',
      status: 'healthy',
      metadata: { active: true }
    });
    
    this.updateSystemHealth({
      component: 'transcription_service',
      status: 'healthy',
      metadata: { model: 'whisper-base' }
    });
    
    this.updateSystemHealth({
      component: 'nlp_classifier',
      status: 'healthy',
      metadata: { keywords_loaded: true }
    });

    // Add sample emergency calls for demo
    const sampleCalls = [
      {
        audioSegmentId: 'sample-1',
        transcript: 'Emergency call: unconscious patient at 2501 North Meridian Street, Indianapolis. Patient is unresponsive and not breathing. CPR in progress.',
        confidence: 0.92,
        startMs: 0,
        endMs: 15000,
        callType: 'Medical Emergency',
        location: '2501 N Meridian St, Indianapolis, IN',
        latitude: 39.7868,
        longitude: -86.1562,
        keywords: ['unconscious', 'not breathing', 'cpr'],
        embedding: '[]',
        urgencyScore: 0.95,
        metadata: { typeScores: { medical: 3 }, keywordCount: 3 },
        status: CallStatus.ACTIVE
      },
      {
        audioSegmentId: 'sample-2',
        transcript: 'Motor vehicle collision at I-465 and Keystone Avenue. Multiple vehicles involved, possible entrapment. Fire and EMS requested.',
        confidence: 0.88,
        startMs: 0,
        endMs: 12000,
        callType: 'Trauma/MVC',
        location: 'I-465 & Keystone Ave, Indianapolis, IN',
        latitude: 39.8403,
        longitude: -86.1378,
        keywords: ['motor vehicle', 'collision', 'entrapment'],
        embedding: '[]',
        urgencyScore: 0.75,
        metadata: { typeScores: { trauma: 3 }, keywordCount: 3 },
        status: CallStatus.ACTIVE
      },
      {
        audioSegmentId: 'sample-3',
        transcript: 'Chest pain call at 1234 Main Street. 65-year-old male with severe chest pain radiating to left arm. Patient conscious and alert.',
        confidence: 0.89,
        startMs: 0,
        endMs: 18000,
        callType: 'Medical Emergency',
        location: '1234 Main St, Indianapolis, IN',
        latitude: 39.7684,
        longitude: -86.1581,
        keywords: ['chest pain', 'radiating'],
        embedding: '[]',
        urgencyScore: 0.6,
        metadata: { typeScores: { medical: 2 }, keywordCount: 2 },
        status: CallStatus.ACTIVE
      }
    ];

    // Create sample calls
    sampleCalls.forEach(callData => {
      this.createCall(callData);
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      id: this.userIdCounter++,
      isActive: true,
      lastLogin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...insertUser
    };
    this.users.set(user.id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values()).sort((a, b) => 
      (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  // Call methods
  async createCall(insertCall: InsertCall): Promise<Call> {
    const call: Call = {
      id: this.callIdCounter++,
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
      status: CallStatus.ACTIVE,
      priority: null,
      callType: null,
      location: null,
      latitude: null,
      longitude: null,
      keywords: null,
      embedding: null,
      urgencyScore: null,
      ...insertCall
    };
    this.callsMap.set(call.id, call);
    return call;
  }

  async getCall(id: number): Promise<Call | undefined> {
    return this.callsMap.get(id);
  }

  async getRecentCalls(limit: number): Promise<Call[]> {
    return Array.from(this.callsMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getActiveCalls(): Promise<Call[]> {
    return Array.from(this.callsMap.values())
      .filter(call => call.status === CallStatus.ACTIVE)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async updateCallStatus(id: number, status: string): Promise<Call | undefined> {
    const call = this.callsMap.get(id);
    if (call) {
      call.status = status;
      call.updatedAt = new Date();
      this.callsMap.set(id, call);
    }
    return call;
  }

  async updateCall(id: number, updates: Partial<Call>): Promise<Call | undefined> {
    const call = this.callsMap.get(id);
    if (call) {
      Object.assign(call, updates);
      call.updatedAt = new Date();
      this.callsMap.set(id, call);
    }
    return call;
  }

  async updateCallByAudioSegmentId(audioSegmentId: string, updates: Partial<Call>): Promise<Call | undefined> {
    for (const [id, call] of this.callsMap) {
      if (call.audioSegmentId === audioSegmentId) {
        Object.assign(call, updates);
        call.updatedAt = new Date();
        this.callsMap.set(id, call);
        return call;
      }
    }
    return undefined;
  }

  async searchCalls(params: SearchParams): Promise<Call[]> {
    let results = Array.from(this.callsMap.values());

    if (params.query) {
      const query = params.query.toLowerCase();
      results = results.filter(call => 
        call.transcript.toLowerCase().includes(query) ||
        call.callType?.toLowerCase().includes(query) ||
        call.location?.toLowerCase().includes(query)
      );
    }

    if (params.priority) {
      results = results.filter(call => call.priority === params.priority);
    }

    if (params.callType) {
      results = results.filter(call => call.callType === params.callType);
    }

    if (params.dateFrom) {
      results = results.filter(call => new Date(call.timestamp) >= params.dateFrom!);
    }

    if (params.dateTo) {
      results = results.filter(call => new Date(call.timestamp) <= params.dateTo!);
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return results.slice(0, params.limit || 50);
  }

  // Audio Segment methods
  async createAudioSegment(insertSegment: InsertAudioSegment): Promise<AudioSegment> {
    const segment: AudioSegment = {
      createdAt: new Date(),
      timestamp: new Date(),
      processed: false,
      ...insertSegment
    };
    this.audioSegmentsMap.set(segment.id, segment);
    return segment;
  }

  async getAudioSegment(id: string): Promise<AudioSegment | undefined> {
    return this.audioSegmentsMap.get(id);
  }

  async updateAudioSegment(id: string, updates: Partial<AudioSegment>): Promise<AudioSegment | undefined> {
    const segment = this.audioSegmentsMap.get(id);
    if (segment) {
      Object.assign(segment, updates);
      this.audioSegmentsMap.set(id, segment);
    }
    return segment;
  }

  async getUnprocessedSegments(): Promise<AudioSegment[]> {
    return Array.from(this.audioSegmentsMap.values())
      .filter(segment => !segment.processed)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Stats methods
  async createCallStats(insertStats: InsertCallStats): Promise<CallStats> {
    const stats: CallStats = {
      id: this.statsIdCounter++,
      createdAt: new Date(),
      avgResponseTime: null,
      anomalyScore: null,
      ...insertStats
    };
    this.callStatsMap.set(stats.id, stats);
    return stats;
  }

  async getCurrentStats(): Promise<any> {
    const activeCalls = await this.getActiveCalls();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysCalls = Array.from(this.callsMap.values())
      .filter(call => new Date(call.timestamp) >= today);

    const priorityCounts = {
      echo: 0,
      delta: 0,
      charlie: 0,
      bravo: 0,
      alpha: 0
    };

    return {
      totalCalls: this.callsMap.size,
      activeCalls: activeCalls.length,
      todayTotal: todaysCalls.length,
      activeEmergency: priorityCounts.echo,
      activeHigh: priorityCounts.delta,
      avgResponse: 6.2, // Mock average response time
      priorityCounts,
      callTypes: this.getCallTypeDistribution(todaysCalls)
    };
  }

  async getStatsForPeriod(startDate: Date, endDate: Date): Promise<CallStats[]> {
    return Array.from(this.callStatsMap.values())
      .filter(stats => stats.date >= startDate && stats.date <= endDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
    const health: SystemHealth = {
      id: this.healthIdCounter++,
      lastCheck: new Date(),
      metadata: null,
      ...insertHealth
    };
    this.systemHealthMap.set(health.component, health);
    return health;
  }

  async getSystemHealth(): Promise<SystemHealth[]> {
    return Array.from(this.systemHealthMap.values());
  }

  // Hospital Calls methods (stub implementations for MemStorage)
  async createHospitalCall(call: InsertHospitalCall): Promise<HospitalCall> {
    throw new Error("Hospital calls not supported in MemStorage");
  }

  async getHospitalCall(id: number): Promise<HospitalCall | undefined> {
    return undefined;
  }

  async getHospitalCalls(limit?: number, hospitalFilter?: string): Promise<HospitalCall[]> {
    return [];
  }

  async updateHospitalCall(id: number, updates: Partial<HospitalCall>): Promise<HospitalCall | undefined> {
    return undefined;
  }

  async deleteHospitalCall(id: number): Promise<boolean> {
    return false;
  }

  async createHospitalCallSegment(segment: InsertHospitalCallSegment): Promise<HospitalCallSegment> {
    throw new Error("Hospital call segments not supported in MemStorage");
  }

  async getHospitalCallSegments(hospitalCallId: number): Promise<HospitalCallSegment[]> {
    return [];
  }

  async getHospitalCallSegmentById(id: number): Promise<HospitalCallSegment | undefined> {
    return undefined;
  }

  async getHospitalCallSegmentByAudioId(audioSegmentId: string): Promise<HospitalCallSegment | undefined> {
    return undefined;
  }

  async updateHospitalCallSegment(id: number, updates: Partial<HospitalCallSegment>): Promise<HospitalCallSegment | undefined> {
    return undefined;
  }

  async getUnlinkedSegments(): Promise<HospitalCallSegment[]> {
    return [];
  }

  // Alert Management methods (stub implementations for MemStorage)
  async createAlert(alert: InsertAlert): Promise<Alert> {
    throw new Error("Alerts not supported in MemStorage");
  }

  async getAlert(id: number): Promise<Alert | undefined> {
    return undefined;
  }

  async getAllAlerts(limit?: number, userId?: number): Promise<Alert[]> {
    return [];
  }

  async getUnreadAlerts(userId?: number): Promise<Alert[]> {
    return [];
  }

  async markAlertAsRead(id: number, userId?: number): Promise<Alert | undefined> {
    return undefined;
  }

  async acknowledgeAlert(id: number, userId: number): Promise<Alert | undefined> {
    return undefined;
  }

  async deleteAlert(id: number): Promise<boolean> {
    return false;
  }

  async deleteExpiredAlerts(): Promise<number> {
    return 0;
  }

  // Alert Rules
  async createAlertRule(rule: InsertAlertRule): Promise<AlertRule> {
    throw new Error("Alert rules not supported in MemStorage");
  }

  async getAlertRule(id: number): Promise<AlertRule | undefined> {
    return undefined;
  }

  async getAllAlertRules(): Promise<AlertRule[]> {
    return [];
  }

  async getActiveAlertRules(): Promise<AlertRule[]> {
    return [];
  }

  async updateAlertRule(id: number, updates: Partial<AlertRule>): Promise<AlertRule | undefined> {
    return undefined;
  }

  async deleteAlertRule(id: number): Promise<boolean> {
    return false;
  }

  async incrementRuleTriggerCount(id: number): Promise<void> {
    // No-op
  }

  // User Alert Preferences
  async getUserAlertPreferences(userId: number): Promise<UserAlertPreferences[]> {
    return [];
  }

  async updateUserAlertPreferences(userId: number, alertType: string, preferences: Partial<UserAlertPreferences>): Promise<UserAlertPreferences> {
    throw new Error("User alert preferences not supported in MemStorage");
  }

  async createUserAlertPreferences(preferences: InsertUserAlertPreferences): Promise<UserAlertPreferences> {
    throw new Error("User alert preferences not supported in MemStorage");
  }

  // Unit Tags
  async createUnitTag(tag: InsertUnitTag): Promise<UnitTag> {
    throw new Error("Unit tags not supported in MemStorage");
  }

  async getUnitTag(id: number): Promise<UnitTag | undefined> {
    return undefined;
  }

  async getAllUnitTags(): Promise<UnitTag[]> {
    return [];
  }

  async getActiveUnitTags(): Promise<UnitTag[]> {
    return [];
  }

  async updateUnitTag(id: number, updates: Partial<UnitTag>): Promise<UnitTag | undefined> {
    return undefined;
  }

  async deleteUnitTag(id: number): Promise<boolean> {
    return false;
  }

  // Call Unit Tags
  async addUnitsToCall(callId: number, unitIds: number[]): Promise<void> {
    // No-op
  }

  async removeUnitsFromCall(callId: number, unitIds: number[]): Promise<void> {
    // No-op
  }

  async getCallUnits(callId: number): Promise<UnitTag[]> {
    return [];
  }

  async getBatchCallUnits(callIds: number[]): Promise<Record<number, UnitTag[]>> {
    const result: Record<number, UnitTag[]> = {};
    callIds.forEach(callId => {
      result[callId] = [];
    });
    return result;
  }

  async getCallsByUnit(unitId: number): Promise<Call[]> {
    return [];
  }
}

import { DatabaseStorage } from './database-storage';

export const storage = new DatabaseStorage();

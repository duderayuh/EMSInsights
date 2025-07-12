import { pgTable, text, serial, integer, boolean, timestamp, real, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").default("user").notNull(), // 'super_admin', 'hospital_admin', or 'user'
  isActive: boolean("is_active").default(true).notNull(),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  audioSegmentId: text("audio_segment_id").notNull(),
  transcript: text("transcript").default(""),
  confidence: real("confidence").default(0),
  startMs: integer("start_ms").default(0),
  endMs: integer("end_ms").default(0),
  callType: text("call_type"),
  priority: text("priority"), // Alpha, Bravo, Charlie, Delta, Echo
  location: text("location"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  keywords: text("keywords").array(),
  embedding: text("embedding"), // JSON string of vector embedding
  urgencyScore: real("urgency_score"),
  metadata: jsonb("metadata"), // Additional AI analysis data
  status: text("status").default("active"), // active, cleared, archived
  // Rdio Scanner specific fields
  talkgroup: text("talkgroup"),
  system: text("system"),
  frequency: real("frequency"),
  duration: real("duration"),
  radioTimestamp: timestamp("radio_timestamp"), // Original radio transmission time
  voiceType: text("voice_type"), // "automated_voice" or "human_voice"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const audioSegments = pgTable("audio_segments", {
  id: text("id").primaryKey(),
  filepath: text("filepath").notNull(),
  duration: real("duration").notNull(),
  sampleRate: integer("sample_rate").notNull(),
  channels: integer("channels").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").defaultNow()
});

export const callStats = pgTable("call_stats", {
  id: serial("id").primaryKey(),
  date: timestamp("date").notNull(),
  totalCalls: integer("total_calls").notNull(),
  callsByPriority: jsonb("calls_by_priority").notNull(),
  callsByType: jsonb("calls_by_type").notNull(),
  avgResponseTime: real("avg_response_time"),
  anomalyScore: real("anomaly_score"),
  createdAt: timestamp("created_at").defaultNow()
});

export const systemHealth = pgTable("system_health", {
  id: serial("id").primaryKey(),
  component: text("component").notNull(),
  status: text("status").notNull(), // healthy, warning, error
  lastCheck: timestamp("last_check").defaultNow(),
  metadata: jsonb("metadata")
});

// Sessions table for user authentication
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Hospital communications table for EMS-to-Hospital calls
export const hospitalCalls = pgTable("hospital_calls", {
  id: serial("id").primaryKey(),
  conversationId: text("conversation_id").notNull(), // Groups related audio segments
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  talkgroup: text("talkgroup").notNull(), // e.g., "10256" for IU Methodist Hospital
  system: text("system").notNull(),
  hospitalName: text("hospital_name"), // e.g., "Methodist", "Riley", "Eskenazi"
  status: text("status").default("active"), // active, completed, archived
  mergedAudioPath: text("merged_audio_path"), // Path to merged audio file
  sorPhysician: text("sor_physician"), // Physician name if SOR identified
  sorDetected: boolean("sor_detected").default(false),
  totalSegments: integer("total_segments").default(0),
  conversationAnalysis: jsonb("conversation_analysis"), // Anthropic-analyzed conversation
  analysisCompletedAt: timestamp("analysis_completed_at"), // When analysis was completed
  voiceType: text("voice_type"), // "automated_voice" or "human_voice"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Hospital name constants
export const HospitalNames = {
  METHODIST: "Methodist",
  RILEY: "Riley",
  ESKENAZI: "Eskenazi"
} as const;

// Individual audio segments within a hospital call conversation
export const hospitalCallSegments = pgTable("hospital_call_segments", {
  id: serial("id").primaryKey(),
  hospitalCallId: integer("hospital_call_id").references(() => hospitalCalls.id, { onDelete: "cascade" }).notNull(),
  audioSegmentId: text("audio_segment_id").notNull(), // Links to original audio segment
  sequenceNumber: integer("sequence_number").notNull(), // Order in conversation
  timestamp: timestamp("timestamp").notNull(),
  transcript: text("transcript").default(""),
  confidence: real("confidence").default(0),
  speakerType: text("speaker_type"), // 'ems' or 'hospital'
  speakerIdentity: text("speaker_identity"), // Specific person if identified
  duration: real("duration").default(0),
  voiceType: text("voice_type"), // "automated_voice" or "human_voice"
  metadata: jsonb("metadata"), // Additional segment-specific data
  createdAt: timestamp("created_at").defaultNow()
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  firstName: true,
  lastName: true,
  role: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertAudioSegmentSchema = createInsertSchema(audioSegments).omit({
  createdAt: true
});

export const insertCallStatsSchema = createInsertSchema(callStats).omit({
  id: true,
  createdAt: true
});

export const insertSystemHealthSchema = createInsertSchema(systemHealth).omit({
  id: true,
  lastCheck: true
});

export const insertHospitalCallSchema = createInsertSchema(hospitalCalls).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertHospitalCallSegmentSchema = createInsertSchema(hospitalCallSegments).omit({
  id: true,
  createdAt: true
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type LoginCredentials = z.infer<typeof loginSchema>;

export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;

export type InsertAudioSegment = z.infer<typeof insertAudioSegmentSchema>;
export type AudioSegment = typeof audioSegments.$inferSelect;

export type InsertCallStats = z.infer<typeof insertCallStatsSchema>;
export type CallStats = typeof callStats.$inferSelect;

export type InsertSystemHealth = z.infer<typeof insertSystemHealthSchema>;
export type SystemHealth = typeof systemHealth.$inferSelect;

export type InsertHospitalCall = z.infer<typeof insertHospitalCallSchema>;
export type HospitalCall = typeof hospitalCalls.$inferSelect;

export type InsertHospitalCallSegment = z.infer<typeof insertHospitalCallSegmentSchema>;
export type HospitalCallSegment = typeof hospitalCallSegments.$inferSelect;

// Enums

export const CallStatus = {
  ACTIVE: "active",
  CLEARED: "cleared",
  ARCHIVED: "archived"
} as const;

export const SystemStatus = {
  HEALTHY: "healthy",
  WARNING: "warning",
  ERROR: "error"
} as const;

export type CallStatusType = typeof CallStatus[keyof typeof CallStatus];
export type SystemStatusType = typeof SystemStatus[keyof typeof SystemStatus];

// Settings and Customization Tables
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  description: text("description"),
  category: text("category").notNull(), // 'branding', 'location', 'audio', 'api'
  dataType: text("data_type").default("text"), // 'text', 'number', 'boolean', 'json', 'file'
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id)
});

export const customHospitals = pgTable("custom_hospitals", {
  id: serial("id").primaryKey(),
  talkgroupId: text("talkgroup_id").notNull().unique(),
  hospitalName: text("hospital_name").notNull(),
  displayName: text("display_name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  phone: text("phone"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const customTalkgroups = pgTable("custom_talkgroups", {
  id: serial("id").primaryKey(),
  talkgroupId: text("talkgroup_id").notNull().unique(),
  systemName: text("system_name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  category: text("category"), // 'dispatch', 'fire', 'ems', 'police', 'admin', 'mutual_aid'
  color: text("color"), // hex color for UI display
  frequency: real("frequency"),
  isMonitored: boolean("is_monitored").default(true),
  priority: integer("priority").default(0), // for display ordering
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const transcriptionDictionary = pgTable("transcription_dictionary", {
  id: serial("id").primaryKey(),
  wrongWord: text("wrong_word").notNull(),
  correctWord: text("correct_word").notNull(),
  category: text("category"), // 'medical', 'location', 'unit', 'equipment', 'general'
  contextHint: text("context_hint"), // when this correction should apply
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  accuracy: real("accuracy").default(1.0), // track correction accuracy
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id)
});

// Unit Tags Table - for storing all emergency units
export const unitTags = pgTable("unit_tags", {
  id: serial("id").primaryKey(),
  unitType: text("unit_type").notNull(), // 'ambulance', 'ems', 'squad', 'engine'
  unitNumber: integer("unit_number").notNull(),
  displayName: text("display_name").notNull(), // e.g., "Ambulance 1", "Engine 23"
  color: text("color").notNull().default("#3B82F6"), // hex color for UI display
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id)
});

// Many-to-many relationship between calls and unit tags
export const callUnitTags = pgTable("call_unit_tags", {
  id: serial("id").primaryKey(),
  callId: integer("call_id").references(() => calls.id, { onDelete: "cascade" }).notNull(),
  unitTagId: integer("unit_tag_id").references(() => unitTags.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  uniqueCallUnit: unique().on(table.callId, table.unitTagId)
}));

// Create insert schemas
export const insertSystemSetting = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true
});

export const insertCustomHospital = createInsertSchema(customHospitals).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertCustomTalkgroup = createInsertSchema(customTalkgroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertTranscriptionDictionary = createInsertSchema(transcriptionDictionary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
  accuracy: true
});

export const insertUnitTag = createInsertSchema(unitTags).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertCallUnitTag = createInsertSchema(callUnitTags).omit({
  id: true,
  createdAt: true
});

// Types
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSetting>;
export type CustomHospital = typeof customHospitals.$inferSelect;
export type InsertCustomHospital = z.infer<typeof insertCustomHospital>;
export type CustomTalkgroup = typeof customTalkgroups.$inferSelect;
export type InsertCustomTalkgroup = z.infer<typeof insertCustomTalkgroup>;
export type TranscriptionDictionary = typeof transcriptionDictionary.$inferSelect;
export type InsertTranscriptionDictionary = z.infer<typeof insertTranscriptionDictionary>;
export type UnitTag = typeof unitTags.$inferSelect;
export type InsertUnitTag = z.infer<typeof insertUnitTag>;
export type CallUnitTag = typeof callUnitTags.$inferSelect;
export type InsertCallUnitTag = z.infer<typeof insertCallUnitTag>;

// Call Types Management
export const callTypes = pgTable("call_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  keywords: text("keywords").array().default([]),
  category: text("category"), // 'medical', 'fire', 'trauma', 'investigation', etc.
  color: text("color"), // For UI display
  icon: text("icon"), // Icon identifier for UI
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by")
});

export const insertCallType = createInsertSchema(callTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type CallType = typeof callTypes.$inferSelect;
export type InsertCallType = z.infer<typeof insertCallType>;

// Incidents table for tracking unit dispatch to hospital transport
export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  unitId: text("unit_id").notNull(), // e.g., "EMS 91", "Medic 23"
  dispatchTime: timestamp("dispatch_time").notNull(),
  location: text("location").notNull(), // incident location/address
  callType: text("call_type"), // e.g., "Cardiac Arrest", "MVC", "Trauma"
  
  // Hospital information
  inferredClosestHospital: text("inferred_closest_hospital"), // calculated closest hospital
  actualHospitalCalled: text("actual_hospital_called"), // from EMS-hospital communication
  
  // Transport timing
  transportStartTime: timestamp("transport_start_time"), // when unit called hospital
  etaGiven: integer("eta_given"), // ETA in minutes given by EMS
  etaEstimated: integer("eta_estimated"), // Google Maps estimated ETA in minutes
  etaVariance: integer("eta_variance"), // difference in minutes
  
  // Status tracking
  status: text("status").default("dispatched"), // 'dispatched', 'en_route', 'arrived', 'arriving_shortly', 'completed'
  matchStatus: text("match_status"), // 'matched', 'unmatched', 'manual'
  
  // Geographic data
  distanceKm: real("distance_km"), // distance to hospital in km
  travelTimeMin: real("travel_time_min"), // estimated travel time in minutes
  
  // Linked data
  transcriptDispatchId: integer("transcript_dispatch_id").references(() => calls.id),
  transcriptHospitalId: integer("transcript_hospital_id").references(() => hospitalCalls.id),
  
  // QI fields
  fullAiSummary: text("full_ai_summary"), // AI-generated incident summary
  editableNotes: text("editable_notes"), // QI team notes
  qiFlag: boolean("qi_flag").default(false), // marked for QI review
  qiResolution: text("qi_resolution"), // QI resolution notes
  
  // Metadata
  createdBy: integer("created_by").references(() => users.id),
  lastUpdatedBy: integer("last_updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertIncidentSchema = createInsertSchema(incidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;

// Alert & Notification System
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'critical', 'warning', 'info', 'anomaly', 'system'
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull(), // 'high', 'medium', 'low'
  category: text("category").notNull(), // 'incident', 'system', 'pattern', 'validation'
  relatedCallId: integer("related_call_id").references(() => calls.id),
  relatedData: jsonb("related_data"), // Additional context data
  isRead: boolean("is_read").default(false),
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedBy: integer("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  expiresAt: timestamp("expires_at"), // For temporary alerts
  soundEnabled: boolean("sound_enabled").default(false),
  visualHighlight: boolean("visual_highlight").default(false),
  autoAcknowledge: boolean("auto_acknowledge").default(false),
  metadata: jsonb("metadata"), // Additional alert-specific data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ruleType: text("rule_type").notNull(), // 'keyword', 'pattern', 'anomaly', 'threshold'
  conditions: jsonb("conditions").notNull(), // Rule conditions as JSON
  actions: jsonb("actions").notNull(), // Actions to take when triggered
  priority: integer("priority").default(1), // 1 = highest, 5 = lowest
  isActive: boolean("is_active").default(true),
  triggerCount: integer("trigger_count").default(0),
  lastTriggered: timestamp("last_triggered"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const userAlertPreferences = pgTable("user_alert_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  alertType: text("alert_type").notNull(),
  soundEnabled: boolean("sound_enabled").default(true),
  visualEnabled: boolean("visual_enabled").default(true),
  emailEnabled: boolean("email_enabled").default(false),
  pushEnabled: boolean("push_enabled").default(false),
  minSeverity: text("min_severity").default("medium"), // 'high', 'medium', 'low'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Create insert schemas for alert system
export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  triggerCount: true,
  lastTriggered: true
});

export const insertUserAlertPreferencesSchema = createInsertSchema(userAlertPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Alert system types
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export type UserAlertPreferences = typeof userAlertPreferences.$inferSelect;
export type InsertUserAlertPreferences = z.infer<typeof insertUserAlertPreferencesSchema>;

// Alert enums
export const AlertType = {
  CRITICAL: "critical",
  WARNING: "warning", 
  INFO: "info",
  ANOMALY: "anomaly",
  SYSTEM: "system"
} as const;

export const AlertSeverity = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
} as const;

export const AlertCategory = {
  INCIDENT: "incident",
  SYSTEM: "system",
  PATTERN: "pattern",
  VALIDATION: "validation"
} as const;

export type AlertTypeType = typeof AlertType[keyof typeof AlertType];
export type AlertSeverityType = typeof AlertSeverity[keyof typeof AlertSeverity];
export type AlertCategoryType = typeof AlertCategory[keyof typeof AlertCategory];

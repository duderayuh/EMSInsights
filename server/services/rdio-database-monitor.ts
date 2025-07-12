import { EventEmitter } from "events";
import { join } from "path";
import { writeFile } from "fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { storage } from "../storage";
import Database from "better-sqlite3";
import { hospitalCallDetector } from "./hospital-call-detector";
import { isHospitalTalkgroup } from "./hospital-talkgroup-mapping";
import { VoiceTypeClassifier } from "./voice-type-classifier";
import { unitExtractor } from "./unit-extractor";
import { incidentTracker } from "./incident-tracker";

interface RdioCall {
  id: number;
  audio: Buffer;
  audioName: string | null;
  audioType: string;
  dateTime: string;
  frequencies: string;
  frequency: number | null;
  patches: string;
  source: number | null;
  sources: string;
  system: number;
  talkgroup: number;
}

export class RdioDatabaseMonitor extends EventEmitter {
  private rdioDbPath: string;
  private ems_audioDir: string;
  private processedCallIds: Set<number> = new Set();
  private isMonitoring: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private lastScanTime: number = Date.now() - 24 * 60 * 60 * 1000; // Start from 24 hours ago to catch recent calls
  private targetTalkgroups: number[] = [10202, 10244, 10255, 10256, 10258]; // MESA emergency channels + hospital channels
  private targetSystems: number[] = [1]; // MESA system
  private db: Database.Database | null = null;
  private lastProcessedIdFile: string;

  constructor() {
    super();

    this.rdioDbPath = join(
      process.cwd(),
      "rdio-scanner-server/rdio-scanner.db",
    );
    this.ems_audioDir = join(process.cwd(), "ems_audio_processing");
    this.lastProcessedIdFile = join(process.cwd(), ".last-processed-rdio-id");

    this.ensureDirectories();
    this.loadLastProcessedId();
    console.log(`Rdio Database Monitor initialized:`);
    console.log(`  Database: ${this.rdioDbPath}`);
    console.log(`  Processing to: ${this.ems_audioDir}`);
    console.log(`  Target talkgroups: ${this.targetTalkgroups.join(", ")}`);
  }

  private ensureDirectories() {
    if (!existsSync(this.ems_audioDir)) {
      mkdirSync(this.ems_audioDir, { recursive: true });
    }
  }

  private loadLastProcessedId() {
    try {
      if (existsSync(this.lastProcessedIdFile)) {
        const content = readFileSync(this.lastProcessedIdFile, 'utf-8');
        const lastId = parseInt(content.trim(), 10);
        if (!isNaN(lastId) && lastId > 0) {
          // Load IDs from lastId - 100 to lastId to populate the set
          // This ensures we don't miss any calls that might have been processed
          // but not persisted due to a crash
          const startId = Math.max(1, lastId - 100);
          for (let id = startId; id <= lastId; id++) {
            this.processedCallIds.add(id);
          }
          console.log(`Loaded last processed ID: ${lastId} (populated ${startId} to ${lastId})`);
        }
      } else {
        console.log('No previous processed ID found, starting fresh');
      }
    } catch (error) {
      console.error('Error loading last processed ID:', error);
    }
  }

  private saveLastProcessedId() {
    try {
      const lastId = Math.max(...Array.from(this.processedCallIds), 0);
      if (lastId > 0) {
        writeFileSync(this.lastProcessedIdFile, lastId.toString(), 'utf-8');
      }
    } catch (error) {
      console.error('Error saving last processed ID:', error);
    }
  }

  private connectDatabase() {
    if (!existsSync(this.rdioDbPath)) {
      throw new Error(`Rdio Scanner database not found: ${this.rdioDbPath}`);
    }

    try {
      this.db = new Database(this.rdioDbPath, { readonly: true });
      console.log("Connected to Rdio Scanner database");
      return true;
    } catch (error) {
      console.error("Failed to connect to Rdio Scanner database:", error);
      return false;
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log("Database monitor already running");
      return;
    }

    if (!this.connectDatabase()) {
      throw new Error("Failed to connect to Rdio Scanner database");
    }

    this.isMonitoring = true;
    console.log("Starting Rdio Scanner database monitoring...");

    try {
      // Load existing call IDs to avoid reprocessing
      await this.loadProcessedCallIds();

      // Start periodic scanning for new calls
      this.scanInterval = setInterval(() => {
        this.scanForNewCalls();
      }, 10000); // Scan every 10 seconds

      // Initial scan
      await this.scanForNewCalls();

      this.emit("started");
      console.log("Rdio Scanner database monitoring started successfully");
    } catch (error) {
      console.error("Failed to start database monitoring:", error);
      this.isMonitoring = false;
      this.emit("error", error);
    }
  }

  async stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.emit("stopped");
    console.log("Rdio Scanner database monitoring stopped");
  }

  private async loadProcessedCallIds() {
    if (!this.db) return;

    try {
      // Get all existing call IDs from our database that were processed from Rdio Scanner
      const existingCalls = await storage.searchCalls({
        query: "",
        limit: 1000,
      });

      // Check what's actually available in the rdio-scanner database
      const maxRdioIdQuery = `SELECT MAX(id) as maxId FROM rdioScannerCalls`;
      const maxRdioResult = this.db.prepare(maxRdioIdQuery).get() as { maxId: number } | undefined;
      const maxRdioId = maxRdioResult?.maxId || 0;

      // Force reprocessing of recent calls (last 60) to address missing audio
      const reprocessThreshold = maxRdioId - 60;

      for (const call of existingCalls) {
        if (
          call.metadata &&
          typeof call.metadata === "object" &&
          "rdioCallId" in call.metadata
        ) {
          const rdioCallId = (call.metadata as any).rdioCallId;
          // Only add IDs that are still in the rdio-scanner database AND not in the recent range
          if (rdioCallId <= maxRdioId && rdioCallId < reprocessThreshold) {
            this.processedCallIds.add(rdioCallId);
          }
        }
      }

      console.log(
        `Loaded ${this.processedCallIds.size} previously processed call IDs (max rdio ID: ${maxRdioId})`,
      );
    } catch (error) {
      console.error("Error loading processed call IDs:", error);
    }
  }

  private async scanForNewCalls() {
    if (!this.db || !this.isMonitoring) return;

    try {
      // Query for new calls since last scan time, filtering by target talkgroups and systems
      const query = `
        SELECT id, audio, audioName, audioType, dateTime, frequencies, frequency, 
               patches, source, sources, system, talkgroup
        FROM rdioScannerCalls 
        WHERE system IN (${this.targetSystems.join(",")})
          AND talkgroup IN (${this.targetTalkgroups.join(",")})
          AND id > ?
        ORDER BY id ASC
        LIMIT 50
      `;

      // Use the last processed ID instead of timestamp for more reliable detection
      const lastProcessedId = Math.max(...Array.from(this.processedCallIds), 0);
      const stmt = this.db.prepare(query);
      const newCalls = stmt.all(lastProcessedId) as RdioCall[];

      console.log(
        `Found ${newCalls.length} new calls since last processed ID ${lastProcessedId}`,
      );

      // If no new calls, check for recent hospital calls that need processing
      if (newCalls.length === 0) {
        console.log(
          "No new calls found, checking for recent hospital calls...",
        );
        const hospitalQuery = `
          SELECT id, audio, audioName, audioType, dateTime, frequencies, frequency, 
                 patches, source, sources, system, talkgroup
          FROM rdioScannerCalls 
          WHERE system IN (${this.targetSystems.join(",")})
            AND talkgroup IN (10255, 10256, 10257, 10258, 10259, 10260, 10261, 10262, 10263)
            AND dateTime > datetime('now', '-2 hours')
          ORDER BY dateTime DESC
          LIMIT 5
        `;

        const hospitalStmt = this.db.prepare(hospitalQuery);
        const hospitalCalls = hospitalStmt.all() as RdioCall[];

        console.log(
          `Found ${hospitalCalls.length} recent hospital calls in last 2 hours`,
        );

        for (const call of hospitalCalls) {
          if (!this.processedCallIds.has(call.id)) {
            console.log(
              `Processing recent hospital call: ${call.id} on talkgroup ${call.talkgroup} from ${call.dateTime}`,
            );
            newCalls.push(call);
          }
        }
      }

      for (const call of newCalls) {
        if (this.processedCallIds.has(call.id)) {
          continue; // Already processed
        }

        try {
          await this.processAudioCall(call);
          this.processedCallIds.add(call.id);
          // Save progress after each successful processing
          this.saveLastProcessedId();
        } catch (error) {
          console.error(`Error processing call ${call.id}:`, error);
        }
      }

      this.lastScanTime = Date.now();
    } catch (error) {
      console.error("Error scanning for new calls:", error);
      this.emit("error", error);
    }
  }

  private async processAudioCall(call: RdioCall) {
    try {
      console.log(
        `Processing Rdio Scanner call: ${call.id} - TG:${call.talkgroup} - ${call.dateTime}`,
      );

      // Generate unique segment ID
      const segmentId = uuidv4();

      // Determine file extension based on audio type
      let extension = ".m4a";
      if (call.audioType === "audio/wav") extension = ".wav";
      else if (call.audioType === "audio/mp3") extension = ".mp3";
      else if (call.audioType === "audio/mp4" || call.audioType === "audio/aac")
        extension = ".m4a";

      const targetPath = join(this.ems_audioDir, `${segmentId}${extension}`);

      // Write audio data to file
      await writeFile(targetPath, call.audio);
      console.log(
        `Extracted audio file: ${targetPath} (${call.audio.length} bytes)`,
      );

      // Parse datetime
      const callDateTime = new Date(call.dateTime);
      
      // Get talkgroup string
      const talkgroupStr = call.talkgroup.toString();

      // Check if this is a hospital talkgroup for automatic hospital call creation  
      if (isHospitalTalkgroup(talkgroupStr)) {
        console.log(
          `Detected hospital call for talkgroup ${talkgroupStr}, creating hospital call record`,
        );

        try {
          const hospitalCallId =
            await hospitalCallDetector.detectAndCreateHospitalCall(
              talkgroupStr,
              segmentId,
              callDateTime,
              call.system.toString(),
              {
                rdioCallId: call.id,
                audioType: call.audioType,
                frequency: call.frequency,
                source: call.source,
                frequencies: call.frequencies,
                patches: call.patches,
                sources: call.sources,
              },
            );

          if (hospitalCallId) {
            console.log(
              `Hospital call ${hospitalCallId} created/updated for talkgroup ${talkgroupStr}`,
            );
          }
        } catch (error) {
          console.error(
            `Error creating hospital call for talkgroup ${talkgroupStr}:`,
            error,
          );
        }
      }

      // Create audio segment record
      await storage.createAudioSegment({
        id: segmentId,
        filepath: targetPath,
        duration: 0, // Will be updated after processing
        sampleRate: 8000, // Default for scanner audio
        channels: 1,
        timestamp: callDateTime,
        processed: false,
      });

      // Classify voice type based on talkgroup
      const voiceType = VoiceTypeClassifier.classifyVoiceType(talkgroupStr);

      // Determine initial call type based on talkgroup
      const initialCallType = isHospitalTalkgroup(talkgroupStr) 
        ? "EMS-Hospital Communications" 
        : "Emergency Dispatch";

      // Create preliminary call record with Rdio Scanner metadata
      const callRecord = await storage.createCall({
        timestamp: new Date(), // Processing timestamp
        radioTimestamp: callDateTime, // Original radio transmission timestamp
        audioSegmentId: segmentId,
        transcript: "", // Will be filled by transcription
        confidence: 0,
        startMs: 0,
        endMs: 0,
        callType: initialCallType,
        status: "active",
        location: "",
        talkgroup: call.talkgroup.toString(),
        system: "MESA",
        frequency: call.frequency,
        duration: 0,
        voiceType: voiceType,
        metadata: {
          rdioCallId: call.id,
          rdioAudioType: call.audioType,
          rdioFrequencies: call.frequencies,
          rdioPatches: call.patches,
          rdioSources: call.sources,
          rdioSource: call.source,
          extracted: true,
        },
      });

      // Emit events for further processing
      this.emit("callProcessed", {
        segmentId,
        callRecord,
        rdioCall: call,
        audioFile: targetPath,
      });

      this.emit("segmentReady", segmentId);

      console.log(
        `Rdio Scanner call processed: ${call.id} -> ${segmentId} (TG:${call.talkgroup})`,
      );

      // Create incident for dispatch calls (not hospital calls)
      if (!isHospitalTalkgroup(talkgroupStr) && callRecord) {
        try {
          await incidentTracker.processNewCall(callRecord);
          console.log(`Incident tracking processed for call ${callRecord.id}`);
        } catch (error) {
          console.error(`Error creating incident for call ${callRecord.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error processing Rdio Scanner call ${call.id}:`, error);
      this.emit("error", error);
    }
  }

  async processAllCalls() {
    if (!this.db) {
      console.log("Database not connected, cannot process all calls");
      return { processed: 0, error: "Database not connected" };
    }

    try {
      console.log("Processing all calls from Rdio Scanner database...");

      // Query for all calls from target talkgroups and systems
      const query = `
        SELECT id, audio, audioName, audioType, dateTime, frequencies, frequency, 
               patches, source, sources, system, talkgroup
        FROM rdioScannerCalls 
        WHERE system IN (${this.targetSystems.join(",")})
          AND talkgroup IN (${this.targetTalkgroups.join(",")})
        ORDER BY dateTime DESC
        LIMIT 100
      `;

      const stmt = this.db.prepare(query);
      const allCalls = stmt.all() as RdioCall[];

      console.log(
        `Found ${allCalls.length} total calls in Rdio Scanner database`,
      );

      let processedCount = 0;

      for (const call of allCalls) {
        if (!this.processedCallIds.has(call.id)) {
          await this.processAudioCall(call);
          this.processedCallIds.add(call.id);
          processedCount++;
        }
      }

      console.log(
        `Processed ${processedCount} new calls from Rdio Scanner database`,
      );

      return {
        processed: processedCount,
        total: allCalls.length,
        alreadyProcessed: allCalls.length - processedCount,
      };
    } catch (error) {
      console.error("Error processing all calls:", error);
      return {
        processed: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  getStatus() {
    return {
      monitoring: this.isMonitoring,
      rdioDbPath: this.rdioDbPath,
      ems_audioDir: this.ems_audioDir,
      processedCalls: this.processedCallIds.size,
      lastScanTime: new Date(this.lastScanTime).toISOString(),
      databaseExists: existsSync(this.rdioDbPath),
      targetTalkgroups: this.targetTalkgroups,
      targetSystems: this.targetSystems,
      connected: this.db !== null,
    };
  }

  // Manual scan trigger
  async triggerScan() {
    if (!this.isMonitoring) {
      await this.startMonitoring();
    } else {
      await this.scanForNewCalls();
    }
  }

  // Get recent calls from Rdio Scanner database
  async getRecentCalls(limit: number = 20) {
    if (!this.db) {
      throw new Error("Database not connected");
    }

    try {
      const query = `
        SELECT id, dateTime, system, talkgroup, frequency, audioType, LENGTH(audio) as audio_size
        FROM rdioScannerCalls 
        WHERE system IN (${this.targetSystems.join(",")})
          AND talkgroup IN (${this.targetTalkgroups.join(",")})
        ORDER BY dateTime DESC 
        LIMIT ?
      `;

      const stmt = this.db.prepare(query);
      return stmt.all(limit);
    } catch (error) {
      console.error("Error getting recent calls:", error);
      return [];
    }
  }
}

export const rdioDatabaseMonitor = new RdioDatabaseMonitor();

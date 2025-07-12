import { db } from "../db";
import { hospitalCalls, hospitalCallSegments } from "@shared/schema";
import { storage } from "../storage";
import { getHospitalInfo, isHospitalTalkgroup } from "./hospital-talkgroup-mapping";
import { eq, desc, and, gte } from "drizzle-orm";

export class HospitalCallDetector {
  private activeConversations: Map<string, number> = new Map(); // talkgroup -> hospitalCallId
  private lastActivityTime: Map<string, Date> = new Map(); // talkgroup -> lastActivity
  private readonly CONVERSATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MIN_SEGMENT_GAP_MS = 30 * 1000; // 30 seconds minimum between segments

  async detectAndCreateHospitalCall(
    talkgroup: string,
    audioSegmentId: string,
    timestamp: Date,
    system: string,
    metadata: any
  ): Promise<number | null> {
    // Check if this is a hospital talkgroup
    if (!isHospitalTalkgroup(talkgroup)) {
      return null;
    }

    const hospitalInfo = getHospitalInfo(talkgroup);
    if (!hospitalInfo) {
      return null;
    }

    // First check if this audio segment is already linked to ANY hospital call
    try {
      // Use a more efficient check by querying the segments table directly
      const existingSegment = await storage.getHospitalCallSegmentByAudioId(audioSegmentId);
      if (existingSegment) {
        console.log(`Audio segment ${audioSegmentId} already linked to hospital call ${existingSegment.hospitalCallId}`);
        return existingSegment.hospitalCallId;
      }
    } catch (error) {
      console.log('Error checking existing segments, proceeding with new segment creation');
    }

    const now = new Date();
    let hospitalCallId = this.activeConversations.get(talkgroup);
    
    // Check for existing active hospital calls within the time window (across all calls, not just memory)
    if (!hospitalCallId) {
      const recentCalls = await storage.getHospitalCalls(50, hospitalInfo.hospitalName);
      const activeCall = recentCalls.find(call => {
        if (call.status !== 'active' || call.talkgroup !== talkgroup) return false;
        const callTime = new Date(call.timestamp);
        const timeDiff = Math.abs(timestamp.getTime() - callTime.getTime());
        return timeDiff <= this.CONVERSATION_TIMEOUT_MS;
      });

      if (activeCall) {
        hospitalCallId = activeCall.id;
        this.activeConversations.set(talkgroup, hospitalCallId);
        this.lastActivityTime.set(talkgroup, timestamp);
        console.log(`Found existing active hospital call ${hospitalCallId} for talkgroup ${talkgroup} within time window`);
      }
    }

    // Check if the conversation has timed out
    if (hospitalCallId) {
      const lastActivity = this.lastActivityTime.get(talkgroup);
      if (lastActivity) {
        const timeSinceLastActivity = timestamp.getTime() - lastActivity.getTime();
        if (timeSinceLastActivity > this.CONVERSATION_TIMEOUT_MS) {
          // Conversation timed out, mark as completed and start a new one
          await this.closeHospitalCall(hospitalCallId);
          hospitalCallId = undefined;
          this.activeConversations.delete(talkgroup);
          this.lastActivityTime.delete(talkgroup);
          console.log(`Closed timed out hospital call for talkgroup ${talkgroup}`);
        }
      }
    }

    // Create a new hospital call if needed
    if (!hospitalCallId) {
      hospitalCallId = await this.createNewHospitalCall(talkgroup, timestamp, system, hospitalInfo);
      this.activeConversations.set(talkgroup, hospitalCallId);
      console.log(`Created new hospital call ${hospitalCallId} for ${hospitalInfo.hospitalName}`);
    }

    // Update last activity time
    this.lastActivityTime.set(talkgroup, timestamp);

    // Create hospital call segment
    await this.createHospitalCallSegment(
      hospitalCallId,
      audioSegmentId,
      timestamp,
      metadata
    );

    // Update the total segments count for the hospital call
    const segments = await storage.getHospitalCallSegments(hospitalCallId);
    await storage.updateHospitalCall(hospitalCallId, { 
      totalSegments: segments.length 
    });

    console.log(`Hospital call segment created for call ${hospitalCallId}, audio segment ${audioSegmentId}`);

    // Trigger automatic transcription
    await this.triggerAutomaticTranscription(hospitalCallId, audioSegmentId, metadata);

    // Update incident tracker when hospital call is created or updated
    try {
      const hospitalCall = await storage.getHospitalCall(hospitalCallId);
      if (hospitalCall) {
        const { incidentTracker } = await import('./incident-tracker');
        await incidentTracker.updateIncidentFromHospitalCall(hospitalCall);
      }
    } catch (error) {
      console.error('Error updating incident from hospital call:', error);
    }

    return hospitalCallId;
  }

  private async createNewHospitalCall(
    talkgroup: string,
    timestamp: Date,
    system: string,
    hospitalInfo: any
  ): Promise<number> {
    const conversationId = `CONV-${timestamp.getFullYear()}-${talkgroup}-${timestamp.getTime()}`;
    
    const hospitalCall = await storage.createHospitalCall({
      conversationId,
      talkgroup,
      system,
      status: 'active',
      timestamp,
      summary: `${hospitalInfo.hospitalName} Emergency Communication`,
      hospitalName: hospitalInfo.hospitalName,
      sorDetected: false,
      sorPhysician: null,
      transcriptCount: 0,
      callType: 'EMS-Hospital Communications'
    });

    return hospitalCall.id;
  }

  private async createHospitalCallSegment(
    hospitalCallId: number,
    audioSegmentId: string,
    timestamp: Date,
    metadata: any
  ): Promise<void> {
    // Get current segment count for sequence number
    const existingSegments = await storage.getHospitalCallSegments(hospitalCallId);
    const sequenceNumber = existingSegments.length + 1;

    await storage.createHospitalCallSegment({
      hospitalCallId,
      audioSegmentId,
      sequenceNumber,
      timestamp,
      transcript: 'Transcription pending...',
      confidence: null,
      speakerType: null,
      speakerIdentity: null,
      duration: null,
      metadata: {
        ...metadata,
        autoDetected: true,
        processingStatus: 'pending_transcription'
      }
    });

    console.log(`Created hospital call segment ${sequenceNumber} for call ${hospitalCallId}`);
  }

  private async triggerAutomaticTranscription(
    hospitalCallId: number,
    audioSegmentId: string,
    metadata: any
  ): Promise<void> {
    try {
      // Import transcription service
      const { TranscriptionService } = await import('./transcription');
      const transcriptionService = new TranscriptionService();

      // Get the Rdio Scanner call ID from metadata
      const rdioCallId = metadata?.rdioCallId || metadata?.id;
      if (!rdioCallId) {
        console.warn(`No rdioCallId found in metadata for segment ${audioSegmentId}`);
        return;
      }

      // Access Rdio Scanner database to get audio
      const Database = await import('better-sqlite3');
      const path = await import('path');
      const fs = await import('fs');

      const rdioDbPath = path.join(process.cwd(), 'rdio-scanner-server/rdio-scanner.db');
      
      if (!fs.existsSync(rdioDbPath)) {
        console.warn(`Rdio Scanner database not found: ${rdioDbPath}`);
        return;
      }

      const rdioDb = new Database.default(rdioDbPath, { readonly: true });
      
      try {
        const stmt = rdioDb.prepare('SELECT audio, audioType FROM rdioScannerCalls WHERE id = ?');
        const result = stmt.get(rdioCallId) as { audio: Buffer; audioType: string } | undefined;
        
        if (!result || !result.audio) {
          console.warn(`No audio found for Rdio call ${rdioCallId}`);
          return;
        }

        // Transcribe the audio directly from buffer (no duplicate file creation)
        console.log(`Starting automatic transcription for hospital segment ${audioSegmentId} using direct buffer access`);
        const transcriptResult = await transcriptionService.transcribeAudioBuffer(result.audio, audioSegmentId);
        
        if (transcriptResult && transcriptResult.utterance) {
          // Update the hospital call segment with transcript
          const segments = await storage.getHospitalCallSegments(hospitalCallId);
          const segment = segments.find(s => s.audioSegmentId === audioSegmentId);
          
          if (segment) {
            await storage.updateHospitalCallSegment(segment.id, {
              transcript: transcriptResult.utterance,
              confidence: transcriptResult.confidence || 0.8,
              duration: null,
              metadata: {
                ...segment.metadata,
                processingStatus: 'transcribed',
                transcribedAt: new Date().toISOString()
              }
            });

            // Update hospital call transcript count
            const updatedSegments = await storage.getHospitalCallSegments(hospitalCallId);
            await storage.updateHospitalCall(hospitalCallId, {
              transcriptCount: updatedSegments.filter(s => s.transcript && s.transcript !== 'Transcription pending...').length
            });

            // Update incident tracker after transcription
            try {
              const hospitalCall = await storage.getHospitalCall(hospitalCallId);
              if (hospitalCall) {
                // Update hospital call with full transcript
                const allTranscripts = updatedSegments
                  .filter(s => s.transcript && s.transcript !== 'Transcription pending...')
                  .map(s => s.transcript)
                  .join(' ');
                
                await storage.updateHospitalCall(hospitalCallId, {
                  transcript: allTranscripts
                });
                
                // Get updated hospital call with transcript
                const updatedHospitalCall = await storage.getHospitalCall(hospitalCallId);
                if (updatedHospitalCall) {
                  const { incidentTracker } = await import('./incident-tracker');
                  await incidentTracker.updateIncidentFromHospitalCall(updatedHospitalCall);
                }
              }
            } catch (error) {
              console.error('Error updating incident after transcription:', error);
            }

            console.log(`Automatic transcription completed for hospital segment ${audioSegmentId}`);
          }
        }

        // No temporary file cleanup needed - working directly with buffer

      } finally {
        rdioDb.close();
      }

    } catch (error) {
      console.error(`Error in automatic transcription for hospital segment ${audioSegmentId}:`, error);
      
      // Update segment to indicate transcription failed
      const segments = await storage.getHospitalCallSegments(hospitalCallId);
      const segment = segments.find(s => s.audioSegmentId === audioSegmentId);
      
      if (segment) {
        await storage.updateHospitalCallSegment(segment.id, {
          metadata: {
            ...segment.metadata,
            processingStatus: 'transcription_failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }
  }

  private async closeHospitalCall(hospitalCallId: number): Promise<void> {
    await storage.updateHospitalCall(hospitalCallId, {
      status: 'completed'
    });
    console.log(`Closed hospital call ${hospitalCallId} (conversation timeout)`);
  }

  // Clean up old conversations periodically
  async cleanupOldConversations(): Promise<void> {
    const now = new Date();
    const expiredTalkgroups: string[] = [];

    for (const [talkgroup, lastActivity] of this.lastActivityTime.entries()) {
      const timeSinceLastActivity = now.getTime() - lastActivity.getTime();
      if (timeSinceLastActivity > this.CONVERSATION_TIMEOUT_MS) {
        const hospitalCallId = this.activeConversations.get(talkgroup);
        if (hospitalCallId) {
          await this.closeHospitalCall(hospitalCallId);
        }
        expiredTalkgroups.push(talkgroup);
      }
    }

    // Remove expired conversations from tracking
    for (const talkgroup of expiredTalkgroups) {
      this.activeConversations.delete(talkgroup);
      this.lastActivityTime.delete(talkgroup);
    }

    if (expiredTalkgroups.length > 0) {
      console.log(`Cleaned up ${expiredTalkgroups.length} expired hospital conversations`);
    }
  }

  // Get active hospital conversations
  getActiveConversations(): { talkgroup: string; hospitalCallId: number; lastActivity: Date }[] {
    const active: { talkgroup: string; hospitalCallId: number; lastActivity: Date }[] = [];
    
    for (const [talkgroup, hospitalCallId] of this.activeConversations.entries()) {
      const lastActivity = this.lastActivityTime.get(talkgroup);
      if (lastActivity) {
        active.push({ talkgroup, hospitalCallId, lastActivity });
      }
    }
    
    return active;
  }
}

// Export singleton instance
export const hospitalCallDetector = new HospitalCallDetector();
import { storage } from '../storage';
import { telegramBot } from './telegram-bot';
import { keywordMonitor } from './keyword-monitor';
import { audioConverter } from './audio-converter';
import { geocodingService } from './geocoding';
import { 
  Call, HospitalCall, HospitalCallSegment, 
  NotificationKeyword, InsertTelegramNotification,
  InsertNotificationQueue, Incident
} from '@shared/schema';
import path from 'path';

interface NotificationData {
  call?: Call;
  hospitalCall?: HospitalCall;
  incident?: Incident;
  keywords: NotificationKeyword[];
  audioPath?: string;
  audioMp3Path?: string;
  location?: string;
  closestHospital?: string;
  hospitalDistance?: number;
  hospitalEta?: number;
}

interface HospitalCallGroup {
  unitId: string;
  segments: HospitalCallSegment[];
  hospitalCall: HospitalCall;
  incident?: Incident;
}

export class NotificationManagerService {
  private isProcessing: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  private pendingHospitalCalls: Map<string, HospitalCallGroup> = new Map();
  private hospitalCallTimeout = 30000; // 30 seconds to group hospital call segments
  
  constructor() {
    this.initialize();
  }
  
  private async initialize() {
    // Start processing queue
    this.startQueueProcessor();
    console.log('Notification manager initialized');
  }
  
  private startQueueProcessor() {
    // Process queue every 5 seconds
    this.processInterval = setInterval(() => this.processQueue(), 5000);
  }
  
  async processDispatchCall(call: Call) {
    if (!call.transcript || call.transcript.length < 3) {
      return;
    }
    
    try {
      // Check for keyword matches
      const triggeredKeywords = await keywordMonitor.checkCallForKeywords(call);
      
      if (triggeredKeywords.length === 0) {
        return;
      }
      
      console.log(`Dispatch call ${call.id} triggered ${triggeredKeywords.length} keywords`);
      
      // Get incident if exists
      const incident = await storage.getIncidentByDispatchCall(call.id);
      
      // Prepare notification data
      const notificationData: NotificationData = {
        call,
        incident,
        keywords: triggeredKeywords,
        audioPath: call.audioPath || undefined,
        location: call.location || undefined
      };
      
      // Add geocoding data if location exists
      if (call.location) {
        await this.enrichWithGeocoding(notificationData);
      }
      
      // Convert audio to MP3 if available
      if (notificationData.audioPath) {
        notificationData.audioMp3Path = await this.convertAudioToMp3(notificationData.audioPath);
      }
      
      // Queue notifications for each triggered keyword
      for (const keyword of triggeredKeywords) {
        await this.queueNotification(notificationData, keyword);
      }
      
    } catch (error) {
      console.error(`Error processing dispatch call ${call.id} for notifications:`, error);
    }
  }
  
  async processHospitalCall(hospitalCall: HospitalCall, segments?: HospitalCallSegment[]) {
    if (!hospitalCall.transcript || hospitalCall.transcript.length < 3) {
      return;
    }
    
    try {
      // Check if we should group this with other segments
      const groupKey = `${hospitalCall.unitId}_${hospitalCall.hospitalName}`;
      
      if (this.pendingHospitalCalls.has(groupKey)) {
        // Add to existing group
        const group = this.pendingHospitalCalls.get(groupKey)!;
        if (segments) {
          group.segments.push(...segments);
        }
        return;
      }
      
      // Create new group
      const group: HospitalCallGroup = {
        unitId: hospitalCall.unitId,
        segments: segments || [],
        hospitalCall,
        incident: await storage.getIncidentByHospitalCall(hospitalCall.id) || undefined
      };
      
      this.pendingHospitalCalls.set(groupKey, group);
      
      // Set timeout to process this group
      setTimeout(() => this.processHospitalCallGroup(groupKey), this.hospitalCallTimeout);
      
    } catch (error) {
      console.error(`Error processing hospital call ${hospitalCall.id} for notifications:`, error);
    }
  }
  
  private async processHospitalCallGroup(groupKey: string) {
    const group = this.pendingHospitalCalls.get(groupKey);
    if (!group) return;
    
    this.pendingHospitalCalls.delete(groupKey);
    
    try {
      // Combine transcripts from all segments
      const combinedTranscript = [
        group.hospitalCall.transcript,
        ...group.segments.map(s => s.transcript).filter(Boolean)
      ].join('\n');
      
      // Check for keyword matches
      const triggeredKeywords = await keywordMonitor.checkMultipleTranscripts([combinedTranscript]);
      
      if (triggeredKeywords.length === 0) {
        return;
      }
      
      console.log(`Hospital call group ${groupKey} triggered ${triggeredKeywords.length} keywords`);
      
      // Prepare notification data
      const notificationData: NotificationData = {
        hospitalCall: group.hospitalCall,
        incident: group.incident,
        keywords: triggeredKeywords,
        location: group.hospitalCall.hospitalName || undefined
      };
      
      // Convert audio files to MP3
      const audioMp3Paths: string[] = [];
      for (const segment of group.segments) {
        if (segment.audioPath) {
          const mp3Path = await this.convertAudioToMp3(segment.audioPath);
          if (mp3Path) audioMp3Paths.push(mp3Path);
        }
      }
      
      // Send bulk notification with all segments
      await this.sendBulkHospitalNotification(group, triggeredKeywords, audioMp3Paths);
      
    } catch (error) {
      console.error(`Error processing hospital call group ${groupKey}:`, error);
    }
  }
  
  private async enrichWithGeocoding(data: NotificationData) {
    if (!data.location) return;
    
    try {
      // Get coordinates for location
      const geocodeResult = await geocodingService.geocodeAddress(data.location);
      
      if (geocodeResult && geocodeResult.coordinates) {
        // Find closest hospital
        const hospitals = await this.getHospitalList();
        const closest = await this.findClosestHospital(
          geocodeResult.coordinates,
          hospitals
        );
        
        if (closest) {
          data.closestHospital = closest.name;
          data.hospitalDistance = closest.distance;
          data.hospitalEta = Math.round(closest.distance * 2.5); // Rough estimate: 2.5 min per mile
        }
      }
    } catch (error) {
      console.error('Error enriching with geocoding data:', error);
    }
  }
  
  private async getHospitalList() {
    // This should be replaced with actual hospital data from database or config
    return [
      { name: 'IU Health Methodist Hospital', lat: 39.7902, lng: -86.1565 },
      { name: 'Eskenazi Health', lat: 39.7765, lng: -86.1779 },
      { name: 'Riley Hospital for Children', lat: 39.7758, lng: -86.1822 },
      { name: 'St. Vincent Indianapolis', lat: 39.9089, lng: -86.0744 },
      { name: 'Community Hospital East', lat: 39.7946, lng: -86.0381 }
    ];
  }
  
  private async findClosestHospital(
    coordinates: { lat: number; lng: number },
    hospitals: Array<{ name: string; lat: number; lng: number }>
  ) {
    let closest = null;
    let minDistance = Infinity;
    
    for (const hospital of hospitals) {
      const distance = this.calculateDistance(
        coordinates.lat, coordinates.lng,
        hospital.lat, hospital.lng
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closest = {
          name: hospital.name,
          distance: distance
        };
      }
    }
    
    return closest;
  }
  
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
  
  private async convertAudioToMp3(audioPath: string): Promise<string | undefined> {
    try {
      const outputPath = path.join(
        path.dirname(audioPath),
        `${path.basename(audioPath, path.extname(audioPath))}.mp3`
      );
      
      const success = await audioConverter.convertToMp3(audioPath, outputPath);
      return success ? outputPath : undefined;
    } catch (error) {
      console.error('Error converting audio to MP3:', error);
      return undefined;
    }
  }
  
  private async queueNotification(data: NotificationData, keyword: NotificationKeyword) {
    try {
      // Determine priority based on keyword severity
      const priority = keyword.severity === 'high' ? 10 : 
                      keyword.severity === 'medium' ? 5 : 1;
      
      // Create queue item
      await storage.createNotificationQueueItem({
        callId: data.call?.id || null,
        keywordId: keyword.id,
        priority,
        status: 'queued',
        metadata: {
          hospitalCallId: data.hospitalCall?.id,
          incidentId: data.incident?.id,
          audioMp3Path: data.audioMp3Path,
          location: data.location,
          closestHospital: data.closestHospital,
          hospitalDistance: data.hospitalDistance,
          hospitalEta: data.hospitalEta
        }
      });
      
      console.log(`Queued notification for keyword ${keyword.keyword} with priority ${priority}`);
      
    } catch (error) {
      console.error('Error queuing notification:', error);
    }
  }
  
  private async processQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      // Get next item from queue
      const queueItem = await storage.getNextQueuedNotification();
      
      if (!queueItem) {
        this.isProcessing = false;
        return;
      }
      
      // Update status to processing
      await storage.updateQueueItem(queueItem.id, { status: 'processing' });
      
      // Get call and keyword data
      const call = queueItem.callId ? await storage.getCall(queueItem.callId) : undefined;
      const keyword = await storage.getNotificationKeyword(queueItem.keywordId);
      
      if (!keyword) {
        await storage.updateQueueItem(queueItem.id, { 
          status: 'failed',
          error: 'Keyword not found'
        });
        this.isProcessing = false;
        return;
      }
      
      // Send notification
      const messageId = await telegramBot.sendNotification({
        callId: call?.id,
        keywordId: keyword.id,
        location: (queueItem.metadata as any)?.location,
        closestHospital: (queueItem.metadata as any)?.closestHospital,
        hospitalDistance: (queueItem.metadata as any)?.hospitalDistance,
        hospitalEta: (queueItem.metadata as any)?.hospitalEta,
        transcript: call?.transcript || '',
        callType: call?.callType || undefined,
        priority: call?.priority || undefined,
        timestamp: call?.timestamp || new Date(),
        audioMp3Path: (queueItem.metadata as any)?.audioMp3Path
      });
      
      if (messageId) {
        // Create notification record
        await storage.createTelegramNotification({
          callId: call?.id || null,
          hospitalCallId: null,
          keywordId: keyword.id,
          messageId,
          channelId: (await storage.getTelegramConfig())?.channelId || null,
          status: 'sent',
          messageContent: call?.transcript || null,
          audioMp3Path: (queueItem.metadata as any)?.audioMp3Path || null,
          location: (queueItem.metadata as any)?.location || null,
          closestHospital: (queueItem.metadata as any)?.closestHospital || null,
          hospitalDistance: (queueItem.metadata as any)?.hospitalDistance || null,
          hospitalEta: (queueItem.metadata as any)?.hospitalEta || null,
          transcript: call?.transcript || null,
          callType: call?.callType || null,
          priority: call?.priority || null,
          timestamp: call?.timestamp || null,
          sentAt: new Date(),
          metadata: queueItem.metadata || null
        });
        
        // Update queue item
        await storage.updateQueueItem(queueItem.id, { 
          status: 'completed',
          processedAt: new Date()
        });
        
        console.log(`Successfully sent notification for queue item ${queueItem.id}`);
      } else {
        // Update attempts and status
        const attempts = queueItem.attempts + 1;
        const status = attempts >= queueItem.maxAttempts ? 'failed' : 'queued';
        
        await storage.updateQueueItem(queueItem.id, { 
          status,
          attempts,
          error: 'Failed to send notification'
        });
      }
      
    } catch (error) {
      console.error('Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  private async sendBulkHospitalNotification(
    group: HospitalCallGroup,
    keywords: NotificationKeyword[],
    audioMp3Paths: string[]
  ) {
    try {
      const messages = group.segments.map(segment => ({
        transcript: segment.transcript,
        timestamp: new Date(segment.timestamp),
        audioMp3Path: audioMp3Paths.shift()
      }));
      
      // Add main hospital call transcript
      messages.unshift({
        transcript: group.hospitalCall.transcript,
        timestamp: new Date(group.hospitalCall.timestamp),
        audioMp3Path: undefined
      });
      
      const messageId = await telegramBot.sendBulkNotification(
        messages as any,
        `Hospital Communication: ${group.hospitalCall.unitId} → ${group.hospitalCall.hospitalName}`
      );
      
      if (messageId) {
        // Create notification record for each keyword
        for (const keyword of keywords) {
          await storage.createTelegramNotification({
            callId: null,
            hospitalCallId: group.hospitalCall.id,
            keywordId: keyword.id,
            messageId,
            channelId: (await storage.getTelegramConfig())?.channelId || null,
            status: 'sent',
            messageContent: group.hospitalCall.transcript,
            location: group.hospitalCall.hospitalName || null,
            transcript: group.hospitalCall.transcript,
            timestamp: new Date(group.hospitalCall.timestamp),
            sentAt: new Date(),
            metadata: { 
              segmentCount: group.segments.length,
              unitId: group.hospitalCall.unitId,
              incidentId: group.incident?.id
            }
          });
        }
        
        console.log(`Successfully sent bulk hospital notification for ${group.hospitalCall.id}`);
      }
      
    } catch (error) {
      console.error('Error sending bulk hospital notification:', error);
    }
  }
  
  stop() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    console.log('Notification manager stopped');
  }
  
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      pendingHospitalCalls: this.pendingHospitalCalls.size,
      telegramBotStatus: telegramBot.getStatus(),
      keywordMonitorStatus: keywordMonitor.getStatus()
    };
  }
}

// Export singleton instance
export const notificationManager = new NotificationManagerService();
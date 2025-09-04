import { EventEmitter } from 'events';
import { storage } from '../storage';
import { telegramBotService } from './telegram-bot';
import { audioConverter } from './audio-converter';
import { keywordMonitor, KeywordMatch, CallData } from './keyword-monitor';
import path from 'path';
import { existsSync } from 'fs';

export interface NotificationPayload {
  call: CallData;
  matches: KeywordMatch[];
  hospitalInfo?: HospitalInfo;
  relatedCalls?: RelatedCall[];
  audioPath?: string;
  mp3Path?: string;
}

export interface HospitalInfo {
  name: string;
  distance: number;
  driveTime: number;
  address?: string;
}

export interface RelatedCall {
  id: number;
  timestamp: Date;
  transcript: string;
  audioPath?: string;
  isHospitalCall: boolean;
}

export class NotificationManagerService extends EventEmitter {
  private notificationQueue: Map<number, NotificationPayload> = new Map();
  private processingInterval: NodeJS.Timer | null = null;
  private isProcessing = false;
  private readonly PROCESS_INTERVAL = 5000; // Process queue every 5 seconds
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 5; // Process up to 5 notifications at once

  constructor() {
    super();
    this.startQueueProcessor();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for keyword matches
    keywordMonitor.on('keywordMatched', async ({ callData, matches }) => {
      console.log(`Keyword match detected for call ${callData.id}, queueing notification`);
      await this.queueNotification(callData as CallData, matches);
    });
  }

  private startQueueProcessor(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processQueue();
      }
    }, this.PROCESS_INTERVAL);

    console.log('Notification queue processor started');
  }

  async queueNotification(call: CallData, matches: KeywordMatch[]): Promise<void> {
    try {
      // Check if already queued or sent
      const existing = await storage.query(
        `SELECT id FROM notification_history 
         WHERE call_id = $1 AND status IN ('queued', 'sending', 'sent')
         LIMIT 1`,
        [call.id]
      );

      if (existing.rows.length > 0) {
        console.log(`Notification already queued/sent for call ${call.id}`);
        return;
      }

      // Get hospital info
      const hospitalInfo = await this.findNearestHospital(call);

      // Get related hospital calls if this is a dispatch call
      const relatedCalls = await this.findRelatedHospitalCalls(call);

      // Convert audio to MP3 if available
      let mp3Path: string | undefined;
      if (call.audioPath && existsSync(call.audioPath)) {
        try {
          mp3Path = await audioConverter.convertToMP3(call.audioPath);
        } catch (error) {
          console.error(`Failed to convert audio for call ${call.id}:`, error);
        }
      }

      // Create notification payload
      const payload: NotificationPayload = {
        call,
        matches,
        hospitalInfo,
        relatedCalls,
        audioPath: call.audioPath,
        mp3Path
      };

      // Add to queue
      this.notificationQueue.set(call.id, payload);

      // Save to database queue
      await storage.query(
        `INSERT INTO notification_queue (notification_type, priority, payload, status)
         VALUES ('dispatch', $1, $2, 'pending')`,
        [this.getPriority(matches), JSON.stringify(payload)]
      );

      console.log(`Notification queued for call ${call.id}`);
    } catch (error) {
      console.error(`Failed to queue notification for call ${call.id}:`, error);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.notificationQueue.size === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending notifications from database
      const pending = await storage.query(
        `SELECT * FROM notification_queue 
         WHERE status = 'pending' OR (status = 'retry' AND next_retry_at <= NOW())
         ORDER BY priority ASC, created_at ASC
         LIMIT $1`,
        [this.BATCH_SIZE]
      );

      for (const row of pending.rows) {
        await this.processNotification(row);
      }

      // Process in-memory queue
      const entries = Array.from(this.notificationQueue.entries()).slice(0, this.BATCH_SIZE);
      for (const [callId, payload] of entries) {
        await this.sendNotification(payload);
        this.notificationQueue.delete(callId);
      }
    } catch (error) {
      console.error('Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processNotification(queueItem: any): Promise<void> {
    try {
      // Update status to processing
      await storage.query(
        'UPDATE notification_queue SET status = $1 WHERE id = $2',
        ['processing', queueItem.id]
      );

      const payload: NotificationPayload = queueItem.payload;
      
      // Send notification
      const success = await this.sendNotification(payload);

      if (success) {
        // Mark as completed
        await storage.query(
          'UPDATE notification_queue SET status = $1, processed_at = NOW() WHERE id = $2',
          ['completed', queueItem.id]
        );
      } else {
        // Handle failure
        const attempts = queueItem.attempts + 1;
        if (attempts >= this.MAX_RETRIES) {
          await storage.query(
            'UPDATE notification_queue SET status = $1, attempts = $2 WHERE id = $3',
            ['failed', attempts, queueItem.id]
          );
        } else {
          // Schedule retry
          const nextRetry = new Date(Date.now() + Math.pow(2, attempts) * 60000); // Exponential backoff
          await storage.query(
            'UPDATE notification_queue SET status = $1, attempts = $2, next_retry_at = $3 WHERE id = $4',
            ['retry', attempts, nextRetry, queueItem.id]
          );
        }
      }
    } catch (error) {
      console.error(`Failed to process notification ${queueItem.id}:`, error);
    }
  }

  private async sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      if (!telegramBotService.isReady()) {
        console.error('Telegram bot not ready, skipping notification');
        return false;
      }

      // Get channel IDs for notification
      const channelIds = this.getChannelIds(payload.matches);
      
      for (const channelId of channelIds) {
        // Format the message
        const message = this.formatNotificationMessage(payload);
        
        // Send main message
        const mainMessage = await telegramBotService.sendMessage(channelId, message, {
          parseMode: 'HTML',
          disableNotification: false
        });

        if (!mainMessage) {
          console.error(`Failed to send message to channel ${channelId}`);
          continue;
        }

        // Send audio if available
        if (payload.mp3Path && existsSync(payload.mp3Path)) {
          await telegramBotService.sendAudio(
            channelId,
            payload.mp3Path,
            `🎯 Call #${payload.call.id} Audio`,
            { replyToMessageId: mainMessage.message_id.toString() }
          );
        }

        // Send related hospital call audios
        if (payload.relatedCalls && payload.relatedCalls.length > 0) {
          const hospitalAudios = [];
          for (const relatedCall of payload.relatedCalls) {
            if (relatedCall.audioPath && existsSync(relatedCall.audioPath)) {
              try {
                const mp3Path = await audioConverter.convertToMP3(relatedCall.audioPath);
                hospitalAudios.push({
                  type: 'audio' as const,
                  media: mp3Path,
                  caption: `🏥 ${new Date(relatedCall.timestamp).toLocaleTimeString()}: ${relatedCall.transcript.substring(0, 200)}`
                });
              } catch (error) {
                console.error(`Failed to convert related audio:`, error);
              }
            }
          }

          if (hospitalAudios.length > 0) {
            await telegramBotService.sendMediaGroup(channelId, hospitalAudios);
          }
        }

        // Record successful notification
        await this.recordNotification(payload, channelId, mainMessage.message_id.toString());
      }

      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  private formatNotificationMessage(payload: NotificationPayload): string {
    const { call, matches, hospitalInfo, relatedCalls } = payload;
    
    // Format timestamp
    const timestamp = new Date(call.timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    // Build message parts
    let message = `🚨 <b>DISPATCH ALERT</b> - ${matches.map(m => `"${m.keyword}"`).join(', ')}\n\n`;
    
    message += `📍 <b>Location:</b> ${call.location || 'Unknown'}\n`;
    
    if (hospitalInfo) {
      message += `🏥 <b>Nearest Hospital:</b> ${hospitalInfo.name}\n`;
      message += `   📏 Distance: ${hospitalInfo.distance.toFixed(1)} mi | 🚗 Drive: ~${hospitalInfo.driveTime} min\n`;
    }
    
    message += `\n📅 <b>Time:</b> ${timestamp}\n`;
    message += `🎯 <b>Call Type:</b> ${call.callType || 'Unknown'}\n`;
    
    if (call.units && call.units.length > 0) {
      message += `🚑 <b>Units:</b> ${call.units.join(', ')}\n`;
    }
    
    message += `\n📝 <b>Transcript:</b>\n<code>${this.truncateText(call.transcript, 800)}</code>\n`;
    
    if (relatedCalls && relatedCalls.length > 0) {
      message += `\n🏥 <b>Related Hospital Communications (${relatedCalls.length}):</b>\n`;
      for (const related of relatedCalls.slice(0, 3)) {
        const time = new Date(related.timestamp).toLocaleTimeString();
        message += `• ${time}: "${this.truncateText(related.transcript, 100)}"\n`;
      }
      if (relatedCalls.length > 3) {
        message += `• <i>...and ${relatedCalls.length - 3} more segments</i>\n`;
      }
    }
    
    message += `\n🆔 Call ID: #${call.id}`;
    message += ` | 📊 Confidence: ${(call.confidence * 100).toFixed(0)}%`;

    return message;
  }

  private async findNearestHospital(call: CallData): Promise<HospitalInfo | undefined> {
    if (!call.latitude || !call.longitude) {
      return undefined;
    }

    try {
      // Get hospitals from database
      const hospitals = await storage.query(`
        SELECT name, latitude, longitude, address,
          (3959 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )) AS distance
        FROM hospitals
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY distance
        LIMIT 1
      `, [call.latitude, call.longitude]);

      if (hospitals.rows.length === 0) {
        return undefined;
      }

      const hospital = hospitals.rows[0];
      
      // Estimate drive time (rough approximation: 30 mph average in city)
      const driveTime = Math.round((hospital.distance / 30) * 60);

      return {
        name: hospital.name,
        distance: hospital.distance,
        driveTime,
        address: hospital.address
      };
    } catch (error) {
      console.error('Failed to find nearest hospital:', error);
      return undefined;
    }
  }

  private async findRelatedHospitalCalls(call: CallData): Promise<RelatedCall[]> {
    try {
      // Find hospital calls within 30 minutes of this dispatch call
      const result = await storage.query(`
        SELECT c.id, c.timestamp, c.transcript, c.audio_path
        FROM calls c
        WHERE c.talkgroup IN ('10255', '10256', '10258')
          AND c.timestamp BETWEEN $1 - INTERVAL '5 minutes' AND $1 + INTERVAL '25 minutes'
          AND c.transcript IS NOT NULL
          AND c.transcript != ''
          AND c.transcript NOT LIKE '%{beeping}%'
          AND c.transcript NOT LIKE '%[Static]%'
        ORDER BY c.timestamp ASC
        LIMIT 10
      `, [call.timestamp]);

      return result.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        transcript: row.transcript,
        audioPath: row.audio_path,
        isHospitalCall: true
      }));
    } catch (error) {
      console.error('Failed to find related hospital calls:', error);
      return [];
    }
  }

  private getChannelIds(matches: KeywordMatch[]): string[] {
    const channelIds = new Set<string>();
    
    // Add default channel if configured
    const defaultChannel = process.env.TELEGRAM_CHANNEL_ID;
    if (defaultChannel) {
      channelIds.add(defaultChannel);
    }
    
    // Add channels from keyword matches
    for (const match of matches) {
      if (match.channelId) {
        channelIds.add(match.channelId);
      }
    }
    
    return Array.from(channelIds);
  }

  private getPriority(matches: KeywordMatch[]): number {
    const priorityMap = { critical: 1, high: 3, normal: 5, low: 8 };
    let minPriority = 10;
    
    for (const match of matches) {
      const priority = priorityMap[match.priority as keyof typeof priorityMap] || 5;
      minPriority = Math.min(minPriority, priority);
    }
    
    return minPriority;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  private async recordNotification(
    payload: NotificationPayload,
    channelId: string,
    messageId: string
  ): Promise<void> {
    try {
      const metadata = {
        hospitalInfo: payload.hospitalInfo,
        relatedCallCount: payload.relatedCalls?.length || 0,
        keywordsMatched: payload.matches.map(m => m.keyword)
      };

      await storage.query(
        `INSERT INTO notification_history 
         (call_id, keyword_id, telegram_channel_id, telegram_message_id, status, audio_mp3_path, message_text, metadata)
         VALUES ($1, $2, $3, $4, 'sent', $5, $6, $7)`,
        [
          payload.call.id,
          payload.matches[0]?.keywordId || null,
          channelId,
          messageId,
          payload.mp3Path || null,
          this.formatNotificationMessage(payload),
          JSON.stringify(metadata)
        ]
      );
    } catch (error) {
      console.error('Failed to record notification:', error);
    }
  }

  async getNotificationStats(): Promise<any> {
    try {
      const stats = await storage.query(`
        SELECT 
          COUNT(*) as total_sent,
          COUNT(CASE WHEN sent_at > NOW() - INTERVAL '24 hours' THEN 1 END) as sent_24h,
          COUNT(CASE WHEN sent_at > NOW() - INTERVAL '1 hour' THEN 1 END) as sent_1h,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM notification_history
      `);

      return stats.rows[0];
    } catch (error) {
      console.error('Failed to get notification stats:', error);
      return { total_sent: 0, sent_24h: 0, sent_1h: 0, failed: 0 };
    }
  }

  stopQueueProcessor(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Notification queue processor stopped');
    }
  }
}

export const notificationManager = new NotificationManagerService();
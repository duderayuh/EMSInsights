import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { InputFile } from 'telegraf/types';
import { storage } from '../storage';
import { 
  TelegramConfig, InsertTelegramNotification, 
  NotificationKeyword, TelegramNotification 
} from '@shared/schema';
import { promises as fs } from 'fs';
import { join } from 'path';
import express, { Express } from 'express';
import { createServer, Server } from 'http';

interface TelegramMessage {
  callId?: number;
  hospitalCallId?: number;
  keywordId?: number;
  location?: string;
  closestHospital?: string;
  hospitalDistance?: number;
  hospitalEta?: number;
  transcript: string;
  callType?: string;
  priority?: string;
  timestamp: Date;
  audioPath?: string;
  audioMp3Path?: string;
}

export class TelegramBotService {
  private bot: Telegraf | null = null;
  private config: TelegramConfig | null = null;
  private isRunning: boolean = false;
  private rateLimitQueue: number[] = [];
  private server: Server | null = null;
  private app: Express | null = null;
  private readonly port = 3002; // Dedicated port for Telegram bot
  private webhookPath = '/telegram-webhook';
  
  constructor() {
    this.initialize();
  }
  
  private async initialize() {
    try {
      this.config = await storage.getTelegramConfig();
      if (this.config && this.config.isActive) {
        await this.setupBot();
      }
    } catch (error) {
      console.error('Error initializing Telegram bot:', error);
    }
  }
  
  private async setupBot() {
    if (!this.config || !this.config.botToken) {
      console.log('Telegram bot config not found or invalid');
      return;
    }
    
    try {
      this.bot = new Telegraf(this.config.botToken);
      
      // Setup commands
      this.bot.command('start', (ctx) => {
        ctx.reply('EMS-Insight Telegram Bot is active. This bot will send notifications for emergency dispatch calls matching your configured keywords.');
      });
      
      this.bot.command('status', async (ctx) => {
        const keywords = await storage.getActiveNotificationKeywords();
        const keywordList = keywords.map(k => `• ${k.keyword} (${k.category || 'general'})`).join('\n');
        ctx.reply(`📊 Bot Status:\n\nActive Keywords (${keywords.length}):\n${keywordList || 'No keywords configured'}\n\nChannel: ${this.config?.channelName || this.config?.channelId}`);
      });
      
      this.bot.command('keywords', async (ctx) => {
        const keywords = await storage.getActiveNotificationKeywords();
        if (keywords.length === 0) {
          ctx.reply('No notification keywords configured. Add keywords through the web interface.');
          return;
        }
        
        const list = keywords.map((k, i) => 
          `${i + 1}. **${k.keyword}**\n   Category: ${k.category || 'general'}\n   Severity: ${k.severity}\n   Triggers: ${k.triggerCount}`
        ).join('\n\n');
        
        ctx.reply(`🔍 Active Notification Keywords:\n\n${list}`);
      });
      
      // Setup webhook or polling
      if (this.config.webhookUrl) {
        await this.setupWebhook();
      } else {
        // Use polling for local development
        await this.bot.launch();
        console.log('Telegram bot started in polling mode');
      }
      
      this.isRunning = true;
      console.log(`Telegram bot initialized successfully on port ${this.port}`);
      
      // Enable graceful stop
      process.once('SIGINT', () => this.stop());
      process.once('SIGTERM', () => this.stop());
      
    } catch (error) {
      console.error('Error setting up Telegram bot:', error);
      this.isRunning = false;
    }
  }
  
  private async setupWebhook() {
    if (!this.bot || !this.config) return;
    
    // Create Express app for webhook on port 3002
    this.app = express();
    this.app.use(express.json());
    
    // Setup webhook endpoint
    const webhookCallback = await this.bot.createWebhook({ 
      domain: this.config.webhookUrl!,
      path: this.webhookPath
    });
    
    this.app.post(this.webhookPath, webhookCallback as any);
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'telegram-bot',
        running: this.isRunning,
        port: this.port 
      });
    });
    
    // Start server on port 3002
    this.server = createServer(this.app);
    this.server.listen(this.port, () => {
      console.log(`Telegram bot webhook server listening on port ${this.port}`);
    });
  }
  
  async sendNotification(message: TelegramMessage): Promise<string | null> {
    if (!this.bot || !this.config || !this.isRunning) {
      console.error('Telegram bot not initialized or not running');
      return null;
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      console.warn('Telegram rate limit exceeded, queueing message');
      return null;
    }
    
    try {
      const channelId = this.config.channelId;
      
      // Format the message
      const formattedMessage = this.formatNotificationMessage(message);
      
      // Send text message first
      const sentMessage = await this.bot.telegram.sendMessage(channelId, formattedMessage, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      
      // Send audio file if available
      if (message.audioMp3Path) {
        try {
          const audioBuffer = await fs.readFile(message.audioMp3Path);
          const audioFile: InputFile = {
            source: audioBuffer,
            filename: `dispatch_${message.callId || 'unknown'}.mp3`
          };
          
          await this.bot.telegram.sendAudio(channelId, audioFile, {
            reply_to_message_id: sentMessage.message_id,
            caption: `🎙️ Dispatch Audio - ${new Date(message.timestamp).toLocaleTimeString()}`,
            title: `Dispatch Call ${message.callId || ''}`,
            performer: 'EMS Dispatch'
          });
        } catch (audioError) {
          console.error('Error sending audio to Telegram:', audioError);
        }
      }
      
      return sentMessage.message_id.toString();
      
    } catch (error) {
      console.error('Error sending Telegram notification:', error);
      return null;
    }
  }
  
  private formatNotificationMessage(message: TelegramMessage): string {
    const timestamp = new Date(message.timestamp);
    const timeStr = timestamp.toLocaleTimeString();
    const dateStr = timestamp.toLocaleDateString();
    
    let text = `🚨 <b>EMERGENCY DISPATCH ALERT</b> 🚨\n\n`;
    text += `📅 <b>Date:</b> ${dateStr}\n`;
    text += `⏰ <b>Time:</b> ${timeStr}\n`;
    
    if (message.callType) {
      text += `🏷️ <b>Type:</b> ${message.callType}\n`;
    }
    
    if (message.priority) {
      const priorityEmoji = this.getPriorityEmoji(message.priority);
      text += `${priorityEmoji} <b>Priority:</b> ${message.priority}\n`;
    }
    
    if (message.location) {
      text += `📍 <b>Location:</b> ${message.location}\n`;
    }
    
    if (message.closestHospital) {
      text += `🏥 <b>Closest Hospital:</b> ${message.closestHospital}\n`;
      if (message.hospitalDistance) {
        text += `   📏 Distance: ${message.hospitalDistance.toFixed(1)} miles\n`;
      }
      if (message.hospitalEta) {
        text += `   ⏱️ ETA: ${message.hospitalEta} minutes\n`;
      }
    }
    
    text += `\n💬 <b>Transcript:</b>\n<i>${this.escapeHtml(message.transcript)}</i>\n`;
    
    if (message.callId) {
      text += `\n🔗 <b>Call ID:</b> #${message.callId}`;
    }
    
    return text;
  }
  
  private getPriorityEmoji(priority: string): string {
    const priorityMap: Record<string, string> = {
      'Alpha': '🔴',
      'Bravo': '🟠',
      'Charlie': '🟡',
      'Delta': '🟢',
      'Echo': '🔵',
      'high': '🔴',
      'medium': '🟠',
      'low': '🟢'
    };
    return priorityMap[priority] || '⚪';
  }
  
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
  
  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Remove old entries
    this.rateLimitQueue = this.rateLimitQueue.filter(t => t > windowStart);
    
    // Check if we're under the limit
    if (this.rateLimitQueue.length >= (this.config?.rateLimitPerMinute || 20)) {
      return false;
    }
    
    // Add current request
    this.rateLimitQueue.push(now);
    return true;
  }
  
  async sendBulkNotification(
    messages: TelegramMessage[], 
    groupTitle?: string
  ): Promise<string | null> {
    if (!this.bot || !this.config || !this.isRunning) {
      return null;
    }
    
    try {
      const channelId = this.config.channelId;
      
      // Format bulk message
      let text = `📋 <b>${groupTitle || 'HOSPITAL COMMUNICATION'}</b>\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Add each message
      messages.forEach((msg, index) => {
        const timeStr = new Date(msg.timestamp).toLocaleTimeString();
        text += `${index + 1}. [${timeStr}]\n`;
        text += `<i>${this.escapeHtml(msg.transcript)}</i>\n\n`;
      });
      
      // Send combined message
      const sentMessage = await this.bot.telegram.sendMessage(channelId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      
      // Send all audio files as a media group if available
      const audioFiles = messages.filter(m => m.audioMp3Path);
      if (audioFiles.length > 0) {
        for (const msg of audioFiles) {
          if (msg.audioMp3Path) {
            try {
              const audioBuffer = await fs.readFile(msg.audioMp3Path);
              const audioFile: InputFile = {
                source: audioBuffer,
                filename: `segment_${messages.indexOf(msg) + 1}.mp3`
              };
              
              await this.bot.telegram.sendAudio(channelId, audioFile, {
                reply_to_message_id: sentMessage.message_id,
                caption: `Segment ${messages.indexOf(msg) + 1} - ${new Date(msg.timestamp).toLocaleTimeString()}`
              });
            } catch (error) {
              console.error('Error sending audio segment:', error);
            }
          }
        }
      }
      
      return sentMessage.message_id.toString();
      
    } catch (error) {
      console.error('Error sending bulk Telegram notification:', error);
      return null;
    }
  }
  
  async updateConfig(config: TelegramConfig) {
    this.config = config;
    
    // Restart bot if configuration changed
    if (this.isRunning) {
      await this.stop();
      await this.setupBot();
    }
  }
  
  async testConnection(): Promise<boolean> {
    if (!this.bot || !this.config) {
      return false;
    }
    
    try {
      const me = await this.bot.telegram.getMe();
      console.log(`Telegram bot connected as @${me.username}`);
      
      // Send test message
      await this.bot.telegram.sendMessage(
        this.config.channelId,
        '✅ EMS-Insight Telegram Bot connection test successful!'
      );
      
      return true;
    } catch (error) {
      console.error('Telegram connection test failed:', error);
      return false;
    }
  }
  
  async stop() {
    console.log('Stopping Telegram bot...');
    this.isRunning = false;
    
    if (this.bot) {
      this.bot.stop();
    }
    
    if (this.server) {
      this.server.close();
    }
    
    console.log('Telegram bot stopped');
  }
  
  isActive(): boolean {
    return this.isRunning;
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      configured: !!this.config,
      channelId: this.config?.channelId,
      channelName: this.config?.channelName,
      webhookMode: !!this.config?.webhookUrl,
      port: this.port,
      rateLimitPerMinute: this.config?.rateLimitPerMinute || 20,
      queueLength: this.rateLimitQueue.length
    };
  }
}

// Export singleton instance
export const telegramBot = new TelegramBotService();
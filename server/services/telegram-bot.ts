import TelegramBot from 'node-telegram-bot-api';
import { storage } from '../storage';
import { EventEmitter } from 'events';

export interface TelegramConfig {
  token: string;
  channelId?: string;
  webhookUrl?: string;
  webhookPort?: number;
}

export interface TelegramMessage {
  text: string;
  audio?: Buffer | string;
  audioFilename?: string;
  replyToMessageId?: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
}

export class TelegramBotService extends EventEmitter {
  private bot: TelegramBot | null = null;
  private config: TelegramConfig;
  private isInitialized = false;
  private rateLimitQueue: Map<string, number> = new Map();
  private readonly MAX_MESSAGE_LENGTH = 4096;
  private readonly RATE_LIMIT_MESSAGES = 30; // Telegram allows 30 messages per second
  private readonly RATE_LIMIT_WINDOW = 1000; // 1 second in milliseconds

  constructor() {
    super();
    this.config = {
      token: process.env.TELEGRAM_BOT_TOKEN || '',
      channelId: process.env.TELEGRAM_CHANNEL_ID,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
      webhookPort: parseInt(process.env.TELEGRAM_WEBHOOK_PORT || '3002')
    };
  }

  async initialize(): Promise<boolean> {
    if (!this.config.token) {
      console.error('Telegram bot token not configured');
      return false;
    }

    try {
      // Initialize bot with webhook if URL is provided, otherwise use polling
      if (this.config.webhookUrl && this.config.webhookPort) {
        this.bot = new TelegramBot(this.config.token, {
          webHook: {
            port: this.config.webhookPort,
            host: '0.0.0.0'
          }
        });
        
        // Set webhook URL
        await this.bot.setWebHook(`${this.config.webhookUrl}/${this.config.token}`);
        console.log(`Telegram webhook set to ${this.config.webhookUrl} on port ${this.config.webhookPort}`);
      } else {
        // Use polling for development
        this.bot = new TelegramBot(this.config.token, { polling: true });
        console.log('Telegram bot initialized with polling mode');
      }

      // Set up bot commands
      await this.setupCommands();
      
      // Set up event handlers
      this.setupEventHandlers();

      this.isInitialized = true;
      console.log('Telegram bot service initialized successfully');
      
      // Test connection
      const me = await this.bot.getMe();
      console.log(`Bot info: @${me.username} (${me.first_name})`);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Telegram bot:', error);
      return false;
    }
  }

  private async setupCommands() {
    if (!this.bot) return;

    const commands = [
      { command: 'start', description: 'Start the bot and get information' },
      { command: 'subscribe', description: 'Subscribe to notifications' },
      { command: 'unsubscribe', description: 'Unsubscribe from notifications' },
      { command: 'keywords', description: 'List active keywords' },
      { command: 'addkeyword', description: 'Add a new keyword' },
      { command: 'removekeyword', description: 'Remove a keyword' },
      { command: 'status', description: 'Check notification status' },
      { command: 'help', description: 'Show help message' }
    ];

    await this.bot.setMyCommands(commands);
  }

  private setupEventHandlers() {
    if (!this.bot) return;

    // Handle /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const username = msg.from?.username || 'User';
      
      const welcomeMessage = `
🚨 <b>EMS Dispatch Notification Bot</b> 🚨

Welcome, ${username}!

This bot sends real-time notifications for emergency dispatch calls based on configured keywords.

Available commands:
/keywords - View active keywords
/addkeyword <word> - Add notification keyword
/removekeyword <word> - Remove keyword
/status - Check system status
/help - Show this message

<i>Notifications include location, nearest hospital, audio, and transcript.</i>
      `;
      
      await this.sendMessage(chatId.toString(), welcomeMessage, { parseMode: 'HTML' });
    });

    // Handle /keywords command
    this.bot.onText(/\/keywords/, async (msg) => {
      const chatId = msg.chat.id;
      const keywords = await this.getActiveKeywords();
      
      if (keywords.length === 0) {
        await this.sendMessage(chatId.toString(), '📝 No active keywords configured.');
        return;
      }
      
      const keywordList = keywords.map(k => `• <b>${k.keyword}</b> (${k.match_type})`).join('\n');
      const message = `📝 <b>Active Keywords:</b>\n\n${keywordList}`;
      
      await this.sendMessage(chatId.toString(), message, { parseMode: 'HTML' });
    });

    // Handle /addkeyword command
    this.bot.onText(/\/addkeyword (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const keyword = match?.[1];
      
      if (!keyword) {
        await this.sendMessage(chatId.toString(), '❌ Please provide a keyword. Usage: /addkeyword <word>');
        return;
      }
      
      try {
        await this.addKeyword(keyword, chatId.toString());
        await this.sendMessage(chatId.toString(), `✅ Keyword "${keyword}" added successfully!`);
      } catch (error) {
        await this.sendMessage(chatId.toString(), `❌ Failed to add keyword: ${error}`);
      }
    });

    // Handle /status command
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      const stats = await this.getNotificationStats();
      
      const message = `
📊 <b>Notification System Status</b>

✅ Bot: Online
📡 Webhook: ${this.config.webhookUrl ? 'Active' : 'Polling Mode'}
🎯 Active Keywords: ${stats.activeKeywords}
📨 Notifications (24h): ${stats.notificationsSent24h}
⏱️ Avg Response Time: ${stats.avgResponseTime}ms
🔄 Queue Size: ${stats.queueSize}

<i>Last updated: ${new Date().toLocaleString()}</i>
      `;
      
      await this.sendMessage(chatId.toString(), message, { parseMode: 'HTML' });
    });

    // Handle errors
    this.bot.on('error', (error) => {
      console.error('Telegram bot error:', error);
      this.emit('error', error);
    });

    // Handle webhook errors
    this.bot.on('webhook_error', (error) => {
      console.error('Telegram webhook error:', error);
      this.emit('webhook_error', error);
    });
  }

  async sendMessage(
    chatId: string,
    text: string,
    options: Partial<TelegramMessage> = {}
  ): Promise<TelegramBot.Message | null> {
    if (!this.bot || !this.isInitialized) {
      console.error('Telegram bot not initialized');
      return null;
    }

    try {
      // Apply rate limiting
      await this.applyRateLimit(chatId);

      // Split long messages
      const messages = this.splitLongMessage(text);
      let lastMessage: TelegramBot.Message | null = null;

      for (const messageText of messages) {
        const sendOptions: any = {
          parse_mode: options.parseMode || 'HTML',
          disable_notification: options.disableNotification || false
        };

        if (options.replyToMessageId) {
          sendOptions.reply_to_message_id = options.replyToMessageId;
        }

        lastMessage = await this.bot.sendMessage(chatId, messageText, sendOptions);
      }

      return lastMessage;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      throw error;
    }
  }

  async sendAudio(
    chatId: string,
    audioPath: string,
    caption?: string,
    options: Partial<TelegramMessage> = {}
  ): Promise<TelegramBot.Message | null> {
    if (!this.bot || !this.isInitialized) {
      console.error('Telegram bot not initialized');
      return null;
    }

    try {
      // Apply rate limiting
      await this.applyRateLimit(chatId);

      const sendOptions: any = {
        caption: caption ? this.truncateMessage(caption) : undefined,
        parse_mode: options.parseMode || 'HTML'
      };

      if (options.replyToMessageId) {
        sendOptions.reply_to_message_id = options.replyToMessageId;
      }

      const message = await this.bot.sendAudio(chatId, audioPath, sendOptions);
      return message;
    } catch (error) {
      console.error('Failed to send Telegram audio:', error);
      throw error;
    }
  }

  async sendMediaGroup(
    chatId: string,
    media: Array<{ type: 'audio'; media: string; caption?: string }>
  ): Promise<TelegramBot.Message[] | null> {
    if (!this.bot || !this.isInitialized) {
      console.error('Telegram bot not initialized');
      return null;
    }

    try {
      // Apply rate limiting
      await this.applyRateLimit(chatId);

      const messages = await this.bot.sendMediaGroup(chatId, media);
      return messages;
    } catch (error) {
      console.error('Failed to send Telegram media group:', error);
      throw error;
    }
  }

  private async applyRateLimit(chatId: string): Promise<void> {
    const now = Date.now();
    const lastSent = this.rateLimitQueue.get(chatId) || 0;
    const timeSinceLastSent = now - lastSent;

    if (timeSinceLastSent < this.RATE_LIMIT_WINDOW / this.RATE_LIMIT_MESSAGES) {
      const waitTime = (this.RATE_LIMIT_WINDOW / this.RATE_LIMIT_MESSAGES) - timeSinceLastSent;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.rateLimitQueue.set(chatId, Date.now());
    
    // Clean up old entries
    if (this.rateLimitQueue.size > 100) {
      const oldestAllowed = now - this.RATE_LIMIT_WINDOW * 2;
      for (const [key, time] of this.rateLimitQueue) {
        if (time < oldestAllowed) {
          this.rateLimitQueue.delete(key);
        }
      }
    }
  }

  private splitLongMessage(text: string): string[] {
    if (text.length <= this.MAX_MESSAGE_LENGTH) {
      return [text];
    }

    const messages: string[] = [];
    let currentMessage = '';
    const lines = text.split('\n');

    for (const line of lines) {
      if (currentMessage.length + line.length + 1 > this.MAX_MESSAGE_LENGTH) {
        messages.push(currentMessage);
        currentMessage = line;
      } else {
        currentMessage += (currentMessage ? '\n' : '') + line;
      }
    }

    if (currentMessage) {
      messages.push(currentMessage);
    }

    return messages;
  }

  private truncateMessage(text: string): string {
    if (text.length <= this.MAX_MESSAGE_LENGTH) {
      return text;
    }
    return text.substring(0, this.MAX_MESSAGE_LENGTH - 3) + '...';
  }

  private async getActiveKeywords(): Promise<any[]> {
    try {
      const result = await storage.query(
        'SELECT * FROM notification_keywords WHERE is_active = true ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (error) {
      console.error('Failed to get active keywords:', error);
      return [];
    }
  }

  private async addKeyword(keyword: string, channelId: string): Promise<void> {
    try {
      await storage.query(
        `INSERT INTO notification_keywords (keyword, telegram_channel_id, match_type) 
         VALUES ($1, $2, 'contains')`,
        [keyword.toLowerCase(), channelId]
      );
    } catch (error) {
      console.error('Failed to add keyword:', error);
      throw error;
    }
  }

  private async getNotificationStats(): Promise<any> {
    try {
      const stats = await storage.query(`
        SELECT 
          (SELECT COUNT(*) FROM notification_keywords WHERE is_active = true) as activeKeywords,
          (SELECT COUNT(*) FROM notification_history WHERE sent_at > NOW() - INTERVAL '24 hours' AND status = 'sent') as notificationsSent24h,
          (SELECT COUNT(*) FROM notification_queue WHERE status = 'pending') as queueSize,
          (SELECT AVG(EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000) FROM notification_queue WHERE status = 'completed' AND processed_at > NOW() - INTERVAL '24 hours') as avgResponseTime
      `);
      
      return stats.rows[0] || {
        activeKeywords: 0,
        notificationsSent24h: 0,
        queueSize: 0,
        avgResponseTime: 0
      };
    } catch (error) {
      console.error('Failed to get notification stats:', error);
      return {
        activeKeywords: 0,
        notificationsSent24h: 0,
        queueSize: 0,
        avgResponseTime: 0
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.bot) {
      if (this.config.webhookUrl) {
        await this.bot.deleteWebHook();
      }
      await this.bot.stopPolling();
      this.bot = null;
      this.isInitialized = false;
      console.log('Telegram bot service shut down');
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.bot !== null;
  }
}

export const telegramBotService = new TelegramBotService();
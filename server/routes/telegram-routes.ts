import { Router, Request, Response } from 'express';
import { keywordMonitor } from '../services/keyword-monitor';
import { notificationManager } from '../services/notification-manager';
import { telegramBotService } from '../services/telegram-bot';
import { storage } from '../storage';

const router = Router();

// Get all keywords
router.get('/keywords', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active !== 'false';
    const keywords = await keywordMonitor.getKeywords(activeOnly);
    res.json(keywords);
  } catch (error) {
    console.error('Failed to get keywords:', error);
    res.status(500).json({ error: 'Failed to get keywords' });
  }
});

// Add a new keyword
router.post('/keywords', async (req: Request, res: Response) => {
  try {
    const { keyword, matchType, priority, channelId, minConfidence } = req.body;

    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    const success = await keywordMonitor.addKeyword(
      keyword,
      matchType || 'contains',
      priority || 'normal',
      channelId || process.env.TELEGRAM_CHANNEL_ID,
      minConfidence || 0.7
    );

    if (success) {
      res.json({ message: 'Keyword added successfully' });
    } else {
      res.status(500).json({ error: 'Failed to add keyword' });
    }
  } catch (error) {
    console.error('Failed to add keyword:', error);
    res.status(500).json({ error: 'Failed to add keyword' });
  }
});

// Update a keyword
router.put('/keywords/:id', async (req: Request, res: Response) => {
  try {
    const keywordId = parseInt(req.params.id);
    const updates = req.body;

    const success = await keywordMonitor.updateKeyword(keywordId, updates);

    if (success) {
      res.json({ message: 'Keyword updated successfully' });
    } else {
      res.status(404).json({ error: 'Keyword not found' });
    }
  } catch (error) {
    console.error('Failed to update keyword:', error);
    res.status(500).json({ error: 'Failed to update keyword' });
  }
});

// Delete/deactivate a keyword
router.delete('/keywords/:id', async (req: Request, res: Response) => {
  try {
    const keywordId = parseInt(req.params.id);
    const success = await keywordMonitor.removeKeyword(keywordId);

    if (success) {
      res.json({ message: 'Keyword removed successfully' });
    } else {
      res.status(404).json({ error: 'Keyword not found' });
    }
  } catch (error) {
    console.error('Failed to remove keyword:', error);
    res.status(500).json({ error: 'Failed to remove keyword' });
  }
});

// Get notification history
router.get('/notifications/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await storage.query(
      `SELECT nh.*, nk.keyword, c.location, c.call_type, c.timestamp as call_timestamp
       FROM notification_history nh
       LEFT JOIN notification_keywords nk ON nh.keyword_id = nk.id
       LEFT JOIN calls c ON nh.call_id = c.id
       ORDER BY nh.sent_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Failed to get notification history:', error);
    res.status(500).json({ error: 'Failed to get notification history' });
  }
});

// Get notification statistics
router.get('/notifications/stats', async (req: Request, res: Response) => {
  try {
    const stats = await notificationManager.getNotificationStats();
    const keywordCount = keywordMonitor.getActiveKeywordCount();
    const botStatus = telegramBotService.isReady();

    res.json({
      ...stats,
      activeKeywords: keywordCount,
      botStatus: botStatus ? 'online' : 'offline'
    });
  } catch (error) {
    console.error('Failed to get notification stats:', error);
    res.status(500).json({ error: 'Failed to get notification stats' });
  }
});

// Send a test notification
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { message, channelId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const targetChannel = channelId || process.env.TELEGRAM_CHANNEL_ID;
    if (!targetChannel) {
      return res.status(400).json({ error: 'No channel ID configured' });
    }

    const testMessage = `🧪 <b>TEST NOTIFICATION</b>\n\n${message}\n\n<i>Sent at ${new Date().toLocaleString()}</i>`;
    
    const result = await telegramBotService.sendMessage(targetChannel, testMessage, {
      parseMode: 'HTML'
    });

    if (result) {
      res.json({ 
        message: 'Test notification sent successfully',
        messageId: result.message_id,
        channelId: targetChannel
      });
    } else {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Failed to send test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Get Telegram bot info
router.get('/bot/info', async (req: Request, res: Response) => {
  try {
    if (!telegramBotService.isReady()) {
      return res.status(503).json({ error: 'Telegram bot not initialized' });
    }

    // Get bot info from Telegram API
    const botInfoQuery = await storage.query(
      `SELECT 
        COUNT(DISTINCT telegram_channel_id) as channel_count,
        COUNT(*) as total_keywords,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_keywords
       FROM notification_keywords`
    );

    res.json({
      status: 'online',
      webhookPort: process.env.TELEGRAM_WEBHOOK_PORT || 3002,
      ...botInfoQuery.rows[0]
    });
  } catch (error) {
    console.error('Failed to get bot info:', error);
    res.status(500).json({ error: 'Failed to get bot info' });
  }
});

// Webhook endpoint for Telegram updates (if using webhooks)
router.post('/webhook/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    
    // Verify token matches bot token
    if (token !== process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Process Telegram update
    // This would be handled by the telegram-bot service internally
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Get notification queue status
router.get('/queue/status', async (req: Request, res: Response) => {
  try {
    const result = await storage.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM notification_queue
      GROUP BY status
    `);

    const queueStats = result.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    res.json({
      queue: queueStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get queue status:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// Manual notification trigger (for testing)
router.post('/notifications/manual', async (req: Request, res: Response) => {
  try {
    const { callId, keywords } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'Call ID is required' });
    }

    // Get call data
    const callResult = await storage.query(
      `SELECT * FROM calls WHERE id = $1`,
      [callId]
    );

    if (callResult.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = callResult.rows[0];
    
    // Create fake keyword matches for manual trigger
    const matches = (keywords || ['manual']).map((keyword: string) => ({
      keywordId: 0,
      keyword,
      matchType: 'manual',
      priority: 'normal',
      matched: keyword,
      confidence: call.confidence || 0.9,
      channelId: process.env.TELEGRAM_CHANNEL_ID
    }));

    // Queue the notification
    await notificationManager.queueNotification({
      id: call.id,
      transcript: call.transcript || '',
      confidence: call.confidence || 0.9,
      location: call.location,
      callType: call.call_type,
      units: call.units,
      timestamp: call.timestamp,
      audioPath: call.audio_path,
      talkgroup: call.talkgroup,
      latitude: call.latitude,
      longitude: call.longitude
    }, matches);

    res.json({ message: 'Notification queued for manual trigger' });
  } catch (error) {
    console.error('Failed to trigger manual notification:', error);
    res.status(500).json({ error: 'Failed to trigger manual notification' });
  }
});

export default router;
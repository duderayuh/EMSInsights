import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import { storage } from './storage';
import { 
  insertCallSchema, insertUserSchema, insertAudioSegmentSchema, 
  insertCallStatsSchema, insertSystemHealthSchema, insertHospitalCallSchema,
  insertAlertSchema, insertAlertRuleSchema, insertIncidentSchema,
  type User, type Call, type AudioSegment 
} from '@shared/schema';

// Import services
import { TelegramBotService } from './services/telegram-bot';
import { KeywordMonitorService } from './services/keyword-monitor';
import { RdioScannerManager } from './services/rdio-scanner-manager';
import { AudioProcessor } from './services/audio-processor';
import { TranscriptionService } from './services/transcription';
import { authService } from './services/auth-service';

// Initialize services
const telegramBotService = new TelegramBotService();
const keywordMonitor = new KeywordMonitorService();
const rdioScannerManager = new RdioScannerManager();
const audioProcessor = new AudioProcessor();
const transcriptionService = new TranscriptionService();

// WebSocket for real-time updates
let wss: WebSocketServer;

export async function registerRoutes(app: Express) {
  // Storage is already initialized as a singleton
  
  // Initialize default admin user if it doesn't exist
  await initializeDefaultAdmin();

  // Create HTTP server for WebSocket
  const server = createServer(app);

  // Initialize WebSocket server on a different port to avoid conflicts with Vite HMR
  wss = new WebSocketServer({ 
    server,
    path: '/api/ws'  // Use a specific path to avoid conflicts
  });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Broadcast function for real-time updates
  function broadcast(data: any) {
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  // Authentication routes
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      // Verify user credentials
      const user = await authService.verifyUser({ username, password });
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      
      // Create session
      const session = await authService.createSession(user.id);
      
      // Set session cookie
      res.cookie('sessionId', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      // Return user info (without password)
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      const sessionId = req.cookies?.sessionId;
      if (sessionId) {
        await authService.deleteSession(sessionId);
      }
      res.clearCookie('sessionId');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    try {
      const sessionId = req.cookies?.sessionId;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const user = await authService.getSessionUser(sessionId);
      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }
      
      // Return user info (without password)
      const { password: _, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  // User routes
  app.get('/api/users', async (_req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.post('/api/users', async (req: Request, res: Response) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error) {
      res.status(400).json({ error: 'Invalid user data' });
    }
  });

  app.get('/api/users/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // Call routes
  app.get('/api/calls', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const calls = await storage.getRecentCalls(limit);
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch calls' });
    }
  });

  app.get('/api/calls/active', async (_req: Request, res: Response) => {
    try {
      const calls = await storage.getActiveCalls();
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch active calls' });
    }
  });

  app.post('/api/calls', async (req: Request, res: Response) => {
    try {
      const callData = insertCallSchema.parse(req.body);
      const call = await storage.createCall(callData);
      
      // Broadcast new call to WebSocket clients
      broadcast({ type: 'new_call', data: call });
      
      res.json(call);
    } catch (error) {
      res.status(400).json({ error: 'Invalid call data' });
    }
  });

  app.get('/api/calls/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }
      res.json(call);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch call' });
    }
  });

  app.patch('/api/calls/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const call = await storage.updateCall(id, updates);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      // Broadcast call update
      broadcast({ type: 'call_update', data: call });
      
      res.json(call);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update call' });
    }
  });

  // Hospital calls routes
  app.get('/api/hospital-calls', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const hospital = req.query.hospital as string;
      const search = req.query.search as string;
      const sorOnly = req.query.sorOnly === 'true';
      
      const calls = await storage.getHospitalCalls(limit, hospital, 0, search, sorOnly);
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch hospital calls' });
    }
  });

  app.post('/api/hospital-calls', async (req: Request, res: Response) => {
    try {
      const callData = insertHospitalCallSchema.parse(req.body);
      const call = await storage.createHospitalCall(callData);
      res.json(call);
    } catch (error) {
      res.status(400).json({ error: 'Invalid hospital call data' });
    }
  });

  // Audio routes
  app.get('/api/audio/segment/:id', async (req: Request, res: Response) => {
    try {
      const segmentId = req.params.id;
      const segment = await storage.getAudioSegment(segmentId);
      
      if (!segment || !segment.filepath) {
        return res.status(404).json({ error: 'Audio segment not found' });
      }

      const audioPath = path.resolve(segment.filepath);
      
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: 'Audio file not found' });
      }

      const stat = fs.statSync(audioPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(audioPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/wav',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'audio/wav',
        };
        res.writeHead(200, head);
        fs.createReadStream(audioPath).pipe(res);
      }
    } catch (error) {
      console.error('Error serving audio:', error);
      res.status(500).json({ error: 'Failed to serve audio file' });
    }
  });

  // Stats routes
  app.get('/api/stats/current', async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getCurrentStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  app.get('/api/stats/period', async (req: Request, res: Response) => {
    try {
      const startDate = new Date(req.query.start as string);
      const endDate = new Date(req.query.end as string);
      const stats = await storage.getStatsForPeriod(startDate, endDate);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch period stats' });
    }
  });

  // System health routes
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const health = await storage.getSystemHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch system health' });
    }
  });

  // Alert routes
  app.get('/api/alerts', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const alerts = await storage.getAllAlerts(limit);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  app.post('/api/alerts', async (req: Request, res: Response) => {
    try {
      const alertData = insertAlertSchema.parse(req.body);
      const alert = await storage.createAlert(alertData);
      
      // Broadcast new alert
      broadcast({ type: 'new_alert', data: alert });
      
      res.json(alert);
    } catch (error) {
      res.status(400).json({ error: 'Invalid alert data' });
    }
  });

  // Search routes
  app.get('/api/search/calls', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const callType = req.query.type as string;
      const priority = req.query.priority as string;
      const limit = parseInt(req.query.limit as string) || 50;

      const searchParams = {
        query,
        callType,
        priority,
        limit
      };

      const calls = await storage.searchCalls(searchParams);
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: 'Failed to search calls' });
    }
  });

  // Initialize services after routes are set up
  await initializeTelegramBot();
  
  return server;
}

async function initializeDefaultAdmin() {
  try {
    // Check if admin user exists
    const existingAdmin = await storage.getUserByUsername('admin');
    if (!existingAdmin) {
      console.log('Creating default admin user...');
      
      // Create default admin user
      await authService.createUser({
        username: 'admin',
        password: 'admin123',
        email: 'admin@example.com',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'super_admin'
      });
      
      console.log('✅ Default admin user created');
      console.log('Username: admin');
      console.log('Password: admin123');
      console.log('Please change the password after first login!');
    }
  } catch (error) {
    console.error('Error creating default admin user:', error);
  }
}

async function initializeTelegramBot() {
  try {
    console.log('Initializing Telegram notification bot...');
    
    // Check if Telegram bot token is configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.log('Telegram bot token not configured - skipping initialization');
      console.log('Set TELEGRAM_BOT_TOKEN environment variable to enable notifications');
      return;
    }
    
    // Initialize the Telegram bot service
    const success = await telegramBotService.initialize();
    
    if (success) {
      console.log('✅ Telegram bot initialized successfully');
      
      // Start webhook server on port 3002 if webhook URL is configured
      if (process.env.TELEGRAM_WEBHOOK_URL) {
        const webhookPort = parseInt(process.env.TELEGRAM_WEBHOOK_PORT || '3002');
        console.log(`Telegram webhook server listening on port ${webhookPort}`);
      } else {
        console.log('Telegram bot using polling mode (no webhook URL configured)');
      }
      
      // Load initial keywords from database
      await keywordMonitor.refreshKeywords();
      console.log(`Loaded ${keywordMonitor.getActiveKeywordCount()} active notification keywords`);
      
    } else {
      console.error('❌ Failed to initialize Telegram bot - check configuration');
    }
  } catch (error) {
    console.error('Error initializing Telegram bot:', error);
  }
}

export { rdioScannerManager, audioProcessor, transcriptionService };
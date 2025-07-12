import { config } from "dotenv";
config(); // Load .env file first

import { EventEmitter } from 'events';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage';
import WebSocket from 'ws';

interface RdioScannerCall {
  id: string;
  dateTime: string;
  talkgroup: string;
  system: string;
  freq: number;
  duration: number;
  audio?: ArrayBuffer | string; // audio data or URL
  source?: string;
  talkgroupLabel?: string;
  systemLabel?: string;
  unit?: string;
  [key: string]: any;
}

interface RdioScannerConfig {
  baseUrl: string;
  apiKey?: string;
  systems?: string[]; // Filter by specific systems
  talkgroups?: string[]; // Filter by specific talkgroups
}

export class RdioScannerClient extends EventEmitter {
  private config: RdioScannerConfig;
  private audioDir: string;
  private connected: boolean = false;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private processedCalls: Set<string> = new Set();
  private monitoredSystems: Set<string> = new Set();
  private monitoredTalkgroups: Set<string> = new Set();

  constructor(config: RdioScannerConfig) {
    super();
    this.config = config;
    this.audioDir = join(process.cwd(), 'audio_segments');
    this.ensureAudioDir();
    
    // Setup monitored systems and talkgroups
    if (config.systems) {
      config.systems.forEach(system => this.monitoredSystems.add(system));
    }
    if (config.talkgroups) {
      config.talkgroups.forEach(tg => this.monitoredTalkgroups.add(tg));
    }
  }

  private ensureAudioDir() {
    if (!existsSync(this.audioDir)) {
      mkdirSync(this.audioDir, { recursive: true });
    }
  }

  async startPolling() {
    this.connect();
  }

  async stopPolling() {
    this.disconnect();
  }

  private connect() {
    if (this.connected || this.ws) {
      console.log('Rdio Scanner WebSocket already connected');
      return;
    }

    try {
      // Try multiple WebSocket URL formats that Rdio Scanner might use
      const possibleUrls = [
        this.config.baseUrl.replace('http', 'ws'),
        this.config.baseUrl.replace('http', 'ws') + '/socket.io/',
        this.config.baseUrl.replace('http', 'ws') + '/ws',
        this.config.baseUrl.replace('http', 'ws') + '/api/websocket'
      ];
      
      const wsUrl = possibleUrls[0]; // Start with the basic one
      console.log(`Connecting to Rdio Scanner WebSocket: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        console.log('Rdio Scanner WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        
        // Send initial configuration if needed
        this.sendConfig();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const rawMessage = data.toString();
          console.log(`Received WebSocket message: ${rawMessage.substring(0, 200)}${rawMessage.length > 200 ? '...' : ''}`);
          
          const message = JSON.parse(rawMessage);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          console.error('Raw message:', data.toString().substring(0, 500));
        }
      });

      this.ws.on('close', () => {
        console.log('Rdio Scanner WebSocket disconnected');
        this.connected = false;
        this.ws = null;
        this.emit('disconnected');
        
        // Attempt to reconnect
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('Rdio Scanner WebSocket error:', error);
        this.emit('error', error);
        this.connected = false;
        this.ws = null;
      });

    } catch (error) {
      console.error('Failed to connect to Rdio Scanner WebSocket:', error);
      this.emit('error', error);
    }
  }

  private disconnect() {
    console.log('Disconnecting from Rdio Scanner WebSocket');
    this.connected = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.emit('disconnected');
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private sendConfig() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      // Send subscription message to start receiving calls
      const subscribeMessage = {
        type: 'subscribe',
        systems: Array.from(this.monitoredSystems),
        talkgroups: Array.from(this.monitoredTalkgroups)
      };
      
      console.log('Sending subscription message:', JSON.stringify(subscribeMessage));
      this.ws.send(JSON.stringify(subscribeMessage));
      
      // Also try alternative formats that Rdio Scanner might expect
      const altSubscribe = {
        command: 'subscribe',
        filter: {
          systems: Array.from(this.monitoredSystems),
          talkgroups: Array.from(this.monitoredTalkgroups)
        }
      };
      
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          console.log('Sending alternative subscription format:', JSON.stringify(altSubscribe));
          this.ws.send(JSON.stringify(altSubscribe));
        }
      }, 1000);
      
    } catch (error) {
      console.error('Error sending config to Rdio Scanner:', error);
    }
  }

  private handleMessage(message: any) {
    console.log(`Handling message type: ${message.type || 'unknown'}`);
    console.log(`Message data:`, JSON.stringify(message, null, 2).substring(0, 500));
    
    // Handle different message types from Rdio Scanner
    switch (message.type) {
      case 'call':
        console.log('Processing call message');
        this.handleCall(message.data);
        break;
      case 'config':
        console.log('Processing config message');
        this.handleConfig(message.data);
        break;
      case 'pong':
        // Ignore pong messages
        break;
      default:
        console.log('Unknown message type from Rdio Scanner:', message.type);
        console.log('Full message:', JSON.stringify(message, null, 2));
    }
  }

  private async handleCall(callData: any) {
    try {
      // Check if this call matches our filters
      const systemMatch = this.monitoredSystems.size === 0 || this.monitoredSystems.has(callData.system);
      const talkgroupMatch = this.monitoredTalkgroups.size === 0 || this.monitoredTalkgroups.has(callData.talkgroup?.toString());

      if (!systemMatch || !talkgroupMatch) {
        return; // Skip calls that don't match our filters
      }

      const callId = `${callData.system}-${callData.talkgroup}-${callData.dateTime || Date.now()}`;
      
      if (this.processedCalls.has(callId)) {
        return; // Skip already processed calls
      }

      console.log(`Processing call from Rdio Scanner: ${callId}`);
      await this.processCall(callData);
      this.processedCalls.add(callId);
      
    } catch (error) {
      console.error('Error handling call from Rdio Scanner:', error);
    }
  }

  private handleConfig(configData: any) {
    console.log('Received config from Rdio Scanner:', configData);
  }



  private async processCall(call: any) {
    try {
      const callId = `${call.system}-${call.talkgroup}-${call.dateTime || Date.now()}`;
      console.log(`Processing call ${callId} from talkgroup ${call.talkgroup}`);

      // Generate unique segment ID
      const segmentId = uuidv4();
      const filepath = join(this.audioDir, `${segmentId}.wav`);

      // Handle audio data - could be base64, ArrayBuffer, or URL
      let audioBuffer: Buffer;
      let audioProcessed = false;
      
      if (typeof call.audio === 'string' && call.audio.startsWith('http')) {
        // Audio is a URL - fetch it
        console.log(`Fetching audio from URL: ${call.audio}`);
        const response = await fetch(call.audio);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio from ${call.audio}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
        audioProcessed = true;
      } else if (typeof call.audio === 'string' && call.audio.length > 0) {
        // Audio is base64 encoded
        console.log(`Processing base64 audio data (${call.audio.length} chars)`);
        audioBuffer = Buffer.from(call.audio, 'base64');
        audioProcessed = true;
      } else if (call.audio instanceof ArrayBuffer) {
        // Audio is ArrayBuffer
        console.log(`Processing ArrayBuffer audio data (${call.audio.byteLength} bytes)`);
        audioBuffer = Buffer.from(call.audio);
        audioProcessed = true;
      } else {
        // No audio data available, still create record but don't process audio
        console.warn(`No audio data available for call ${callId} - creating metadata-only record`);
        audioBuffer = Buffer.alloc(0);
      }

      // Create WAV file if we have audio data
      if (audioBuffer.length > 0) {
        const wavBuffer = this.createWavFile(audioBuffer);
        writeFileSync(filepath, wavBuffer);
        console.log(`Audio file created: ${filepath} (${audioBuffer.length} bytes)`);
      }

      // Store audio segment metadata (even if no audio, for tracking)
      await storage.createAudioSegment({
        id: segmentId,
        filepath,
        duration: call.duration || 0,
        sampleRate: 8000, // Common for scanner audio
        channels: 1,
        timestamp: new Date(call.dateTime || Date.now()),
        processed: false
      });

      // Create preliminary call record with scanner metadata
      const callRecord = await storage.createCall({
        timestamp: new Date(call.dateTime || Date.now()),
        audioSegmentId: segmentId,
        transcript: '', // Will be filled by transcription service
        confidence: 0,
        startMs: 0,
        endMs: Math.round((call.duration || 0) * 1000),
        callType: 'Scanner Audio', // Will be classified after transcription
        status: 'active',
        location: '',
        talkgroup: call.talkgroup?.toString(),
        system: call.system?.toString(),
        frequency: call.freq || call.frequency,
        duration: call.duration || 0,
        metadata: {
          rdioScannerId: callId,
          talkgroupLabel: call.talkgroupLabel,
          systemLabel: call.systemLabel,
          unit: call.unit,
          source: call.source,
          audioProcessed
        }
      });

      console.log(`Call ${callId} processed as segment ${segmentId} (audio: ${audioProcessed ? 'yes' : 'no'})`);
      
      // Emit events for further processing
      this.emit('segmentReady', segmentId);
      this.emit('callCreated', callRecord);
      
    } catch (error) {
      console.error(`Error processing call:`, error);
      this.emit('error', error);
    }
  }

  private createWavFile(audioData: Buffer): Buffer {
    const dataSize = audioData.length;
    const fileSize = 44 + dataSize - 8;
    const sampleRate = 8000; // Common for scanner audio
    const channels = 1;
    
    const header = Buffer.alloc(44);
    
    // WAV header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Format chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * 2, 28); // Byte rate
    header.writeUInt16LE(channels * 2, 32); // Block align
    header.writeUInt16LE(16, 34); // Bits per sample
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    
    return Buffer.concat([header, audioData]);
  }

  getStatus() {
    return {
      connected: this.connected,
      baseUrl: this.config.baseUrl,
      processedCalls: this.processedCalls.size,
      systems: this.config.systems || [],
      talkgroups: this.config.talkgroups || [],
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  // Configuration methods
  updateConfig(newConfig: Partial<RdioScannerConfig>) {
    this.config = { ...this.config, ...newConfig };
    
    // Update monitored systems and talkgroups
    this.monitoredSystems.clear();
    this.monitoredTalkgroups.clear();
    
    if (newConfig.systems) {
      newConfig.systems.forEach(system => this.monitoredSystems.add(system));
    }
    if (newConfig.talkgroups) {
      newConfig.talkgroups.forEach(tg => this.monitoredTalkgroups.add(tg));
    }
    
    // Restart connection if active
    if (this.connected) {
      this.disconnect();
      setTimeout(() => this.connect(), 1000);
    }
  }

  addSystem(system: string) {
    if (!this.config.systems) this.config.systems = [];
    if (!this.config.systems.includes(system)) {
      this.config.systems.push(system);
    }
  }

  addTalkgroup(talkgroup: string) {
    if (!this.config.talkgroups) this.config.talkgroups = [];
    if (!this.config.talkgroups.includes(talkgroup)) {
      this.config.talkgroups.push(talkgroup);
    }
  }
}

// Debug environment variables
console.log('RdioScanner Environment Variables:');
console.log('RDIO_SCANNER_URL:', process.env.RDIO_SCANNER_URL);
console.log('RDIO_SCANNER_API_KEY:', process.env.RDIO_SCANNER_API_KEY ? 'SET' : 'NOT SET');
console.log('RDIO_SCANNER_SYSTEMS:', process.env.RDIO_SCANNER_SYSTEMS);
console.log('RDIO_SCANNER_TALKGROUPS:', process.env.RDIO_SCANNER_TALKGROUPS);

export const rdioScannerClient = new RdioScannerClient({
  baseUrl: 'http://localhost:3001', // Use local Rdio Scanner instance
  apiKey: process.env.RDIO_SCANNER_API_KEY,
  systems: process.env.RDIO_SCANNER_SYSTEMS?.split(','),
  talkgroups: process.env.RDIO_SCANNER_TALKGROUPS?.split(',')
});
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage';
import dgram from 'dgram';

export class AudioProcessor extends EventEmitter {
  private audioDir: string;
  private chunkSize: number = 30; // 30 seconds
  private sampleRate: number = 48000;
  private channels: number = 1;
  private currentChunk: Buffer[] = [];
  private chunkStartTime: number = 0;
  private isProcessing: boolean = false;
  private udpServer: dgram.Socket | null = null;
  private pipeProcess: ChildProcess | null = null;
  private chunkTimer: NodeJS.Timeout | null = null;
  private audioThreshold: number = 512; // Minimum bytes for audio detection
  private silenceTimeout: number = 5000; // 5 seconds of silence before finalizing

  constructor() {
    super();
    this.audioDir = join(process.cwd(), 'audio_segments');
    this.ensureAudioDir();
  }

  private ensureAudioDir() {
    if (!existsSync(this.audioDir)) {
      mkdirSync(this.audioDir, { recursive: true });
    }
  }

  async startSDRTrunkListener(host: string = 'localhost', port: number = 9999) {
    console.log(`Starting SDRTrunk UDP listener on ${host}:${port}`);
    
    try {
      // Create UDP server to listen for SDRTrunk audio stream
      this.udpServer = dgram.createSocket('udp4');
      
      this.udpServer.on('message', (msg: Buffer, rinfo) => {
        console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
        this.processAudioData(msg);
      });

      this.udpServer.on('error', (err) => {
        console.error('UDP Server error:', err);
        this.emit('error', err);
      });

      this.udpServer.on('listening', () => {
        const address = this.udpServer!.address();
        console.log(`SDRTrunk UDP server listening on ${address.address}:${address.port}`);
        this.emit('connected');
      });

      this.udpServer.bind(port, host);
      
    } catch (error) {
      console.error('Failed to start SDRTrunk UDP listener:', error);
      this.emit('error', error);
    }
  }

  private processAudioData(audioData: Buffer) {
    // Basic voice activity detection - check if audio has sufficient energy
    const hasAudio = this.detectVoiceActivity(audioData);
    
    if (hasAudio) {
      if (!this.isProcessing) {
        this.chunkStartTime = Date.now();
        this.isProcessing = true;
        console.log('Audio activity detected, starting new chunk');
      }

      this.currentChunk.push(audioData);
      
      // Reset silence timer
      if (this.chunkTimer) {
        clearTimeout(this.chunkTimer);
      }
      
      // Set timer to finalize chunk after silence
      this.chunkTimer = setTimeout(() => {
        console.log('Silence detected, finalizing chunk');
        this.finalizeChunk();
      }, this.silenceTimeout);

      // Also check for maximum chunk size (30 seconds)
      const totalBytes = this.currentChunk.reduce((sum, chunk) => sum + chunk.length, 0);
      const expectedBytes = this.sampleRate * this.channels * 2 * this.chunkSize; // 16-bit samples

      if (totalBytes >= expectedBytes) {
        console.log('Maximum chunk size reached, finalizing');
        this.finalizeChunk();
      }
    }
  }

  private detectVoiceActivity(audioData: Buffer): boolean {
    // Simple energy-based voice activity detection
    if (audioData.length < this.audioThreshold) {
      return false;
    }

    let energy = 0;
    for (let i = 0; i < audioData.length; i += 2) {
      // Assume 16-bit samples
      const sample = audioData.readInt16LE(i);
      energy += sample * sample;
    }
    
    const rms = Math.sqrt(energy / (audioData.length / 2));
    const threshold = 1000; // Adjust based on your audio levels
    
    return rms > threshold;
  }

  private async finalizeChunk() {
    if (this.currentChunk.length === 0) return;

    // Clear any pending timer
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }

    const segmentId = uuidv4();
    const filename = `${segmentId}.wav`;
    const filepath = join(this.audioDir, filename);

    try {
      // Combine all chunks into a single buffer
      const audioBuffer = Buffer.concat(this.currentChunk);
      
      // Calculate actual duration based on audio data
      const actualDuration = (audioBuffer.length / (this.sampleRate * this.channels * 2));
      
      // Create WAV file with proper header
      const wavBuffer = this.createWavFile(audioBuffer);
      
      // Write to file synchronously to ensure completion
      writeFileSync(filepath, wavBuffer);

      // Store segment metadata
      await storage.createAudioSegment({
        id: segmentId,
        filepath,
        duration: actualDuration,
        sampleRate: this.sampleRate,
        channels: this.channels,
        timestamp: new Date(this.chunkStartTime),
        processed: false
      });

      console.log(`Audio segment ${segmentId} saved (${actualDuration.toFixed(2)}s, ${audioBuffer.length} bytes)`);
      
      // Reset for next chunk
      this.currentChunk = [];
      this.isProcessing = false;
      
      // Emit event for transcription processing
      this.emit('segmentReady', segmentId);
      
    } catch (error) {
      console.error('Error finalizing audio chunk:', error);
      this.emit('error', error);
    }
  }

  private createWavFile(audioData: Buffer): Buffer {
    const dataSize = audioData.length;
    const fileSize = 44 + dataSize - 8;
    
    const header = Buffer.alloc(44);
    
    // WAV header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Format chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(this.sampleRate * this.channels * 2, 28); // Byte rate
    header.writeUInt16LE(this.channels * 2, 32); // Block align
    header.writeUInt16LE(16, 34); // Bits per sample
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    
    return Buffer.concat([header, audioData]);
  }

  async startPipeListener(pipePath: string) {
    console.log(`Starting pipe listener on ${pipePath}`);
    
    try {
      const cat = spawn('cat', [pipePath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      cat.stdout.on('data', (data: Buffer) => {
        this.processAudioData(data);
      });

      cat.stderr.on('data', (data) => {
        console.error('Pipe listener error:', data.toString());
      });

      cat.on('close', (code) => {
        console.log(`Pipe listener closed with code ${code}`);
        this.emit('disconnected');
      });

      this.emit('connected');
      
    } catch (error) {
      console.error('Failed to start pipe listener:', error);
      this.emit('error', error);
    }
  }

  getStatus() {
    return {
      isProcessing: this.isProcessing,
      currentChunkSize: this.currentChunk.length,
      chunkStartTime: this.chunkStartTime
    };
  }
}

export const audioProcessor = new AudioProcessor();

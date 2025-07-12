import { EventEmitter } from 'events';
import { watch, readdir, stat, copyFile, access } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage';

interface AudioFileInfo {
  filename: string;
  fullPath: string;
  size: number;
  mtime: Date;
  talkgroup?: string;
  system?: string;
  frequency?: number;
}

export class RdioFileMonitor extends EventEmitter {
  private rdioAudioDir: string;
  private ems_audioDir: string;
  private watchingDirs: Set<string> = new Set();
  private processedFiles: Set<string> = new Set();
  private isMonitoring: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private lastScanTime: number = Date.now();

  constructor() {
    super();
    
    // Common Rdio Scanner audio directory locations
    const possibleDirs = [
      'rdio-scanner-server/audio',
      'rdio-scanner/audio', 
      './audio',
      '../rdio-scanner-server/audio',
      '/opt/rdio-scanner/audio',
      '/var/rdio-scanner/audio'
    ];
    
    // Find the first existing directory
    this.rdioAudioDir = possibleDirs.find(dir => existsSync(dir)) || 'rdio-scanner-server/audio';
    this.ems_audioDir = join(process.cwd(), 'ems_audio_processing');
    
    this.ensureDirectories();
    console.log(`Rdio File Monitor initialized:`);
    console.log(`  Watching: ${this.rdioAudioDir}`);
    console.log(`  Processing to: ${this.ems_audioDir}`);
  }

  private ensureDirectories() {
    if (!existsSync(this.ems_audioDir)) {
      mkdirSync(this.ems_audioDir, { recursive: true });
    }
    
    // Also create the rdio audio dir if it doesn't exist
    if (!existsSync(this.rdioAudioDir)) {
      mkdirSync(this.rdioAudioDir, { recursive: true });
      console.log(`Created Rdio Scanner audio directory: ${this.rdioAudioDir}`);
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('File monitor already running');
      return;
    }

    this.isMonitoring = true;
    console.log('Starting Rdio Scanner file monitoring...');

    try {
      // Start periodic scanning for new files
      this.scanInterval = setInterval(() => {
        this.scanForNewFiles();
      }, 5000); // Scan every 5 seconds

      // Initial scan
      await this.scanForNewFiles();
      
      this.emit('started');
      console.log('Rdio Scanner file monitoring started successfully');
      
    } catch (error) {
      console.error('Failed to start file monitoring:', error);
      this.isMonitoring = false;
      this.emit('error', error);
    }
  }

  async stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    this.emit('stopped');
    console.log('Rdio Scanner file monitoring stopped');
  }

  private async scanForNewFiles() {
    try {
      if (!existsSync(this.rdioAudioDir)) {
        return;
      }

      const files = await readdir(this.rdioAudioDir);
      const audioFiles = files.filter(file => {
        const ext = extname(file).toLowerCase();
        return ext === '.wav' || ext === '.mp3' || ext === '.m4a' || ext === '.ogg';
      });

      for (const file of audioFiles) {
        const fullPath = join(this.rdioAudioDir, file);
        
        if (this.processedFiles.has(fullPath)) {
          continue; // Already processed
        }

        try {
          const stats = await stat(fullPath);
          
          // Only process files that are at least 1 second old to ensure they're complete
          if (Date.now() - stats.mtime.getTime() < 1000) {
            continue;
          }

          // Only process files modified since last scan (or newer files)
          if (stats.mtime.getTime() > this.lastScanTime) {
            await this.processAudioFile({
              filename: file,
              fullPath,
              size: stats.size,
              mtime: stats.mtime
            });
          }
          
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
        }
      }

      this.lastScanTime = Date.now();
      
    } catch (error) {
      console.error('Error scanning for new files:', error);
      this.emit('error', error);
    }
  }

  private async processAudioFile(fileInfo: AudioFileInfo) {
    try {
      console.log(`Processing new audio file: ${fileInfo.filename}`);
      
      // Extract metadata from filename if possible
      const metadata = this.extractMetadataFromFilename(fileInfo.filename);
      
      // Generate unique segment ID
      const segmentId = uuidv4();
      const targetPath = join(this.ems_audioDir, `${segmentId}.wav`);
      
      // Copy file to our processing directory
      await copyFile(fileInfo.fullPath, targetPath);
      console.log(`Copied audio file to: ${targetPath}`);
      
      // Create audio segment record
      await storage.createAudioSegment({
        id: segmentId,
        filepath: targetPath,
        duration: 0, // Will be updated after processing
        sampleRate: 8000, // Default for scanner audio
        channels: 1,
        timestamp: fileInfo.mtime,
        processed: false
      });

      // Create preliminary call record
      const callRecord = await storage.createCall({
        timestamp: fileInfo.mtime,
        audioSegmentId: segmentId,
        transcript: '', // Will be filled by transcription
        confidence: 0,
        startMs: 0,
        endMs: 0,
        callType: 'Scanner Audio',
        status: 'active',
        location: '',
        talkgroup: metadata.talkgroup,
        system: metadata.system,
        frequency: metadata.frequency,
        duration: 0,
        metadata: {
          sourceFile: fileInfo.filename,
          fileSize: fileInfo.size,
          rdioScanner: true
        }
      });

      // Mark as processed
      this.processedFiles.add(fileInfo.fullPath);
      
      // Emit events for further processing
      this.emit('fileProcessed', {
        segmentId,
        callRecord,
        originalFile: fileInfo.fullPath,
        processedFile: targetPath
      });
      
      this.emit('segmentReady', segmentId);
      
      console.log(`Audio file processed successfully: ${fileInfo.filename} -> ${segmentId}`);
      
    } catch (error) {
      console.error(`Error processing audio file ${fileInfo.filename}:`, error);
      this.emit('error', error);
    }
  }

  private extractMetadataFromFilename(filename: string): { talkgroup?: string, system?: string, frequency?: number } {
    // Try to extract metadata from common Rdio Scanner filename patterns
    // Examples: "20250103_143052_10244_MESA_453.700MHz.wav"
    //          "MESA_10244_20250103143052.wav"
    //          "talkgroup_10244_20250103_143052.wav"
    
    const metadata: { talkgroup?: string, system?: string, frequency?: number } = {};
    
    // Extract talkgroup (common patterns)
    const talkgroupMatch = filename.match(/(?:talkgroup|tg)[-_]?(\d{4,6})/i) || 
                          filename.match(/(\d{4,6})(?:_MESA|_mesa)/i) ||
                          filename.match(/_(\d{4,6})_/);
    if (talkgroupMatch) {
      metadata.talkgroup = talkgroupMatch[1];
    }
    
    // Extract system
    const systemMatch = filename.match(/(MESA|mesa|MARION|marion)/i);
    if (systemMatch) {
      metadata.system = systemMatch[1].toUpperCase();
    }
    
    // Extract frequency
    const freqMatch = filename.match(/(\d{2,3}\.\d{2,3})(?:MHz|mhz)/i);
    if (freqMatch) {
      metadata.frequency = parseFloat(freqMatch[1]) * 1000000; // Convert MHz to Hz
    }
    
    console.log(`Extracted metadata from ${filename}:`, metadata);
    return metadata;
  }

  getStatus() {
    return {
      monitoring: this.isMonitoring,
      rdioAudioDir: this.rdioAudioDir,
      ems_audioDir: this.ems_audioDir,
      processedFiles: this.processedFiles.size,
      lastScanTime: new Date(this.lastScanTime).toISOString(),
      directoryExists: existsSync(this.rdioAudioDir)
    };
  }

  // Manual scan trigger
  async triggerScan() {
    if (!this.isMonitoring) {
      await this.startMonitoring();
    } else {
      await this.scanForNewFiles();
    }
  }

  // Get list of available files in Rdio Scanner directory
  async getAvailableFiles() {
    try {
      if (!existsSync(this.rdioAudioDir)) {
        return [];
      }

      const files = await readdir(this.rdioAudioDir);
      const audioFiles = [];

      for (const file of files) {
        const ext = extname(file).toLowerCase();
        if (ext === '.wav' || ext === '.mp3' || ext === '.m4a' || ext === '.ogg') {
          const fullPath = join(this.rdioAudioDir, file);
          try {
            const stats = await stat(fullPath);
            audioFiles.push({
              filename: file,
              size: stats.size,
              mtime: stats.mtime,
              processed: this.processedFiles.has(fullPath)
            });
          } catch (error) {
            // Skip files that can't be accessed
          }
        }
      }

      return audioFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch (error) {
      console.error('Error getting available files:', error);
      return [];
    }
  }
}

export const rdioFileMonitor = new RdioFileMonitor();
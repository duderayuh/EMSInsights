import { config } from "dotenv";
config(); // Load .env file first

import { spawn } from 'child_process';
import { readFileSync, existsSync, createReadStream, unlinkSync } from 'fs';
import { join } from 'path';
import { storage } from '../storage';
// Removed Anthropic Claude transcript cleanup - using verbatim transcripts only
import { transcriptionRetryService } from './transcription-retry';
import { EventEmitter } from 'events';
import OpenAI from 'openai';
import { audioPreprocessor } from './audio-preprocessor';
import { postProcessingPipeline } from './post-processing-pipeline';
import { audioEnhancementService } from './audio-enhancement';
import { emsDictionary } from './ems-dictionary';
import { confidenceMonitor } from './confidence-monitor';
import { qualityMonitor } from './transcription-quality-monitor';

interface TranscriptionProgress {
  segmentId: string;
  stage: 'starting' | 'whisper' | 'cleanup' | 'classification' | 'complete';
  progress: number; // 0-100
  message: string;
  error?: string;
}

interface TranscriptionResult {
  utterance: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  cleanedTranscript?: string;
  extractedAddress?: string | null;
  extractedUnits?: string[];
  extractedCallReason?: string | null;
  extractedTime?: string | null;
  extractedIntersection?: string | null;
}

interface QueueItem {
  segmentId: string;
  segment: any;
  resolve: (result: TranscriptionResult) => void;
  reject: (error: Error) => void;
}

export class TranscriptionService extends EventEmitter {
  private whisperModel: string;
  private activeTranscriptions: Map<string, TranscriptionProgress> = new Map();
  private transcriptionQueue: QueueItem[] = [];
  private isProcessing: boolean = false;
  private processedCount: number = 0;
  private errorCount: number = 0;
  private openaiClient: OpenAI | null = null;
  private useOpenAI: boolean = false;
  private maxConcurrentTranscriptions: number = 10; // Allow up to 10 parallel OpenAI transcriptions
  private activeOpenAITranscriptions: Set<string> = new Set();

  constructor() {
    super();
    // Use larger Whisper model for better accuracy
    this.whisperModel = process.env.WHISPER_MODEL || 'small';
    
    // Initialize OpenAI client if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.useOpenAI = true;
      console.log('OpenAI Whisper initialized as primary transcription method with local fallback');
    } else {
      console.log(`Using local Whisper model: ${this.whisperModel} for transcription`);
    }
  }

  private emitProgress(segmentId: string, stage: TranscriptionProgress['stage'], progress: number, message: string, error?: string) {
    const progressData: TranscriptionProgress = { segmentId, stage, progress, message, error };
    this.activeTranscriptions.set(segmentId, progressData);
    this.emit('progress', progressData);
    console.log(`Transcription Progress [${segmentId}]: ${stage} - ${progress}% - ${message}`);
  }

  getActiveTranscriptions(): Map<string, TranscriptionProgress> {
    return new Map(this.activeTranscriptions);
  }

  private async processQueue(): Promise<void> {
    // Process multiple items in parallel if using OpenAI
    if (this.useOpenAI && this.openaiClient) {
      this.processParallelQueue();
    } else {
      // Sequential processing for local Whisper
      this.processSequentialQueue();
    }
  }

  private async processParallelQueue(): Promise<void> {
    while (this.transcriptionQueue.length > 0 && this.activeOpenAITranscriptions.size < this.maxConcurrentTranscriptions) {
      const item = this.transcriptionQueue.shift();
      if (!item) break;

      // Mark as active and process in parallel
      this.activeOpenAITranscriptions.add(item.segmentId);
      
      this.processTranscriptionItem(item.segmentId, item.segment)
        .then(result => {
          this.processedCount++;
          item.resolve(result);
        })
        .catch(error => {
          this.errorCount++;
          item.reject(error as Error);
        })
        .finally(() => {
          this.activeOpenAITranscriptions.delete(item.segmentId);
          // Continue processing queue
          this.processParallelQueue();
        });
    }
  }

  private async processSequentialQueue(): Promise<void> {
    if (this.isProcessing || this.transcriptionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const item = this.transcriptionQueue.shift();
    
    if (!item) {
      this.isProcessing = false;
      return;
    }

    try {
      const result = await this.processTranscriptionItem(item.segmentId, item.segment);
      this.processedCount++;
      item.resolve(result);
    } catch (error) {
      this.errorCount++;
      item.reject(error as Error);
    } finally {
      this.isProcessing = false;
      // Process next item in queue
      this.processSequentialQueue();
    }
  }

  private async processTranscriptionItem(segmentId: string, segment: any): Promise<TranscriptionResult> {
    this.emitProgress(segmentId, 'starting', 0, 'Initializing transcription');

    // Step 1: Pre-process audio to detect beeps/noise
    this.emitProgress(segmentId, 'starting', 5, 'Analyzing audio for voice content');
    const audioAnalysis = await audioPreprocessor.analyzeAudio(segment.filepath);
    
    // Step 1.5: Enhance audio quality for better transcription
    let enhancedAudioPath: string | null = null;
    try {
      // Analyze audio quality first
      const qualityAnalysis = await audioEnhancementService.analyzeAudioQuality(segment.filepath);
      console.log(`Audio quality for ${segmentId}: ${qualityAnalysis.quality}, SNR: ${qualityAnalysis.signalToNoiseRatio.toFixed(1)}dB`);
      
      // Enhance audio if quality is not excellent
      if (qualityAnalysis.quality !== 'excellent') {
        this.emitProgress(segmentId, 'starting', 8, 'Enhancing audio quality for better transcription');
        enhancedAudioPath = await audioEnhancementService.enhanceEMSAudio(segment.filepath);
        console.log(`Audio enhanced for ${segmentId} - quality was ${qualityAnalysis.quality}`);
      }
    } catch (error) {
      console.error(`Audio enhancement failed for ${segmentId}, using original:`, error);
    }
    
    // If audio is pure noise/beeps, skip Whisper and return beeping transcript
    if (audioAnalysis.isPureNoise) {
      console.log(`Audio segment ${segmentId} detected as pure noise/beeps`);
      const result: TranscriptionResult = {
        utterance: '{beeping}',
        start_ms: 0,
        end_ms: Math.floor(audioAnalysis.duration * 1000),
        confidence: 0.1
      };
      
      // Mark as processed with low confidence
      await this.markSegmentProcessed(segmentId, segment.filepath);
      this.emitProgress(segmentId, 'complete', 100, 'Audio contains only beeps/tones');
      this.activeTranscriptions.delete(segmentId);
      return result;
    }

    // Step 2: Use enhanced audio if available, then trimmed, otherwise original
    const audioPathToTranscribe = enhancedAudioPath || audioAnalysis.trimmedFilePath || segment.filepath;

    // Step 3: Transcribe with Whisper (OpenAI first, then local fallback)
    let result: TranscriptionResult;
    
    if (this.useOpenAI && this.openaiClient) {
      this.emitProgress(segmentId, 'whisper', 10, 'Starting OpenAI Whisper transcription');
      try {
        result = await this.transcribeWithOpenAI(segmentId, audioPathToTranscribe);
        console.log(`OpenAI Whisper transcription successful for ${segmentId} - confidence: ${(result.confidence * 100).toFixed(1)}%`);
      } catch (error) {
        console.error(`OpenAI Whisper failed for ${segmentId}, falling back to local:`, error);
        this.emitProgress(segmentId, 'whisper', 10, 'OpenAI failed, using local Whisper');
        result = await this.transcribeWithLocalWhisper(segmentId, audioPathToTranscribe);
      }
    } else {
      this.emitProgress(segmentId, 'whisper', 10, 'Starting local Whisper transcription');
      result = await this.transcribeWithLocalWhisper(segmentId, audioPathToTranscribe);
    }

    // Step 4: Apply post-processing pipeline
    this.emitProgress(segmentId, 'cleanup', 70, 'Applying post-processing filters');
    const postProcessed = await postProcessingPipeline.process(
      result.utterance || '',
      result.confidence || 0.5
    );

    // Update result with post-processed data
    result.utterance = postProcessed.cleanedTranscript;
    result.confidence = postProcessed.confidence;
    result.cleanedTranscript = postProcessed.cleanedTranscript;
    result.extractedAddress = postProcessed.extractedAddress;
    result.extractedUnits = postProcessed.extractedUnits;
    result.extractedCallReason = postProcessed.extractedCallType;
    
    // Add metadata for tracking
    (result as any).isNoise = postProcessed.isNoise;
    (result as any).isHallucination = postProcessed.isHallucination;
    (result as any).parseErrors = postProcessed.parseErrors;

    // Clean up temporary files
    if (audioAnalysis.trimmedFilePath && audioAnalysis.trimmedFilePath !== segment.filepath) {
      await audioPreprocessor.cleanupTrimmedFile(audioAnalysis.trimmedFilePath);
    }
    if (enhancedAudioPath) {
      await audioEnhancementService.cleanupEnhancedFile(enhancedAudioPath);
    }

    // Complete transcription
    this.emitProgress(segmentId, 'complete', 100, 'Transcription completed successfully');
    this.activeTranscriptions.delete(segmentId);
    
    // Mark as processed and clean up
    await this.markSegmentProcessed(segmentId, segment.filepath);
    
    return result;
  }

  private async markSegmentProcessed(segmentId: string, filepath: string): Promise<void> {
    // Mark audio segment as processed in database
    try {
      await storage.updateAudioSegment(segmentId, { processed: true });
      console.log(`Audio segment ${segmentId} marked as processed`);
    } catch (error) {
      console.error(`Failed to mark audio segment ${segmentId} as processed:`, error);
    }
    
    // IMPORTANT: Only delete temporary copies in ems_audio_processing directory
    // Never delete files from the rdio-scanner database directory
    try {
      // Safety check: Only delete files from our temporary processing directory
      if (filepath.includes('ems_audio_processing') && existsSync(filepath)) {
        unlinkSync(filepath);
        console.log(`Temporary audio file deleted after transcription: ${filepath}`);
      } else if (filepath.includes('rdio-scanner')) {
        // CRITICAL: Never delete files from rdio-scanner database
        console.log(`Preserving rdio-scanner database file (read-only): ${filepath}`);
      } else if (existsSync(filepath)) {
        // For any other temporary files created during processing
        unlinkSync(filepath);
        console.log(`Temporary audio file deleted after transcription: ${filepath}`);
      }
    } catch (error) {
      console.error(`Failed to delete temporary audio file ${filepath}:`, error);
    }
  }

  async transcribeAudioSegment(segmentId: string): Promise<TranscriptionResult | null> {
    const segment = await storage.getAudioSegment(segmentId);
    if (!segment) {
      throw new Error(`Audio segment ${segmentId} not found`);
    }

    if (!existsSync(segment.filepath)) {
      console.log(`Audio file not found: ${segment.filepath} - marking as processed with error message`);
      return {
        utterance: "Audio file no longer available",
        confidence: 0.0
      } as any;
    }

    // Add to queue and return a promise
    return new Promise((resolve, reject) => {
      this.transcriptionQueue.push({
        segmentId,
        segment,
        resolve,
        reject
      });
      
      // Start processing queue if not already processing
      this.processQueue();
    });
  }

  async transcribeAudioBuffer(audioBuffer: Buffer, segmentId: string): Promise<TranscriptionResult | null> {
    // Create a temporary file from the buffer
    const { createHash } = await import('crypto');
    const tempDir = join(process.cwd(), 'temp_audio');
    
    // Ensure temp directory exists
    const fs = await import('fs');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const hash = createHash('md5').update(audioBuffer).digest('hex');
    const tempFilePath = join(tempDir, `retranscribe-${segmentId}-${hash}.m4a`);
    
    try {
      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      // Use OpenAI Whisper if available, otherwise fallback to local
      const result = this.useOpenAI 
        ? await this.transcribeWithOpenAI(segmentId, tempFilePath)
        : await this.transcribeWithLocalWhisper(segmentId, tempFilePath);
      
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error(`Failed to delete temporary file ${tempFilePath}:`, cleanupError);
      }
      
      return result;
    } catch (error) {
      // Clean up temporary file on error
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error(`Failed to delete temporary file ${tempFilePath}:`, cleanupError);
      }
      throw error;
    }
  }

  private async transcribeWithLocalWhisper(segmentId: string, audioPath: string): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      console.log(`Starting local Whisper transcription for: ${audioPath}`);

      // Try using whisper command directly first
      const whisperProcess = spawn('whisper', [
        audioPath,
        '--model', this.whisperModel,
        '--output_format', 'json',
        '--output_dir', '/tmp',
        '--language', 'en'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let progressEmitted = false;

      whisperProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        // Emit progress update when we start getting output
        if (!progressEmitted) {
          this.emitProgress(segmentId, 'whisper', 30, 'Whisper processing audio');
          progressEmitted = true;
        }
      });

      whisperProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Look for progress indicators in stderr
        const stderrStr = data.toString();
        if (stderrStr.includes('Loading model')) {
          this.emitProgress(segmentId, 'whisper', 20, 'Loading Whisper model');
        } else if (stderrStr.includes('Processing')) {
          this.emitProgress(segmentId, 'whisper', 50, 'Processing audio with Whisper');
        }
      });

      whisperProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse whisper output
            const lines = stdout.split('\n').filter(line => line.trim());
            const transcriptLine = lines.find(line => line.includes('transcript'));
            
            if (transcriptLine) {
              const transcript = transcriptLine.split('transcript:')[1]?.trim() || '';
              resolve({
                utterance: transcript,
                confidence: 0.8,
                start_ms: 0,
                end_ms: 5000
              });
            } else {
              // Try to extract any text from stdout
              const cleanText = stdout.replace(/\[.*?\]/g, '').trim();
              resolve({
                utterance: cleanText || '[Unable to transcribe audio]',
                confidence: 0.5,
                start_ms: 0,
                end_ms: 5000
              });
            }
          } catch (error) {
            console.error('Error parsing Whisper output:', error);
            resolve({
              utterance: '[Error parsing transcription]',
              confidence: 0.1,
              start_ms: 0,
              end_ms: 0
            });
          }
        } else {
          console.error('Whisper command failed:', stderr);
          
          // Try python whisper as fallback
          this.tryPythonWhisper(audioPath).then(resolve).catch(() => {
            // Final fallback - basic audio info
            try {
              const audioBuffer = readFileSync(audioPath);
              let duration = 5000; // default 5 seconds
              
              if (audioBuffer.length > 44) {
                const sampleRate = audioBuffer.readUInt32LE(24);
                const dataSize = audioBuffer.readUInt32LE(40);
                if (sampleRate > 0) {
                  duration = Math.floor((dataSize / (sampleRate * 2)) * 1000);
                }
              }
              
              resolve({
                utterance: `[Audio detected - ${Math.floor(duration/1000)}s duration, transcription unavailable]`,
                confidence: 0.1,
                start_ms: 0,
                end_ms: duration
              });
            } catch (audioError) {
              console.error('Audio analysis failed:', audioError);
              resolve({
                utterance: '[Audio transcription failed]',
                confidence: 0.0,
                start_ms: 0,
                end_ms: 0
              });
            }
          });
        }
      });

      whisperProcess.on('error', (error) => {
        console.error('Whisper process error:', error);
        this.tryPythonWhisper(audioPath).then(resolve).catch(() => {
          resolve({
            utterance: '[Whisper command not found]',
            confidence: 0.0,
            start_ms: 0,
            end_ms: 0
          });
        });
      });
    });
  }

  private async tryPythonWhisper(audioPath: string): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      console.log('Trying Python Whisper as fallback');
      
      const pythonProcess = spawn('python3', ['-c', `
import whisper
import sys
import json

try:
    model = whisper.load_model("${this.whisperModel}")
    result = model.transcribe("${audioPath}")
    print(json.dumps({
        "text": result["text"],
        "segments": result.get("segments", [])
    }))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve({
              utterance: result.text || '[No speech detected]',
              confidence: 0.8,
              start_ms: 0,
              end_ms: 5000
            });
          } catch (error) {
            console.error('Error parsing Python Whisper output:', error);
            reject(error);
          }
        } else {
          console.error('Python Whisper failed:', stderr);
          reject(new Error(stderr));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Python Whisper process error:', error);
        reject(error);
      });
    });
  }

  private async transcribeWithOpenAI(segmentId: string, audioPath: string): Promise<TranscriptionResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      // Track transcription start time
      (global as any).transcriptionStartTime = Date.now();
      
      this.emitProgress(segmentId, 'whisper', 20, 'Uploading audio to OpenAI');
      
      // Multi-pass transcription for improved accuracy
      const transcriptionPasses = [];
      const temperatures = [0.0, 0.2, 0.4]; // Multiple temperature settings for consensus
      
      for (const temp of temperatures) {
        try {
          const transcription = await this.openaiClient.audio.transcriptions.create({
            file: createReadStream(audioPath),
            model: 'whisper-1',
            response_format: 'verbose_json',
            language: 'en',
            prompt: emsDictionary.generateWhisperPrompt() + ' Focus on emergency dispatch radio communications with unit numbers, street addresses, and medical terminology.',
            temperature: temp,
            // Additional parameters for better accuracy
            timestamp_granularities: ['segment', 'word'] as any
          });
          transcriptionPasses.push(transcription);
        } catch (passError) {
          console.error(`Transcription pass at temp ${temp} failed:`, passError);
        }
      }
      
      // If all passes failed, throw error
      if (transcriptionPasses.length === 0) {
        throw new Error('All transcription passes failed');
      }
      
      // Select best transcription based on confidence metrics
      const transcription = this.selectBestTranscription(transcriptionPasses);

      this.emitProgress(segmentId, 'whisper', 60, 'Processing OpenAI transcription response');

      // Advanced confidence calculation with multiple factors
      let confidence = 0.92; // Base confidence for OpenAI Whisper (proven high accuracy for dispatch audio)
      
      // If we have segments data, calculate sophisticated confidence metrics
      if (transcription.segments && transcription.segments.length > 0) {
        const segmentConfidences = transcription.segments.map((segment: any) => {
          if (segment.avg_logprob !== undefined) {
            // Enhanced confidence calculation
            const baseProb = Math.exp(segment.avg_logprob);
            
            // Multiple confidence factors
            let segmentConfidence = baseProb;
            
            // Factor 1: Speech probability (inverse of no_speech_prob)
            if (segment.no_speech_prob !== undefined) {
              const speechProb = 1 - segment.no_speech_prob;
              segmentConfidence *= (0.7 + 0.3 * speechProb); // Weight speech presence
            }
            
            // Factor 2: Compression ratio (lower is better, indicates less repetition)
            if (segment.compression_ratio !== undefined) {
              const compressionFactor = Math.max(0.5, Math.min(1.0, 2.0 - segment.compression_ratio));
              segmentConfidence *= compressionFactor;
            }
            
            // Factor 3: Token probability consistency
            if (segment.tokens && Array.isArray(segment.tokens)) {
              const tokenCount = segment.tokens.length;
              if (tokenCount > 0 && segment.token_logprobs) {
                const avgTokenProb = segment.token_logprobs.reduce((sum: number, logprob: number) => 
                  sum + Math.exp(logprob), 0) / tokenCount;
                segmentConfidence *= (0.8 + 0.2 * avgTokenProb);
              }
            }
            
            // Factor 4: Segment duration quality
            const segmentDuration = (segment.end || 0) - (segment.start || 0);
            if (segmentDuration < 0.3) {
              segmentConfidence *= 0.7; // Very short, likely noise
            } else if (segmentDuration > 10) {
              segmentConfidence *= 0.9; // Very long, might have errors
            } else {
              segmentConfidence *= 1.05; // Optimal length boost
            }
            
            // Apply Bayesian adjustment based on prior knowledge
            const priorConfidence = 0.88; // Prior belief in transcription quality (OpenAI Whisper is highly accurate)
            const weight = 0.4; // Weight of prior
            segmentConfidence = weight * priorConfidence + (1 - weight) * segmentConfidence;
            
            return Math.min(0.99, Math.max(0.1, segmentConfidence));
          }
          return 0.85; // Default confidence for OpenAI Whisper
        });
        
        // Calculate weighted average based on segment duration
        const durations = transcription.segments.map((seg: any) => (seg.end || 0) - (seg.start || 0));
        const totalDuration = durations.reduce((sum: number, d: number) => sum + d, 0);
        
        if (totalDuration > 0) {
          confidence = transcription.segments.reduce((sum: number, seg: any, i: number) => {
            const weight = durations[i] / totalDuration;
            return sum + (segmentConfidences[i] * weight);
          }, 0);
        } else {
          confidence = segmentConfidences.reduce((sum: number, c: number) => sum + c, 0) / segmentConfidences.length;
        }
        
        // Advanced text quality analysis for EMS dispatch content
        const text = transcription.text || '';
        const textLength = text.length;
        
        // Pattern matching for dispatch-specific content
        const patterns = {
          units: /(medic|engine|fire|ambulance|ems|squad|battalion|ladder|rescue|truck)\s*\d+/gi,
          addresses: /\d+\s+[NSEW]?\s*\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|circle|cir|place|pl|parkway|pkwy)/gi,
          intersections: /(\w+\s+(and|&)\s+\w+\s+(street|avenue|road|boulevard|drive))/gi,
          medicalTerms: /(cardiac|breathing|unconscious|trauma|bleeding|chest pain|difficulty|emergency|priority|code|transport|patient|victim)/gi,
          dispatchCodes: /(priority\s*\d|code\s*\d|ems\s*\d{2,5}|10-\d{2})/gi,
          timestamps: /(\d{1,2}:\d{2}|\d{4}\s*hours)/gi
        };
        
        // Calculate pattern match scores
        const matchScores = {
          units: (text.match(patterns.units) || []).length,
          addresses: (text.match(patterns.addresses) || []).length,
          intersections: (text.match(patterns.intersections) || []).length,
          medicalTerms: (text.match(patterns.medicalTerms) || []).length,
          dispatchCodes: (text.match(patterns.dispatchCodes) || []).length,
          timestamps: (text.match(patterns.timestamps) || []).length
        };
        
        // Calculate content quality score with improved boosts
        let contentQualityBoost = 1.05; // Start with base boost for radio dispatch audio
        if (matchScores.units > 0) contentQualityBoost *= 1.20;
        if (matchScores.addresses > 0) contentQualityBoost *= 1.18;
        if (matchScores.medicalTerms > 0) contentQualityBoost *= 1.12;
        if (matchScores.dispatchCodes > 0) contentQualityBoost *= 1.15;
        if (matchScores.intersections > 0) contentQualityBoost *= 1.10;
        
        // Length-based adjustment with better thresholds
        if (textLength > 15 && textLength < 300) {
          contentQualityBoost *= 1.08; // Optimal dispatch message length
        } else if (textLength < 10) {
          contentQualityBoost *= 0.85; // Short but might still be valid
        } else if (textLength > 500) {
          contentQualityBoost *= 0.95; // Long transcriptions can still be accurate
        }
        
        // Check for common transcription errors
        const errorPatterns = [
          /\b(um|uh|ah|er)\b/gi,  // Filler words
          /(\w)\1{3,}/gi,  // Repeated characters
          /[^\w\s,.-]/gi  // Unusual characters
        ];
        
        const errorCount = errorPatterns.reduce((count, pattern) => 
          count + (text.match(pattern) || []).length, 0);
        
        if (errorCount > 0) {
          contentQualityBoost *= Math.max(0.9, 1 - (errorCount * 0.03)); // Less penalty for minor errors
        }
        
        // Apply content quality boost to confidence
        confidence *= Math.min(1.8, contentQualityBoost); // Allow higher boost for quality content
        
        // Ensure confidence is in valid range with higher minimum for good transcriptions
        const minConfidence = matchScores.units > 0 || matchScores.addresses > 0 ? 0.85 : 0.75;
        confidence = Math.min(0.99, Math.max(minConfidence, confidence));
      } else {
        // Fallback confidence based on text quality
        const textLength = transcription.text?.length || 0;
        const hasNumbers = /\d/.test(transcription.text || '');
        const hasCommonWords = /(medic|engine|fire|ambulance|dispatch|location|street|avenue|road)/i.test(transcription.text || '');
        
        confidence = textLength > 10 ? 0.88 : 0.75;
        if (hasNumbers && hasCommonWords) confidence += 0.10;
      }
      
      // Enhanced quality checks with multiple retries for low confidence
      if (confidence < 0.7 && transcriptionPasses.length < 3) {
        console.log(`Low confidence (${(confidence * 100).toFixed(1)}%), attempting enhanced transcription...`);
        
        // Try one more time with enhanced audio
        try {
          const enhancedPath = await audioEnhancementService.enhanceEMSAudio(audioPath);
          const enhancedTranscription = await this.openaiClient.audio.transcriptions.create({
            file: createReadStream(enhancedPath),
            model: 'whisper-1',
            response_format: 'verbose_json',
            language: 'en',
            prompt: emsDictionary.generateWhisperPrompt() + ' This is emergency dispatch radio audio. Listen carefully for unit numbers, street addresses, and medical conditions.',
            temperature: 0.1
          });
          
          // Clean up enhanced file
          await audioEnhancementService.cleanupEnhancedFile(enhancedPath);
          
          // Recalculate confidence for enhanced transcription
          const enhancedConfidence = this.calculateTranscriptionConfidence(enhancedTranscription);
          if (enhancedConfidence > confidence) {
            console.log(`Enhanced transcription improved confidence: ${(confidence * 100).toFixed(1)}% -> ${(enhancedConfidence * 100).toFixed(1)}%`);
            return this.processTranscriptionResult(enhancedTranscription, segmentId, enhancedConfidence);
          }
        } catch (enhanceError) {
          console.error('Enhanced transcription attempt failed:', enhanceError);
        }
      }
      
      // Only reject if confidence is extremely low
      if (confidence < 0.3) {
        throw new Error(`Transcription quality too low: ${(confidence * 100).toFixed(1)}%`);
      }
      
      // Apply EMS dictionary corrections
      const originalText = transcription.text || '';
      const correctedText = emsDictionary.correctTranscript(originalText);
      
      // Get confidence boost from corrections
      const confidenceBoost = emsDictionary.getConfidenceBoost(originalText, correctedText);
      
      // Additional boost for dispatch radio characteristics
      let radioBoost = 0;
      if (correctedText.length > 0) {
        // Boost for typical dispatch patterns
        if (/(medic|engine|fire|ambulance|ems|squad)\s*\d+/i.test(correctedText)) radioBoost += 0.05;
        if (/\d+\s+\w+\s+(street|avenue|road|drive)/i.test(correctedText)) radioBoost += 0.04;
        if (/(priority|code|dispatch|respond|emergency)/i.test(correctedText)) radioBoost += 0.03;
        if (/\d{4}\s*hours?/i.test(correctedText)) radioBoost += 0.02; // Time stamps
      }
      
      const finalConfidence = Math.min(0.99, confidence + confidenceBoost + radioBoost);
      
      // Track confidence for monitoring
      await confidenceMonitor.trackSegmentConfidence(segmentId, finalConfidence);
      
      // Track in quality monitor
      await qualityMonitor.trackSegment({
        segmentId,
        confidence: finalConfidence,
        timestamp: new Date(),
        hasUnits: /(medic|engine|fire|ambulance|ems|squad)\s*\d+/i.test(correctedText),
        hasAddress: /\d+\s+[NSEW]?\s*\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr)/i.test(correctedText),
        textLength: correctedText.length,
        processingTime: Date.now() - (global as any).transcriptionStartTime || 0,
        audioQuality: finalConfidence >= 0.9 ? 'excellent' : finalConfidence >= 0.75 ? 'good' : finalConfidence >= 0.6 ? 'fair' : 'poor',
        enhancementApplied: false
      });
      
      // Log detailed confidence metrics
      console.log(`OpenAI Whisper confidence metrics:`, {
        confidence: (finalConfidence * 100).toFixed(1) + '%',
        original_confidence: (confidence * 100).toFixed(1) + '%',
        confidence_boost: (confidenceBoost * 100).toFixed(1) + '%',
        segments: transcription.segments?.length || 0,
        duration: transcription.duration || 0,
        text_preview: correctedText.substring(0, 100)
      });
      
      return {
        utterance: correctedText || '[No transcription available]',
        confidence: finalConfidence,
        start_ms: 0,
        end_ms: Math.round((transcription.duration || 5) * 1000)
      };
    } catch (error: any) {
      console.error('OpenAI Whisper transcription failed:', error);
      throw error;
    }
  }

  async transcribeText(text: string): Promise<TranscriptionResult> {
    // For text input, just return as-is
    return {
      utterance: text,
      confidence: 1.0,
      start_ms: 0,
      end_ms: text.length * 50 // Rough estimate
    };
  }

  clearStuckTranscriptions() {
    console.log(`Clearing ${this.activeTranscriptions.size} stuck transcriptions`);
    this.activeTranscriptions.clear();
    this.isProcessing = false;
    console.log('Stuck transcriptions cleared, service reset');
  }

  /**
   * Select the best transcription from multiple passes
   */
  private selectBestTranscription(transcriptions: any[]): any {
    if (transcriptions.length === 1) return transcriptions[0];
    
    // Score each transcription
    const scoredTranscriptions = transcriptions.map(t => {
      let score = 0;
      
      // Check for key dispatch elements
      const text = t.text || '';
      if (/(medic|engine|fire|ambulance|ems|squad|battalion|ladder)\s*\d+/i.test(text)) score += 3;
      if (/\d+\s+[NSEW]?\s*\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr)/i.test(text)) score += 3;
      if (text.length > 10 && text.length < 300) score += 2;
      
      // Check segment quality
      if (t.segments && t.segments.length > 0) {
        const avgLogProb = t.segments.reduce((sum: number, s: any) => 
          sum + (s.avg_logprob || -1), 0) / t.segments.length;
        score += Math.max(0, 5 + avgLogProb * 2); // Convert log prob to score
      }
      
      return { transcription: t, score };
    });
    
    // Sort by score and return best
    scoredTranscriptions.sort((a, b) => b.score - a.score);
    return scoredTranscriptions[0].transcription;
  }

  /**
   * Calculate confidence for a transcription
   */
  private calculateTranscriptionConfidence(transcription: any): number {
    let confidence = 0.85;
    
    if (transcription.segments && transcription.segments.length > 0) {
      // Calculate weighted confidence from segments
      const segmentConfidences = transcription.segments.map((segment: any) => {
        if (segment.avg_logprob !== undefined) {
          const baseProb = Math.exp(segment.avg_logprob);
          let segmentConfidence = baseProb;
          
          if (segment.no_speech_prob !== undefined) {
            const speechProb = 1 - segment.no_speech_prob;
            segmentConfidence *= (0.7 + 0.3 * speechProb);
          }
          
          const segmentDuration = (segment.end || 0) - (segment.start || 0);
          if (segmentDuration < 0.3) {
            segmentConfidence *= 0.7;
          } else if (segmentDuration > 10) {
            segmentConfidence *= 0.9;
          } else {
            segmentConfidence *= 1.05;
          }
          
          return Math.min(0.99, Math.max(0.1, segmentConfidence));
        }
        return 0.75;
      });
      
      // Calculate weighted average
      const durations = transcription.segments.map((seg: any) => (seg.end || 0) - (seg.start || 0));
      const totalDuration = durations.reduce((sum: number, d: number) => sum + d, 0);
      
      if (totalDuration > 0) {
        confidence = transcription.segments.reduce((sum: number, seg: any, i: number) => {
          const weight = durations[i] / totalDuration;
          return sum + (segmentConfidences[i] * weight);
        }, 0);
      } else {
        confidence = segmentConfidences.reduce((sum: number, c: number) => sum + c, 0) / segmentConfidences.length;
      }
    }
    
    // Apply text quality boost
    const text = transcription.text || '';
    if (/(medic|engine|fire|ambulance|ems|squad)\s*\d+/i.test(text)) confidence *= 1.15;
    if (/\d+\s+[NSEW]?\s*\w+\s+(street|st|avenue|ave|road|rd|drive|dr)/i.test(text)) confidence *= 1.12;
    
    return Math.min(0.99, Math.max(0.1, confidence));
  }

  /**
   * Process transcription result with confidence
   */
  private processTranscriptionResult(transcription: any, segmentId: string, confidence: number): TranscriptionResult {
    const correctedText = emsDictionary.correctTranscript(transcription.text || '');
    const confidenceBoost = emsDictionary.getConfidenceBoost(transcription.text || '', correctedText);
    const finalConfidence = Math.min(0.99, confidence + confidenceBoost);
    
    // Track confidence for monitoring
    confidenceMonitor.trackSegmentConfidence(segmentId, finalConfidence).catch(console.error);
    
    // Track in quality monitor
    qualityMonitor.trackSegment({
      segmentId,
      confidence: finalConfidence,
      timestamp: new Date(),
      hasUnits: /(medic|engine|fire|ambulance|ems|squad)\s*\d+/i.test(correctedText),
      hasAddress: /\d+\s+[NSEW]?\s*\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr)/i.test(correctedText),
      textLength: correctedText.length,
      processingTime: Date.now() - (global as any).transcriptionStartTime || 0,
      audioQuality: finalConfidence >= 0.9 ? 'excellent' : finalConfidence >= 0.75 ? 'good' : finalConfidence >= 0.6 ? 'fair' : 'poor',
      enhancementApplied: true
    }).catch(console.error);
    
    console.log(`Transcription confidence for ${segmentId}: ${(finalConfidence * 100).toFixed(1)}%`);
    
    return {
      utterance: correctedText || '[No transcription available]',
      confidence: finalConfidence,
      start_ms: 0,
      end_ms: Math.round((transcription.duration || 5) * 1000)
    };
  }

  private applyPostProcessingCorrections(transcript: string): string {
    // Apply common Indianapolis dispatch transcription corrections
    let corrected = transcript;
    
    // BEEPING SOUND CORRECTIONS - Fix hallucinated text for beeping sounds
    // Common hallucinations that should be converted to {beeping}
    corrected = corrected.replace(/\bfor\s+more\s+un\s+videos?\s+visit\s+www\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bfor\s+more\s+information,?\s+visit\s+www\.?\s*isglobal\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bfor\s+more\s+information,?\s+visit\s+www\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bthank\s+you\s+for\s+watching\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bbeep\s+beep\s+beep\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bbeep\s+beep\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bbuzzer\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bto\s+be\s+continued\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bsubscribe\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bthe\s+end\.?/gi, '{beeping}');
    corrected = corrected.replace(/\br\.?i\.?p\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bwoooo+\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bah!\.?/gi, '{beeping}');
    corrected = corrected.replace(/\beh!\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bha!\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bhey,?\s+yeah\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bone\.{3,}/gi, '{beeping}');
    corrected = corrected.replace(/\byou\.{3,}/gi, '{beeping}');
    corrected = corrected.replace(/\bperfect\.{3,}/gi, '{beeping}');
    corrected = corrected.replace(/\bright\.{3,}/gi, '{beeping}');
    corrected = corrected.replace(/\bdr\.{3,}/gi, '{beeping}');
    corrected = corrected.replace(/\byou\.?\s*$/gi, '{beeping}');
    corrected = corrected.replace(/\bone\.?\s*$/gi, '{beeping}');
    corrected = corrected.replace(/\bminutes\s+\d+,?\s+\d+,?\s+\d+,?\s+leading\s+non-static\s+b\.?/gi, '{beeping}');
    corrected = corrected.replace(/\b👏\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bin\s+the\s+back\s+if\s+you\s+want\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bor\s+yes\.?/gi, '{beeping}');
    corrected = corrected.replace(/\bthank\s+you\.{3,}/gi, '{beeping}');
    corrected = corrected.replace(/\bsuffocating\.?/gi, '{beeping}');
    corrected = corrected.replace(/\baudio\s+contains\s+only\s+electronic\s+beeping\s+tones\s*-?\s*no\s+.*$/gi, '{beeping}');
    corrected = corrected.replace(/\baudio\s+contains\s+only\s+static\/interference\s+with\s+no\s+.*$/gi, '{beeping}');
    corrected = corrected.replace(/\baudio\s+processing\s+error\s*-?\s*no\s+dispatch\s+content\s+.*$/gi, '{beeping}');
    corrected = corrected.replace(/\bincomplete\s+transmission\s*-?\s*appears\s+to\s+be\s+audio\s+.*$/gi, '{beeping}');
    corrected = corrected.replace(/\bincomplete\s+dispatch\s+transmission\s*-?\s*appears\s+to\s+be\s+.*$/gi, '{beeping}');
    corrected = corrected.replace(/\bno\s+audio\s+transcript\s+provided\.?/gi, '{beeping}');
    
    // Hospital identification corrections (context-sensitive)
    // Pattern: "Medic XX, this is negative" → "Medic XX, this is Methodist"
    corrected = corrected.replace(/(\bmedic\s+\d+,?\s+this\s+is\s+)negative/gi, '$1Methodist');
    corrected = corrected.replace(/(\bmedic\s+\d+,?\s+)negative(\s+here)?/gi, '$1Methodist$2');
    
    // General hospital name corrections when in hospital communication context
    corrected = corrected.replace(/\bthis\s+is\s+negative\b/gi, 'this is Methodist');
    corrected = corrected.replace(/\bnegative\s+here\b/gi, 'Methodist here');
    corrected = corrected.replace(/\bnegative\s+receiving\b/gi, 'Methodist receiving');
    corrected = corrected.replace(/\bnegative\s+hospital\b/gi, 'Methodist Hospital');
    
    // Other hospital name corrections
    corrected = corrected.replace(/\brelease\s+hospital?\b/gi, 'Riley Hospital');
    corrected = corrected.replace(/\brelease\s+children\b/gi, 'Riley Children');
    corrected = corrected.replace(/\besken[ao]z[io]\b/gi, 'Eskenazi');
    corrected = corrected.replace(/\buniversity\s+medical\b/gi, 'University Hospital');
    corrected = corrected.replace(/\bsaint\s+vincent\b/gi, 'St. Vincent');
    corrected = corrected.replace(/\bfrancis[ck]an\b/gi, 'Franciscan');
    
    // Street name corrections
    corrected = corrected.replace(/\bNorth Tv on the street\b/gi, 'North Tremont Street');
    corrected = corrected.replace(/\bTv on the street\b/gi, 'Tremont Street');
    
    // Emergency terminology corrections
    corrected = corrected.replace(/\bfalse trauma\b/gi, 'assault trauma');
    corrected = corrected.replace(/\bC and A secure\b/gi, 'scene not secure');
    corrected = corrected.replace(/\bscene secure\b/gi, 'scene secure');
    
    // Time format corrections
    corrected = corrected.replace(/\b0,?\s*0,?\s*50\s*hours?\b/gi, '0050 hours');
    corrected = corrected.replace(/\b(\d),?\s*(\d),?\s*(\d{2})\s*hours?\b/gi, '$1$2$3 hours');
    
    // Address formatting improvements
    corrected = corrected.replace(/\b(\d+),?\s*North\s+Tv\s+on\s+the\s+left\b/gi, '$1 North 2500 West');
    corrected = corrected.replace(/\blocation\s+(\d+),?\s*(\w+)\s+(\d+),?\s*west\b/gi, '$1 $2 & $3 West');
    
    // Medical terminology corrections
    corrected = corrected.replace(/\btessane?\s*park\b/gi, 'chest pain');
    corrected = corrected.replace(/\bsieg-?hurzen\b/gi, 'sick person');
    corrected = corrected.replace(/\badorno-?batain\s*v?\b/gi, 'abdominal pain');
    corrected = corrected.replace(/\bcedar\b/gi, 'seizure');
    
    // Radio communication improvements
    corrected = corrected.replace(/\bcopy\s+that\s+see\s+you\s+inside\b/gi, 'copy that, see you inside');
    corrected = corrected.replace(/\b10-?\s*4\b/gi, '10-4');
    corrected = corrected.replace(/\broger\s+that\b/gi, 'roger');
    
    // Remove duplicate phrases (common in radio transmissions)
    const sentences = corrected.split(/[.!?]+/);
    const uniqueSentences = sentences.filter((sentence, index, arr) => {
      const trimmed = sentence.trim();
      if (trimmed.length < 5) return false;
      // Check if this sentence appears earlier in the array
      return arr.findIndex(s => s.trim().toLowerCase() === trimmed.toLowerCase()) === index;
    });
    
    if (uniqueSentences.length < sentences.length) {
      corrected = uniqueSentences.join('. ').trim();
    }
    
    console.log(`Post-processing applied: "${transcript.substring(0, 100)}..." → "${corrected.substring(0, 100)}..."`);
    return corrected;
  }

  getStatus() {
    return {
      model: this.useOpenAI ? 'OpenAI Whisper (cloud)' : this.whisperModel,
      useAPI: this.useOpenAI,
      processed: this.processedCount,
      pending: this.transcriptionQueue.length,
      errors: this.errorCount,
      isProcessing: this.isProcessing,
      queueSize: this.transcriptionQueue.length,
      openaiEnabled: this.useOpenAI,
      fallbackModel: this.whisperModel
    };
  }
}

export const transcriptionService = new TranscriptionService();
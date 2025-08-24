import { EventEmitter } from 'events';
import { storage } from '../storage';
import { transcriptionService } from './transcription';
import { audioEnhancementService } from './audio-enhancement';
import { confidenceMonitor } from './confidence-monitor';
import OpenAI from 'openai';
import { existsSync, createReadStream } from 'fs';
import { nlpClassifier } from './nlp-classifier';

interface RetryOptions {
  maxAttempts?: number;
  confidenceThreshold?: number;
  useEnhancement?: boolean;
  progressiveEnhancement?: boolean;
}

interface RetryResult {
  success: boolean;
  originalConfidence: number;
  finalConfidence: number;
  improvementPercent: number;
  transcript: string;
  attempts: number;
  enhancementApplied: boolean;
  error?: string;
}

interface RetryProgress {
  segmentId: string;
  attempt: number;
  maxAttempts: number;
  currentConfidence: number;
  stage: string;
  message: string;
}

export class EnhancedRetryService extends EventEmitter {
  private openaiClient: OpenAI | null = null;
  private readonly defaultOptions: Required<RetryOptions> = {
    maxAttempts: 3,
    confidenceThreshold: 0.9,
    useEnhancement: true,
    progressiveEnhancement: true
  };
  
  private activeRetries = new Set<string>();
  private retryStats = {
    totalRetries: 0,
    successfulRetries: 0,
    averageImprovement: 0
  };

  constructor() {
    super();
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log('Enhanced retry service initialized with OpenAI');
    }
  }

  /**
   * Automatically retry low-confidence transcriptions with progressive enhancement
   */
  async retryLowConfidenceSegment(
    segmentId: string,
    options: RetryOptions = {}
  ): Promise<RetryResult> {
    const opts = { ...this.defaultOptions, ...options };
    
    // Check if already being retried
    if (this.activeRetries.has(segmentId)) {
      return {
        success: false,
        originalConfidence: 0,
        finalConfidence: 0,
        improvementPercent: 0,
        transcript: '',
        attempts: 0,
        enhancementApplied: false,
        error: 'Segment already being retried'
      };
    }

    this.activeRetries.add(segmentId);
    this.emitProgress(segmentId, 1, opts.maxAttempts, 0, 'initialization', 'Starting enhanced retry process');

    try {
      // Get the call and its current confidence
      const call = await storage.getCallByAudioSegmentId(segmentId);
      if (!call) {
        throw new Error('Call not found for segment');
      }

      const originalConfidence = call.confidence || 0;
      console.log(`Starting enhanced retry for segment ${segmentId} with confidence ${(originalConfidence * 100).toFixed(1)}%`);

      // Get the audio segment
      const segment = await storage.getAudioSegment(segmentId);
      if (!segment || !existsSync(segment.filepath)) {
        throw new Error('Audio file not found');
      }

      let bestTranscript = call.transcript || '';
      let bestConfidence = originalConfidence;
      let enhancementApplied = false;
      let currentFilePath = segment.filepath;

      // Progressive retry with increasing enhancement
      for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        this.emitProgress(segmentId, attempt, opts.maxAttempts, bestConfidence, 'processing', `Attempt ${attempt}/${opts.maxAttempts}`);

        // Apply progressive enhancement based on attempt number
        if (opts.useEnhancement && opts.progressiveEnhancement) {
          const enhancementLevel = this.getEnhancementLevel(attempt, bestConfidence);
          
          if (enhancementLevel > 0) {
            this.emitProgress(segmentId, attempt, opts.maxAttempts, bestConfidence, 'enhancing', `Applying level ${enhancementLevel} audio enhancement`);
            
            try {
              const enhancedPath = await this.applyProgressiveEnhancement(segment.filepath, enhancementLevel);
              currentFilePath = enhancedPath;
              enhancementApplied = true;
            } catch (error) {
              console.error(`Enhancement failed for attempt ${attempt}:`, error);
            }
          }
        }

        // Retry transcription with current audio file
        const retryResult = await this.performTranscriptionRetry(currentFilePath, attempt, bestTranscript);
        
        if (retryResult.confidence > bestConfidence) {
          bestTranscript = retryResult.transcript;
          bestConfidence = retryResult.confidence;
          
          // Update the call with better transcript
          await storage.updateCall(call.id, {
            transcript: bestTranscript,
            confidence: bestConfidence
          });
          
          // Track confidence for monitoring
          await confidenceMonitor.trackSegmentConfidence(segmentId, bestConfidence);
        }

        // Check if we've reached target confidence
        if (bestConfidence >= opts.confidenceThreshold) {
          console.log(`Target confidence reached after ${attempt} attempts: ${(bestConfidence * 100).toFixed(1)}%`);
          break;
        }
        
        // Clean up enhanced file if created
        if (currentFilePath !== segment.filepath) {
          await audioEnhancementService.cleanupEnhancedFile(currentFilePath);
        }
      }

      // Calculate improvement
      const improvementPercent = ((bestConfidence - originalConfidence) / originalConfidence) * 100;
      
      // Update retry statistics
      this.updateStats(improvementPercent > 0);

      const result: RetryResult = {
        success: bestConfidence >= opts.confidenceThreshold,
        originalConfidence,
        finalConfidence: bestConfidence,
        improvementPercent,
        transcript: bestTranscript,
        attempts: Math.min(opts.maxAttempts, Math.ceil(bestConfidence / opts.confidenceThreshold * opts.maxAttempts)),
        enhancementApplied
      };

      this.emitProgress(segmentId, opts.maxAttempts, opts.maxAttempts, bestConfidence, 'complete', 
        `Retry complete: ${(bestConfidence * 100).toFixed(1)}% confidence (${improvementPercent > 0 ? '+' : ''}${improvementPercent.toFixed(1)}%)`);

      return result;

    } catch (error: any) {
      console.error(`Enhanced retry failed for segment ${segmentId}:`, error);
      return {
        success: false,
        originalConfidence: 0,
        finalConfidence: 0,
        improvementPercent: 0,
        transcript: '',
        attempts: 0,
        enhancementApplied: false,
        error: error.message
      };
    } finally {
      this.activeRetries.delete(segmentId);
    }
  }

  /**
   * Batch retry multiple segments
   */
  async batchRetryLowConfidence(threshold: number = 0.7): Promise<Map<string, RetryResult>> {
    const segments = await confidenceMonitor.getSegmentsForRetry(threshold);
    const results = new Map<string, RetryResult>();
    
    console.log(`Starting batch retry for ${segments.length} segments below ${(threshold * 100).toFixed(0)}% confidence`);
    
    // Process in parallel with concurrency limit
    const concurrencyLimit = 3;
    for (let i = 0; i < segments.length; i += concurrencyLimit) {
      const batch = segments.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(segmentId => this.retryLowConfidenceSegment(segmentId))
      );
      
      batch.forEach((segmentId, index) => {
        results.set(segmentId, batchResults[index]);
      });
    }
    
    // Log summary
    const successful = Array.from(results.values()).filter(r => r.success).length;
    const avgImprovement = Array.from(results.values())
      .filter(r => r.improvementPercent > 0)
      .reduce((sum, r) => sum + r.improvementPercent, 0) / successful || 0;
    
    console.log(`Batch retry complete: ${successful}/${segments.length} improved, average improvement: ${avgImprovement.toFixed(1)}%`);
    
    return results;
  }

  /**
   * Determine enhancement level based on attempt and current confidence
   */
  private getEnhancementLevel(attempt: number, currentConfidence: number): number {
    if (currentConfidence >= 0.85) return 0; // No enhancement needed
    if (currentConfidence >= 0.7) return attempt === 1 ? 1 : 2;
    if (currentConfidence >= 0.5) return Math.min(attempt + 1, 3);
    return 3; // Maximum enhancement for very low confidence
  }

  /**
   * Apply progressive audio enhancement
   */
  private async applyProgressiveEnhancement(audioPath: string, level: number): Promise<string> {
    const enhancementOptions = {
      enableNoiseReduction: level >= 1,
      enableNormalization: level >= 1,
      enableHighPassFilter: level >= 2,
      enableCompression: level >= 2,
      enableSilenceTrimming: level >= 3,
      targetLoudness: level === 3 ? -14 : -16,
      highPassFrequency: level === 3 ? 150 : 100
    };
    
    console.log(`Applying enhancement level ${level} with options:`, enhancementOptions);
    
    if (level === 3) {
      // Use specialized EMS enhancement for maximum quality
      return await audioEnhancementService.enhanceEMSAudio(audioPath);
    } else {
      return await audioEnhancementService.enhanceAudio(audioPath, enhancementOptions);
    }
  }

  /**
   * Perform a single transcription retry attempt
   */
  private async performTranscriptionRetry(
    audioPath: string,
    attempt: number,
    previousTranscript: string
  ): Promise<{ transcript: string, confidence: number }> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not available');
    }

    // Create a more specific prompt based on the attempt
    const prompt = this.generateAttemptSpecificPrompt(attempt, previousTranscript);
    
    const transcription = await this.openaiClient.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'verbose_json',
      prompt,
      temperature: attempt === 1 ? 0.0 : 0.1 * (attempt - 1) // Slightly increase temperature with attempts
    });

    // Calculate enhanced confidence
    let confidence = 0.85;
    if (transcription.segments && transcription.segments.length > 0) {
      const segmentConfidences = transcription.segments.map((seg: any) => {
        if (seg.avg_logprob !== undefined) {
          return Math.exp(seg.avg_logprob);
        }
        return 0.85;
      });
      
      confidence = segmentConfidences.reduce((sum, c) => sum + c, 0) / segmentConfidences.length;
      
      // Apply quality boosters
      const hasUnits = /(medic|engine|ambulance|ems|squad)\s*\d+/i.test(transcription.text);
      const hasAddresses = /\d+\s+[NSEW]?\s*\w+\s+(street|avenue|road)/i.test(transcription.text);
      
      if (hasUnits) confidence *= 1.1;
      if (hasAddresses) confidence *= 1.1;
      
      confidence = Math.min(0.99, confidence);
    }

    return {
      transcript: transcription.text || '',
      confidence
    };
  }

  /**
   * Generate attempt-specific prompts for better results
   */
  private generateAttemptSpecificPrompt(attempt: number, previousTranscript: string): string {
    const basePrompt = `Indianapolis-Marion County EMS dispatch radio communication.
Common units: Medic 1-100, Engine 1-100, Ambulance 1-100, Squad 1-100, Battalion 1-100.
Common hospitals: Eskenazi, Methodist, Riley, Community, St. Vincent.
Streets often end with: Street, Avenue, Road, Boulevard, Drive, Court, Place.
Transcribe verbatim including all addresses, unit numbers, and medical terminology.`;

    if (attempt === 1) {
      return basePrompt;
    } else if (attempt === 2) {
      return `${basePrompt}
Previous attempt may have missed: unit numbers, street names, or medical terms.
Listen carefully for dispatch codes, severity levels (A, B, C), and exact addresses.`;
    } else {
      return `${basePrompt}
Previous transcript: "${previousTranscript.substring(0, 100)}..."
Focus on: Clear unit identification, complete addresses, medical terminology.
This is emergency dispatch - accuracy is critical.`;
    }
  }

  /**
   * Emit progress updates
   */
  private emitProgress(
    segmentId: string,
    attempt: number,
    maxAttempts: number,
    confidence: number,
    stage: string,
    message: string
  ): void {
    const progress: RetryProgress = {
      segmentId,
      attempt,
      maxAttempts,
      currentConfidence: confidence,
      stage,
      message
    };
    
    this.emit('retryProgress', progress);
    console.log(`[Retry ${segmentId}] ${message}`);
  }

  /**
   * Update retry statistics
   */
  private updateStats(successful: boolean): void {
    this.retryStats.totalRetries++;
    if (successful) {
      this.retryStats.successfulRetries++;
    }
    this.retryStats.averageImprovement = 
      (this.retryStats.successfulRetries / this.retryStats.totalRetries) * 100;
  }

  /**
   * Get current retry statistics
   */
  getStats(): typeof this.retryStats {
    return { ...this.retryStats };
  }

  /**
   * Start automatic monitoring and retry of low-confidence segments
   */
  startAutomaticRetry(intervalMinutes: number = 15, threshold: number = 0.7): void {
    console.log(`Starting automatic retry service (every ${intervalMinutes} minutes for confidence < ${(threshold * 100).toFixed(0)}%)`);
    
    setInterval(async () => {
      try {
        const segments = await confidenceMonitor.getSegmentsForRetry(threshold);
        if (segments.length > 0) {
          console.log(`Found ${segments.length} segments for automatic retry`);
          await this.batchRetryLowConfidence(threshold);
        }
      } catch (error) {
        console.error('Automatic retry error:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }
}

export const enhancedRetryService = new EnhancedRetryService();
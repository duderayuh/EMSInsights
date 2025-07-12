import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { storage } from '../storage';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

interface RetryResult {
  success: boolean;
  transcript?: string;
  confidence?: number;
  attempts: number;
  error?: string;
}

/**
 * Attempts to improve transcription quality for low-confidence results
 * Uses OpenAI Whisper online with up to 3 retry attempts for confidence ≤50%
 */
export class TranscriptionRetryService {
  private readonly maxRetries = 3;
  private readonly confidenceThreshold = 0.5; // 50%

  /**
   * Determines if a transcript needs improvement based on confidence level
   */
  needsImprovement(confidence: number | null): boolean {
    if (confidence === null) return true;
    return confidence <= this.confidenceThreshold;
  }

  /**
   * Retries transcription using OpenAI Whisper for low-confidence results
   */
  async retryTranscription(audioPath: string, currentConfidence: number | null): Promise<RetryResult> {
    console.log(`[TranscriptionRetry] Starting retry for low confidence: ${currentConfidence}`);
    
    if (!this.needsImprovement(currentConfidence)) {
      return {
        success: false,
        attempts: 0,
        error: `Confidence ${currentConfidence} above threshold ${this.confidenceThreshold}`
      };
    }

    // Check if audio file exists
    if (!fs.existsSync(audioPath)) {
      return {
        success: false,
        attempts: 0,
        error: `Audio file not found: ${audioPath}`
      };
    }

    let bestTranscript = '';
    let bestConfidence = currentConfidence || 0;
    let attempts = 0;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      attempts = attempt;
      console.log(`[TranscriptionRetry] Attempt ${attempt}/${this.maxRetries}`);
      
      try {
        const audioReadStream = fs.createReadStream(audioPath);
        
        // Use OpenAI Whisper with emergency dispatch context
        const transcription = await openai.audio.transcriptions.create({
          file: audioReadStream,
          model: "whisper-1",
          response_format: "verbose_json",
          temperature: 0.0,
          prompt: `Emergency dispatch communication between EMS units, fire units, and hospitals in Indianapolis-Marion County. Listen for:
- EMS unit IDs (Medic 1-99, Ambulance 1-99)
- Fire unit IDs (Engine 1-99, Ladder 1-99, Rescue 1-99)
- Hospital communications (Methodist, Riley, Eskenazi)
- Indianapolis locations, addresses, intersections
- Emergency medical terminology and call types
- Dispatch codes and severity levels (A, B, C)
- Radio transmission patterns with silence breaks`
        });

        // Calculate confidence from segment data
        const segments = (transcription as any).segments || [];
        let totalLogProb = 0;
        let tokenCount = 0;

        for (const segment of segments) {
          if (segment.avg_logprob !== undefined) {
            totalLogProb += segment.avg_logprob;
            tokenCount++;
          }
        }

        // Convert log probability to confidence (0-1 scale)
        const avgLogProb = tokenCount > 0 ? totalLogProb / tokenCount : -1.0;
        const confidence = Math.max(0, Math.min(1, Math.exp(avgLogProb) * 2)); // Adjust scaling

        console.log(`[TranscriptionRetry] Attempt ${attempt} - Confidence: ${confidence.toFixed(3)}, Text: "${transcription.text}"`);

        // Keep the best result so far
        if (confidence > bestConfidence) {
          bestTranscript = transcription.text;
          bestConfidence = confidence;
        }

        // If we achieved good confidence, stop retrying
        if (confidence > this.confidenceThreshold) {
          console.log(`[TranscriptionRetry] Success after ${attempt} attempts: ${confidence.toFixed(3)}`);
          return {
            success: true,
            transcript: transcription.text,
            confidence: confidence,
            attempts: attempt
          };
        }

      } catch (error) {
        console.error(`[TranscriptionRetry] Attempt ${attempt} failed:`, error);
        
        // If it's the last attempt, return the error
        if (attempt === this.maxRetries) {
          return {
            success: false,
            attempts: attempt,
            error: `All ${this.maxRetries} attempts failed. Last error: ${error}`
          };
        }
        
        // Wait before next attempt (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }

    // Return the best result we got, even if it didn't meet the threshold
    const improved = bestConfidence > (currentConfidence || 0);
    
    return {
      success: improved,
      transcript: improved ? bestTranscript : undefined,
      confidence: improved ? bestConfidence : undefined,
      attempts: attempts,
      error: improved ? undefined : `Failed to improve confidence after ${attempts} attempts`
    };
  }

  /**
   * Updates audio segment with improved transcription results
   */
  async updateAudioSegmentWithRetry(segmentId: string, retryResult: RetryResult): Promise<void> {
    if (!retryResult.success || !retryResult.transcript) {
      console.log(`[TranscriptionRetry] No improvement for segment ${segmentId}`);
      return;
    }

    try {
      await storage.updateAudioSegment(segmentId, {
        transcript: retryResult.transcript,
        confidence: retryResult.confidence || 0,
        metadata: {
          retryAttempts: retryResult.attempts,
          improvedTranscription: true,
          originalConfidence: null // We'd need to pass this in
        }
      });

      console.log(`[TranscriptionRetry] Updated segment ${segmentId} with improved transcription`);
    } catch (error) {
      console.error(`[TranscriptionRetry] Failed to update segment ${segmentId}:`, error);
    }
  }

  /**
   * Process all audio segments with low confidence
   */
  async processLowConfidenceSegments(): Promise<void> {
    console.log('[TranscriptionRetry] Processing low confidence segments...');
    
    try {
      const unprocessedSegments = await storage.getUnprocessedSegments();
      
      for (const segment of unprocessedSegments) {
        if (this.needsImprovement(segment.confidence)) {
          console.log(`[TranscriptionRetry] Retrying segment ${segment.id} with confidence ${segment.confidence}`);
          
          // Construct audio file path
          const audioPath = `/home/runner/workspace/ems_audio_processing/${segment.id}.m4a`;
          
          const retryResult = await this.retryTranscription(audioPath, segment.confidence);
          
          if (retryResult.success) {
            await this.updateAudioSegmentWithRetry(segment.id, retryResult);
          }
          
          // Rate limiting - wait between segments
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('[TranscriptionRetry] Error processing low confidence segments:', error);
    }
  }

  /**
   * Retry transcription for a hospital call segment reading audio directly from Rdio Scanner database
   */
  async retryHospitalCallSegmentTranscription(segmentId: number): Promise<RetryResult> {
    console.log(`Retrying transcription for hospital call segment ${segmentId}...`);
    
    try {
      // Get the hospital call segment
      const segment = await storage.getHospitalCallSegmentById(segmentId);
      if (!segment) {
        throw new Error(`Hospital call segment ${segmentId} not found`);
      }

      // Extract rdioCallId from metadata
      const metadata = segment.metadata as any;
      const rdioCallId = metadata?.rdioCallId;
      
      if (!rdioCallId) {
        throw new Error(`No rdioCallId found in segment ${segmentId} metadata`);
      }

      // Access Rdio Scanner database directly
      const rdioDbPath = path.join(process.cwd(), 'rdio-scanner-server', 'rdio-scanner.db');
      if (!fs.existsSync(rdioDbPath)) {
        throw new Error(`Rdio Scanner database not found at ${rdioDbPath}`);
      }

      const rdioDb = new Database(rdioDbPath, { readonly: true });
      
      try {
        // Get audio data from Rdio Scanner database
        const audioQuery = rdioDb.prepare(`
          SELECT audio, audioType 
          FROM calls 
          WHERE id = ?
        `);
        
        const audioResult = audioQuery.get(rdioCallId) as { audio: Buffer; audioType: string } | undefined;
        
        if (!audioResult?.audio) {
          throw new Error(`Audio not found for rdioCallId ${rdioCallId}`);
        }

        // Create temporary file for transcription
        const tempDir = path.join(process.cwd(), 'temp_audio');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFilePath = path.join(tempDir, `hospital-segment-${segmentId}.m4a`);
        fs.writeFileSync(tempFilePath, audioResult.audio);

        // Perform transcription
        const transcriptionFile = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath),
          model: 'whisper-1',
          language: 'en',
          response_format: 'verbose_json',
          temperature: 0.0,
          prompt: `Emergency medical dispatch communication from Indianapolis-Marion County EMS. 
          Listen for: hospital names (Methodist, Riley, Eskenazi, St. Vincent), 
          medical units (Medic, Ambulance), medical terminology, 
          patient information, and hospital communications.`
        });

        // Clean up temporary file
        fs.unlinkSync(tempFilePath);

        // Calculate confidence from log probabilities
        const segments = transcriptionFile.segments || [];
        let totalLogProb = 0;
        let tokenCount = 0;
        
        for (const segment of segments) {
          if (segment.avg_logprob) {
            totalLogProb += segment.avg_logprob;
            tokenCount++;
          }
        }
        
        const avgLogProb = tokenCount > 0 ? totalLogProb / tokenCount : -1;
        const confidence = Math.max(0, Math.min(1, Math.exp(avgLogProb)));

        console.log(`Hospital segment ${segmentId} transcription completed with confidence ${confidence}`);

        // Update the hospital call segment with transcription results
        await storage.updateHospitalCallSegment(segmentId, {
          transcript: transcriptionFile.text,
          confidence: confidence,
          duration: transcriptionFile.duration,
          metadata: {
            ...metadata,
            processingStatus: 'transcription_completed',
            errorMessage: null,
            retryAttempts: (metadata.retryAttempts || 0) + 1,
            lastRetryAt: new Date().toISOString()
          }
        });

        return {
          success: true,
          transcript: transcriptionFile.text,
          confidence: confidence,
          attempts: 1
        };

      } finally {
        rdioDb.close();
      }

    } catch (error) {
      console.error(`Error retrying hospital call segment ${segmentId}:`, error);
      
      // Update metadata with error information
      try {
        const segment = await storage.getHospitalCallSegmentById(segmentId);
        if (segment) {
          const metadata = segment.metadata as any;
          await storage.updateHospitalCallSegment(segmentId, {
            metadata: {
              ...metadata,
              processingStatus: 'transcription_failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              retryAttempts: (metadata.retryAttempts || 0) + 1,
              lastRetryAt: new Date().toISOString()
            }
          });
        }
      } catch (updateError) {
        console.error('Failed to update segment metadata:', updateError);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: 1
      };
    }
  }
}

export const transcriptionRetryService = new TranscriptionRetryService();
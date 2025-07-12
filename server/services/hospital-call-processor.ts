import { storage } from '../storage';
import { transcriptionService } from './transcription';
import { EventEmitter } from 'events';

/**
 * HospitalCallProcessor handles automated processing of hospital EMS calls
 * that are stuck in pending status and need to be moved to transcription queue
 */
export class HospitalCallProcessor extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60000; // Check every minute
  private isProcessing: boolean = false;

  constructor() {
    super();
  }

  /**
   * Start the hospital call processor
   */
  start(): void {
    if (this.checkInterval) {
      console.log('Hospital call processor already running');
      return;
    }

    console.log('Starting hospital call processor...');
    this.checkInterval = setInterval(() => {
      this.processStuckHospitalCalls();
    }, this.CHECK_INTERVAL_MS);

    // Process immediately on start
    this.processStuckHospitalCalls();
  }

  /**
   * Stop the hospital call processor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Hospital call processor stopped');
    }
  }

  /**
   * Process hospital calls that are stuck in pending status
   */
  private async processStuckHospitalCalls(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Check for hospital audio files in the processing directory
      const audioProcessingDir = path.join(process.cwd(), 'ems_audio_processing');
      
      if (!fs.existsSync(audioProcessingDir)) {
        this.isProcessing = false;
        return;
      }

      const files = fs.readdirSync(audioProcessingDir);
      const hospitalFiles = files.filter(file => file.startsWith('hospital-') && file.endsWith('.m4a'));
      
      if (hospitalFiles.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.log(`Hospital Call Processor: Found ${hospitalFiles.length} stuck hospital audio files`);

      // Process each hospital file
      for (const hospitalFile of hospitalFiles) {
        try {
          const fullPath = path.join(audioProcessingDir, hospitalFile);
          
          // Extract segment ID from filename: hospital-{segmentId}.m4a
          const segmentId = hospitalFile.replace('hospital-', '').replace('.m4a', '');
          
          console.log(`Hospital Call Processor: Processing stuck file ${hospitalFile} with segment ID ${segmentId}`);
          
          // Queue the audio file for transcription using the transcription service
          await transcriptionService.transcribeAudioBuffer(fs.readFileSync(fullPath), segmentId);

          // Emit event for monitoring
          this.emit('segmentQueued', {
            segmentId: segmentId,
            timestamp: new Date(),
            fileName: hospitalFile
          });

          console.log(`Hospital Call Processor: Successfully queued ${hospitalFile} for transcription`);

        } catch (error) {
          console.error(`Hospital Call Processor: Error processing ${hospitalFile}:`, error);
          
          // Try to remove problematic file to prevent infinite retry
          try {
            const fullPath = path.join(audioProcessingDir, hospitalFile);
            fs.unlinkSync(fullPath);
            console.log(`Hospital Call Processor: Removed problematic file ${hospitalFile}`);
          } catch (removeError) {
            console.error(`Hospital Call Processor: Failed to remove file ${hospitalFile}:`, removeError);
          }
        }
      }

    } catch (error) {
      console.error('Error in processStuckHospitalCalls:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manually trigger processing of stuck hospital calls
   */
  async triggerManualProcessing(): Promise<void> {
    console.log('Manual processing of stuck hospital calls triggered');
    await this.processStuckHospitalCalls();
  }

  /**
   * Get processor status
   */
  getStatus(): { running: boolean; checkInterval: number; isProcessing: boolean } {
    return {
      running: this.checkInterval !== null,
      checkInterval: this.CHECK_INTERVAL_MS,
      isProcessing: this.isProcessing
    };
  }
}

// Export singleton instance
export const hospitalCallProcessor = new HospitalCallProcessor();
import { DatabaseStorage } from '../database-storage';
import { ConversationAnalyzer } from './conversation-analyzer';

export class HospitalCallStatusMonitor {
  private storage: DatabaseStorage;
  private conversationAnalyzer: ConversationAnalyzer;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

  constructor(storage: DatabaseStorage) {
    this.storage = storage;
    this.conversationAnalyzer = new ConversationAnalyzer();
  }

  /**
   * Start monitoring hospital calls for status changes
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }

    console.log('Starting Hospital Call Status Monitor...');
    
    this.checkInterval = setInterval(() => {
      this.checkForCompletedCalls().catch(error => {
        console.error('Error checking for completed calls:', error);
      });
    }, this.CHECK_INTERVAL_MS);

    // Run initial check
    this.checkForCompletedCalls().catch(error => {
      console.error('Error in initial completed calls check:', error);
    });
  }

  /**
   * Stop monitoring hospital calls
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Hospital Call Status Monitor stopped');
    }
  }

  /**
   * Check for hospital calls that have moved to COMPLETED status
   * and need AI summary generation
   */
  private async checkForCompletedCalls(): Promise<void> {
    try {
      // Get all hospital calls with COMPLETED status that don't have conversation analysis
      const completedCalls = await this.storage.getHospitalCalls(100);
      
      for (const call of completedCalls) {
        if (call.status === 'COMPLETED' && !call.conversationAnalysis) {
          // Check if all segments have been transcribed
          const segments = await this.storage.getHospitalCallSegments(call.id);
          
          if (segments.length > 0 && this.areAllSegmentsTranscribed(segments)) {
            console.log(`Triggering AI summary for completed hospital call ${call.id} (${call.conversationId})`);
            
            try {
              await this.generateAISummary(call.id);
              console.log(`AI summary generated successfully for call ${call.id}`);
            } catch (error) {
              console.error(`Failed to generate AI summary for call ${call.id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in checkForCompletedCalls:', error);
    }
  }

  /**
   * Check if all segments in a hospital call have been transcribed
   */
  private areAllSegmentsTranscribed(segments: any[]): boolean {
    return segments.length > 0 && segments.every(segment => {
      return segment.transcript && 
             segment.transcript.trim().length > 0 && 
             segment.transcript !== 'Transcription pending...';
    });
  }

  /**
   * Generate AI summary for a completed hospital call
   */
  private async generateAISummary(hospitalCallId: number): Promise<void> {
    try {
      // Get all segments for this call
      const segments = await this.storage.getHospitalCallSegments(hospitalCallId);
      
      if (segments.length === 0) {
        console.log(`No segments found for hospital call ${hospitalCallId}`);
        return;
      }

      // Generate conversation analysis using segments
      const analysis = await this.conversationAnalyzer.analyzeConversation(segments);
      
      // Update the hospital call with the analysis
      await this.storage.updateHospitalCall(hospitalCallId, {
        conversationAnalysis: JSON.stringify(analysis),
        updatedAt: new Date()
      });

      console.log(`AI summary completed for hospital call ${hospitalCallId}:`, {
        summary: analysis.summary?.substring(0, 100) + '...',
        keyPoints: analysis.keyPoints?.length || 0,
        medicalContext: analysis.medicalContext?.substring(0, 50) + '...'
      });

    } catch (error) {
      console.error(`Error generating AI summary for hospital call ${hospitalCallId}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger AI summary for a specific hospital call
   */
  async triggerManualSummary(hospitalCallId: number): Promise<void> {
    console.log(`Manual AI summary trigger for hospital call ${hospitalCallId}`);
    await this.generateAISummary(hospitalCallId);
  }

  /**
   * Get monitoring status
   */
  getStatus(): { running: boolean; checkInterval: number } {
    return {
      running: this.checkInterval !== null,
      checkInterval: this.CHECK_INTERVAL_MS
    };
  }
}
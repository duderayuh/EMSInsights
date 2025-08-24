import { db } from '../db';
import { calls, audioSegments } from '@shared/schema';
import { eq, sql, gte, and, desc } from 'drizzle-orm';

export interface ConfidenceMetrics {
  averageConfidence: number;
  totalTranscriptions: number;
  highConfidenceCount: number; // >= 90%
  mediumConfidenceCount: number; // 70-89%
  lowConfidenceCount: number; // < 70%
  recentTrend: 'improving' | 'stable' | 'declining';
  problemSegments: Array<{
    id: string;
    confidence: number;
    transcript: string;
    timestamp: Date;
  }>;
  hourlyMetrics: Array<{
    hour: string;
    averageConfidence: number;
    count: number;
  }>;
}

export interface QualityReport {
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
  averageConfidence: number;
  targetMet: boolean; // Whether we're meeting >90% target
  recommendations: string[];
  timeBasedAnalysis: {
    bestHours: string[];
    worstHours: string[];
  };
}

class ConfidenceMonitorService {
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.9;
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.7;
  private readonly TARGET_CONFIDENCE = 0.9;

  /**
   * Get real-time confidence metrics for all transcriptions
   */
  async getConfidenceMetrics(hoursBack: number = 24): Promise<ConfidenceMetrics> {
    const since = new Date();
    since.setHours(since.getHours() - hoursBack);

    try {
      // Get all calls with confidence scores
      const recentCalls = await db.select({
        id: calls.id,
        confidence: calls.confidence,
        transcript: calls.transcript,
        timestamp: calls.timestamp
      })
      .from(calls)
      .where(gte(calls.timestamp, since))
      .orderBy(desc(calls.timestamp));

      // Calculate metrics
      const totalTranscriptions = recentCalls.length;
      if (totalTranscriptions === 0) {
        return this.getEmptyMetrics();
      }

      const confidenceValues = recentCalls
        .map(c => c.confidence || 0)
        .filter(c => c > 0);

      const averageConfidence = confidenceValues.length > 0
        ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
        : 0;

      const highConfidenceCount = confidenceValues.filter(c => c >= this.HIGH_CONFIDENCE_THRESHOLD).length;
      const mediumConfidenceCount = confidenceValues.filter(
        c => c >= this.MEDIUM_CONFIDENCE_THRESHOLD && c < this.HIGH_CONFIDENCE_THRESHOLD
      ).length;
      const lowConfidenceCount = confidenceValues.filter(c => c < this.MEDIUM_CONFIDENCE_THRESHOLD).length;

      // Get problem segments (low confidence)
      const problemSegments = recentCalls
        .filter(c => (c.confidence || 0) < this.MEDIUM_CONFIDENCE_THRESHOLD)
        .slice(0, 10)
        .map(c => ({
          id: c.id.toString(),
          confidence: c.confidence || 0,
          transcript: c.transcript || '',
          timestamp: c.timestamp
        }));

      // Calculate hourly metrics
      const hourlyMetrics = await this.calculateHourlyMetrics(recentCalls);

      // Determine trend
      const recentTrend = await this.calculateTrend(recentCalls);

      return {
        averageConfidence,
        totalTranscriptions,
        highConfidenceCount,
        mediumConfidenceCount,
        lowConfidenceCount,
        recentTrend,
        problemSegments,
        hourlyMetrics
      };
    } catch (error) {
      console.error('Error calculating confidence metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  /**
   * Generate a quality report with recommendations
   */
  async generateQualityReport(): Promise<QualityReport> {
    const metrics = await this.getConfidenceMetrics(24);
    
    // Determine overall quality
    let overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
    if (metrics.averageConfidence >= 0.95) {
      overallQuality = 'excellent';
    } else if (metrics.averageConfidence >= 0.9) {
      overallQuality = 'good';
    } else if (metrics.averageConfidence >= 0.7) {
      overallQuality = 'fair';
    } else {
      overallQuality = 'poor';
    }

    const targetMet = metrics.averageConfidence >= this.TARGET_CONFIDENCE;

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (metrics.averageConfidence < 0.9) {
      recommendations.push('Audio quality needs improvement to reach 90% confidence target');
    }
    
    if (metrics.lowConfidenceCount > metrics.totalTranscriptions * 0.2) {
      recommendations.push('Over 20% of transcriptions have low confidence - check audio input quality');
    }

    if (metrics.problemSegments.length > 5) {
      recommendations.push('Multiple problem segments detected - consider adjusting noise reduction settings');
    }

    // Analyze time-based patterns
    const sortedHours = [...metrics.hourlyMetrics].sort((a, b) => b.averageConfidence - a.averageConfidence);
    const bestHours = sortedHours.slice(0, 3).map(h => h.hour);
    const worstHours = sortedHours.slice(-3).map(h => h.hour);

    if (worstHours.some(h => {
      const hour = parseInt(h.split(':')[0]);
      return hour >= 22 || hour <= 6;
    })) {
      recommendations.push('Night shift shows lower confidence - may need additional audio enhancement');
    }

    return {
      overallQuality,
      averageConfidence: metrics.averageConfidence,
      targetMet,
      recommendations,
      timeBasedAnalysis: {
        bestHours,
        worstHours
      }
    };
  }

  /**
   * Track confidence for a specific segment
   */
  async trackSegmentConfidence(segmentId: string, confidence: number): Promise<void> {
    try {
      // Log to database or metrics system
      console.log(`Confidence tracked for ${segmentId}: ${(confidence * 100).toFixed(1)}%`);
      
      // Alert if confidence is very low
      if (confidence < 0.5) {
        console.warn(`⚠️ Very low confidence for segment ${segmentId}: ${(confidence * 100).toFixed(1)}%`);
      }
    } catch (error) {
      console.error('Error tracking segment confidence:', error);
    }
  }

  /**
   * Get segments that need retry based on confidence
   */
  async getSegmentsForRetry(confidenceThreshold: number = 0.7): Promise<string[]> {
    try {
      const lowConfidenceCalls = await db.select({
        audioSegmentId: calls.audioSegmentId
      })
      .from(calls)
      .where(
        and(
          sql`${calls.confidence} < ${confidenceThreshold}`,
          sql`${calls.confidence} > 0`
        )
      )
      .limit(10);

      return lowConfidenceCalls
        .map(c => c.audioSegmentId)
        .filter((id): id is string => id !== null);
    } catch (error) {
      console.error('Error getting segments for retry:', error);
      return [];
    }
  }

  /**
   * Calculate hourly confidence metrics
   */
  private async calculateHourlyMetrics(recentCalls: any[]): Promise<Array<{hour: string, averageConfidence: number, count: number}>> {
    const hourlyData = new Map<number, { sum: number, count: number }>();
    
    recentCalls.forEach(call => {
      const hour = new Date(call.timestamp).getHours();
      const existing = hourlyData.get(hour) || { sum: 0, count: 0 };
      existing.sum += call.confidence || 0;
      existing.count += 1;
      hourlyData.set(hour, existing);
    });

    const metrics = [];
    for (let hour = 0; hour < 24; hour++) {
      const data = hourlyData.get(hour);
      if (data && data.count > 0) {
        metrics.push({
          hour: `${hour.toString().padStart(2, '0')}:00`,
          averageConfidence: data.sum / data.count,
          count: data.count
        });
      }
    }

    return metrics.sort((a, b) => a.hour.localeCompare(b.hour));
  }

  /**
   * Calculate confidence trend
   */
  private async calculateTrend(recentCalls: any[]): Promise<'improving' | 'stable' | 'declining'> {
    if (recentCalls.length < 10) return 'stable';

    const firstHalf = recentCalls.slice(0, Math.floor(recentCalls.length / 2));
    const secondHalf = recentCalls.slice(Math.floor(recentCalls.length / 2));

    const firstAvg = firstHalf.reduce((sum, c) => sum + (c.confidence || 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, c) => sum + (c.confidence || 0), 0) / secondHalf.length;

    const difference = secondAvg - firstAvg;
    
    if (difference > 0.05) return 'improving';
    if (difference < -0.05) return 'declining';
    return 'stable';
  }

  /**
   * Get empty metrics object
   */
  private getEmptyMetrics(): ConfidenceMetrics {
    return {
      averageConfidence: 0,
      totalTranscriptions: 0,
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      recentTrend: 'stable',
      problemSegments: [],
      hourlyMetrics: []
    };
  }

  /**
   * Get real-time confidence statistics
   */
  async getRealTimeStats(): Promise<{
    current: number;
    average24h: number;
    average7d: number;
    targetStatus: 'exceeded' | 'met' | 'below';
  }> {
    const metrics24h = await this.getConfidenceMetrics(24);
    const metrics7d = await this.getConfidenceMetrics(168);
    
    // Get most recent transcription confidence
    const recentCall = await db.select({
      confidence: calls.confidence
    })
    .from(calls)
    .orderBy(desc(calls.timestamp))
    .limit(1);

    const current = recentCall[0]?.confidence || 0;
    
    let targetStatus: 'exceeded' | 'met' | 'below';
    if (metrics24h.averageConfidence >= 0.95) {
      targetStatus = 'exceeded';
    } else if (metrics24h.averageConfidence >= 0.9) {
      targetStatus = 'met';
    } else {
      targetStatus = 'below';
    }

    return {
      current,
      average24h: metrics24h.averageConfidence,
      average7d: metrics7d.averageConfidence,
      targetStatus
    };
  }
}

export const confidenceMonitor = new ConfidenceMonitorService();
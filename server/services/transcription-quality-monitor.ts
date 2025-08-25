import { storage } from '../storage';
import { EventEmitter } from 'events';

interface QualityMetrics {
  totalTranscriptions: number;
  averageConfidence: number;
  highConfidenceCount: number;  // >90%
  mediumConfidenceCount: number; // 70-90%
  lowConfidenceCount: number;    // <70%
  recentConfidences: number[];   // Last 100 transcriptions
  hourlyAverages: Map<string, number>;
  improvementTrend: number;      // Positive means improving
}

interface SegmentQuality {
  segmentId: string;
  confidence: number;
  timestamp: Date;
  hasUnits: boolean;
  hasAddress: boolean;
  textLength: number;
  processingTime: number;
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent';
  enhancementApplied: boolean;
}

class TranscriptionQualityMonitor extends EventEmitter {
  private metrics: QualityMetrics;
  private segmentHistory: SegmentQuality[] = [];
  private readonly MAX_HISTORY = 1000;
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.91;  // Target: >91%
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.70;
  
  constructor() {
    super();
    this.metrics = {
      totalTranscriptions: 0,
      averageConfidence: 0,
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      recentConfidences: [],
      hourlyAverages: new Map(),
      improvementTrend: 0
    };
    
    // Load historical data from database
    this.loadHistoricalMetrics();
    
    // Update metrics every minute
    setInterval(() => this.updateMetrics(), 60000);
    
    // Report quality metrics every 5 minutes
    setInterval(() => this.reportQualityMetrics(), 300000);
  }
  
  async trackSegment(segment: SegmentQuality): Promise<void> {
    // Add to history
    this.segmentHistory.push(segment);
    if (this.segmentHistory.length > this.MAX_HISTORY) {
      this.segmentHistory.shift();
    }
    
    // Update recent confidences
    this.metrics.recentConfidences.push(segment.confidence);
    if (this.metrics.recentConfidences.length > 100) {
      this.metrics.recentConfidences.shift();
    }
    
    // Update counts
    this.metrics.totalTranscriptions++;
    if (segment.confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
      this.metrics.highConfidenceCount++;
    } else if (segment.confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD) {
      this.metrics.mediumConfidenceCount++;
    } else {
      this.metrics.lowConfidenceCount++;
    }
    
    // Update average
    this.updateAverageConfidence();
    
    // Track hourly average
    const hour = new Date().toISOString().substring(0, 13);
    const hourlyData = this.metrics.hourlyAverages.get(hour) || [];
    this.metrics.hourlyAverages.set(hour, 
      [...(Array.isArray(hourlyData) ? hourlyData : [hourlyData]), segment.confidence] as any
    );
    
    // Emit quality alert if confidence is concerning
    if (segment.confidence < 0.5) {
      this.emit('low_quality_alert', {
        segmentId: segment.segmentId,
        confidence: segment.confidence,
        message: `Very low confidence transcription: ${(segment.confidence * 100).toFixed(1)}%`
      });
    }
    
    // Log quality achievement
    if (this.metrics.averageConfidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
      console.log(`✅ TARGET ACHIEVED: Average confidence ${(this.metrics.averageConfidence * 100).toFixed(1)}% exceeds 91% goal!`);
    }
  }
  
  private updateAverageConfidence(): void {
    if (this.metrics.recentConfidences.length === 0) return;
    
    const sum = this.metrics.recentConfidences.reduce((a, b) => a + b, 0);
    const newAverage = sum / this.metrics.recentConfidences.length;
    
    // Calculate trend
    if (this.metrics.averageConfidence > 0) {
      this.metrics.improvementTrend = newAverage - this.metrics.averageConfidence;
    }
    
    this.metrics.averageConfidence = newAverage;
  }
  
  private async loadHistoricalMetrics(): Promise<void> {
    try {
      // Load recent transcriptions from database
      const recentCalls = await storage.getRecentCalls(100);
      
      for (const call of recentCalls) {
        if (call.confidence !== null && call.confidence !== undefined) {
          this.metrics.recentConfidences.push(call.confidence);
          this.metrics.totalTranscriptions++;
          
          if (call.confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
            this.metrics.highConfidenceCount++;
          } else if (call.confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD) {
            this.metrics.mediumConfidenceCount++;
          } else {
            this.metrics.lowConfidenceCount++;
          }
        }
      }
      
      this.updateAverageConfidence();
      console.log(`Loaded ${this.metrics.totalTranscriptions} historical transcriptions`);
    } catch (error) {
      console.error('Failed to load historical metrics:', error);
    }
  }
  
  private updateMetrics(): void {
    // Clean up old hourly data (keep last 24 hours)
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);
    const cutoffHour = cutoff.toISOString().substring(0, 13);
    
    const hourlyKeys = Array.from(this.metrics.hourlyAverages.keys());
    for (const hour of hourlyKeys) {
      if (hour < cutoffHour) {
        this.metrics.hourlyAverages.delete(hour);
      }
    }
    
    // Calculate hourly averages
    const hourlyEntries = Array.from(this.metrics.hourlyAverages.entries());
    for (const [hour, confidences] of hourlyEntries) {
      if (Array.isArray(confidences) && confidences.length > 0) {
        const avg = confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length;
        this.metrics.hourlyAverages.set(hour, avg as any);
      }
    }
  }
  
  private reportQualityMetrics(): void {
    const report = {
      timestamp: new Date().toISOString(),
      totalTranscriptions: this.metrics.totalTranscriptions,
      averageConfidence: (this.metrics.averageConfidence * 100).toFixed(1) + '%',
      targetAchieved: this.metrics.averageConfidence >= this.HIGH_CONFIDENCE_THRESHOLD,
      distribution: {
        high: `${this.metrics.highConfidenceCount} (${((this.metrics.highConfidenceCount / this.metrics.totalTranscriptions) * 100).toFixed(1)}%)`,
        medium: `${this.metrics.mediumConfidenceCount} (${((this.metrics.mediumConfidenceCount / this.metrics.totalTranscriptions) * 100).toFixed(1)}%)`,
        low: `${this.metrics.lowConfidenceCount} (${((this.metrics.lowConfidenceCount / this.metrics.totalTranscriptions) * 100).toFixed(1)}%)`
      },
      trend: this.metrics.improvementTrend > 0 ? 'improving' : this.metrics.improvementTrend < 0 ? 'declining' : 'stable',
      recentAverage: this.metrics.recentConfidences.length > 0 
        ? (this.metrics.recentConfidences.reduce((a, b) => a + b, 0) / this.metrics.recentConfidences.length * 100).toFixed(1) + '%'
        : 'N/A'
    };
    
    console.log('📊 Transcription Quality Report:', report);
    
    // Emit metrics for dashboard display
    this.emit('quality_report', report);
    
    // Alert if below target
    if (this.metrics.averageConfidence < this.HIGH_CONFIDENCE_THRESHOLD) {
      const gap = ((this.HIGH_CONFIDENCE_THRESHOLD - this.metrics.averageConfidence) * 100).toFixed(1);
      console.log(`⚠️ Below target: Need ${gap}% improvement to reach 91% goal`);
    }
  }
  
  getMetrics(): QualityMetrics {
    return { ...this.metrics };
  }
  
  getRecentQuality(): SegmentQuality[] {
    return this.segmentHistory.slice(-20);
  }
  
  async getQualityTrends(): Promise<any> {
    const hourlyTrends: any[] = [];
    
    const hourlyEntries = Array.from(this.metrics.hourlyAverages.entries());
    for (const [hour, avgOrConfidences] of hourlyEntries) {
      const avg = Array.isArray(avgOrConfidences) 
        ? avgOrConfidences.reduce((a: number, b: number) => a + b, 0) / avgOrConfidences.length
        : avgOrConfidences;
      
      hourlyTrends.push({
        hour,
        averageConfidence: avg,
        aboveTarget: avg >= this.HIGH_CONFIDENCE_THRESHOLD
      });
    }
    
    return {
      hourlyTrends: hourlyTrends.sort((a, b) => a.hour.localeCompare(b.hour)),
      overallTrend: this.metrics.improvementTrend > 0 ? 'improving' : 'declining',
      currentAverage: this.metrics.averageConfidence,
      targetGap: Math.max(0, this.HIGH_CONFIDENCE_THRESHOLD - this.metrics.averageConfidence)
    };
  }
  
  /**
   * Get recommendations for improving transcription quality
   */
  getImprovementRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.metrics.averageConfidence < 0.7) {
      recommendations.push('Critical: Audio quality is very poor. Check microphone placement and noise levels.');
      recommendations.push('Consider upgrading audio capture hardware or adjusting gain settings.');
    }
    
    if (this.metrics.lowConfidenceCount > this.metrics.highConfidenceCount) {
      recommendations.push('Majority of transcriptions are low confidence. Review audio enhancement settings.');
      recommendations.push('Check for consistent background noise or interference patterns.');
    }
    
    if (this.metrics.improvementTrend < 0) {
      recommendations.push('Quality is declining. Investigate recent changes to audio pipeline.');
    }
    
    // Check recent performance
    if (this.metrics.recentConfidences.length >= 10) {
      const recent10 = this.metrics.recentConfidences.slice(-10);
      const recentAvg = recent10.reduce((a, b) => a + b, 0) / recent10.length;
      
      if (recentAvg < this.metrics.averageConfidence - 0.1) {
        recommendations.push('Recent transcriptions performing below average. Check for system issues.');
      }
    }
    
    if (this.metrics.averageConfidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
      recommendations.push('✅ Excellent! Transcription quality exceeds 91% target.');
    } else if (this.metrics.averageConfidence >= 0.85) {
      recommendations.push('Good quality. Minor improvements needed to reach 91% target.');
      recommendations.push('Consider fine-tuning noise reduction parameters.');
    }
    
    return recommendations;
  }
}

export const qualityMonitor = new TranscriptionQualityMonitor();
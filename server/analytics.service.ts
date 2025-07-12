import { db } from './db';
import { calls, callTypes } from '@shared/schema';
import { sql, inArray, eq, and, gte } from 'drizzle-orm';
import { format, subDays } from 'date-fns';

export interface TrendData {
  date: string;
  chiefComplaint: string;
  count: number;
}

export interface SpikeAlert {
  chiefComplaint: string;
  currentCount: number;
  historicalMean: number;
  standardDeviation: number;
  zScore: number;
  percentIncrease: number;
  isSpike: boolean;
}

export interface GeoCluster {
  chiefComplaint: string;
  latitude: number;
  longitude: number;
  count: number;
  zipCode?: string;
}

export interface PublicHealthSummary {
  totalCalls: number;
  topComplaints: Array<{ chiefComplaint: string; count: number; percentage: number }>;
  spikeAlerts: SpikeAlert[];
  recentClusters: GeoCluster[];
  dateRange: { start: string; end: string };
}

// Priority public health complaints - exact database call types
const PUBLIC_HEALTH_CALL_TYPES = [
  'Overdose',
  'Environmental', 
  'Mental-Emotional',
  'Injured Person',
  'OB/Childbirth'
];

// Mapping for display names
const PUBLIC_HEALTH_DISPLAY_NAMES: Record<string, string> = {
  'Overdose': 'Overdose',
  'Environmental': 'Environmental/Heat',
  'Mental-Emotional': 'Mental Health',
  'Injured Person': 'Injury/Gunshot',
  'OB/Childbirth': 'OB/Childbirth'
};

export class AnalyticsService {
  private publicHealthCallTypes: string[] = [];
  private publicHealthDisplayNames: Record<string, string> = {};
  private initialized = false;

  private async initialize() {
    if (this.initialized) return;
    
    try {
      // Load public health call types from database
      const publicHealthTypes = await db.select()
        .from(callTypes)
        .where(inArray(callTypes.name, [
          'overdose', 'overdose b', 'overdose c',
          'environmental',
          'mental-emotional', 'mental-emotional b',
          'injured person', 'injured person b', 'injured person c',
          'ob/childbirth', 'ob/childbirth b'
        ]));
      
      // Map call type names to display names
      this.publicHealthCallTypes = publicHealthTypes.map(ct => ct.displayName);
      this.publicHealthDisplayNames = {};
      
      for (const ct of publicHealthTypes) {
        // Use simplified display name for analytics
        if (ct.displayName.includes('Overdose')) {
          this.publicHealthDisplayNames[ct.displayName] = 'Overdose';
        } else if (ct.displayName.includes('Environmental')) {
          this.publicHealthDisplayNames[ct.displayName] = 'Environmental/Heat';
        } else if (ct.displayName.includes('Mental-Emotional') || ct.displayName.includes('Mental/Emotional')) {
          this.publicHealthDisplayNames[ct.displayName] = 'Mental Health';
        } else if (ct.displayName.includes('Injured Person')) {
          this.publicHealthDisplayNames[ct.displayName] = 'Injury/Gunshot';
        } else if (ct.displayName.includes('OB/Childbirth')) {
          this.publicHealthDisplayNames[ct.displayName] = 'OB/Childbirth';
        }
      }
      
      // Fallback to hardcoded if no call types found
      if (this.publicHealthCallTypes.length === 0) {
        this.publicHealthCallTypes = PUBLIC_HEALTH_CALL_TYPES;
        this.publicHealthDisplayNames = PUBLIC_HEALTH_DISPLAY_NAMES;
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error loading public health call types:', error);
      // Use hardcoded values as fallback
      this.publicHealthCallTypes = PUBLIC_HEALTH_CALL_TYPES;
      this.publicHealthDisplayNames = PUBLIC_HEALTH_DISPLAY_NAMES;
      this.initialized = true;
    }
  }

  // Get chief complaint trends for specified days
  async getChiefComplaintTrends(days: number): Promise<TrendData[]> {
    await this.initialize();
    const startDate = subDays(new Date(), days);
    
    const trends = await db.select({
      date: sql<string>`DATE_TRUNC('day', ${calls.timestamp})`,
      chiefComplaint: calls.callType,
      count: sql<number>`COUNT(*)`
    })
    .from(calls)
    .where(and(
      gte(calls.timestamp, startDate),
      inArray(calls.callType, this.publicHealthCallTypes)
    ))
    .groupBy(sql`DATE_TRUNC('day', ${calls.timestamp})`, calls.callType)
    .orderBy(sql`date DESC`, sql`count DESC`);

    console.log('Analytics trends query result:', trends);
    
    // Check different possible result structures
    const rows = trends.rows || trends || [];
    const dataArray = Array.isArray(rows) ? rows : (rows.rows || []);
    
    return dataArray.map(row => ({
      date: format(new Date(row.date as string), 'yyyy-MM-dd'),
      chiefComplaint: PUBLIC_HEALTH_DISPLAY_NAMES[row.chief_complaint as string] || row.chief_complaint as string,
      count: Number(row.count)
    }));
  }

  // Detect spikes in chief complaints using z-score method
  async detectSpikes(): Promise<SpikeAlert[]> {
    await this.initialize();
    const alerts: SpikeAlert[] = [];

    for (const callType of this.publicHealthCallTypes) {
      const displayName = this.publicHealthDisplayNames[callType] || callType;
      
      // Get last 24 hours count
      const recentCount = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM ${calls}
        WHERE timestamp >= ${subDays(new Date(), 1).toISOString()}
          AND call_type = ${callType}
      `);

      // Get historical data for past 30 days
      const historicalData = await db.execute(sql`
        SELECT 
          DATE_TRUNC('day', timestamp) as date,
          COUNT(*) as count
        FROM ${calls}
        WHERE timestamp >= ${subDays(new Date(), 30).toISOString()}
          AND timestamp < ${subDays(new Date(), 1).toISOString()}
          AND call_type = ${callType}
        GROUP BY DATE_TRUNC('day', timestamp)
      `);

      const historicalRows = Array.isArray(historicalData) ? historicalData : (historicalData.rows || []);
      const counts = historicalRows.map(row => Number(row.count));
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length || 0;
      const variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length || 0;
      const stdDev = Math.sqrt(variance);
      
      const recentRows = Array.isArray(recentCount) ? recentCount : (recentCount.rows || []);
      const current = Number(recentRows[0]?.count || 0);
      const zScore = stdDev > 0 ? (current - mean) / stdDev : 0;
      const percentIncrease = mean > 0 ? ((current - mean) / mean) * 100 : 0;

      alerts.push({
        chiefComplaint: displayName,
        currentCount: current,
        historicalMean: parseFloat(mean.toFixed(2)),
        standardDeviation: parseFloat(stdDev.toFixed(2)),
        zScore: parseFloat(zScore.toFixed(2)),
        percentIncrease: parseFloat(percentIncrease.toFixed(0)),
        isSpike: zScore > 2 // Flag if z-score > 2 standard deviations
      });
    }

    return alerts.filter(alert => alert.currentCount > 0);
  }

  // Get geographic clusters of calls
  async getGeoClusters(hours: number = 24): Promise<GeoCluster[]> {
    await this.initialize();
    const clusters = await db.select({
      chiefComplaint: calls.callType,
      latitude: calls.latitude,
      longitude: calls.longitude,
      count: sql<number>`COUNT(*)`
    })
    .from(calls)
    .where(and(
      gte(calls.timestamp, subDays(new Date(), hours / 24)),
      sql`${calls.latitude} IS NOT NULL`,
      sql`${calls.longitude} IS NOT NULL`,
      inArray(calls.callType, this.publicHealthCallTypes)
    ))
    .groupBy(calls.callType, calls.latitude, calls.longitude)
    .having(sql`COUNT(*) >= 2`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(100);

    return clusters.map(row => ({
      chiefComplaint: this.publicHealthDisplayNames[row.chiefComplaint] || row.chiefComplaint,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      count: Number(row.count)
    }));
  }

  // Get top complaints for a date range (filtered for public health categories)
  async getTopComplaints(days: number): Promise<Array<{ chiefComplaint: string; count: number; percentage: number }>> {
    await this.initialize();
    const startDate = subDays(new Date(), days);
    
    const totalCountResult = await db.select({
      total: sql<number>`COUNT(*)`
    })
    .from(calls)
    .where(and(
      gte(calls.timestamp, startDate),
      inArray(calls.callType, this.publicHealthCallTypes)
    ));
    
    const totalCount = Number(totalCountResult[0]?.total || 0);

    const topComplaints = await db.select({
      chiefComplaint: calls.callType,
      count: sql<number>`COUNT(*)`
    })
    .from(calls)
    .where(and(
      gte(calls.timestamp, startDate),
      inArray(calls.callType, this.publicHealthCallTypes)
    ))
    .groupBy(calls.callType)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

    return topComplaints.map(row => ({
      chiefComplaint: this.publicHealthDisplayNames[row.chiefComplaint] || row.chiefComplaint,
      count: Number(row.count),
      percentage: totalCount > 0 ? parseFloat(((Number(row.count) / totalCount) * 100).toFixed(1)) : 0
    }));
  }

  // Generate public health summary
  async generateSummary(days: number = 7): Promise<PublicHealthSummary> {
    await this.initialize();
    const startDate = subDays(new Date(), days);
    const endDate = new Date();

    const [totalCallsResult, topComplaints, spikeAlerts, recentClusters] = await Promise.all([
      db.select({
        total: sql<number>`COUNT(*)`
      })
      .from(calls)
      .where(and(
        gte(calls.timestamp, startDate),
        inArray(calls.callType, this.publicHealthCallTypes)
      )),
      this.getTopComplaints(days),
      this.detectSpikes(),
      this.getGeoClusters(24)
    ]);

    const totalCalls = Number(totalCallsResult[0]?.total || 0);
    
    return {
      totalCalls,
      topComplaints,
      spikeAlerts: spikeAlerts.filter(alert => alert.isSpike),
      recentClusters: recentClusters,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() }
    };
  }

  // Generate Medical Director Insights for Emergency Alert Center
  async generateMedicalDirectorInsights(): Promise<Array<{
    id: string;
    title: string;
    message: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: 'medical_director';
    timestamp: Date;
    data: any;
  }>> {
    const insights: Array<{
      id: string;
      title: string;
      message: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      category: 'medical_director';
      timestamp: Date;
      data: any;
    }> = [];
    
    // Get current public health summary
    const summary = await this.generateSummary(7);
    
    // Check for critical spikes
    for (const spike of summary.spikeAlerts) {
      if (spike.isSpike && spike.zScore > 3) {
        insights.push({
          id: `spike_${spike.chiefComplaint.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
          title: `Critical ${spike.chiefComplaint} Spike Detected`,
          message: `${spike.chiefComplaint} calls have increased by ${spike.percentIncrease}% (${spike.currentCount} calls vs ${spike.historicalMean.toFixed(1)} average). Z-score: ${spike.zScore.toFixed(2)}`,
          severity: spike.zScore > 4 ? 'critical' : 'high',
          category: 'medical_director',
          timestamp: new Date(),
          data: spike
        });
      }
    }
    
    // Check for high-volume clusters
    const clustersByType = summary.recentClusters.reduce((acc, cluster) => {
      if (!acc[cluster.chiefComplaint]) {
        acc[cluster.chiefComplaint] = [];
      }
      acc[cluster.chiefComplaint].push(cluster);
      return acc;
    }, {} as Record<string, typeof summary.recentClusters>);
    
    for (const [complaint, clusters] of Object.entries(clustersByType)) {
      if (clusters.length >= 3) {
        const totalCalls = clusters.reduce((sum, cluster) => sum + cluster.count, 0);
        insights.push({
          id: `cluster_${complaint.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
          title: `Geographic Clustering Alert: ${complaint}`,
          message: `${totalCalls} ${complaint} calls clustered in ${clusters.length} locations within 24 hours. Review for potential outbreak or incident.`,
          severity: totalCalls > 10 ? 'high' : 'medium',
          category: 'medical_director',
          timestamp: new Date(),
          data: { complaint, clusters, totalCalls }
        });
      }
    }
    
    // Check for high daily volumes
    const highVolumeThreshold = 20; // Threshold for high daily volume
    if (summary.totalCalls > highVolumeThreshold) {
      insights.push({
        id: `high_volume_${Date.now()}`,
        title: 'High Public Health Call Volume',
        message: `${summary.totalCalls} public health calls in the last 7 days. Top concerns: ${summary.topComplaints.slice(0, 2).map(c => `${c.chiefComplaint} (${c.count})`).join(', ')}`,
        severity: 'medium',
        category: 'medical_director',
        timestamp: new Date(),
        data: { totalCalls: summary.totalCalls, topComplaints: summary.topComplaints }
      });
    }
    
    return insights;
  }

  // Generate AI insights (optional)
  async generateAIInsight(summary: PublicHealthSummary): Promise<string> {
    // This would integrate with OpenAI/Claude API
    // For now, return a template-based insight
    
    const insights: string[] = [];
    
    // Check for spikes
    for (const spike of summary.spikeAlerts) {
      if (spike.isSpike) {
        insights.push(`${spike.chiefComplaint.charAt(0).toUpperCase() + spike.chiefComplaint.slice(1)} calls have increased by ${spike.percentIncrease}% above the historical average.`);
      }
    }
    
    // Check for clusters
    const clustersByType = summary.recentClusters.reduce((acc, cluster) => {
      if (!acc[cluster.chiefComplaint]) {
        acc[cluster.chiefComplaint] = 0;
      }
      acc[cluster.chiefComplaint] += cluster.count;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(clustersByType).forEach(([type, count]) => {
      if (count > 5) {
        insights.push(`Geographic clustering of ${type} calls detected with ${count} incidents in concentrated areas.`);
      }
    });
    
    // Add top complaint insight
    if (summary.topComplaints.length > 0) {
      const topComplaint = summary.topComplaints[0];
      insights.push(`The most common call type is "${topComplaint.chiefComplaint}" accounting for ${topComplaint.percentage}% of all calls.`);
    }
    
    return insights.length > 0 
      ? insights.join(' ')
      : 'No significant public health trends detected in the current period.';
  }
}

export const analyticsService = new AnalyticsService();
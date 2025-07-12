import { db } from './db';
import { calls } from '@shared/schema';
import { sql, inArray } from 'drizzle-orm';
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
  // Get chief complaint trends for specified days
  async getChiefComplaintTrends(days: number): Promise<TrendData[]> {
    const startDate = subDays(new Date(), days);
    
    const trends = await db.execute(sql`
      SELECT 
        DATE_TRUNC('day', timestamp) as date,
        call_type as chief_complaint,
        COUNT(*) as count
      FROM ${calls}
      WHERE timestamp >= ${startDate.toISOString()}
        AND call_type IN ('Overdose', 'Environmental', 'Mental-Emotional', 'Injured Person', 'OB/Childbirth')
      GROUP BY DATE_TRUNC('day', timestamp), call_type
      ORDER BY date DESC, count DESC
    `);

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
    const alerts: SpikeAlert[] = [];

    for (const callType of PUBLIC_HEALTH_CALL_TYPES) {
      const displayName = PUBLIC_HEALTH_DISPLAY_NAMES[callType] || callType;
      
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
    const clusters = await db.execute(sql`
      SELECT 
        call_type as chief_complaint,
        latitude,
        longitude,
        COUNT(*) as count
      FROM ${calls}
      WHERE timestamp >= ${subDays(new Date(), hours / 24).toISOString()}
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND call_type IN ('Overdose', 'Environmental', 'Mental-Emotional', 'Injured Person', 'OB/Childbirth')
      GROUP BY call_type, latitude, longitude
      HAVING COUNT(*) >= 2
      ORDER BY count DESC
      LIMIT 100
    `);

    const clusterRows = Array.isArray(clusters) ? clusters : (clusters.rows || []);
    return clusterRows.map(row => ({
      chiefComplaint: PUBLIC_HEALTH_DISPLAY_NAMES[row.chief_complaint as string] || row.chief_complaint as string,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      count: Number(row.count)
    }));
  }

  // Get top complaints for a date range (filtered for public health categories)
  async getTopComplaints(days: number): Promise<Array<{ chiefComplaint: string; count: number; percentage: number }>> {
    const startDate = subDays(new Date(), days);
    
    const totalCountResult = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM ${calls}
      WHERE timestamp >= ${startDate.toISOString()}
        AND call_type IN ('Overdose', 'Environmental', 'Mental-Emotional', 'Injured Person', 'OB/Childbirth')
    `);
    
    const totalRows = Array.isArray(totalCountResult) ? totalCountResult : (totalCountResult.rows || []);
    const totalCount = Number(totalRows[0]?.total || 0);

    const topComplaints = await db.execute(sql`
      SELECT 
        call_type as chief_complaint,
        COUNT(*) as count
      FROM ${calls}
      WHERE timestamp >= ${startDate.toISOString()}
        AND call_type IN ('Overdose', 'Environmental', 'Mental-Emotional', 'Injured Person', 'OB/Childbirth')
      GROUP BY call_type
      ORDER BY count DESC
      LIMIT 10
    `);

    const complaintRows = Array.isArray(topComplaints) ? topComplaints : (topComplaints.rows || []);
    return complaintRows.map(row => ({
      chiefComplaint: PUBLIC_HEALTH_DISPLAY_NAMES[row.chief_complaint as string] || row.chief_complaint as string,
      count: Number(row.count),
      percentage: totalCount > 0 ? parseFloat(((Number(row.count) / totalCount) * 100).toFixed(1)) : 0
    }));
  }

  // Generate public health summary
  async generateSummary(days: number = 7): Promise<PublicHealthSummary> {
    const startDate = subDays(new Date(), days);
    const endDate = new Date();

    const [totalCallsResult, topComplaints, spikeAlerts, recentClusters] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) as total
        FROM ${calls}
        WHERE timestamp >= ${startDate.toISOString()}
          AND call_type IN ('Overdose', 'Environmental', 'Mental-Emotional', 'Injured Person', 'OB/Childbirth')
      `),
      this.getTopComplaints(days),
      this.detectSpikes(),
      this.getGeoClusters(24)
    ]);

    const totalRows = Array.isArray(totalCallsResult) ? totalCallsResult : (totalCallsResult.rows || []);
    const totalCalls = Number(totalRows[0]?.total || 0);
    
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
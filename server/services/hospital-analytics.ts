import { storage } from '../storage';
import { HospitalCall, HospitalCallSegment } from '@shared/schema';

interface HospitalAnalytics {
  totalCalls: number;
  callsByHospital: Record<string, number>;
  averageCallDuration: number;
  callsToday: number;
  callsThisWeek: number;
  topCallTypes: Array<{ type: string; count: number }>;
  responseTimeStats: {
    average: number;
    fastest: number;
    slowest: number;
  };
  segmentAnalytics: {
    totalSegments: number;
    averageSegmentsPerCall: number;
    transcriptionCompletionRate: number;
  };
}

interface CallTrend {
  date: string;
  count: number;
  hospital: string;
}

export class HospitalAnalyticsService {
  async getHospitalAnalytics(dateRange?: { from: Date; to: Date }): Promise<HospitalAnalytics> {
    const endDate = dateRange?.to || new Date();
    const startDate = dateRange?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Get all hospital calls within date range
    const allCalls = await storage.getHospitalCalls(1000); // Get up to 1000 calls
    const filteredCalls = allCalls.filter(call => {
      const callDate = new Date(call.timestamp);
      return callDate >= startDate && callDate <= endDate;
    });

    // Calculate basic metrics
    const totalCalls = filteredCalls.length;
    const callsByHospital = this.groupCallsByHospital(filteredCalls);
    
    // Calculate call duration analytics
    const callDurations = await this.calculateCallDurations(filteredCalls);
    const averageCallDuration = callDurations.length > 0 
      ? callDurations.reduce((sum, duration) => sum + duration, 0) / callDurations.length 
      : 0;

    // Calculate time-based metrics
    const today = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const callsToday = filteredCalls.filter(call => {
      const callDate = new Date(call.timestamp);
      return callDate.toDateString() === today.toDateString();
    }).length;

    const callsThisWeek = filteredCalls.filter(call => {
      const callDate = new Date(call.timestamp);
      return callDate >= weekAgo;
    }).length;

    // Calculate top call types (would need additional data structure)
    const topCallTypes = this.calculateTopCallTypes(filteredCalls);

    // Calculate response time statistics
    const responseTimeStats = await this.calculateResponseTimeStats(filteredCalls);

    // Calculate segment analytics
    const segmentAnalytics = await this.calculateSegmentAnalytics(filteredCalls);

    return {
      totalCalls,
      callsByHospital,
      averageCallDuration,
      callsToday,
      callsThisWeek,
      topCallTypes,
      responseTimeStats,
      segmentAnalytics
    };
  }

  async getCallTrends(days: number = 30): Promise<CallTrend[]> {
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const calls = await storage.getHospitalCalls(1000);
    const filteredCalls = calls.filter(call => {
      const callDate = new Date(call.timestamp);
      return callDate >= startDate && callDate <= endDate;
    });

    // Group calls by date and hospital
    const trends: CallTrend[] = [];
    const dateMap = new Map<string, Map<string, number>>();

    filteredCalls.forEach(call => {
      const dateStr = new Date(call.timestamp).toISOString().split('T')[0];
      const hospital = call.hospitalName || 'Unknown';
      
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, new Map());
      }
      
      const hospitalMap = dateMap.get(dateStr)!;
      hospitalMap.set(hospital, (hospitalMap.get(hospital) || 0) + 1);
    });

    // Convert to trend format
    for (const [date, hospitalMap] of dateMap.entries()) {
      for (const [hospital, count] of hospitalMap.entries()) {
        trends.push({ date, hospital, count });
      }
    }

    return trends.sort((a, b) => a.date.localeCompare(b.date));
  }

  private groupCallsByHospital(calls: HospitalCall[]): Record<string, number> {
    const grouping: Record<string, number> = {};
    
    calls.forEach(call => {
      const hospital = call.hospitalName || 'Unknown';
      grouping[hospital] = (grouping[hospital] || 0) + 1;
    });

    return grouping;
  }

  private async calculateCallDurations(calls: HospitalCall[]): Promise<number[]> {
    const durations: number[] = [];
    
    for (const call of calls) {
      try {
        const segments = await storage.getHospitalCallSegments(call.id);
        if (segments.length > 0) {
          const totalDuration = segments.reduce((sum, segment) => {
            return sum + (segment.duration || 0);
          }, 0);
          durations.push(totalDuration);
        }
      } catch (error) {
        console.error(`Error calculating duration for call ${call.id}:`, error);
      }
    }

    return durations;
  }

  private calculateTopCallTypes(calls: HospitalCall[]): Array<{ type: string; count: number }> {
    // This would require additional metadata about call types
    // For now, return placeholder based on available data
    const typeMap = new Map<string, number>();
    
    calls.forEach(call => {
      // Use conversation ID patterns or other available data
      const type = this.inferCallType(call);
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    return Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5
  }

  private inferCallType(call: HospitalCall): string {
    // Simple inference based on available data
    if (call.sorDetected || call.sorPhysician) {
      return 'SOR Request';
    }
    
    if (call.conversationId.includes('STEMI')) {
      return 'STEMI Alert';
    }
    
    if (call.conversationId.includes('TRAUMA')) {
      return 'Trauma Alert';
    }

    return 'General EMS';
  }

  private async calculateResponseTimeStats(calls: HospitalCall[]): Promise<{
    average: number;
    fastest: number;
    slowest: number;
  }> {
    const responseTimes: number[] = [];
    
    for (const call of calls) {
      try {
        const segments = await storage.getHospitalCallSegments(call.id);
        if (segments.length >= 2) {
          // Calculate time between first and last segment
          const firstSegment = segments.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )[0];
          const lastSegment = segments[segments.length - 1];
          
          const responseTime = new Date(lastSegment.timestamp).getTime() - 
                              new Date(firstSegment.timestamp).getTime();
          responseTimes.push(responseTime / 1000); // Convert to seconds
        }
      } catch (error) {
        console.error(`Error calculating response time for call ${call.id}:`, error);
      }
    }

    if (responseTimes.length === 0) {
      return { average: 0, fastest: 0, slowest: 0 };
    }

    return {
      average: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      fastest: Math.min(...responseTimes),
      slowest: Math.max(...responseTimes)
    };
  }

  private async calculateSegmentAnalytics(calls: HospitalCall[]): Promise<{
    totalSegments: number;
    averageSegmentsPerCall: number;
    transcriptionCompletionRate: number;
  }> {
    let totalSegments = 0;
    let transcribedSegments = 0;

    for (const call of calls) {
      try {
        const segments = await storage.getHospitalCallSegments(call.id);
        totalSegments += segments.length;
        transcribedSegments += segments.filter(s => s.transcript && s.transcript.trim().length > 0).length;
      } catch (error) {
        console.error(`Error calculating segment analytics for call ${call.id}:`, error);
      }
    }

    const averageSegmentsPerCall = calls.length > 0 ? totalSegments / calls.length : 0;
    const transcriptionCompletionRate = totalSegments > 0 ? (transcribedSegments / totalSegments) * 100 : 0;

    return {
      totalSegments,
      averageSegmentsPerCall,
      transcriptionCompletionRate
    };
  }
}

export const hospitalAnalyticsService = new HospitalAnalyticsService();
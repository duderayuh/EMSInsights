import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Phone, Activity, TrendingUp, Users, MapPin, Clock, MessageSquare } from "lucide-react";

export function HospitalAnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState("30");

  // Fetch all calls for analytics (no limit)
  const { data: allCalls = [], isLoading: callsLoading } = useQuery({
    queryKey: ['/api/calls', { limit: 10000 }], // Get all calls, not just 20
    refetchInterval: 30000,
  });

  // Fetch hospital calls
  const { data: hospitalCalls = [], isLoading: hospitalCallsLoading } = useQuery({
    queryKey: ['/api/hospital-calls'],
    refetchInterval: 30000,
  });

  // Fetch system stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/stats'],
    refetchInterval: 5000,
  });

  // Calculate analytics from real call data
  const analytics = useMemo(() => {
    if (!Array.isArray(allCalls) || allCalls.length === 0) return null;

    const now = new Date();
    const daysAgo = parseInt(timeRange);
    const cutoffDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
    
    const recentCalls = allCalls.filter((call: any) => 
      new Date(call.timestamp) >= cutoffDate
    );

    // Calculate call distribution by type
    const callsByType: Record<string, number> = {};
    recentCalls.forEach((call: any) => {
      const type = call.callType || call.callReason || 'Unknown';
      callsByType[type] = (callsByType[type] || 0) + 1;
    });

    // Calculate today's calls for dispatch systems only (10202, 10244)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayDispatchCalls = allCalls.filter((call: any) => {
      const isToday = new Date(call.timestamp) >= todayStart;
      const isDispatch = call.talkgroup === '10202' || call.talkgroup === '10244';
      return isToday && isDispatch;
    });

    // Calculate this week's calls
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekCalls = allCalls.filter((call: any) => 
      new Date(call.timestamp) >= weekStart
    );

    // Calculate confidence stats
    const transcribedCalls = recentCalls.filter((call: any) => call.confidence > 0);
    const avgConfidence = transcribedCalls.length > 0 
      ? transcribedCalls.reduce((sum: number, call: any) => sum + (call.confidence || 0), 0) / transcribedCalls.length
      : 0;

    // Calculate top call types
    const topCallTypes = Object.entries(callsByType)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // Calculate distribution by talkgroup/channel with aliases
    const callsByChannel: Record<string, number> = {};
    recentCalls.forEach((call: any) => {
      let channelName = call.talkgroupDisplayName || call.talkgroup || 'Unknown';
      // Add talkgroup aliases
      if (call.talkgroup === '10202') {
        channelName = 'Countywide Dispatch Primary';
      } else if (call.talkgroup === '10244') {
        channelName = 'Countywide Dispatch Secondary';
      }
      callsByChannel[channelName] = (callsByChannel[channelName] || 0) + 1;
    });

    // Calculate hospital calls
    const hospitalCallsToday = Array.isArray(hospitalCalls) ? hospitalCalls.filter((call: any) => {
      const isToday = new Date(call.timestamp) >= todayStart;
      return isToday;
    }).length : 0;

    return {
      totalSystemCalls: allCalls.length, // Total calls across all systems
      totalCalls: recentCalls.length, // Calls in selected time range
      callsToday: todayDispatchCalls.length, // Only dispatch calls today
      callsThisWeek: weekCalls.length,
      callsByType,
      callsByChannel,
      topCallTypes,
      transcriptionRate: transcribedCalls.length / recentCalls.length * 100,
      averageConfidence: avgConfidence * 100,
      hospitalCallsToday,
      callsWithLocation: recentCalls.filter((call: any) => call.latitude && call.longitude).length,
      mappingRate: recentCalls.filter((call: any) => call.latitude && call.longitude).length / recentCalls.length * 100,
    };
  }, [allCalls, hospitalCalls, timeRange]);

  const isLoading = callsLoading || statsLoading || hospitalCallsLoading;

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="space-y-4 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Emergency Analytics Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Real-time insights from emergency dispatch data</p>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 Hours</SelectItem>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total System Calls</p>
                <p className="text-2xl font-bold">{analytics.totalSystemCalls}</p>
              </div>
              <Phone className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Dispatch Calls Today</p>
                <p className="text-2xl font-bold">{analytics.callsToday}</p>
              </div>
              <Calendar className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{analytics.callsThisWeek}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">EMS to Hospital Calls</p>
                <p className="text-2xl font-bold">{analytics.hospitalCallsToday}</p>
              </div>
              <Users className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Transcription Rate</p>
                <p className="text-2xl font-bold">{analytics.transcriptionRate.toFixed(1)}%</p>
              </div>
              <MessageSquare className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">AI Transcription Confidence (Average)</p>
                <p className="text-2xl font-bold">{analytics.averageConfidence.toFixed(1)}%</p>
              </div>
              <Activity className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Call Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Top Call Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.topCallTypes.map((callType: any, index: number) => {
                const percentage = (callType.count / analytics.totalCalls) * 100;
                return (
                  <div key={index} className="flex items-center justify-between">
                    <span className="font-medium">{callType.type}</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold w-8">{callType.count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Channel Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.callsByChannel)
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .slice(0, 5)
                .map(([channel, count]) => {
                  const percentage = (count as number) / analytics.totalCalls * 100;
                  return (
                    <div key={channel} className="flex items-center justify-between">
                      <span className="font-medium">{channel}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold w-8">{count}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            System Performance ({timeRange} Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground">Total Calls in Period</div>
              <div className="text-3xl font-bold text-blue-600">{analytics.totalCalls}</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground">Average per Day</div>
              <div className="text-3xl font-bold text-green-600">{Math.round(analytics.totalCalls / parseInt(timeRange))}</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-sm font-medium text-muted-foreground">Processing Success</div>
              <div className="text-3xl font-bold text-purple-600">{analytics.transcriptionRate.toFixed(1)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
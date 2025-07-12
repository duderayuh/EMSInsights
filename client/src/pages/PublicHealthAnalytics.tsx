import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Line, LineChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MapPin, TrendingUp, Activity, Brain, AlertTriangle, Calendar } from 'lucide-react';
import { GoogleMapView } from '@/components/GoogleMapView';
import { format } from 'date-fns';

interface PublicHealthSummary {
  totalCalls: number;
  topComplaints: Array<{ chiefComplaint: string; count: number; percentage: number }>;
  spikeAlerts: Array<{
    chiefComplaint: string;
    currentCount: number;
    historicalMean: number;
    standardDeviation: number;
    zScore: number;
    percentIncrease: number;
    isSpike: boolean;
  }>;
  recentClusters: Array<{
    chiefComplaint: string;
    latitude: number;
    longitude: number;
    count: number;
  }>;
  dateRange: { start: string; end: string };
}

interface TrendData {
  date: string;
  chiefComplaint: string;
  count: number;
}

interface AIInsight {
  insight: string;
  summary: PublicHealthSummary;
}

const complaintTypeColors: Record<string, string> = {
  overdose: '#dc2626', // red
  environmental: '#f59e0b', // amber
  mentalhealth: '#8b5cf6', // violet
  injury: '#ef4444', // red
  obstetric: '#ec4899', // pink
  default: '#6b7280' // gray
};

const getComplaintColor = (complaint: string): string => {
  const lower = complaint.toLowerCase();
  for (const [key, color] of Object.entries(complaintTypeColors)) {
    if (lower.includes(key.replace('health', ''))) {
      return color;
    }
  }
  return complaintTypeColors.default;
};

export default function PublicHealthAnalytics() {
  const [dateRange, setDateRange] = useState('7');
  const [selectedComplaint, setSelectedComplaint] = useState('all');

  // Fetch summary data
  const { data: summary, isLoading: summaryLoading } = useQuery<PublicHealthSummary>({
    queryKey: ['/api/analytics/summary', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/summary?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch summary');
      return response.json();
    }
  });

  // Fetch trends data
  const { data: trends, isLoading: trendsLoading } = useQuery<TrendData[]>({
    queryKey: ['/api/analytics/trends', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/trends?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch trends');
      return response.json();
    }
  });

  // Fetch AI insights
  const { data: aiInsight, isLoading: insightLoading } = useQuery<AIInsight>({
    queryKey: ['/api/analytics/ai-insight', dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/ai-insight?days=${dateRange}`);
      if (!response.ok) throw new Error('Failed to fetch AI insights');
      return response.json();
    }
  });

  // Transform trends data for charts
  const chartData = React.useMemo(() => {
    if (!trends) return [];
    
    // Group by date and aggregate top complaints
    const dateMap = new Map<string, Record<string, number>>();
    const complaintTypes = new Set<string>();
    
    trends.forEach(trend => {
      if (selectedComplaint !== 'all' && !trend.chiefComplaint.toLowerCase().includes(selectedComplaint)) {
        return;
      }
      
      const date = format(new Date(trend.date), 'MMM dd');
      if (!dateMap.has(date)) {
        dateMap.set(date, {});
      }
      
      const complaints = dateMap.get(date)!;
      complaints[trend.chiefComplaint] = (complaints[trend.chiefComplaint] || 0) + trend.count;
      complaintTypes.add(trend.chiefComplaint);
    });
    
    // Convert to chart format
    const chartData = Array.from(dateMap.entries()).map(([date, complaints]) => ({
      date,
      ...complaints,
      total: Object.values(complaints).reduce((sum, count) => sum + count, 0)
    }));
    
    return chartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [trends, selectedComplaint]);

  // Create map markers from clusters
  const mapMarkers = React.useMemo(() => {
    if (!summary?.recentClusters) return [];
    
    return summary.recentClusters.map((cluster, idx) => ({
      id: `cluster-${idx}`,
      position: { lat: cluster.latitude, lng: cluster.longitude },
      title: `${cluster.chiefComplaint} (${cluster.count} calls)`,
      type: cluster.chiefComplaint.toLowerCase(),
      color: getComplaintColor(cluster.chiefComplaint)
    }));
  }, [summary]);

  if (summaryLoading || trendsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white flex items-center gap-2">
            <Brain className="h-6 w-6" />
            Public Health Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Medical director insights and trend analysis
          </p>
        </div>
        
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Spike Alerts */}
      {summary?.spikeAlerts && summary.spikeAlerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.spikeAlerts.map((spike) => (
            <Alert key={spike.chiefComplaint} className="border-red-200 bg-red-50 dark:bg-red-900/20">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800 dark:text-red-200">
                {spike.chiefComplaint.charAt(0).toUpperCase() + spike.chiefComplaint.slice(1)} Spike
              </AlertTitle>
              <AlertDescription className="text-red-700 dark:text-red-300">
                <div className="text-2xl font-bold">↑ {spike.percentIncrease}%</div>
                <div className="text-sm">
                  {spike.currentCount} calls vs {spike.historicalMean.toFixed(1)} average
                </div>
                <div className="text-xs mt-1">
                  Z-score: {spike.zScore.toFixed(2)}
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-2" />
            Call Trends
          </TabsTrigger>
          <TabsTrigger value="distribution">
            <Activity className="h-4 w-4 mr-2" />
            Distribution
          </TabsTrigger>
          <TabsTrigger value="map">
            <MapPin className="h-4 w-4 mr-2" />
            Geoclusters
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Brain className="h-4 w-4 mr-2" />
            AI Insights
          </TabsTrigger>
        </TabsList>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Call Volume Trends</CardTitle>
              <CardDescription>
                Daily call volume by chief complaint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Select value={selectedComplaint} onValueChange={setSelectedComplaint}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by complaint" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Complaints</SelectItem>
                    <SelectItem value="overdose">Overdose</SelectItem>
                    <SelectItem value="environmental">Environmental</SelectItem>
                    <SelectItem value="mental">Mental Health</SelectItem>
                    <SelectItem value="gunshot">Injury/Gunshot</SelectItem>
                    <SelectItem value="ob">OB/Childbirth</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      name="Total Calls"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Chief Complaints</CardTitle>
              <CardDescription>
                Distribution of emergency calls by type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary?.topComplaints.map((complaint) => (
                  <div key={complaint.chiefComplaint} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getComplaintColor(complaint.chiefComplaint) }}
                      />
                      <span className="font-medium">{complaint.chiefComplaint}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{complaint.count} calls</Badge>
                      <span className="text-sm text-gray-600">{complaint.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Bar chart visualization */}
              <div className="h-64 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary?.topComplaints || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="chiefComplaint" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar 
                      dataKey="count" 
                      fill={(entry: any) => getComplaintColor(entry.chiefComplaint)}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Map Tab */}
        <TabsContent value="map" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Geographic Clusters</CardTitle>
              <CardDescription>
                Heat zones for overdose, environmental, and other public health concerns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[600px]">
                <GoogleMapView
                  calls={mapMarkers}
                  showOverlays={false}
                  showDispatchOverlay={false}
                />
              </div>
              
              {/* Cluster legend */}
              <div className="mt-4 flex flex-wrap gap-4">
                {Object.entries(complaintTypeColors).filter(([key]) => key !== 'default').map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm capitalize">{type.replace('health', ' Health')}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Medical Director Insights</CardTitle>
              <CardDescription>
                AI-generated analysis of current public health trends
              </CardDescription>
            </CardHeader>
            <CardContent>
              {insightLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-4/6"></div>
                </div>
              ) : (
                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-lg leading-relaxed">
                    {aiInsight?.insight || 'No significant public health trends detected in the current period.'}
                  </p>
                  
                  {/* Key metrics summary */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Total Calls</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{summary?.totalCalls || 0}</div>
                        <p className="text-xs text-gray-600">in {dateRange} days</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Active Spikes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                          {summary?.spikeAlerts.filter(s => s.isSpike).length || 0}
                        </div>
                        <p className="text-xs text-gray-600">above threshold</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Clusters</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                          {summary?.recentClusters.length || 0}
                        </div>
                        <p className="text-xs text-gray-600">geographic hotspots</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
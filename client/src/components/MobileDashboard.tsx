import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CallDetailModal } from "./CallDetailModal";
import { 
  AlertTriangle, 
  Activity, 
  Clock, 
  MapPin, 
  Play, 
  Signal,
  Zap,
  Phone,
  Users,
  TrendingUp,
  Filter,
  Check
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Call {
  id: number;
  timestamp: string;
  radioTimestamp?: string;
  talkgroup: string;
  talkgroupDescription?: string;
  talkgroupDisplayName?: string;
  callType: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  transcript?: string;
  confidence?: number;
  audioSegmentId?: string;
}

interface Stats {
  totalCalls: number;
  activeCalls: number;
  todayTotal: number;
  lastHourTotal: number;
  transcriptionRate: number;
  avgConfidence: number;
}

export function MobileDashboard() {
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [activeTab, setActiveTab] = useState("live");
  const [showDispatchOnly, setShowDispatchOnly] = useState(true);

  // Fetch active calls
  const { data: activeCalls, isLoading: callsLoading } = useQuery({
    queryKey: ["/api/calls/active"],
    refetchInterval: 5000,
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });

  // Fetch scanner status
  const { data: scannerStatus } = useQuery({
    queryKey: ["/api/rdio-scanner/status"],
    refetchInterval: 5000,
  });

  const allCalls = (activeCalls as Call[]) || [];
  
  // Filter calls based on dispatch preference
  const calls = showDispatchOnly 
    ? allCalls.filter(call => call.talkgroup === '10202' || call.talkgroup === '10244')
    : allCalls;

  const formatTalkgroup = (call: Call) => {
    if (call.talkgroupDisplayName) {
      return call.talkgroupDisplayName;
    }
    return call.talkgroupDescription || `Channel ${call.talkgroup}`;
  };

  const getCallTypeColor = (callType: string) => {
    const type = callType.toLowerCase();
    if (type.includes('cardiac') || type.includes('arrest')) return 'bg-red-500';
    if (type.includes('fire') || type.includes('trauma')) return 'bg-orange-500';
    if (type.includes('medical') || type.includes('sick')) return 'bg-blue-500';
    if (type.includes('investigation')) return 'bg-gray-500';
    return 'bg-green-500';
  };

  const renderCallCard = (call: Call) => (
    <Card 
      key={call.id} 
      className="mb-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setSelectedCall(call)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`w-3 h-3 rounded-full ${getCallTypeColor(call.callType)} flex-shrink-0`} />
            <div className="truncate">
              <Badge variant="outline" className="text-xs">
                📞 {formatTalkgroup(call)}
              </Badge>
            </div>
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
            📻 {formatDistanceToNow(new Date(call.radioTimestamp || call.timestamp), { addSuffix: true })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="font-medium text-sm">
            {call.callType || "Active Call in Progress, Transcription Pending"}
          </div>
          
          {call.address && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{call.address}</span>
            </div>
          )}

          {call.transcript && (
            <div className="text-xs text-muted-foreground line-clamp-2 bg-gray-50 dark:bg-gray-800 p-2 rounded">
              {call.transcript}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {call.audioSegmentId && (
                <Badge variant="secondary" className="text-xs">
                  <Play className="h-3 w-3 mr-1" />
                  Audio
                </Badge>
              )}
              {call.confidence && (
                <Badge variant="outline" className="text-xs">
                  {Math.round(call.confidence * 100)}%
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs">
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="pb-20"> {/* Bottom padding for mobile navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="live" className="text-xs">
            <Activity className="h-4 w-4 mr-1" />
            Live
          </TabsTrigger>
          <TabsTrigger value="stats" className="text-xs">
            <TrendingUp className="h-4 w-4 mr-1" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="status" className="text-xs">
            <Signal className="h-4 w-4 mr-1" />
            Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                    <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{stats?.activeCalls || 0}</div>
                    <div className="text-xs text-muted-foreground">Active</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                    <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{stats?.todayTotal || 0}</div>
                    <div className="text-xs text-muted-foreground">Today</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Calls */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Live Emergency Calls
                  <Badge variant="secondary">{calls.length}</Badge>
                </CardTitle>
                <Button
                  variant={showDispatchOnly ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDispatchOnly(!showDispatchOnly);
                  }}
                  className="h-8 px-3 text-xs"
                >
                  <Filter className="h-3 w-3 mr-1" />
                  {showDispatchOnly ? "Dispatch" : "All"}
                  {showDispatchOnly && <Check className="h-3 w-3 ml-1" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[60vh] px-4">
                {callsLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <Skeleton className="h-4 w-3/4 mb-2" />
                          <Skeleton className="h-3 w-1/2 mb-2" />
                          <Skeleton className="h-3 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : calls.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active calls</p>
                    <p className="text-sm">Monitoring emergency channels...</p>
                  </div>
                ) : (
                  <div className="pb-4">
                    {calls.map(renderCallCard)}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          {statsLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{stats?.totalCalls || 0}</div>
                      <div className="text-sm text-muted-foreground">Total Calls</div>
                    </div>
                    <Phone className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{stats?.lastHourTotal || 0}</div>
                      <div className="text-sm text-muted-foreground">Last Hour</div>
                    </div>
                    <Clock className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">
                        {stats?.transcriptionRate ? `${Math.round(stats.transcriptionRate * 100)}%` : '0%'}
                      </div>
                      <div className="text-sm text-muted-foreground">Transcription Rate</div>
                    </div>
                    <Activity className="h-8 w-8 text-orange-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">
                        {stats?.avgConfidence ? `${Math.round(stats.avgConfidence * 100)}%` : '0%'}
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Confidence</div>
                    </div>
                    <TrendingUp className="h-8 w-8 text-purple-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Signal className="h-5 w-5" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${scannerStatus?.running ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <div className="font-medium">Rdio Scanner</div>
                    <div className="text-sm text-muted-foreground">
                      {scannerStatus?.running ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
                <Badge variant={scannerStatus?.running ? 'default' : 'destructive'}>
                  {scannerStatus?.running ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {scannerStatus?.running && (
                <div className="text-sm text-muted-foreground">
                  <div>Port: {scannerStatus.port}</div>
                  <div>PID: {scannerStatus.pid}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Call Detail Modal */}
      {selectedCall && (
        <CallDetailModal
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
        />
      )}
    </div>
  );
}
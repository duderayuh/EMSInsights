import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Clock, Radio, Volume2, Filter, BarChart3 } from "lucide-react";
import { Call } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useWebSocket } from "@/hooks/useWebSocket";

interface MobileDispatchDashboardProps {
  calls: Call[];
  stats: any;
  onCallSelect: (call: Call) => void;
}

export function MobileDispatchDashboard({ calls = [], stats, onCallSelect }: MobileDispatchDashboardProps) {
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "stats">("list");

  // WebSocket connection for real-time updates
  const { 
    calls: liveCalls, 
    stats: liveStats, 
    connectionStatus 
  } = useWebSocket('/ws');

  // Use live data when available, fallback to props
  const displayCalls = liveCalls.length > 0 ? liveCalls : calls;
  const displayStats = liveStats || stats || {
    totalCalls: 0,
    activeCalls: 0,
    todayTotal: 0
  };

  // Filter calls based on search and channel
  const filteredCalls = displayCalls.filter((call: Call) => {
    const matchesSearch = !searchQuery || 
      call.transcript?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.callType?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesChannel = channelFilter === "all" || call.talkgroup === channelFilter;
    
    return matchesSearch && matchesChannel;
  });

  const handleCallSelect = (call: Call) => {
    setSelectedCall(call);
    setDetailsOpen(true);
    onCallSelect(call);
  };

  const getCallTypeColor = (callType: string) => {
    switch (callType?.toLowerCase()) {
      case 'medical emergency':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'fire emergency':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'mvc':
      case 'accident':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const renderMobileCallCard = (call: Call) => (
    <Card 
      key={call.id} 
      className="mb-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
      onClick={() => handleCallSelect(call)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-600" />
            <div className="text-xs text-gray-600 dark:text-gray-400">
              📞 {call.talkgroup === '10202' ? 'Primary' : 'Secondary'}
            </div>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            📻 {formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {call.callType && (
            <Badge 
              variant="secondary" 
              className={`text-xs ${getCallTypeColor(call.callType)}`}
            >
              {call.callType}
            </Badge>
          )}
          
          {call.location && (
            <div className="flex items-center gap-1 text-sm">
              <MapPin className="h-3 w-3 text-gray-500" />
              <span className="truncate">{call.location}</span>
            </div>
          )}
          
          {call.transcript && (
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
              {call.transcript}
            </p>
          )}
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Confidence: {call.confidence ? `${Math.round(call.confidence * 100)}%` : 'N/A'}</span>
            {call.latitude && call.longitude && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Mapped
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderStats = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{displayStats.activeCalls}</div>
            <div className="text-xs text-gray-600">Active Calls</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{displayStats.todayTotal}</div>
            <div className="text-xs text-gray-600">Today Total</div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="text-sm">
              {connectionStatus === 'connected' ? 'Live Updates Active' : 'Disconnected'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-bold mb-2">Emergency Dispatch</h1>
        
        {/* View toggle */}
        <div className="flex gap-2 mb-3">
          <Button 
            size="sm" 
            variant={viewMode === 'list' ? 'default' : 'outline'}
            onClick={() => setViewMode('list')}
            className="flex-1"
          >
            <Radio className="h-3 w-3 mr-1" />
            Calls ({filteredCalls.length})
          </Button>
          <Button 
            size="sm" 
            variant={viewMode === 'stats' ? 'default' : 'outline'}
            onClick={() => setViewMode('stats')}
            className="flex-1"
          >
            <BarChart3 className="h-3 w-3 mr-1" />
            Stats
          </Button>
        </div>

        {/* Search and filter - only show in list mode */}
        {viewMode === 'list' && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search calls..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Filter by channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="10202">Primary Dispatch</SelectItem>
                  <SelectItem value="10244">Secondary Dispatch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {viewMode === 'stats' ? renderStats() : (
          <>
            {filteredCalls.length === 0 ? (
              <div className="text-center py-8">
                <Radio className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {searchQuery ? 'No calls found matching your search' : 'No active calls'}
                </p>
              </div>
            ) : (
              filteredCalls.map(renderMobileCallCard)
            )}
          </>
        )}
      </ScrollArea>

      {/* Call details sheet */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle>
              {selectedCall?.callType || 'Emergency Call'}
            </SheetTitle>
            <SheetDescription>
              {selectedCall && (
                <>
                  📻 {formatDistanceToNow(new Date(selectedCall.timestamp), { addSuffix: true })}
                  {selectedCall.location && (
                    <> • <MapPin className="h-3 w-3 inline" /> {selectedCall.location}</>
                  )}
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="h-full mt-4">
            {selectedCall && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Transcript</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{selectedCall.transcript || 'No transcript available'}</p>
                    {selectedCall.confidence && (
                      <div className="mt-2 text-xs text-gray-600">
                        Confidence: {Math.round(selectedCall.confidence * 100)}%
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Channel:</span>
                        <span className="ml-2">
                          {selectedCall.talkgroup === '10202' ? 'Countywide Dispatch Primary' : 'Countywide Dispatch Secondary'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">Call Type:</span>
                        <span className="ml-2">{selectedCall.callType || 'Unknown'}</span>
                      </div>
                      {selectedCall.latitude && selectedCall.longitude && (
                        <div>
                          <span className="font-medium">Coordinates:</span>
                          <span className="ml-2 font-mono text-xs">
                            {selectedCall.latitude.toFixed(5)}, {selectedCall.longitude.toFixed(5)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {selectedCall.audioSegmentId && (
                  <Card>
                    <CardContent className="p-4">
                      <Button size="sm" variant="outline" className="w-full">
                        <Volume2 className="h-4 w-4 mr-2" />
                        Play Audio
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
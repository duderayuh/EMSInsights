import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Filter, PhoneCall, FileText, Hospital, Eye, Clock, Users, Download, RefreshCw, Edit, Trash2, Link as LinkIcon, Split, CheckCircle, AlertCircle, Activity, Play, Pause, Square, Volume2, Calendar, X } from "lucide-react";
import { HospitalCall, HospitalCallSegment } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface HospitalCallsTabProps {
  onCallSelect?: (call: HospitalCall) => void;
}

// Hospital mapping for talkgroup IDs
const hospitalMapping: { [key: string]: string } = {
  "10255": "Eskenazi Hospital",
  "10256": "IU Health Methodist Hospital",
  "10257": "Community Hospital East", 
  "10258": "IU Health Riley Hospital for Children",
  "10259": "St. Vincent Hospital",
  "10260": "Ascension St. Vincent Castleton",
  "10261": "Community Hospital North",
  "10262": "Community Hospital South",
  "10263": "Community Hospital Westview",
  "10264": "IU Health University Hospital",
  "10265": "St. Vincent Peyton Manning Children's Hospital",
  "10266": "Franciscan Health South",
  "10267": "IU Health North Hospital",
  "10268": "Franciscan Health Primary",
  "10269": "Community Health & Vascular",
  "10270": "Indianapolis VA Medical Center",
  "10271": "Hendricks Regional",
  "10272": "St. Vincent Carmel",
  "10273": "Unknown Hospital"
};

// Get hospital name from talkgroup
function getHospitalName(talkgroup: string): string {
  return hospitalMapping[talkgroup] || "Unknown Hospital";
}

// Format timestamp for display
function formatTimeAgo(timestamp: string | Date): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

// Extract unit identifiers from segments
function getIdentifiedUnits(segments: HospitalCallSegment[]): string[] {
  const units = new Set<string>();
  const unitPatterns = [
    /\b(medic|med)\s*(\d+)/gi,
    /\b(ambulance|amb)\s*(\d+)/gi,
    /\b(ems)\s*(\d+)/gi,
    /\b(engine|eng)\s*(\d+)/gi,
    /\b(ladder|lad)\s*(\d+)/gi,
    /\b(squad|sqd)\s*(\d+)/gi,
    /\b(truck|trk)\s*(\d+)/gi,
    /\b(rescue|res)\s*(\d+)/gi,
    /\b(battalion|bat|chief)\s*(\d+)/gi,
    /\b(unit)\s*(\d+)/gi
  ];

  segments.forEach(segment => {
    if (segment.transcript) {
      unitPatterns.forEach(pattern => {
        const matches = segment.transcript.matchAll(pattern);
        for (const match of matches) {
          const unitType = match[1].toLowerCase();
          const unitNumber = match[2];
          // Normalize unit type names
          let normalizedType = unitType;
          if (unitType === 'med') normalizedType = 'Medic';
          else if (unitType === 'amb') normalizedType = 'Ambulance';
          else if (unitType === 'eng') normalizedType = 'Engine';
          else if (unitType === 'lad') normalizedType = 'Ladder';
          else if (unitType === 'sqd') normalizedType = 'Squad';
          else if (unitType === 'trk') normalizedType = 'Truck';
          else if (unitType === 'res') normalizedType = 'Rescue';
          else if (unitType === 'bat') normalizedType = 'Battalion';
          else normalizedType = unitType.charAt(0).toUpperCase() + unitType.slice(1);
          
          units.add(`${normalizedType} ${unitNumber}`);
        }
      });
    }
  });

  return Array.from(units).sort();
}

export function HospitalCallsTab({ onCallSelect }: HospitalCallsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("active");
  const [selectedCall, setSelectedCall] = useState<HospitalCall | null>(null);
  const [hospitalFilter, setHospitalFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(1000);
  const [sorOnly, setSorOnly] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);
  const [playingSegment, setPlayingSegment] = useState<string | null>(null);
  const [transcribingSegment, setTranscribingSegment] = useState<number | null>(null);
  const [editingSegment, setEditingSegment] = useState<HospitalCallSegment | null>(null);
  const [editedTranscript, setEditedTranscript] = useState("");
  const [validatingTimeframe, setValidatingTimeframe] = useState(false);
  const [exportingCall, setExportingCall] = useState(false);
  const [sortBy, setSortBy] = useState<'time' | 'hospital' | 'units'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  // Update sorOnly when tab changes
  useEffect(() => {
    setSorOnly(selectedTab === 'sor');
  }, [selectedTab]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [hospitalFilter, searchQuery, selectedTab, startDate, endDate]);

  // Fetch hospital calls with filtering, pagination, and search
  const { data: hospitalCallsData = { calls: [], total: 0, page: 1, pages: 1 }, isLoading, refetch } = useQuery({
    queryKey: ['/api/hospital-calls', { 
      hospitalFilter, 
      search: searchQuery, 
      sorOnly,
      page: currentPage,
      limit: itemsPerPage,
      startDate,
      endDate
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        hospitalFilter,
        ...(searchQuery && { search: searchQuery }),
        ...(sorOnly && { sorOnly: 'true' }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      });
      const response = await fetch(`/api/hospital-calls?${params}`);
      if (!response.ok) throw new Error('Failed to fetch hospital calls');
      return response.json();
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  const hospitalCalls = hospitalCallsData.calls || [];

  // Filter calls by tab
  const activeCalls = useMemo(() => 
    hospitalCalls.filter(call => call.status === 'active'),
    [hospitalCalls]
  );

  const completedCalls = useMemo(() => {
    let filtered = hospitalCalls.filter(call => call.status === 'completed');
    
    // Apply date range filter if enabled
    if (dateFilterEnabled && (startDate || endDate)) {
      filtered = filtered.filter(call => {
        const callDate = new Date(call.timestamp);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        if (start && end) {
          return callDate >= start && callDate <= end;
        } else if (start) {
          return callDate >= start;
        } else if (end) {
          return callDate <= end;
        }
        return true;
      });
    }
    
    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'time':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'hospital':
          const hospitalA = a.hospitalName || getHospitalName(a.talkgroup);
          const hospitalB = b.hospitalName || getHospitalName(b.talkgroup);
          comparison = hospitalA.localeCompare(hospitalB);
          break;
        case 'units':
          // Sort by number of units identified
          const unitsA = (a.conversationAnalysis?.units as string[])?.length || 0;
          const unitsB = (b.conversationAnalysis?.units as string[])?.length || 0;
          comparison = unitsA - unitsB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [hospitalCalls, dateFilterEnabled, startDate, endDate, sortBy, sortOrder]);

  const sorRequests = useMemo(() => {
    let filtered = hospitalCalls.filter(call => call.sorDetected);
    
    // Apply date range filter if enabled
    if (dateFilterEnabled && (startDate || endDate)) {
      filtered = filtered.filter(call => {
        const callDate = new Date(call.timestamp);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        if (start && end) {
          return callDate >= start && callDate <= end;
        } else if (start) {
          return callDate >= start;
        } else if (end) {
          return callDate <= end;
        }
        return true;
      });
    }
    
    return filtered;
  }, [hospitalCalls, dateFilterEnabled, startDate, endDate]);

  // Get segments for selected call
  const { data: callSegments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: [`/api/hospital-calls/${selectedCall?.id}/segments`],
    enabled: !!selectedCall?.id && selectedTab === 'details',
  });

  // Delete hospital call mutation
  const deleteCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      await apiRequest('DELETE', `/api/hospital-calls/${callId}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Hospital call deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      setSelectedCall(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete hospital call",
        variant: "destructive",
      });
    },
  });

  // Analyze conversation mutation
  const analyzeConversationMutation = useMutation({
    mutationFn: async (callId: number) => {
      return await apiRequest('POST', `/api/hospital-calls/${callId}/analyze-conversation`);
    },
    onSuccess: (data) => {
      toast({
        title: "AI Analysis Complete",
        description: "Conversation analysis using GPT-4o completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall?.id}/segments`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to analyze conversation",
        variant: "destructive",
      });
    },
  });

  // Copy permalink to clipboard
  const copyPermalink = (callId: number) => {
    const url = `${window.location.origin}/hospital-calls/${callId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "Permalink copied to clipboard",
    });
  };

  // Re-transcribe segment mutation
  const retranscribeSegmentMutation = useMutation({
    mutationFn: async (segmentId: number) => {
      await apiRequest('POST', `/api/hospital-call-segments/${segmentId}/retranscribe`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Re-transcription started",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall?.id}/segments`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to re-transcribe segment",
        variant: "destructive",
      });
    },
  });

  // Update segment transcript mutation
  const updateSegmentMutation = useMutation({
    mutationFn: async ({ segmentId, transcript }: { segmentId: number; transcript: string }) => {
      await apiRequest('PATCH', `/api/hospital-call-segments/${segmentId}`, { transcript });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transcript updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall?.id}/segments`] });
      setEditingSegment(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update transcript",
        variant: "destructive",
      });
    },
  });

  // Validate timeframe mutation
  const validateTimeframeMutation = useMutation({
    mutationFn: async (callId: number) => {
      return await apiRequest('POST', `/api/hospital-calls/${callId}/validate-timeframe`);
    },
    onSuccess: (data) => {
      if (data.isValid) {
        toast({
          title: "Valid Timeframe",
          description: "All segments are within the 10-minute window",
        });
      } else {
        toast({
          title: "Invalid Timeframe",
          description: `Segments exceed 10-minute window. Consider splitting at ${data.splitPoint}`,
          variant: "destructive",
        });
      }
      setValidatingTimeframe(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to validate timeframe",
        variant: "destructive",
      });
      setValidatingTimeframe(false);
    },
  });

  // Export call mutation
  const exportCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      const response = await fetch(`/api/hospital-calls/${callId}/export`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hospital-call-${callId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Call exported successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to export call",
        variant: "destructive",
      });
    },
  });

  // Audio playback functions
  const playAudio = async (segmentId: string, audioUrl: string) => {
    try {
      // Stop any currently playing audio
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
      
      if (!audioRefs.current[segmentId]) {
        audioRefs.current[segmentId] = new Audio();
        audioRefs.current[segmentId].addEventListener('ended', () => {
          setPlayingSegment(null);
        });
        audioRefs.current[segmentId].addEventListener('error', (e) => {
          console.error('Audio playback error:', e);
          toast({
            title: "Audio Error",
            description: "Unable to play audio file",
            variant: "destructive",
          });
          setPlayingSegment(null);
        });
      }
      
      audioRefs.current[segmentId].src = audioUrl;
      await audioRefs.current[segmentId].play();
      setPlayingSegment(segmentId);
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Audio Error",
        description: "Unable to play audio file",
        variant: "destructive",
      });
      setPlayingSegment(null);
    }
  };

  const pauseAudio = (segmentId: string) => {
    if (audioRefs.current[segmentId]) {
      audioRefs.current[segmentId].pause();
      setPlayingSegment(null);
    }
  };

  const stopAudio = () => {
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    setPlayingSegment(null);
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
      });
    };
  }, []);

  // Handle call card click
  const handleCallCardClick = (call: HospitalCall) => {
    setSelectedCall(call);
    setSelectedTab('details');
    if (onCallSelect) {
      onCallSelect(call);
    }
  };

  // Render conversation card
  const renderConversationCard = (call: HospitalCall) => {
    const hospitalName = call.hospitalName || getHospitalName(call.talkgroup);
    const isActive = call.status === 'active';
    const hasSOR = call.sorDetected;
    
    return (
      <Card 
        key={call.id} 
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => handleCallCardClick(call)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <Hospital className="h-4 w-4" />
                {hospitalName}
              </CardTitle>
              <CardDescription className="flex flex-col gap-1 mt-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  {formatTimeAgo(call.timestamp)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Started: {format(new Date(call.timestamp), "MMM d, yyyy h:mm:ss a")}
                </div>
              </CardDescription>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "Active" : "Completed"}
              </Badge>
              {hasSOR && (
                <Badge variant="destructive" className="text-xs">
                  SOR
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {call.segmentCount || call.totalSegments || 0} segments
            </span>
            <span className="text-xs">
              ID: {call.conversationId}
            </span>
          </div>
          {call.conversationAnalysis?.summary && (
            <p className="text-sm mt-2 line-clamp-2">
              {call.conversationAnalysis.summary}
            </p>
          )}
          {call.conversationAnalysis?.units && call.conversationAnalysis.units.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Users className="h-3 w-3 text-muted-foreground" />
              <div className="flex flex-wrap gap-1">
                {(call.conversationAnalysis.units as string[]).map((unit, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {unit}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Render details view
  const renderDetailsView = () => {
    if (!selectedCall) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a conversation to view details</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Call Information Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">
                  {selectedCall.hospitalName || getHospitalName(selectedCall.talkgroup)}
                </CardTitle>
                <CardDescription>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {format(new Date(selectedCall.timestamp), "MMM d, yyyy h:mm a")}
                    </span>
                    <Badge variant={selectedCall.status === 'active' ? "default" : "secondary"}>
                      {selectedCall.status}
                    </Badge>
                    {selectedCall.sorDetected && (
                      <Badge variant="destructive">SOR Request</Badge>
                    )}
                  </div>
                </CardDescription>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyPermalink(selectedCall.id);
                  }}
                  title="Copy permalink"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setValidatingTimeframe(true);
                    validateTimeframeMutation.mutate(selectedCall.id);
                  }}
                  disabled={validatingTimeframe}
                  title="Validate timeframe"
                >
                  {validatingTimeframe ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportingCall(true);
                    exportCallMutation.mutate(selectedCall.id);
                  }}
                  disabled={exportingCall}
                  title="Export conversation"
                >
                  {exportingCall ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    analyzeConversationMutation.mutate(selectedCall.id);
                  }}
                  disabled={analyzeConversationMutation.isPending || selectedCall.status !== 'completed'}
                  title={selectedCall.status === 'completed' ? "Analyze conversation with GPT-4o" : "AI analysis available for completed calls only"}
                >
                  {analyzeConversationMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Are you sure you want to delete this hospital call?")) {
                      deleteCallMutation.mutate(selectedCall.id);
                    }
                  }}
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Conversation ID:</span>
                <p className="text-muted-foreground">{selectedCall.conversationId}</p>
              </div>
              <div>
                <span className="font-medium">Talkgroup:</span>
                <p className="text-muted-foreground">{selectedCall.talkgroup}</p>
              </div>
              {selectedCall.voiceType && (
                <div>
                  <span className="font-medium">Voice Type:</span>
                  <p className="text-muted-foreground">
                    {selectedCall.voiceType === 'human_voice' ? 'Human Voice' : 'Automated Voice'}
                  </p>
                </div>
              )}
              {selectedCall.sorPhysician && (
                <div>
                  <span className="font-medium">Physician:</span>
                  <p className="text-muted-foreground">{selectedCall.sorPhysician}</p>
                </div>
              )}
              {getIdentifiedUnits(callSegments).length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium">Identified Units:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {getIdentifiedUnits(callSegments).map((unit, index) => (
                      <Badge key={index} variant="outline" className="font-mono">
                        {unit}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Audio Segments */}
        <Card>
          <CardHeader>
            <CardTitle>Audio Segments ({callSegments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {segmentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : callSegments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No audio segments available
              </p>
            ) : (
              <div className="space-y-4">
                {callSegments.map((segment: HospitalCallSegment) => {
                  const segmentKey = `${segment.id}`;
                  const isPlaying = playingSegment === segmentKey;
                  const isTranscribing = transcribingSegment === segment.id;
                  const audioUrl = `/api/hospital-call-segments/${segment.id}/audio`;
                  
                  return (
                    <div key={segment.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            Segment {segment.sequenceNumber}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(segment.timestamp), "h:mm:ss a")}
                          </span>
                          {segment.confidence && (
                            <Badge variant={segment.confidence > 0.8 ? "default" : "secondary"}>
                              {Math.round(segment.confidence * 100)}%
                            </Badge>
                          )}
                          {segment.speakerType && (
                            <Badge variant={segment.speakerType === 'ems' ? "default" : "secondary"}>
                              {segment.speakerType.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {/* Audio Controls */}
                          {isPlaying ? (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => pauseAudio(segmentKey)}
                              >
                                <Pause className="h-3 w-3" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={stopAudio}
                              >
                                <Square className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => playAudio(segmentKey, audioUrl)}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                          )}
                          
                          {/* Re-transcribe Button */}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setTranscribingSegment(segment.id);
                              retranscribeSegmentMutation.mutate(segment.id);
                            }}
                            disabled={isTranscribing}
                          >
                            {isTranscribing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                          
                          {/* Edit Transcript Button */}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setEditingSegment(segment);
                              setEditedTranscript(segment.transcript || "");
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Transcript Display */}
                      {segment.transcript ? (
                        <div className="text-sm bg-muted p-3 rounded mt-2">
                          <p>{segment.transcript}</p>
                          {segment.metadata && (
                            <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                              {segment.metadata.duration && (
                                <span className="mr-4">Duration: {segment.metadata.duration}s</span>
                              )}
                              {segment.metadata.system && (
                                <span className="mr-4">System: {segment.metadata.system}</span>
                              )}
                              {segment.metadata.freq && (
                                <span>Frequency: {segment.metadata.freq}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground bg-muted p-3 rounded mt-2 italic">
                          No transcript available
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
        {/* Header with tabs and filters */}
        <div className="border-b border-border bg-gray-50 dark:bg-gray-800 px-6 py-3">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="grid w-[600px] grid-cols-4">
              <TabsTrigger value="active">
                <PhoneCall className="h-4 w-4 mr-2" />
                Active ({activeCalls.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                <FileText className="h-4 w-4 mr-2" />
                Completed ({completedCalls.length})
              </TabsTrigger>
              <TabsTrigger value="sor">
                <Hospital className="h-4 w-4 mr-2" />
                SOR ({sorRequests.length})
              </TabsTrigger>
              <TabsTrigger value="details" disabled={!selectedCall}>
                <Eye className="h-4 w-4 mr-2" />
                Details
              </TabsTrigger>
            </TabsList>
            
            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Hospitals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Hospitals</SelectItem>
                    <SelectItem value="Methodist">Methodist</SelectItem>
                    <SelectItem value="Riley">Riley</SelectItem>
                    <SelectItem value="Eskenazi">Eskenazi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Sorting dropdown */}
              {(selectedTab === 'completed' || selectedTab === 'sor') && (
                <div className="flex items-center gap-2">
                  <Select 
                    value={`${sortBy}-${sortOrder}`} 
                    onValueChange={(value) => {
                      const [newSortBy, newSortOrder] = value.split('-') as [typeof sortBy, typeof sortOrder];
                      setSortBy(newSortBy);
                      setSortOrder(newSortOrder);
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time-desc">Time (Newest First)</SelectItem>
                      <SelectItem value="time-asc">Time (Oldest First)</SelectItem>
                      <SelectItem value="hospital-asc">Hospital (A-Z)</SelectItem>
                      <SelectItem value="hospital-desc">Hospital (Z-A)</SelectItem>
                      <SelectItem value="units-desc">Units (Most First)</SelectItem>
                      <SelectItem value="units-asc">Units (Least First)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Date Range Filter - Only show for Completed and SOR tabs */}
          {(selectedTab === 'completed' || selectedTab === 'sor') && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Date Range:</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-48"
                  placeholder="Start date/time"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-48"
                  placeholder="End date/time"
                />
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateFilterEnabled(!dateFilterEnabled)}
                className={dateFilterEnabled ? "bg-blue-50 border-blue-200" : ""}
              >
                {dateFilterEnabled ? "Disable Filter" : "Enable Filter"}
              </Button>
              
              {(startDate || endDate) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setDateFilterEnabled(false);
                  }}
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
              
              {dateFilterEnabled && (startDate || endDate) && (
                <div className="text-sm text-muted-foreground">
                  {startDate && endDate ? (
                    `Showing calls from ${format(new Date(startDate), "MMM d, yyyy h:mm a")} to ${format(new Date(endDate), "MMM d, yyyy h:mm a")}`
                  ) : startDate ? (
                    `Showing calls from ${format(new Date(startDate), "MMM d, yyyy h:mm a")}`
                  ) : endDate ? (
                    `Showing calls until ${format(new Date(endDate), "MMM d, yyyy h:mm a")}`
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="active" className="h-full m-0 p-6 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : activeCalls.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <PhoneCall className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active hospital calls</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeCalls.map(renderConversationCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="h-full m-0 p-6 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : completedCalls.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No completed hospital calls</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedCalls.map(renderConversationCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sor" className="h-full m-0 p-6 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : sorRequests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Hospital className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No SOR requests found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sorRequests.map(renderConversationCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="details" className="h-full m-0 p-6 overflow-y-auto">
            {renderDetailsView()}
          </TabsContent>
        </div>

        {/* Pagination Footer */}
        {selectedTab !== 'details' && hospitalCallsData.pages > 1 && (
          <div className="border-t border-border bg-gray-50 dark:bg-gray-800 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, hospitalCallsData.total)} of {hospitalCallsData.total} calls
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {currentPage} of {hospitalCallsData.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(hospitalCallsData.pages, p + 1))}
                  disabled={currentPage === hospitalCallsData.pages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Tabs>

      {/* Edit Transcript Dialog */}
      <Dialog 
        open={!!editingSegment} 
        onOpenChange={(open) => {
          if (!open) {
            setEditingSegment(null);
            setEditedTranscript("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Transcript</DialogTitle>
            <DialogDescription>
              Segment {editingSegment?.sequenceNumber} - {editingSegment && format(new Date(editingSegment.timestamp), "MMM d, yyyy h:mm:ss a")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Audio Player for Context */}
            {editingSegment && (
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Audio Playback</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const audioUrl = `/api/hospital-call-segments/${editingSegment.id}/audio`;
                        const key = `edit-${editingSegment.id}`;
                        if (playingSegment === key) {
                          pauseAudio(key);
                        } else {
                          playAudio(key, audioUrl);
                        }
                      }}
                    >
                      {playingSegment === `edit-${editingSegment.id}` ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={stopAudio}
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {editingSegment.confidence && (
                  <div className="text-xs text-muted-foreground">
                    Transcription Confidence: {Math.round(editingSegment.confidence * 100)}%
                  </div>
                )}
              </div>
            )}
            
            {/* Transcript Editor */}
            <div>
              <label className="text-sm font-medium mb-2 block">Transcript</label>
              <Textarea
                value={editedTranscript}
                onChange={(e) => setEditedTranscript(e.target.value)}
                rows={6}
                className="w-full"
                placeholder="Enter the transcript..."
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingSegment(null);
                setEditedTranscript("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingSegment) {
                  updateSegmentMutation.mutate({
                    segmentId: editingSegment.id,
                    transcript: editedTranscript
                  });
                }
              }}
              disabled={updateSegmentMutation.isPending}
            >
              {updateSegmentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
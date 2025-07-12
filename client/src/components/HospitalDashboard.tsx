import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PlayCircle, PauseCircle, Download, Eye, PhoneCall, Hospital, Clock, FileText, Headphones, Link, RotateCcw, Edit3, Stethoscope, AlertCircle, Trash2, Filter, RefreshCw, X, Loader2, Plus } from "lucide-react";
import { HospitalCall, HospitalCallSegment } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HospitalDashboardProps {
  onCallSelect?: (call: HospitalCall) => void;
  callId?: number; // Optional call ID for when used on call detail pages
}

export function HospitalDashboard({ onCallSelect, callId }: HospitalDashboardProps) {
  const [selectedTab, setSelectedTab] = useState("active");
  const [selectedCall, setSelectedCall] = useState<HospitalCall | null>(null);
  const [playingSegment, setPlayingSegment] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState<number | null>(null);
  const [analyzingConversation, setAnalyzingConversation] = useState<number | null>(null);
  const [hospitalFilter, setHospitalFilter] = useState("all");
  const [medicalAnalysis, setMedicalAnalysis] = useState<any>(null);
  const [editingCall, setEditingCall] = useState<HospitalCall | null>(null);
  const [editingSegment, setEditingSegment] = useState<HospitalCallSegment | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [addingSegment, setAddingSegment] = useState(false);
  const [removingSegment, setRemovingSegment] = useState<number | null>(null);
  const [showAddSegmentDialog, setShowAddSegmentDialog] = useState(false);
  const [availableSegments, setAvailableSegments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100); // Show 100 calls per page
  const [sorOnly, setSorOnly] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Update sorOnly when tab changes
  useEffect(() => {
    setSorOnly(selectedTab === 'sor');
  }, [selectedTab]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [hospitalFilter, searchQuery, selectedTab]);

  // Fetch hospital calls with filtering, pagination, and search
  const { data: hospitalCallsData = { calls: [], total: 0, page: 1, pages: 1 }, isLoading, refetch } = useQuery({
    queryKey: ['/api/hospital-calls', { 
      hospitalFilter, 
      search: searchQuery, 
      sorOnly,
      page: currentPage,
      limit: itemsPerPage 
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        hospitalFilter,
        ...(searchQuery && { search: searchQuery }),
        ...(sorOnly && { sorOnly: 'true' })
      });
      const response = await fetch(`/api/hospital-calls?${params}`);
      if (!response.ok) throw new Error('Failed to fetch hospital calls');
      return response.json();
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  const hospitalCalls = hospitalCallsData.calls || [];

  // Fetch available hospitals for dropdown
  const { data: availableHospitals = [] } = useQuery({
    queryKey: ['/api/hospitals'],
  });

  // Delete hospital call mutation
  const deleteCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      await apiRequest(`/api/hospital-calls/${callId}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Hospital call deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete hospital call",
        variant: "destructive",
      });
    },
  });

  // Edit hospital call mutation
  const editCallMutation = useMutation({
    mutationFn: async ({ callId, updates }: { callId: number; updates: any }) => {
      return await apiRequest(`/api/hospital-calls/${callId}`, 'PATCH', updates);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Hospital call updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      setEditingCall(null);
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update hospital call",
        variant: "destructive",
      });
    },
  });

  // Edit segment mutation
  const editSegmentMutation = useMutation({
    mutationFn: async ({ segmentId, updates }: { segmentId: number; updates: any }) => {
      return await apiRequest(`/api/hospital-call-segments/${segmentId}`, 'PATCH', updates);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Segment updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall?.id}/segments`] });
      setEditingSegment(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update segment",
        variant: "destructive",
      });
    },
  });

  // Analyze conversation mutation
  const analyzeConversationMutation = useMutation({
    mutationFn: async (callId: number) => {
      setAnalyzingConversation(callId);
      return await apiRequest(`/api/hospital-calls/${callId}/analyze-conversation`, 'POST');
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Conversation analysis completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      setAnalyzingConversation(null);
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to analyze conversation",
        variant: "destructive",
      });
      setAnalyzingConversation(null);
    },
  });

  // Fetch segments for selected call
  const { data: callSegments = [] } = useQuery({
    queryKey: [`/api/hospital-calls/${selectedCall?.id}/segments`],
    enabled: !!selectedCall?.id,
    staleTime: 0, // Always fetch fresh data
  });

  // Get conversation analysis from selected call data
  const conversationAnalysis = (selectedCall as any)?.conversationAnalysis;

  // Debug segments loading
  const segmentArray = Array.isArray(callSegments) ? callSegments : [];
  console.log('HospitalDashboard - Selected call:', selectedCall?.id);
  console.log('HospitalDashboard - Call segments:', segmentArray);
  console.log('HospitalDashboard - Segments count:', segmentArray.length);
  console.log('HospitalDashboard - Conversation analysis:', conversationAnalysis);

  // Check if all segments have transcripts (transcription complete)
  // Allow segments with "[Unable to transcribe..." as they are considered processed
  const allTranscriptionsComplete = segmentArray.length > 0 && segmentArray.every(segment => 
    segment.transcript && 
    segment.transcript.trim().length > 0 && 
    segment.transcript !== null
  );

  console.log('HospitalDashboard - allTranscriptionsComplete:', allTranscriptionsComplete);
  console.log('HospitalDashboard - segments with transcripts:', segmentArray.map(s => ({
    id: s.id,
    hasTranscript: !!s.transcript,
    transcriptLength: s.transcript?.length || 0,
    transcript: s.transcript?.slice(0, 50) + '...',
    isValidForAnalysis: s.transcript && s.transcript.trim().length > 0
  })));

  const handleCallSelect = (call: HospitalCall) => {
    setSelectedCall(call);
    onCallSelect?.(call);
  };

  const handleEditCall = (call: HospitalCall) => {
    setEditingCall(call);
    setEditFormData({
      hospitalName: call.hospitalName,
      talkgroup: call.talkgroup
    });
  };

  const handleEditSegment = (segment: HospitalCallSegment) => {
    setEditingSegment(segment);
    setEditFormData({
      transcript: segment.transcript
    });
  };

  const handleSaveCallEdit = () => {
    if (editingCall && editFormData.hospitalName) {
      editCallMutation.mutate({
        callId: editingCall.id,
        updates: editFormData
      });
    }
  };

  const handleSaveSegmentEdit = () => {
    if (editingSegment && editFormData.transcript) {
      editSegmentMutation.mutate({
        segmentId: editingSegment.id,
        updates: { transcript: editFormData.transcript }
      });
    }
  };

  const handlePlaySegment = (audioSegmentId: string) => {
    if (playingSegment === audioSegmentId) {
      setPlayingSegment(null);
      // Stop any playing audio
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    } else {
      setPlayingSegment(audioSegmentId);
      // Create and play audio element using the correct audio segment endpoint
      const audio = new Audio(`/api/audio/segment/${audioSegmentId}`);
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
        alert('Audio playback failed - audio file may not be available');
        setPlayingSegment(null);
      });
      
      // Stop playing when audio ends
      audio.onended = () => {
        setPlayingSegment(null);
      };
      
      // Handle audio errors
      audio.onerror = () => {
        console.error('Audio error for segment:', audioSegmentId);
        alert('Audio file not available - may have been rotated out of the database');
        setPlayingSegment(null);
      };
    }
  };

  // Export hospital call mutation
  const exportCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      const response = await fetch(`/api/hospital-calls/${callId}/export`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Export failed');
      }
      return response.blob();
    },
    onSuccess: (blob, callId) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hospital-call-${callId}-export.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Hospital call exported successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to export hospital call",
        variant: "destructive",
      });
    },
  });

  // Unlink segment mutation
  const unlinkSegmentMutation = useMutation({
    mutationFn: async ({ callId, segmentId }: { callId: number; segmentId: number }) => {
      await apiRequest(`/api/hospital-calls/${callId}/unlink-segment`, 'POST', { segmentId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Segment unlinked successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      if (selectedCall) {
        queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall.id}/segments`] });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to unlink segment",
        variant: "destructive",
      });
    },
  });

  // Remove segment mutation
  const removeSegmentMutation = useMutation({
    mutationFn: async (segmentId: number) => {
      setRemovingSegment(segmentId);
      const response = await apiRequest(`/api/hospital-call-segments/${segmentId}`, 'DELETE');
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Segment Removed",
        description: "Audio segment removed from conversation.",
      });
      setRemovingSegment(null);
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      if (selectedCall) {
        queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall.id}/segments`] });
      }
    },
    onError: (error) => {
      console.error('Error removing segment:', error);
      toast({
        title: "Remove Failed",
        description: "Failed to remove segment. Please try again.",
        variant: "destructive",
      });
      setRemovingSegment(null);
    }
  });

  // Add segment to conversation mutation
  const addSegmentToConversationMutation = useMutation({
    mutationFn: async ({ hospitalCallId, audioSegmentId }: { hospitalCallId: number, audioSegmentId: string }) => {
      setAddingSegment(true);
      const response = await apiRequest(`/api/hospital-calls/${hospitalCallId}/add-segment`, 'POST', { audioSegmentId });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Segment Added",
        description: "Audio segment added to conversation.",
      });
      setAddingSegment(false);
      setShowAddSegmentDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      if (selectedCall) {
        queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall.id}/segments`] });
      }
    },
    onError: (error) => {
      console.error('Error adding segment:', error);
      toast({
        title: "Add Failed",
        description: "Failed to add segment. Please try again.",
        variant: "destructive",
      });
      setAddingSegment(false);
    }
  });

  // Retry segment transcription mutation
  const retrySegmentMutation = useMutation({
    mutationFn: async (segmentId: number) => {
      const response = await fetch(`/api/hospital-call-segments/${segmentId}/retranscribe`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Retry failed');
      return response.json();
    },
    onSuccess: (data, segmentId) => {
      toast({
        title: "Success",
        description: `Transcription retry completed for segment ${segmentId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-calls'] });
      if (selectedCall) {
        queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${selectedCall.id}/segments`] });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to retry transcription",
        variant: "destructive",
      });
    },
  });

  const handleExportCall = async (call: HospitalCall) => {
    exportCallMutation.mutate(call.id);
  };

  const handleUnlinkSegment = (segmentId: number) => {
    if (selectedCall) {
      unlinkSegmentMutation.mutate({ callId: selectedCall.id, segmentId });
    }
  };

  const handleRetrySegment = (segmentId: number) => {
    retrySegmentMutation.mutate(segmentId);
  };

  const handleDeleteCall = (callId: number) => {
    deleteCallMutation.mutate(callId);
  };

  const handleValidateTimeframe = async (call: HospitalCall) => {
    try {
      const response = await fetch(`/api/hospital-calls/${call.id}/validate-timeframe`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const validation = await response.json();
        const durationText = validation.actualDurationMinutes > 0 
          ? `${validation.actualDurationMinutes} minutes` 
          : 'Single segment';
        
        if (validation.validation.isValid) {
          alert(`✓ Time Window Valid\nConversation: ${call.conversationId}\nDuration: ${durationText}\nSegments: ${validation.totalSegments}\nStatus: Within 10-minute limit`);
        } else {
          const splitNeeded = validation.splitSuggestion.shouldSplit;
          const message = splitNeeded 
            ? `⚠ Time Window Exceeded\nDuration: ${durationText}\nSegments: ${validation.totalSegments}\nRecommendation: ${validation.splitSuggestion.reason}\n\nWould you like to split this conversation?`
            : `⚠ Time Window Issue\nDuration: ${durationText}\nSegments: ${validation.totalSegments}`;
          
          if (splitNeeded && confirm(message)) {
            // Call split endpoint
            const splitResponse = await fetch(`/api/hospital-calls/${call.id}/split-timeframe`, {
              method: 'POST',
              credentials: 'include'
            });
            
            if (splitResponse.ok) {
              const splitResult = await splitResponse.json();
              alert(`Split Analysis Complete\n${splitResult.recommendation}\nProposed groups: ${splitResult.splitGroups.length}`);
            }
          } else {
            alert(message);
          }
        }
      } else {
        const error = await response.json();
        alert(`Validation failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Validation error:', error);
      alert('Failed to validate timeframe');
    }
  };

  const handleTranscribe = async (callId: number) => {
    setTranscribing(callId);
    try {
      const response = await fetch(`/api/hospital-calls/${callId}/transcribe`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      alert(`Transcription completed: ${result.transcribedSegments} segments processed`);
      window.location.reload();
    } catch (error) {
      console.error('Transcription failed:', error);
      alert('Transcription failed. Please check the console for details.');
    } finally {
      setTranscribing(null);
    }
  };

  const handleCopyPermalink = (callId: number) => {
    const permalink = `${window.location.origin}/hospital-calls/${callId}`;
    navigator.clipboard.writeText(permalink).then(() => {
      alert('Permalink copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy permalink. Please copy manually: ' + permalink);
    });
  };

  const activeCalls = (hospitalCalls as any[]).filter((call: any) => call.status === 'active');
  const completedCalls = (hospitalCalls as any[]).filter((call: any) => call.status === 'completed');
  const sorRequests = (hospitalCalls as any[]).filter((call: any) => call.sorDetected);
  
  // Debug logging
  console.log('HospitalDashboard - tab counts debug:', {
    totalCalls: hospitalCalls.length,
    activeCalls: activeCalls.length,
    completedCalls: completedCalls.length,
    sorRequests: sorRequests.length,
    sampleCall: hospitalCalls[0] ? {
      id: hospitalCalls[0].id,
      status: hospitalCalls[0].status,
      sorDetected: hospitalCalls[0].sorDetected
    } : null
  });

  const renderCallCard = (call: any) => (
    <Card 
      key={call.id} 
      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      onClick={() => handleCallSelect(call)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Hospital className="h-5 w-5 text-blue-600" />
            {call.hospitalName || call.hospitalDisplayName || `Talkgroup ${call.talkgroup}`}
          </CardTitle>
          <div className="flex gap-2">
            {call.sorDetected && (
              <Badge variant="destructive" className="text-xs">SOR</Badge>
            )}
            <Badge 
              variant={call.status === 'active' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {call.status || 'unknown'}
            </Badge>
          </div>
        </div>
        <CardDescription className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {call.segmentCount || 0} segments
          </span>
          <span className="flex items-center gap-1">
            <PhoneCall className="h-4 w-4" />
            {call.hospitalDisplayName || call.hospitalName || `Talkgroup ${call.talkgroup}`}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <strong>Conversation ID:</strong> {call.conversationId}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <strong>System:</strong> {call.system}
          </div>
          {(call.sorDetected || call.sorPhysician) && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Physician:</strong> {call.sorPhysician || 'SOR Request - Physician Pending'}
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-gray-500">
            {new Date(call.timestamp).toLocaleDateString()}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              handleExportCall(call);
            }}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              handleValidateTimeframe(call);
            }}>
              <Clock className="h-4 w-4 mr-1" />
              Validate
            </Button>
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              handleCallSelect(call);
              setSelectedTab("details");
            }}>
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              handleEditCall(call);
            }}>
              <Edit3 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button size="sm" variant="outline" disabled={transcribing === call.id} onClick={(e) => {
              e.stopPropagation();
              handleTranscribe(call.id);
            }}>
              <Headphones className="h-4 w-4 mr-1" />
              {transcribing === call.id ? 'Transcribing...' : 'Transcribe'}
            </Button>
            <Button size="sm" variant="outline" onClick={(e) => {
              e.stopPropagation();
              handleCopyPermalink(call.id);
            }}>
              <Link className="h-4 w-4 mr-1" />
              Permalink
            </Button>
            <Button 
              size="sm" 
              variant="destructive" 
              disabled={deleteCallMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this hospital call?')) {
                  deleteCallMutation.mutate(call.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {deleteCallMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const handleDownloadSegment = (segmentId: number) => {
    const url = `/api/hospital-call-segments/${segmentId}/audio`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `hospital-segment-${segmentId}.m4a`;
    link.click();
  };

  const handleRetranscribeSegment = async (segmentId: number) => {
    handleRetrySegment(segmentId);
  };

  const handleMedicalAnalysis = async (callId: number) => {
    try {
      const response = await fetch(`/api/hospital-calls/${callId}/medical-analysis`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const analysis = await response.json();
        setMedicalAnalysis(analysis);
        toast({
          title: "Medical Analysis Complete",
          description: `Found ${analysis.keyFindings?.length || 0} key findings with ${analysis.urgencyLevel} urgency level`,
        });
      } else {
        const error = await response.json();
        toast({
          title: "Analysis Failed",
          description: `Medical analysis failed: ${error.error}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Medical analysis error:', error);
      toast({
        title: "Analysis Error", 
        description: 'Failed to generate medical analysis',
        variant: "destructive",
      });
    }
  };

  const renderSegmentsTable = (segments: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Speaker</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Transcript</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((segment: any) => (
          <TableRow key={segment.id}>
            <TableCell className="font-mono text-sm">
              {new Date(segment.timestamp).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Badge variant={segment.speakerType?.toLowerCase() === 'ems' ? 'default' : 'secondary'}>
                {segment.speakerType?.toUpperCase() || 'Unknown'}
              </Badge>
            </TableCell>
            <TableCell>
              {segment.duration ? `${Math.floor(segment.duration / 60)}:${(segment.duration % 60).toString().padStart(2, '0')}` : '-'}
            </TableCell>
            <TableCell className="max-w-md">
              <div className="truncate" title={segment.transcript || ''}>
                {segment.transcript || 'Transcription pending...'}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePlaySegment(segment.audioSegmentId)}
                  disabled={!segment.audioSegmentId}
                  title="Play audio"
                >
                  {playingSegment === segment.audioSegmentId ? (
                    <PauseCircle className="h-4 w-4" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownloadSegment(segment.id)}
                  title="Download audio"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRetranscribeSegment(segment.id)}
                  title="Re-transcribe"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEditSegment(segment)}
                  title="Edit transcript"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm('Are you sure you want to remove this segment from the conversation?')) {
                      removeSegmentMutation.mutate(segment.id);
                    }
                  }}
                  disabled={removingSegment === segment.id}
                  title="Remove segment"
                >
                  {removingSegment === segment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading hospital calls...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
          <div className="border-b border-border bg-gray-50 dark:bg-gray-800 px-6 py-3">
            <div className="flex items-center justify-between">
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
              
              {/* Hospital Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Hospitals</SelectItem>
                    <SelectItem value="Methodist">Methodist Hospital</SelectItem>
                    <SelectItem value="Riley">Riley Hospital</SelectItem>
                    <SelectItem value="Eskenazi">Eskenazi Health</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="active" className="h-full m-0 p-6">
              <ScrollArea className="h-full">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Active Hospital Calls</h2>
                    <Badge variant="outline">{activeCalls.length} active</Badge>
                  </div>
                  {activeCalls.length === 0 ? (
                    <Card className="p-8 text-center">
                      <CardContent>
                        <PhoneCall className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Active Calls</h3>
                        <p className="text-gray-600">Hospital communications will appear here when active.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {activeCalls.map(renderCallCard)}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="completed" className="h-full m-0">
              <div className="h-full flex">
                {/* Left 2/3 - Conversation Cards */}
                <div className="w-2/3 p-4 overflow-y-auto">
                  <div className="space-y-2 mb-4">
                    <h2 className="text-xl font-bold">Completed Hospital Calls</h2>
                    <Badge variant="outline">{completedCalls.length} completed</Badge>
                  </div>
                  
                  {(() => {
                    console.log('COMPLETED CALLS DEBUG:', completedCalls.length, completedCalls);
                    return completedCalls.length === 0;
                  })() ? (
                    <Card className="p-6 text-center">
                      <CardContent>
                        <FileText className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                        <h3 className="text-base font-semibold mb-2">No Completed Calls</h3>
                        <p className="text-sm text-gray-600">Completed hospital communications will appear here.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {completedCalls.map((call: any) => {
                        console.log('RENDERING CALL CARD:', call.id, 'has analysis:', !!call.conversationAnalysis?.summary);
                        return (
                        <Card key={call.id} className="cursor-pointer hover:shadow-md transition-shadow bg-gray-50 dark:bg-gray-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-medium">
                                {call.conversationId}
                              </CardTitle>
                              <Badge variant="outline" className="text-xs">
                                {hospitalMapping[call.talkgroup] || `Hospital ${call.talkgroup}`}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {new Date(call.timestamp || call.createdAt).toLocaleString()}
                            </p>
                          </CardHeader>
                          <CardContent className="pt-0">
                            {call.conversationAnalysis?.summary && (
                              <div className="text-xs mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border-l-2 border-blue-500">
                                <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">AI Summary</div>
                                <p className="text-blue-900 dark:text-blue-100 leading-relaxed">
                                  {call.conversationAnalysis.summary}
                                </p>
                              </div>
                            )}
                            
                            {!call.conversationAnalysis?.summary && (
                              <div className="text-xs mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border-l-2 border-yellow-500">
                                <div className="font-medium text-yellow-700 dark:text-yellow-300 mb-1">Analysis Pending</div>
                                <p className="text-yellow-900 dark:text-yellow-100 leading-relaxed">
                                  Click "Analyze Conversation" to generate AI summary and extract key medical details.
                                </p>
                              </div>
                            )}
                            
                            <div className="flex gap-2">
                              <Button
                                onClick={() => {
                                  handleCallSelect(call);
                                  setSelectedTab("details");
                                }}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                View Details
                              </Button>
                              
                              {(() => {
                                const shouldShowButton = !call.conversationAnalysis?.summary;
                                console.log(`BUTTON RENDER CHECK - Call ${call.id}: shouldShow=${shouldShowButton}, hasAnalysis=${!!call.conversationAnalysis?.summary}`);
                                return shouldShowButton;
                              })() && (
                                <Button
                                  onClick={() => {
                                    toast({
                                      title: "AI Analysis Disabled",
                                      description: "Conversation analysis is disabled. System provides verbatim transcripts only.",
                                      variant: "default"
                                    });
                                  }}
                                  disabled={true}
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-xs"
                                  title="AI conversation analysis is disabled - verbatim transcripts only"
                                >
                                  <Stethoscope className="h-3 w-3 mr-1" />
                                  AI Analysis Disabled
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Pagination Controls */}
                  {hospitalCallsData.total > 0 && (
                    <div className="mt-6 flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Page {hospitalCallsData.page} of {hospitalCallsData.pages} • Total: {hospitalCallsData.total} conversations
                        </span>
                        
                        {/* Items per page selector */}
                        <div className="flex items-center gap-2">
                          <Label htmlFor="items-per-page" className="text-sm">Show:</Label>
                          <Select
                            value={itemsPerPage.toString()}
                            onValueChange={(value) => {
                              setItemsPerPage(Number(value));
                              setCurrentPage(1); // Reset to first page when changing items per page
                            }}
                          >
                            <SelectTrigger id="items-per-page" className="w-[100px]">
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
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        
                        {/* Page number buttons for quick navigation */}
                        {hospitalCallsData.pages <= 7 ? (
                          // Show all page numbers if 7 or fewer pages
                          Array.from({ length: hospitalCallsData.pages }, (_, i) => i + 1).map(page => (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(page)}
                              className="w-10"
                            >
                              {page}
                            </Button>
                          ))
                        ) : (
                          // Show limited page numbers with ellipsis for many pages
                          <>
                            <Button
                              variant={currentPage === 1 ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(1)}
                              className="w-10"
                            >
                              1
                            </Button>
                            
                            {currentPage > 3 && <span className="px-2">...</span>}
                            
                            {Array.from({ length: 3 }, (_, i) => {
                              const page = currentPage - 1 + i;
                              if (page > 1 && page < hospitalCallsData.pages) {
                                return (
                                  <Button
                                    key={page}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCurrentPage(page)}
                                    className="w-10"
                                  >
                                    {page}
                                  </Button>
                                );
                              }
                              return null;
                            })}
                            
                            {currentPage < hospitalCallsData.pages - 2 && <span className="px-2">...</span>}
                            
                            <Button
                              variant={currentPage === hospitalCallsData.pages ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(hospitalCallsData.pages)}
                              className="w-10"
                            >
                              {hospitalCallsData.pages}
                            </Button>
                          </>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(hospitalCallsData.pages, prev + 1))}
                          disabled={currentPage === hospitalCallsData.pages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right 1/3 - Analytics */}
                <div className="w-1/3 p-4 border-l border-border bg-gray-50 dark:bg-gray-900/50 overflow-y-auto">
                  <h3 className="text-lg font-semibold mb-4">EMS-Hospital Analytics</h3>
                  <div className="space-y-4">
                    {/* Total Calls */}
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-xl font-bold text-blue-600">
                          {completedCalls?.length || 0}
                        </div>
                        <div className="text-xs text-gray-600">Total Hospital Calls</div>
                      </div>
                    </Card>

                    {/* Calls by Hospital */}
                    <Card className="p-3">
                      <h4 className="font-medium mb-2 text-sm">Calls by Hospital</h4>
                      <div className="space-y-1">
                        {Object.entries(
                          completedCalls?.reduce((acc: any, call: any) => {
                            const hospital = hospitalMapping[call.talkgroup] || `Hospital ${call.talkgroup}`;
                            acc[hospital] = (acc[hospital] || 0) + 1;
                            return acc;
                          }, {}) || {}
                        )
                          .sort(([,a], [,b]) => (b as number) - (a as number))
                          .map(([hospital, count]) => (
                            <div key={hospital} className="flex justify-between text-xs">
                              <span className="truncate">{hospital}</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                      </div>
                    </Card>

                    {/* Completed Analyses */}
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-xl font-bold text-green-600">
                          {completedCalls?.filter((call: any) => call.conversationAnalysis?.summary).length || 0}
                        </div>
                        <div className="text-xs text-gray-600">AI Analyses Complete</div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sor" className="h-full m-0 p-6">
              <ScrollArea className="h-full">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">SOR Requests</h2>
                    <Badge variant="destructive">{sorRequests.length} SOR</Badge>
                  </div>
                  {sorRequests.length === 0 ? (
                    <Card className="p-8 text-center">
                      <CardContent>
                        <Hospital className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No SOR Requests</h3>
                        <p className="text-gray-600">Signature of Release requests will appear here when detected.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {sorRequests.map(renderCallCard)}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="details" className="h-full m-0 p-6">
              {selectedCall ? (
                <div className="h-full flex flex-col">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2">Call Details</h2>
                    <div className="flex items-center gap-4">
                      <Badge variant={selectedCall.status === 'active' ? 'default' : 'secondary'}>
                        {selectedCall.status || 'unknown'}
                      </Badge>
                      {selectedCall.sorDetected && (
                        <Badge variant="destructive">SOR Request</Badge>
                      )}
                      <span className="text-sm text-gray-600">
                        {formatDistanceToNow(new Date(selectedCall.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  
                  {/* Top Row: Call Information & Statistics (left) + Medical Summary & Key Points (right) */}
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    {/* Left Side: Call Information & Statistics */}
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <PhoneCall className="h-5 w-5 text-blue-600" />
                            Call Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div><strong>Hospital:</strong> {selectedCall.talkgroup === '10256' ? 'IU Health Methodist Hospital' : `Talkgroup ${selectedCall.talkgroup}`}</div>
                          <div><strong>Conversation ID:</strong> {selectedCall.conversationId}</div>
                          <div><strong>Talkgroup:</strong> {selectedCall.talkgroup}</div>
                          <div><strong>System:</strong> {selectedCall.system}</div>
                          {(selectedCall.sorDetected || selectedCall.sorPhysician) && (
                            <div><strong>Physician:</strong> {selectedCall.sorPhysician || 'SOR Request - Physician Pending'}</div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-green-600" />
                            Statistics
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div><strong>Total Segments:</strong> {segmentArray.length}</div>
                          <div><strong>Started:</strong> {new Date(selectedCall.timestamp).toLocaleString()}</div>
                          <div><strong>Status:</strong> {selectedCall.status || 'Unknown'}</div>
                          <div><strong>Analysis Confidence:</strong> {(selectedCall as any).analysisConfidence ? `${Math.round((selectedCall as any).analysisConfidence * 100)}%` : 'N/A'}</div>
                        </CardContent>
                      </Card>
                    </div>
                    
                    {/* Right Side: Medical Summary & Key Points */}
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Stethoscope className="h-5 w-5 text-red-600" />
                            Medical Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {conversationAnalysis?.summary ? (
                            <div className="space-y-3">
                              <div className="text-sm leading-relaxed">
                                {conversationAnalysis.summary}
                              </div>
                              <div className="flex justify-end">
                                <Button 
                                  variant="outline"
                                  size="sm" 
                                  disabled={analyzingConversation === (selectedCall?.id || callId)}
                                  onClick={() => {
                                    const targetCallId = selectedCall?.id || callId;
                                    console.log('RE-ANALYZE BUTTON CLICKED - targetCallId:', targetCallId);
                                    if (targetCallId) {
                                      analyzeConversationMutation.mutate(targetCallId);
                                    } else {
                                      console.error('No target call ID available for re-analysis');
                                    }
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  {analyzingConversation === (selectedCall?.id || callId) ? (
                                    <>
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                                      Re-analyzing...
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="h-3 w-3" />
                                      Re-analyze
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="text-sm text-gray-500 italic">
                                AI conversation analysis is disabled - verbatim transcripts only
                              </div>
                              <Button 
                                size="sm" 
                                disabled={true}
                                onClick={() => {
                                  toast({
                                    title: "AI Analysis Disabled",
                                    description: "Conversation analysis is disabled. System provides verbatim transcripts only.",
                                    variant: "default"
                                  });
                                }}
                                className="flex items-center gap-2"
                                title="AI conversation analysis is disabled - verbatim transcripts only"
                                variant="secondary"
                              >
                                <Stethoscope className="h-4 w-4" />
                                AI Analysis Disabled
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-orange-600" />
                            Key Points
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {conversationAnalysis?.keyPoints?.length > 0 ? (
                            <ul className="text-sm space-y-1">
                              {conversationAnalysis.keyPoints.map((point: string, index: number) => (
                                <li key={index} className="flex items-start gap-2">
                                  <span className="text-orange-600 mt-1">•</span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm text-gray-500 italic">
                              Key points will appear here after AI analysis
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                  
                  {/* Bottom: Audio Segments */}
                  <Card className="flex-1 overflow-hidden">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Headphones className="h-5 w-5 text-purple-600" />
                            Audio Segments
                          </CardTitle>
                          <CardDescription>
                            Conversation segments with speaker identification, transcription, and controls
                          </CardDescription>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowAddSegmentDialog(true)}
                          disabled={addingSegment}
                          className="flex items-center gap-2"
                        >
                          {addingSegment ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Add Segment
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="h-full overflow-hidden">
                      <ScrollArea className="h-full">
                        {segmentArray.length > 0 ? (
                          renderSegmentsTable(segmentArray)
                        ) : (
                          <div className="flex items-center justify-center h-32">
                            <p className="text-gray-600">No segments available</p>
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Eye className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Select a Call</h3>
                    <p className="text-gray-600">Choose a hospital call to view detailed information and segments.</p>
                  </div>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Edit Call Dialog */}
      <Dialog open={!!editingCall} onOpenChange={() => setEditingCall(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Hospital Call</DialogTitle>
            <DialogDescription>
              Update the hospital name and talkgroup for this call.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hospitalName">Hospital Name</Label>
              <Input
                id="hospitalName"
                value={editFormData.hospitalName || ''}
                onChange={(e) => setEditFormData({...editFormData, hospitalName: e.target.value})}
                placeholder="Enter hospital name"
              />
            </div>
            <div>
              <Label htmlFor="talkgroup">Talkgroup</Label>
              <Select
                value={editFormData.talkgroup || ''}
                onValueChange={(value) => setEditFormData({...editFormData, talkgroup: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select talkgroup" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10255">10255 - Eskenazi Hospital</SelectItem>
                  <SelectItem value="10256">10256 - Methodist Hospital</SelectItem>
                  <SelectItem value="10257">10257 - Riley Hospital</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCall(null)}>Cancel</Button>
            <Button onClick={handleSaveCallEdit} disabled={editCallMutation.isPending}>
              {editCallMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Segment Dialog */}
      <Dialog open={!!editingSegment} onOpenChange={() => setEditingSegment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transcript</DialogTitle>
            <DialogDescription>
              Update the transcript for this audio segment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="transcript">Transcript</Label>
              <Textarea
                id="transcript"
                value={editFormData.transcript || ''}
                onChange={(e) => setEditFormData({...editFormData, transcript: e.target.value})}
                placeholder="Enter transcript"
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSegment(null)}>Cancel</Button>
            <Button onClick={handleSaveSegmentEdit} disabled={editSegmentMutation.isPending}>
              {editSegmentMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
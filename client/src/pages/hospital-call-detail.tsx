import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, Calendar, Clock, Users, Volume2, Play, Pause, Square, MessageSquare, Unlink, Plus, Download, RefreshCw, Edit, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

interface ConversationMessage {
  speaker: 'EMS' | 'Hospital';
  message: string;
  timestamp: string;
  confidence: number;
  segmentId: number;
}

interface ConversationAnalysis {
  messages: ConversationMessage[];
  summary: string;
  keyPoints: string[];
  medicalContext: string;
  sorDetected: boolean;
  physicianMentioned: string | null;
}

interface HospitalCall {
  id: number;
  conversationId: string;
  talkgroup: string;
  system: string;
  timestamp: string;
  sorDetected: boolean;
  sorPhysician?: string;
  analysisConfidence?: number;
  conversationAnalysis?: ConversationAnalysis;
}

interface HospitalCallSegment {
  id: number;
  timestamp: string;
  transcript: string;
  confidence: number;
  duration?: number;
}

export default function HospitalCallDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [audioStates, setAudioStates] = useState<{ [key: number]: { audio: HTMLAudioElement; isPlaying: boolean } }>({});
  const [addSegmentDialogOpen, setAddSegmentDialogOpen] = useState(false);
  const [selectedUnlinkedSegmentId, setSelectedUnlinkedSegmentId] = useState<string>('');
  const [editingSegment, setEditingSegment] = useState<HospitalCallSegment | null>(null);
  const [editTranscriptText, setEditTranscriptText] = useState('');
  const [retranscribingSegments, setRetranscribingSegments] = useState<Set<number>>(new Set());
  
  // Use ref to persist audio instances
  const audioRefs = useRef<{ [key: number]: HTMLAudioElement }>({});
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, []);

  // Fetch hospital call data
  const { data: hospitalCall, isLoading, error } = useQuery<HospitalCall>({
    queryKey: [`/api/hospital-calls/${id}`],
    enabled: !!id,
  });

  // Fetch segments with cache invalidation
  const { data: segments, refetch: refetchSegments } = useQuery<HospitalCallSegment[]>({
    queryKey: [`/api/hospital-calls/${id}/segments`],
    enabled: !!id,
    staleTime: 0, // Always fetch fresh data
  });

  // Fetch unlinked segments
  const { data: unlinkedSegments = [] } = useQuery<HospitalCallSegment[]>({
    queryKey: ['/api/hospital-call-segments/unlinked'],
    enabled: addSegmentDialogOpen,
  });

  // Force refresh on mount and debug
  useEffect(() => {
    if (id) {
      refetchSegments();
    }
  }, [id, refetchSegments]);

  // Force cache clearing and debug
  useEffect(() => {
    console.log('CACHE CLEAR - Hospital Call ID:', id);
    console.log('CACHE CLEAR - Segments from API:', segments);
    console.log('CACHE CLEAR - Segments count:', segments?.length);
    console.log('CACHE CLEAR - Updated page version 1.2.0');
    if (segments) {
      segments.forEach((seg, idx) => {
        console.log(`CACHE CLEAR - Segment ${idx + 1}:`, seg.transcript);
      });
    }
  }, [segments, id]);

  // Analyze conversation mutation
  const analyzeConversationMutation = useMutation({
    mutationFn: async (callId: number | undefined) => {
      if (!callId) throw new Error('No call ID provided');
      const response = await fetch(`/api/hospital-calls/${callId}/analyze-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to analyze conversation');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospital-calls/${id}`] });
    },
  });

  // Unlink segment mutation
  const unlinkSegmentMutation = useMutation({
    mutationFn: async (segmentId: number) => {
      console.log('Attempting to unlink segment:', segmentId, 'from hospital call:', id);
      const response = await apiRequest(`/api/hospital-calls/${id}/unlink-segment`, 'POST', { segmentId });
      console.log('Unlink response:', response);
      return response;
    },
    onSuccess: (data) => {
      console.log('Unlink successful:', data);
      toast({
        title: "Success",
        description: "Segment unlinked successfully",
      });
      refetchSegments();
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-call-segments/unlinked'] });
    },
    onError: (error) => {
      console.error('Unlink error:', error);
      toast({
        title: "Unlink Failed",
        description: "Failed to unlink segment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Re-transcribe segment mutation
  const retranscribeMutation = useMutation({
    mutationFn: async (segmentId: number) => {
      const response = await fetch(`/api/hospital-call-segments/${segmentId}/retranscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to retranscribe segment');
      return response.json();
    },
    onMutate: (segmentId: number) => {
      setRetranscribingSegments(prev => new Set([...prev, segmentId]));
      toast({
        title: "Re-transcription Started",
        description: "Segment queued for re-transcription processing",
      });
    },
    onSuccess: (data, segmentId: number) => {
      setRetranscribingSegments(prev => {
        const newSet = new Set(prev);
        newSet.delete(segmentId);
        return newSet;
      });
      toast({
        title: "Re-transcription Complete",
        description: "Segment has been re-transcribed successfully",
      });
      refetchSegments();
    },
    onError: (error, segmentId: number) => {
      setRetranscribingSegments(prev => {
        const newSet = new Set(prev);
        newSet.delete(segmentId);
        return newSet;
      });
      toast({
        title: "Re-transcription Failed",
        description: "Failed to re-transcribe segment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Edit transcript mutation
  const editTranscriptMutation = useMutation({
    mutationFn: async ({ segmentId, transcript }: { segmentId: number; transcript: string }) => {
      await apiRequest(`/api/hospital-call-segments/${segmentId}`, 'PATCH', { transcript });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transcript updated successfully",
      });
      setEditingSegment(null);
      setEditTranscriptText('');
      refetchSegments();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update transcript",
        variant: "destructive",
      });
    },
  });

  // Link segment mutation
  const linkSegmentMutation = useMutation({
    mutationFn: async ({ segmentId, sequenceNumber }: { segmentId: number; sequenceNumber: number }) => {
      console.log('Attempting to link segment:', segmentId, 'to hospital call:', id, 'with sequence:', sequenceNumber);
      const response = await apiRequest(`/api/hospital-calls/${id}/relink-segment`, 'POST', { 
        segmentId, 
        sequenceNumber 
      });
      console.log('Link response:', response);
      return response;
    },
    onSuccess: (data) => {
      console.log('Link successful:', data);
      toast({
        title: "Success",
        description: "Segment added successfully",
      });
      setAddSegmentDialogOpen(false);
      setSelectedUnlinkedSegmentId('');
      refetchSegments();
      queryClient.invalidateQueries({ queryKey: ['/api/hospital-call-segments/unlinked'] });
    },
    onError: (error) => {
      console.error('Link error:', error);
      toast({
        title: "Error",
        description: "Failed to add segment",
        variant: "destructive",
      });
    },
  });

  const playAudio = async (segmentId: number) => {
    // Stop all other audio first to prevent multiple instances
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
        setAudioStates(prev => ({
          ...prev,
          [id]: { audio, isPlaying: false }
        }));
      }
    });

    if (audioRefs.current[segmentId]) {
      // Audio already exists, just play it
      audioRefs.current[segmentId].currentTime = 0;
      try {
        await audioRefs.current[segmentId].play();
        setAudioStates(prev => ({
          ...prev,
          [segmentId]: { audio: audioRefs.current[segmentId], isPlaying: true }
        }));
      } catch (error) {
        console.error('Error playing audio:', error);
        toast({
          title: "Audio Error",
          description: "Failed to play audio for this segment",
          variant: "destructive",
        });
      }
    } else {
      // Create new audio instance
      try {
        const audio = new Audio(`/api/hospital-call-segments/${segmentId}/audio`);
        audioRefs.current[segmentId] = audio;
        
        audio.onended = () => {
          setAudioStates(prev => ({
            ...prev,
            [segmentId]: { audio, isPlaying: false }
          }));
        };
        
        audio.onerror = () => {
          console.error('Audio failed to load');
          toast({
            title: "Audio Error",
            description: "Failed to load audio for this segment",
            variant: "destructive",
          });
        };
        
        await audio.play();
        
        setAudioStates(prev => ({
          ...prev,
          [segmentId]: { audio, isPlaying: true }
        }));
      } catch (error) {
        console.error('Error playing audio:', error);
        toast({
          title: "Audio Error",
          description: "Failed to play audio for this segment",
          variant: "destructive",
        });
      }
    }
  };

  const pauseAudio = (segmentId: number) => {
    const audio = audioRefs.current[segmentId];
    if (audio) {
      audio.pause();
      setAudioStates(prev => ({
        ...prev,
        [segmentId]: { audio, isPlaying: false }
      }));
    }
  };

  const stopAudio = (segmentId: number) => {
    const audio = audioRefs.current[segmentId];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      setAudioStates(prev => ({
        ...prev,
        [segmentId]: { audio, isPlaying: false }
      }));
    }
  };

  const getHospitalName = (talkgroup: string) => {
    const hospitalMap: { [key: string]: string } = {
      "10256": "IU Health Methodist Hospital",
      "10240": "IU Health University Hospital", 
      "10241": "Riley Hospital for Children",
      "10242": "IU Health North Hospital",
      "10243": "Community Health Network",
      "10245": "St. Vincent Hospital",
      "10246": "Eskenazi Health"
    };
    return hospitalMap[talkgroup] || `Hospital ${talkgroup}`;
  };

  const handleEditTranscript = (segment: HospitalCallSegment) => {
    setEditingSegment(segment);
    setEditTranscriptText(segment.transcript || '');
    // If audio for this segment doesn't exist, create it
    if (!audioRefs.current[segment.id]) {
      const audio = new Audio(`/api/hospital-call-segments/${segment.id}/audio`);
      audioRefs.current[segment.id] = audio;
      
      audio.onended = () => {
        setAudioStates(prev => ({
          ...prev,
          [segment.id]: { audio, isPlaying: false }
        }));
      };
      
      setAudioStates(prev => ({
        ...prev,
        [segment.id]: { audio, isPlaying: false }
      }));
    }
  };

  const handleSaveTranscript = () => {
    if (editingSegment && editTranscriptText.trim()) {
      editTranscriptMutation.mutate({
        segmentId: editingSegment.id,
        transcript: editTranscriptText.trim()
      });
    }
  };

  const handleRetranscribe = (segmentId: number) => {
    retranscribeMutation.mutate(segmentId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading hospital call details...</p>
        </div>
      </div>
    );
  }

  if (error || !hospitalCall) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Hospital Call Not Found</h1>
          <p className="text-gray-600 mb-4">The requested hospital call could not be found.</p>
          <Button onClick={() => window.location.href = '/'}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={() => window.history.back()}
            className="mb-4"
          >
            ← Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Hospital Call Detail
            <span className="text-sm bg-green-600 text-white px-2 py-1 rounded ml-3">
              v1.2.0 - {segments?.length || 0} segments loaded
            </span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {hospitalCall?.conversationId}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Analyze Conversation Button */}
          {!hospitalCall?.conversationAnalysis && (
            <div className="lg:col-span-3 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Button 
                      onClick={() => {
                        toast({
                          title: "AI Analysis Disabled",
                          description: "Conversation analysis is disabled. System provides verbatim transcripts only.",
                          variant: "default"
                        });
                      }}
                      disabled={true}
                      className="bg-gray-600"
                      title="AI conversation analysis is disabled - verbatim transcripts only"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      AI Analysis Disabled
                    </Button>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      AI conversation analysis is disabled - verbatim transcripts only
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Main Call Information */}
          <div className="lg:col-span-2">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-blue-600" />
                  Call Information
                </CardTitle>
                <CardDescription>
                  {hospitalCall?.talkgroup === '10256' ? 'IU Health Methodist Hospital' : `Talkgroup ${hospitalCall?.talkgroup || 'Unknown'}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {hospitalCall ? new Date(hospitalCall.timestamp).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {hospitalCall ? new Date(hospitalCall.timestamp).toLocaleTimeString() : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {segments?.length || 0} audio segments
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {hospitalCall?.sorDetected && (
                      <Badge variant="destructive">SOR Detected</Badge>
                    )}
                    {hospitalCall?.sorPhysician && (
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Physician:</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{hospitalCall.sorPhysician}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Audio Segments */}
            {segments && segments.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Volume2 className="h-5 w-5 text-green-600" />
                      Audio Segments ({segments.length})
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddSegmentDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Segment
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {segments.map((segment: HospitalCallSegment, index: number) => (
                      <div key={segment.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              Segment {index + 1}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {new Date(segment.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {audioStates[segment.id]?.isPlaying ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => pauseAudio(segment.id)}
                                >
                                  <Pause className="h-4 w-4 mr-1" />
                                  Pause
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => stopAudio(segment.id)}
                                >
                                  <Square className="h-4 w-4 mr-1" />
                                  Stop
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => playAudio(segment.id)}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Play
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={retranscribingSegments.has(segment.id) ? "default" : "outline"}
                              onClick={() => handleRetranscribe(segment.id)}
                              disabled={retranscribingSegments.has(segment.id)}
                              className={retranscribingSegments.has(segment.id) ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                              style={retranscribingSegments.has(segment.id) ? {
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                opacity: 1,
                                cursor: 'wait'
                              } : undefined}
                            >
                              <RefreshCw className={`h-4 w-4 mr-1 ${retranscribingSegments.has(segment.id) ? 'animate-spin' : ''}`} />
                              {retranscribingSegments.has(segment.id) ? 'Transcribing...' : 'Re-transcribe'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditTranscript(segment)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => unlinkSegmentMutation.mutate(segment.id)}
                              disabled={unlinkSegmentMutation.isPending}
                            >
                              <Unlink className="h-4 w-4 mr-1" />
                              Unlink
                            </Button>
                          </div>
                        </div>
                        {segment.transcript && (
                          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {segment.transcript}
                            </p>
                            {segment.confidence && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Confidence: {Math.round(segment.confidence * 100)}%
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Technical Details */}
            <Card>
              <CardHeader>
                <CardTitle>Technical Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">Call ID:</span>
                    <p className="text-gray-600 dark:text-gray-400">{hospitalCall?.id || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="font-medium">Talkgroup:</span>
                    <p className="text-gray-600 dark:text-gray-400">{hospitalCall?.talkgroup || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="font-medium">System:</span>
                    <p className="text-gray-600 dark:text-gray-400">{hospitalCall?.system || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="font-medium">Analysis Confidence:</span>
                    <p className="text-gray-600 dark:text-gray-400">
                      {hospitalCall?.analysisConfidence ? `${Math.round(hospitalCall.analysisConfidence * 100)}%` : 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Conversation Analysis Section */}
            {hospitalCall?.conversationAnalysis && typeof hospitalCall.conversationAnalysis === 'object' && (() => {
              const analysis = hospitalCall.conversationAnalysis as ConversationAnalysis;
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-blue-600" />
                      Conversation Analysis
                      {hospitalCall?.sorDetected && (
                        <Badge variant="destructive">SOR Detected</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      AI-analyzed conversation between EMS and {getHospitalName(hospitalCall?.talkgroup || '')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Medical Summary */}
                      <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 text-sm">Medical Summary</h4>
                        <p className="text-blue-800 dark:text-blue-200 text-xs">{analysis.summary}</p>
                      </div>

                      {/* Key Points */}
                      {analysis.keyPoints && analysis.keyPoints.length > 0 && (
                        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                          <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2 text-sm">Key Points</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {analysis.keyPoints.map((point: string, idx: number) => (
                              <li key={idx} className="text-green-800 dark:text-green-200 text-xs">{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Conversation Flow */}
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 text-sm">Conversation Flow</h4>
                        <div className="space-y-2">
                          {analysis.messages.map((message: ConversationMessage, idx: number) => (
                            <div key={idx} className={`flex ${message.speaker === 'EMS' ? 'justify-start' : 'justify-end'}`}>
                              <div className={`max-w-[85%] p-2 rounded-lg ${
                                message.speaker === 'EMS' 
                                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' 
                                  : 'bg-orange-100 dark:bg-orange-900 text-orange-900 dark:text-orange-100'
                              }`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-xs">{message.speaker}</span>
                                  <span className="text-xs opacity-70">{message.timestamp}</span>
                                </div>
                                <p className="text-xs">{message.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Additional Information */}
                      {(analysis.medicalContext || analysis.physicianMentioned) && (
                        <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-lg">
                          <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2 text-sm">Additional Information</h4>
                          {analysis.medicalContext && (
                            <p className="text-amber-800 dark:text-amber-200 text-xs mb-2">
                              Context: {analysis.medicalContext}
                            </p>
                          )}
                          {analysis.physicianMentioned && (
                            <p className="text-amber-800 dark:text-amber-200 text-xs">
                              Physician: {analysis.physicianMentioned}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>
      </div>
    </div>

    {/* Add Segment Dialog */}
    <Dialog open={addSegmentDialogOpen} onOpenChange={setAddSegmentDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Segment to Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={selectedUnlinkedSegmentId} onValueChange={setSelectedUnlinkedSegmentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an unlinked segment" />
            </SelectTrigger>
            <SelectContent>
              {unlinkedSegments.map((segment) => (
                <SelectItem key={segment.id} value={segment.id.toString()}>
                  {new Date(segment.timestamp).toLocaleString()} - {segment.transcript?.substring(0, 50)}...
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddSegmentDialogOpen(false);
                setSelectedUnlinkedSegmentId('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedUnlinkedSegmentId) {
                  const nextSequence = segments ? segments.length + 1 : 1;
                  linkSegmentMutation.mutate({
                    segmentId: parseInt(selectedUnlinkedSegmentId),
                    sequenceNumber: nextSequence,
                  });
                }
              }}
              disabled={!selectedUnlinkedSegmentId || linkSegmentMutation.isPending}
            >
              Add Segment
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

    {/* Edit Transcript Dialog */}
    <Dialog open={!!editingSegment} onOpenChange={(open) => {
      if (!open) {
        setEditingSegment(null);
        setEditTranscriptText('');
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Transcript</DialogTitle>
          <DialogDescription>
            Update the transcript for this audio segment. You can play the audio while editing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Audio Player */}
          {editingSegment && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Audio Player</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {audioStates[editingSegment.id]?.isPlaying ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pauseAudio(editingSegment.id)}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => stopAudio(editingSegment.id)}
                      >
                        <Square className="h-4 w-4 mr-1" />
                        Stop
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => playAudio(editingSegment.id)}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Play Audio
                    </Button>
                  )}
                  <span className="text-sm text-gray-500">
                    {new Date(editingSegment.timestamp).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Transcript Editor */}
          <div>
            <Label htmlFor="transcript">Transcript</Label>
            <Textarea
              id="transcript"
              value={editTranscriptText}
              onChange={(e) => setEditTranscriptText(e.target.value)}
              placeholder="Enter transcript"
              rows={6}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => {
              setEditingSegment(null);
              setEditTranscriptText('');
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSaveTranscript} 
            disabled={editTranscriptMutation.isPending || !editTranscriptText.trim()}
          >
            {editTranscriptMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
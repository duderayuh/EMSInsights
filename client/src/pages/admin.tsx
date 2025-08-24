import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Edit, Save, Volume2, X, Radio, Pause, Square, Play, RefreshCw, Search, Settings, Users, Mic, Download, Upload, SkipBack, Cpu, RotateCcw, Wrench, MapPin, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserManagement from '@/components/UserManagement';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Call } from '@shared/schema';
import MobileLayout from '@/components/MobileLayout';
import { findClosestHospital, formatDistance } from '@/lib/hospital-proximity';

const talkgroupMapping = {
  '10202': 'Countywide Dispatch Primary',
  '10244': 'Countywide Dispatch Secondary',
  '10210': 'IFD Primary Operations',
  '10220': 'EMS Primary Operations',
  '10230': 'IMPD North District',
  '10240': 'IMPD South District',
  '10250': 'IMPD East District',
  '10260': 'IMPD West District',
  '10270': 'IMPD Central District',
  '10280': 'IMPD Northwest District',
  '10290': 'IMPD Southeast District',
  '10300': 'IMPD Southwest District',
  '10310': 'IMPD Northeast District'
};

// Audio Processing Admin Component
function AudioProcessingAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<{ [key: string]: HTMLAudioElement }>({});
  const [transcriptionLoading, setTranscriptionLoading] = useState(false);
  const [retryingLowConfidence, setRetryingLowConfidence] = useState(false);
  const [fixingTranscriptions, setFixingTranscriptions] = useState(false);
  const [fixingLocations, setFixingLocations] = useState(false);
  const [clearingStuckTranscriptions, setClearingStuckTranscriptions] = useState(false);
  const [forceProcessing, setForceProcessing] = useState(false);

  // Queries for audio data
  const { data: pendingFiles, isLoading: filesLoading, refetch: refetchFiles } = useQuery({
    queryKey: ['/api/audio/pending-files'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: queueStatus, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ['/api/audio/queue-status'],
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  const { data: audioStatus } = useQuery({
    queryKey: ['/api/audio/status'],
    refetchInterval: 2000,
  });

  const { data: transcriptionStatus } = useQuery({
    queryKey: ['/api/transcription/status'],
    refetchInterval: 3000,
  });

  const { data: fixStatus, refetch: refetchFixStatus } = useQuery({
    queryKey: ['/api/transcriptions/status'],
    refetchInterval: 10000,
  });

  // Mutations for audio operations
  const transcribeMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/audio/transcribe/${fileId}`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to queue transcription');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "File queued for transcription" });
      queryClient.invalidateQueries({ queryKey: ['/api/audio/queue-status'] });
      refetchQueue();
      refetchFiles();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to queue transcription", 
        description: error?.message || "Unknown error",
        variant: "destructive" 
      });
    },
  });

  const removeFromQueueMutation = useMutation({
    mutationFn: async (segmentId: string) => {
      const response = await fetch(`/api/audio/remove-from-queue/${segmentId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to remove from queue');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Removed from transcription queue" });
      queryClient.invalidateQueries({ queryKey: ['/api/audio/queue-status'] });
      refetchQueue();
      refetchFiles();
    },
    onError: () => {
      toast({ title: "Failed to remove from queue", variant: "destructive" });
    },
  });

  // Handle remove all from queue
  const handleRemoveAllFromQueue = async () => {
    try {
      const response = await fetch('/api/audio/clear-queue', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to clear queue');
      
      toast({
        title: "Queue Cleared",
        description: "All audio segments have been removed from the transcription queue."
      });
      
      // Refetch queue status  
      refetchQueue();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear transcription queue. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle retry low confidence transcriptions
  const handleRetryLowConfidence = async () => {
    setRetryingLowConfidence(true);
    try {
      const response = await fetch('/api/transcription/retry-low-confidence', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to start retry process');
      
      toast({
        title: "Retry Process Started",
        description: "Low confidence transcriptions are being retried with improved AI models."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start retry process. Please try again.",
        variant: "destructive"
      });
    } finally {
      setRetryingLowConfidence(false);
    }
  };

  const handleClearStuckTranscriptions = async () => {
    setClearingStuckTranscriptions(true);
    try {
      const response = await fetch('/api/transcription/clear-stuck', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to clear stuck transcriptions');
      
      const data = await response.json();
      toast({
        title: "Stuck Transcriptions Cleared",
        description: `Cleared ${data.message || 'stuck segments from the queue'}`
      });
      
      // Refetch queue status
      refetchQueue();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear stuck transcriptions. Please try again.",
        variant: "destructive"
      });
    } finally {
      setClearingStuckTranscriptions(false);
    }
  };

  const handleForceProcessTranscriptions = async () => {
    setForceProcessing(true);
    try {
      const response = await fetch('/api/transcription/force-process', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to force process transcriptions');
      
      const data = await response.json();
      toast({
        title: "Force Processing Started",
        description: `Processing ${data.processed} segments. ${data.totalUnprocessed - data.processed} remaining.`
      });
      
      // Refetch queue status
      refetchQueue();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to force process transcriptions. Please try again.",
        variant: "destructive"
      });
    } finally {
      setForceProcessing(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/audio/file/${fileId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete file');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "File deleted successfully" });
      refetchFiles();
    },
    onError: () => {
      toast({ title: "Failed to delete file", variant: "destructive" });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/audio/clear-pending', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to clear files');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "All pending files cleared" });
      refetchFiles();
    },
    onError: () => {
      toast({ title: "Failed to clear files", variant: "destructive" });
    },
  });

  const fixUnknownMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/transcriptions/fix-unknown');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Unknown calls fixed",
        description: `Processed ${data.processed} calls, reclassified ${data.reclassified}, geocoded ${data.geocoded}`
      });
      refetchFixStatus();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to fix unknown calls", 
        description: error?.message || "Unknown error",
        variant: "destructive" 
      });
    },
  });

  const fixLocationsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/transcriptions/fix-locations');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Missing locations fixed",
        description: `Processed ${data.processed} calls, geocoded ${data.geocoded}`
      });
      refetchFixStatus();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to fix locations", 
        description: error?.message || "Unknown error",
        variant: "destructive" 
      });
    },
  });

  const fixAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/transcriptions/fix-all');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Comprehensive fix completed",
        description: `Processed ${data.processed} calls, reclassified ${data.reclassified}, geocoded ${data.geocoded}`
      });
      refetchFixStatus();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to run comprehensive fix", 
        description: error?.message || "Unknown error",
        variant: "destructive" 
      });
    },
  });

  const fixBeepingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/transcriptions/fix-beeping');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Beeping transcripts fixed",
        description: `Processed ${data.processed} calls, updated ${data.updated} beeping transcripts`
      });
      refetchFixStatus();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to fix beeping transcripts", 
        description: error?.message || "Unknown error",
        variant: "destructive" 
      });
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  // Audio playback functions
  const playAudio = (fileId: string, isFromQueue = false) => {
    // Stop any currently playing audio
    if (currentlyPlaying && currentlyPlaying !== fileId) {
      stopAudio(currentlyPlaying);
    }

    let audioUrl;
    if (isFromQueue) {
      // For queue items, use the segment ID to get audio
      audioUrl = `/api/audio/segment/${fileId}`;
    } else {
      // For pending files, use the pending files endpoint
      // The fileId should already include .m4a from the API response
      audioUrl = `/api/audio/pending/${fileId}`;
    }

    // Create new audio element for this file if it doesn't exist
    if (!audioElements[fileId]) {
      const audio = new Audio();
      audio.preload = 'metadata';
      
      audio.addEventListener('ended', () => {
        setCurrentlyPlaying(null);
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Audio load error:', e);
        toast({ 
          title: "Audio playback failed", 
          description: `Could not load audio file: ${fileId}`,
          variant: "destructive" 
        });
        setCurrentlyPlaying(null);
      });

      audio.addEventListener('loadeddata', () => {
        console.log('Audio loaded successfully:', fileId);
      });

      setAudioElements(prev => ({ ...prev, [fileId]: audio }));
    }

    const audio = audioElements[fileId];
    if (!audio) {
      console.error('Audio element not found for fileId:', fileId);
      return;
    }

    // Set the source and load
    audio.src = audioUrl;
    audio.load();

    audio.play()
      .then(() => {
        console.log('Audio playing:', fileId);
        setCurrentlyPlaying(fileId);
      })
      .catch((error) => {
        console.error('Audio playback error:', error);
        toast({ 
          title: "Audio playback failed", 
          description: `Could not play audio file: ${fileId}`,
          variant: "destructive" 
        });
      });
  };

  const pauseAudio = (fileId: string) => {
    const audio = audioElements[fileId];
    if (audio) {
      audio.pause();
      setCurrentlyPlaying(null);
    }
  };

  const stopAudio = (fileId: string) => {
    const audio = audioElements[fileId];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      setCurrentlyPlaying(null);
    }
  };

  const getTranscriptionProgress = () => {
    if (!(audioStatus as any)?.activeTranscriptions?.length) return null;
    const active = (audioStatus as any).activeTranscriptions[0];
    return {
      id: active.id,
      stage: active.stage,
      progress: active.progress || 0,
      estimatedTime: active.estimatedTime || 'Unknown'
    };
  };

  const transcriptionProgress = getTranscriptionProgress();

  // Transcription control function
  const handleTranscriptionControl = async (action: 'start' | 'stop' | 'restart') => {
    setTranscriptionLoading(true);
    try {
      const response = await fetch(`/api/transcription/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        toast({ 
          title: `Transcription ${action} successful`,
          description: result.message 
        });
        // Refresh status immediately
        queryClient.invalidateQueries({ queryKey: ['/api/transcription/status'] });
      } else {
        const error = await response.json();
        toast({ 
          title: `Failed to ${action} transcription`,
          description: error.error,
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error(`Error ${action}ing transcription:`, error);
      toast({ 
        title: `Failed to ${action} transcription`,
        description: "Please check the console for details.",
        variant: "destructive" 
      });
    } finally {
      setTranscriptionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pending Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(pendingFiles as any)?.files?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Files waiting for transcription
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Queue Length</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(queueStatus as any)?.queueLength || 0}</div>
            <p className="text-xs text-muted-foreground">
              Segments in transcription queue
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active Transcriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(audioStatus as any)?.activeTranscriptions?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Currently processing
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Currently Playing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {currentlyPlaying ? '🔊' : '🔇'}
            </div>
            <p className="text-xs text-muted-foreground">
              {currentlyPlaying ? 'Audio playing' : 'No audio'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transcription Data Quality Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Data Quality Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{(fixStatus as any)?.unknown || 0}</div>
              <div className="text-xs text-muted-foreground">Unknown calls</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-orange-600">{(fixStatus as any)?.missingLocation || 0}</div>
              <div className="text-xs text-muted-foreground">Missing locations</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{(fixStatus as any)?.lowConfidence || 0}</div>
              <div className="text-xs text-muted-foreground">Low confidence</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{(fixStatus as any)?.recentCalls || 0}</div>
              <div className="text-xs text-muted-foreground">Today's calls</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fixUnknownMutation.mutate()}
              disabled={fixUnknownMutation.isPending}
              className="flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3" />
              {fixUnknownMutation.isPending ? 'Fixing...' : 'Fix Unknown Calls'}
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => fixLocationsMutation.mutate()}
              disabled={fixLocationsMutation.isPending}
              className="flex items-center gap-1"
            >
              <MapPin className="h-3 w-3" />
              {fixLocationsMutation.isPending ? 'Fixing...' : 'Fix Locations'}
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => fixBeepingMutation.mutate()}
              disabled={fixBeepingMutation.isPending}
              className="flex items-center gap-1"
            >
              <Volume2 className="h-3 w-3" />
              {fixBeepingMutation.isPending ? 'Fixing...' : 'Fix Beeping Sounds'}
            </Button>
            
            <Button
              size="sm"
              variant="default"
              onClick={() => fixAllMutation.mutate()}
              disabled={fixAllMutation.isPending}
              className="flex items-center gap-1"
            >
              <Wrench className="h-3 w-3" />
              {fixAllMutation.isPending ? 'Processing...' : 'Fix All Issues'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transcription Service Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            Transcription Service
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Service Status</span>
            <Badge variant={(transcriptionStatus as any)?.isRunning ? "default" : "secondary"} className="text-xs h-5">
              {(transcriptionStatus as any)?.isRunning ? "Running" : "Stopped"}
            </Badge>
          </div>
          
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTranscriptionControl('start')}
              disabled={transcriptionLoading || (transcriptionStatus as any)?.isRunning}
              className="flex items-center gap-1"
            >
              <Play className="h-3 w-3" />
              Start
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTranscriptionControl('stop')}
              disabled={transcriptionLoading || !(transcriptionStatus as any)?.isRunning}
              className="flex items-center gap-1"
            >
              <Square className="h-3 w-3" />
              Stop
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTranscriptionControl('restart')}
              disabled={transcriptionLoading}
              className="flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Restart
            </Button>
          </div>

          {(audioStatus as any)?.transcriptionService && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Model</span>
                <Badge variant="outline" className="text-xs h-5">
                  {(audioStatus as any).transcriptionService.useAPI ? 'OpenAI Whisper' : 'Local Whisper'}
                </Badge>
              </div>
              <div className="flex justify-between text-xs">
                <span>Processed</span>
                <span>{(audioStatus as any).transcriptionService.processed}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Pending</span>
                <span>{(audioStatus as any).transcriptionService.pending}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Errors</span>
                <span className={(audioStatus as any).transcriptionService.errors > 0 ? "text-red-500" : ""}>
                  {(audioStatus as any).transcriptionService.errors}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcription Progress Bar */}
      {transcriptionProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Transcription Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing: {transcriptionProgress.id}</span>
                <span>{transcriptionProgress.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${transcriptionProgress.progress}%` }}
                ></div>
              </div>
              <div className="text-xs text-muted-foreground">
                Stage: {transcriptionProgress.stage} • Est. Time: {transcriptionProgress.estimatedTime}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side by Side Layout for Files and Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Files Management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pending Audio Files</CardTitle>
              <p className="text-sm text-muted-foreground">
                Audio files waiting for transcription
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchFiles()}
                disabled={filesLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${filesLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!(pendingFiles as any)?.files?.length}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear All Pending Files</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {(pendingFiles as any)?.files?.length || 0} pending audio files. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearAllMutation.mutate()}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete All Files
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {filesLoading ? (
              <div className="text-center py-8">Loading files...</div>
            ) : (pendingFiles as any)?.files?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pending audio files found
              </div>
            ) : (
              <div className="space-y-2">
                {(pendingFiles as any)?.files?.map((file: any) => (
                  <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 flex-shrink-0" />
                        <span className="font-medium truncate">{file.filename}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Size: {formatFileSize(file.size)} • Created: {formatDate(file.created)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {/* Audio Controls */}
                      <div className="flex items-center gap-1">
                        {currentlyPlaying === file.id ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => pauseAudio(file.id)}
                            >
                              <Pause className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => stopAudio(file.id)}
                            >
                              <Square className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => playAudio(file.id, false)}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => transcribeMutation.mutate(file.id)}
                        disabled={transcribeMutation.isPending}
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Queue
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Audio File</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {file.filename}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(file.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete File
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transcription Queue Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Transcription Queue</CardTitle>
              <p className="text-sm text-muted-foreground">
                Audio segments queued for processing
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchQueue()}
                disabled={queueLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${queueLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveAllFromQueue}
                disabled={queueLoading || !(queueStatus as any)?.segments?.length}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryLowConfidence}
                disabled={retryingLowConfidence}
              >
                <RotateCcw className={`h-4 w-4 mr-1 ${retryingLowConfidence ? 'animate-spin' : ''}`} />
                Retry Low Confidence
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearStuckTranscriptions}
                disabled={clearingStuckTranscriptions}
              >
                <AlertCircle className={`h-4 w-4 mr-1 ${clearingStuckTranscriptions ? 'animate-pulse' : ''}`} />
                Clear Stuck
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleForceProcessTranscriptions}
                disabled={forceProcessing}
              >
                <Play className={`h-4 w-4 mr-1 ${forceProcessing ? 'animate-pulse' : ''}`} />
                Force Process
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {queueLoading ? (
              <div className="text-center py-8">Loading queue...</div>
            ) : (queueStatus as any)?.segments?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No segments in transcription queue
              </div>
            ) : (
              <div className="space-y-2">
                {(queueStatus as any)?.segments?.map?.((segment: any, index: number) => (
                  <div key={segment.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{segment.id}</span>
                        {index === 0 && (
                          <Badge variant="secondary">Next</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Added: {formatDate(segment.created)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {/* Audio Controls for Queue Items */}
                      <div className="flex items-center gap-1">
                        {currentlyPlaying === segment.id ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => pauseAudio(segment.id)}
                            >
                              <Pause className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => stopAudio(segment.id)}
                            >
                              <Square className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => playAudio(segment.id, true)}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromQueueMutation.mutate(segment.id)}
                        disabled={removeFromQueueMutation.isPending}
                      >
                        <SkipBack className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active Transcriptions */}
      {(audioStatus as any)?.activeTranscriptions?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Transcriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(audioStatus as any).activeTranscriptions.map((transcription: any) => (
                <div key={transcription.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <span className="font-medium">{transcription.id}</span>
                    <div className="text-sm text-muted-foreground">
                      Stage: {transcription.stage} • Progress: {transcription.progress}%
                    </div>
                  </div>
                  <Badge variant="secondary">Processing</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [editForm, setEditForm] = useState({
    transcript: '',
    callType: '',
    customCallType: '',
    location: '',
    confidence: 0
  });
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const [audioState, setAudioState] = useState<{
    currentlyPlaying: string | null;
    audio: HTMLAudioElement | null;
    isPlaying: boolean;
  }>({ currentlyPlaying: null, audio: null, isPlaying: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('timestamp');
  const [hospitalDistances, setHospitalDistances] = useState<Record<number, { hospital: string; distance: string } | null>>({});
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available unit tags when editing
  const { data: availableUnits = [] } = useQuery({
    queryKey: ['/api/unit-tags'],
    enabled: !!editingCall
  });

  // Use search when query is provided, otherwise get active calls
  const { data: calls = [], isLoading } = useQuery<Call[]>({
    queryKey: searchQuery ? ['/api/calls', { query: searchQuery, limit: 500 }] : ['/api/calls/active'],
    queryFn: async () => {
      if (searchQuery) {
        const response = await fetch(`/api/calls?query=${encodeURIComponent(searchQuery)}&limit=500`);
        if (!response.ok) {
          throw new Error('Failed to search calls');
        }
        return response.json();
      } else {
        const response = await fetch('/api/calls/active');
        if (!response.ok) {
          throw new Error('Failed to fetch active calls');
        }
        return response.json();
      }
    },
    refetchInterval: searchQuery ? undefined : 5000, // Only auto-refresh for active calls
  });

  // Fetch units for all calls in batch
  const { data: unitsMap = {} } = useQuery({
    queryKey: ['/api/calls/batch-units', calls.map(c => c.id)],
    queryFn: async () => {
      if (!calls.length) return {};
      
      console.log('Fetching units for calls:', calls.map(c => c.id));
      
      const response = await fetch('/api/calls/batch-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callIds: calls.map(c => c.id) })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch units');
      }
      
      const data = await response.json();
      console.log('Units data received:', data);
      return data;
    },
    enabled: !!calls.length && !isLoading,
  });

  // Filter and search functions
  const filteredCalls = calls?.filter((call: Call) => {
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        call.transcript?.toLowerCase().includes(query) ||
        call.location?.toLowerCase().includes(query) ||
        call.callType?.toLowerCase().includes(query) ||
        (call as any).talkgroupDisplayName?.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  // Reset to first page when search query changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  // Calculate hospital distances for calls with coordinates
  React.useEffect(() => {
    const calculateHospitalDistances = async () => {
      if (!calls.length) return;

      const callsWithCoordinates = calls.filter(call => call.latitude && call.longitude);
      if (callsWithCoordinates.length === 0) return;

      const distances: Record<number, { hospital: string; distance: string } | null> = {};
      
      for (const call of callsWithCoordinates) {
        try {
          const result = await findClosestHospital(call.latitude!, call.longitude!);
          if (result) {
            distances[call.id] = {
              hospital: result.hospital.name,
              distance: formatDistance(result.distance)
            };
          } else {
            distances[call.id] = null;
          }
        } catch (error) {
          console.error('Error calculating hospital distance for call', call.id, error);
          distances[call.id] = null;
        }
      }

      setHospitalDistances(distances);
    };

    calculateHospitalDistances();
  }, [calls]);

  const { data: audioAvailability, isLoading: isLoadingAudio } = useQuery({
    queryKey: ['/api/audio/check-availability'],
    queryFn: async () => {
      const response = await fetch('/api/audio/check-availability');
      if (!response.ok) {
        throw new Error('Failed to fetch audio availability');
      }
      return response.json();
    }
  });

  const deleteCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      const response = await fetch(`/api/calls/${callId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete call');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      toast({
        title: 'Call deleted successfully',
        description: 'The call has been removed from the system.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error deleting call',
        description: error.message || 'Failed to delete the call.',
        variant: 'destructive',
      });
    }
  });

  const updateCallMutation = useMutation({
    mutationFn: async (updates: { id: number; [key: string]: any }) => {
      const { id, ...updateData } = updates;
      const response = await fetch(`/api/calls/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Failed to update call');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      setEditingCall(null);
      toast({
        title: 'Call updated successfully',
        description: 'The call information has been saved.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating call',
        description: error.message || 'Failed to update the call.',
        variant: 'destructive',
      });
    }
  });

  const retranscribeMutation = useMutation({
    mutationFn: async (callId: number) => {
      const response = await fetch(`/api/calls/${callId}/retranscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Failed to re-transcribe call');
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      toast({
        title: 'Re-transcription completed',
        description: 'The call has been re-transcribed successfully using Whisper.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error re-transcribing call',
        description: error.message || 'Failed to re-transcribe the call.',
        variant: 'destructive',
      });
    }
  });

  const handleEditCall = (call: Call) => {
    setEditingCall(call);
    setEditForm({
      transcript: call.transcript || '',
      callType: call.callType || '',
      customCallType: '',
      location: call.location || '',
      confidence: call.confidence || 0
    });
    setSelectedUnits(unitsMap[call.id]?.map((unit: any) => unit.id) || []);
  };

  const handleSaveEdit = async () => {
    if (!editingCall) return;
    
    // Use custom call type if "Custom" is selected, otherwise use the selected call type
    const finalCallType = editForm.callType === "Custom" ? editForm.customCallType : editForm.callType;
    
    // First update the call details
    await updateCallMutation.mutateAsync({
      id: editingCall.id,
      transcript: editForm.transcript,
      callType: finalCallType,
      location: editForm.location,
      confidence: editForm.confidence
    });
    
    // Get current units for this call
    const currentUnits = unitsMap[editingCall.id]?.map((unit: any) => unit.id) || [];
    
    // Find units to add and remove
    const unitsToAdd = selectedUnits.filter(id => !currentUnits.includes(id));
    const unitsToRemove = currentUnits.filter((id: number) => !selectedUnits.includes(id));
    
    // Add new units
    if (unitsToAdd.length > 0) {
      await apiRequest(`/api/calls/${editingCall.id}/units`, JSON.stringify({ unitIds: unitsToAdd }));
    }
    
    // Remove units
    if (unitsToRemove.length > 0) {
      await apiRequest(`/api/calls/${editingCall.id}/units`, JSON.stringify({ unitIds: unitsToRemove }));
    }
    
    queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
    setEditingCall(null);
    setSelectedUnits([]);
  };

  const handleCancelEdit = () => {
    setEditingCall(null);
    setEditForm({
      transcript: '',
      callType: '',
      customCallType: '',
      location: '',
      confidence: 0
    });
    setSelectedUnits([]);
  };

  const handleDeleteCall = (callId: number) => {
    deleteCallMutation.mutate(callId);
  };

  const playAudio = async (audioSegmentId: string) => {
    try {
      // Stop any currently playing audio
      if (audioState.audio) {
        audioState.audio.pause();
        audioState.audio.currentTime = 0;
      }

      const response = await fetch(`/api/audio/segment/${audioSegmentId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (response.status === 404 && errorData?.details) {
          throw new Error(`Audio not available: ${errorData.details}`);
        } else {
          throw new Error('Audio file not found');
        }
      }
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      
      setAudioState({
        currentlyPlaying: audioSegmentId,
        audio: audio,
        isPlaying: true
      });

      await audio.play();
      
      // Clean up when audio ends
      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl);
        setAudioState({
          currentlyPlaying: null,
          audio: null,
          isPlaying: false
        });
      });

      // Update state when audio is paused
      audio.addEventListener('pause', () => {
        setAudioState(prev => ({ ...prev, isPlaying: false }));
      });

      // Update state when audio starts playing
      audio.addEventListener('play', () => {
        setAudioState(prev => ({ ...prev, isPlaying: true }));
      });

    } catch (error) {
      console.error('Failed to play audio:', error);
      setAudioState({
        currentlyPlaying: null,
        audio: null,
        isPlaying: false
      });
      toast({
        title: "Audio Error",
        description: "Failed to play audio file",
        variant: "destructive"
      });
    }
  };

  const pauseAudio = () => {
    if (audioState.audio) {
      audioState.audio.pause();
    }
  };

  const stopAudio = () => {
    if (audioState.audio) {
      audioState.audio.pause();
      audioState.audio.currentTime = 0;
      setAudioState({
        currentlyPlaying: null,
        audio: null,
        isPlaying: false
      });
    }
  };

  const resumeAudio = () => {
    if (audioState.audio) {
      audioState.audio.play();
    }
  };



  const getTalkgroupName = (talkgroup: string) => {
    return talkgroupMapping[talkgroup as keyof typeof talkgroupMapping] || talkgroup;
  };

  const content = (
    <div className={isMobile ? "p-4" : "p-4 sm:p-6 max-w-7xl mx-auto"}>
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-black dark:text-white">Admin Panel</h1>
            <p className="text-sm sm:text-base text-gray-700 dark:text-gray-200 mt-1">
              Manage emergency calls, user accounts, and system settings
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="self-start">
              <Radio className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="calls" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6 h-auto">
          <TabsTrigger value="calls" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <Settings className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Call Management</span>
          </TabsTrigger>
          <TabsTrigger value="audio" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <Mic className="h-4 w-4" />
            <span className="text-xs sm:text-sm">Audio Processing</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 p-2 sm:p-3">
            <Users className="h-4 w-4" />
            <span className="text-xs sm:text-sm">User Management</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calls" className="space-y-6">
          {/* Audio Availability Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Audio Availability Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingAudio ? (
            <div className="text-gray-500">Checking audio availability...</div>
          ) : audioAvailability ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{audioAvailability.summary.total}</div>
                  <div className="text-sm text-gray-600">Total Calls</div>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{audioAvailability.summary.available}</div>
                  <div className="text-sm text-gray-600">Available Audio</div>
                </div>
                <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{audioAvailability.summary.missing}</div>
                  <div className="text-sm text-gray-600">Missing Audio</div>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                {audioAvailability.summary.missing > 0 ? (
                  <span className="text-red-600">
                    ⚠️ {audioAvailability.summary.missing} calls have missing audio (likely due to Rdio Scanner database rotation)
                  </span>
                ) : (
                  <span className="text-green-600">
                    ✅ All calls have available audio
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-red-500">Failed to check audio availability</div>
          )}
        </CardContent>
      </Card>

          {/* Search Interface */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            Search Emergency Calls
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="ml-4 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="timestamp">Sort by Date</option>
              <option value="callType">Sort by Call Type</option>
            </select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search transcripts, locations, call types, keywords..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {searchQuery ? (
              <>Searching entire database for: "{searchQuery}" • {filteredCalls.length} results found</>
            ) : (
              <>Showing active calls • Type to search entire database history</>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {!isLoading && filteredCalls.length > 0 && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Items per page:</span>
                  <select 
                    value={itemsPerPage} 
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1); // Reset to first page
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredCalls.length)} to {Math.min(currentPage * itemsPerPage, filteredCalls.length)} of {filteredCalls.length} calls
                  {searchQuery && ` (filtered from ${calls?.length || 0} total)`}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-3">
                  Page {currentPage} of {Math.ceil(filteredCalls.length / itemsPerPage)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(Math.ceil(filteredCalls.length / itemsPerPage), currentPage + 1))}
                  disabled={currentPage >= Math.ceil(filteredCalls.length / itemsPerPage)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8">Loading calls...</div>
        ) : calls.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No calls found</div>
        ) : (
          (() => {
            // Sort calls first
            const sortedCalls = calls.sort((a, b) => {
              if (sortBy === 'callType') {
                const aType = a.callType || '';
                const bType = b.callType || '';
                return aType.localeCompare(bType);
              } else {
                // Default to timestamp sorting (newest first)
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
              }
            });
            
            // Apply pagination
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedCalls = sortedCalls.slice(startIndex, endIndex);
            
            return paginatedCalls.map((call: Call) => (
            <Card key={call.id} className="w-full">
              <CardHeader className="flex flex-col space-y-1.5 p-4 sm:p-6 pt-[7px] pb-[7px]">
                <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1">
                      <CardTitle className="text-base sm:text-lg">
                        📻 {call.radioTimestamp ? 
                          new Date(call.radioTimestamp).toLocaleString() : 
                          new Date(call.timestamp).toLocaleString()
                        }
                      </CardTitle>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Call ID: {call.id} | Rdio ID: {(call.metadata as any)?.rdioCallId || 'N/A'}
                      </div>
                    </div>
                    <Badge variant="outline" className="self-start">
                      <span className="hidden sm:inline">{getTalkgroupName(call.talkgroup || '')} ({call.talkgroup})</span>
                      <span className="sm:hidden">{call.talkgroup}</span>
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    {audioState.currentlyPlaying === call.audioSegmentId ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {audioState.isPlaying ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={pauseAudio}
                          >
                            <Pause className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Pause</span>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={resumeAudio}
                          >
                            <Play className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Resume</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={stopAudio}
                        >
                          <Square className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Stop</span>
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => playAudio(call.audioSegmentId)}
                      >
                        <Volume2 className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Play Audio</span>
                      </Button>
                    )}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditCall(call)}
                        >
                          <Edit className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Edit Call #{call.id}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="transcript">Transcript</Label>
                            <Textarea
                              id="transcript"
                              value={editForm.transcript}
                              onChange={(e) => setEditForm(prev => ({ ...prev, transcript: e.target.value }))}
                              rows={4}
                              placeholder="Enter corrected transcript..."
                            />
                          </div>
                          <div>
                            <Label htmlFor="callType">Call Type</Label>
                            <Select
                              value={editForm.callType}
                              onValueChange={(value) => setEditForm(prev => ({ ...prev, callType: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select call type" />
                              </SelectTrigger>
                              <SelectContent className="z-[10000]">
                                <SelectItem value="Abdominal Pain">Abdominal Pain</SelectItem>
                                <SelectItem value="Abdominal Pain B">Abdominal Pain B</SelectItem>
                                <SelectItem value="Abdominal/Back Pain B">Abdominal/Back Pain B</SelectItem>
                                <SelectItem value="Assault">Assault</SelectItem>
                                <SelectItem value="Assault Trauma B">Assault Trauma B</SelectItem>
                                <SelectItem value="Assault / Sexual Assault / Stun Gun">Assault / Sexual Assault / Stun Gun</SelectItem>
                                <SelectItem value="Assist Person">Assist Person</SelectItem>
                                <SelectItem value="Assist Person C">Assist Person C</SelectItem>
                                <SelectItem value="Assist Person D">Assist Person D</SelectItem>
                                <SelectItem value="Back Pain">Back Pain</SelectItem>
                                <SelectItem value="Bleeding">Bleeding</SelectItem>
                                <SelectItem value="Building Alarm">Building Alarm</SelectItem>
                                <SelectItem value="Building Fire">Building Fire</SelectItem>
                                <SelectItem value="Cardiac Arrest">Cardiac Arrest</SelectItem>
                                <SelectItem value="Chest Pain">Chest Pain</SelectItem>
                                <SelectItem value="Chest Pain/Heart">Chest Pain/Heart</SelectItem>
                                <SelectItem value="Choking">Choking</SelectItem>
                                <SelectItem value="Diabetic">Diabetic</SelectItem>
                                <SelectItem value="Diabetic B">Diabetic B</SelectItem>
                                <SelectItem value="Difficulty Breathing">Difficulty Breathing</SelectItem>
                                <SelectItem value="Difficulty Breathing B">Difficulty Breathing B</SelectItem>
                                <SelectItem value="Difficulty Breathing C">Difficulty Breathing C</SelectItem>
                                <SelectItem value="EMS-Hospital Communications">EMS-Hospital Communications</SelectItem>
                                <SelectItem value="Emergency Dispatch">Emergency Dispatch</SelectItem>
                                <SelectItem value="Eye Problem">Eye Problem</SelectItem>
                                <SelectItem value="Fire/Hazmat">Fire/Hazmat</SelectItem>
                                <SelectItem value="Headache">Headache</SelectItem>
                                <SelectItem value="Injured Person">Injured Person</SelectItem>
                                <SelectItem value="Injured Person B">Injured Person B</SelectItem>
                                <SelectItem value="Injured Person C">Injured Person C</SelectItem>
                                <SelectItem value="Investigation">Investigation</SelectItem>
                                <SelectItem value="Mass Casualty">Mass Casualty</SelectItem>
                                <SelectItem value="Medical Emergency">Medical Emergency</SelectItem>
                                <SelectItem value="Mental/Emotional">Mental/Emotional</SelectItem>
                                <SelectItem value="Mental/Emotional B">Mental/Emotional B</SelectItem>
                                <SelectItem value="Mental-Emotional">Mental-Emotional</SelectItem>
                                <SelectItem value="Mental-Emotional B">Mental-Emotional B</SelectItem>
                                <SelectItem value="OB/Childbirth">OB/Childbirth</SelectItem>
                                <SelectItem value="OB/Childbirth B">OB/Childbirth B</SelectItem>
                                <SelectItem value="Overdose">Overdose</SelectItem>
                                <SelectItem value="Overdose B">Overdose B</SelectItem>
                                <SelectItem value="Overdose C">Overdose C</SelectItem>
                                <SelectItem value="Overdose / Poisoning (Ingestion)">Overdose / Poisoning (Ingestion)</SelectItem>
                                <SelectItem value="Pediatric Cardiac Arrest">Pediatric Cardiac Arrest</SelectItem>
                                <SelectItem value="Residential Fire">Residential Fire</SelectItem>
                                <SelectItem value="Seizure">Seizure</SelectItem>
                                <SelectItem value="Seizure B">Seizure B</SelectItem>
                                <SelectItem value="Sick Person">Sick Person</SelectItem>
                                <SelectItem value="Sick Person A">Sick Person A</SelectItem>
                                <SelectItem value="Sick Person B">Sick Person B</SelectItem>
                                <SelectItem value="Sick Person C">Sick Person C</SelectItem>
                                <SelectItem value="Stab / Gunshot / Penetrating Trauma">Stab / Gunshot / Penetrating Trauma</SelectItem>
                                <SelectItem value="Stroke/CVA">Stroke/CVA</SelectItem>
                                <SelectItem value="Trauma/MVC">Trauma/MVC</SelectItem>
                                <SelectItem value="Unconscious / Fainting (Near)">Unconscious / Fainting (Near)</SelectItem>
                                <SelectItem value="Unconscious Person">Unconscious Person</SelectItem>
                                <SelectItem value="Unconscious Person B">Unconscious Person B</SelectItem>
                                <SelectItem value="Unknown Call Type">Unknown Call Type</SelectItem>
                                <SelectItem value="Vehicle Accident">Vehicle Accident</SelectItem>
                                <SelectItem value="Vehicle Accident B">Vehicle Accident B</SelectItem>
                                <SelectItem value="Vehicle Accident C">Vehicle Accident C</SelectItem>
                                <SelectItem value="Custom">Custom (Type Below)</SelectItem>
                              </SelectContent>
                            </Select>
                            {editForm.callType === "Custom" && (
                              <Input
                                className="mt-2"
                                value={editForm.customCallType || ""}
                                onChange={(e) => setEditForm(prev => ({ ...prev, customCallType: e.target.value }))}
                                placeholder="Enter custom call type..."
                              />
                            )}
                          </div>
                          <div>
                            <Label htmlFor="units">Units Assigned</Label>
                            <Select
                              value="units"
                              onValueChange={() => {}}
                            >
                              <SelectTrigger id="units">
                                <SelectValue>
                                  {selectedUnits.length > 0 
                                    ? `${selectedUnits.length} units selected`
                                    : "Select units"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="z-[10000] max-h-60">
                                {(availableUnits as any[]).map((unit: any) => (
                                  <div
                                    key={unit.id}
                                    className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (selectedUnits.includes(unit.id)) {
                                        setSelectedUnits(selectedUnits.filter(id => id !== unit.id));
                                      } else {
                                        setSelectedUnits([...selectedUnits, unit.id]);
                                      }
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedUnits.includes(unit.id)}
                                      onChange={() => {}}
                                      className="mr-2"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <Badge
                                      variant="secondary"
                                      style={{
                                        backgroundColor: unit.color || '#3B82F6',
                                        color: '#ffffff',
                                        border: 'none'
                                      }}
                                    >
                                      {unit.displayName}
                                    </Badge>
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {selectedUnits.map(unitId => {
                                const unit = (availableUnits as any[]).find(u => u.id === unitId);
                                return unit ? (
                                  <Badge
                                    key={unit.id}
                                    variant="secondary"
                                    className="text-xs cursor-pointer"
                                    style={{
                                      backgroundColor: unit.color || '#3B82F6',
                                      color: '#ffffff',
                                      border: 'none'
                                    }}
                                    onClick={() => setSelectedUnits(selectedUnits.filter(id => id !== unit.id))}
                                  >
                                    {unit.displayName} ×
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="location">Location</Label>
                              <Input
                                id="location"
                                value={editForm.location}
                                onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                                placeholder="e.g. 123 Main St"
                              />
                            </div>
                            <div>
                              <Label htmlFor="confidence">Transcription Confidence</Label>
                              <Input
                                id="confidence"
                                type="number"
                                min="0"
                                max="1"
                                step="0.01"
                                value={editForm.confidence}
                                onChange={(e) => setEditForm(prev => ({ ...prev, confidence: parseFloat(e.target.value) }))}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSaveEdit}
                              disabled={updateCallMutation.isPending}
                            >
                              <Save className="h-4 w-4 mr-1" />
                              {updateCallMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline" 
                      size="sm"
                      onClick={() => retranscribeMutation.mutate(call.id)}
                      disabled={retranscribeMutation.isPending || !call.audioSegmentId}
                      title="Re-transcribe using Whisper AI"
                    >
                      <RefreshCw className={`h-4 w-4 sm:mr-1 ${retranscribeMutation.isPending ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{retranscribeMutation.isPending ? 'Re-transcribing...' : 'Re-transcribe'}</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Call</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this call? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteCall(call.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Transcript:</span>
                    <p className="text-sm text-black dark:text-white mt-1 break-words">
                      {call.transcript || 'No transcript available'}
                    </p>
                  </div>
                  {/* Primary Call Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm mb-4">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-200">Call Type:</span>
                      <p className="text-black dark:text-white break-words">{call.callType || 'Unknown'}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-200">Units:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {unitsMap[call.id] && unitsMap[call.id].length > 0 ? (
                          unitsMap[call.id].map((unit: any) => (
                            <Badge 
                              key={unit.id} 
                              variant="secondary"
                              className="text-xs"
                              style={{ 
                                backgroundColor: unit.color || '#3B82F6', 
                                color: '#ffffff',
                                border: 'none'
                              }}
                            >
                              {unit.displayName}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-black dark:text-white text-sm">No units assigned</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-200">Location:</span>
                      <p className="text-black dark:text-white break-words">{call.location || 'Unknown'}</p>
                      {hospitalDistances[call.id] && (
                        <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                          <MapPin className="inline h-3 w-3 mr-1" />
                          Nearest: {hospitalDistances[call.id]!.hospital} ({hospitalDistances[call.id]!.distance})
                        </p>
                      )}
                    </div>
                    <div>
                      <span className={`font-medium ${(call.confidence || 0) < 0.5 ? 'text-red-600' : 'text-gray-700 dark:text-gray-200'}`}>
                        Transcription Confidence:
                      </span>
                      <p className={`${(call.confidence || 0) < 0.5 ? 'text-red-600 font-semibold' : 'text-black dark:text-white'}`}>
                        {((call.confidence || 0) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Rdio Scanner Technical Details */}
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
                    <h4 className="font-medium text-gray-700 dark:text-gray-200 mb-2">📡 Rdio Scanner Details</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">System:</span>
                        <p className="text-black dark:text-white">{call.system || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Talkgroup:</span>
                        <p className="text-black dark:text-white">{call.talkgroup || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Frequency:</span>
                        <p className="text-black dark:text-white">
                          {call.frequency ? `${(call.frequency / 1000000).toFixed(4)} MHz` : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Duration:</span>
                        <p className="text-black dark:text-white">
                          {call.duration ? `${(call.duration / 1000).toFixed(1)}s` : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Rdio Source:</span>
                        <p className="text-black dark:text-white">
                          {(call.metadata as any)?.rdioSource || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Audio Type:</span>
                        <p className="text-black dark:text-white">
                          {(call.metadata as any)?.rdioAudioType || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Radio Time:</span>
                        <p className="text-black dark:text-white">
                          {call.radioTimestamp ? new Date(call.radioTimestamp).toLocaleTimeString() : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Processing Time:</span>
                        <p className="text-black dark:text-white">
                          {new Date(call.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            ))
          })()
        )}
        </div>
        
        {/* Bottom Pagination Controls */}
        {!isLoading && filteredCalls.length > 0 && Math.ceil(filteredCalls.length / itemsPerPage) > 1 && (
          <Card className="mt-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-3">
                  Page {currentPage} of {Math.ceil(filteredCalls.length / itemsPerPage)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(Math.ceil(filteredCalls.length / itemsPerPage), currentPage + 1))}
                  disabled={currentPage >= Math.ceil(filteredCalls.length / itemsPerPage)}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        </TabsContent>

        <TabsContent value="audio">
          <AudioProcessingAdmin />
        </TabsContent>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
  
  if (isMobile) {
    return (
      <MobileLayout title="Admin">
        {content}
      </MobileLayout>
    );
  }
  
  return content;
}
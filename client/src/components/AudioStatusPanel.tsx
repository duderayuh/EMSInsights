import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { apiRequest } from '@/lib/queryClient';
import { RdioScannerControl } from './rdio-scanner-control';
import { Mic, Volume2, Cpu, Zap, AlertTriangle, CheckCircle, FolderOpen, Monitor, Link, Play, Square, RotateCcw } from 'lucide-react';

interface AudioStatus {
  audioProcessor: {
    isProcessing: boolean;
    connected: boolean;
    currentChunk: number;
    totalProcessed: number;
    errors: number;
  };
  transcriptionService: {
    model: string;
    useAPI: boolean;
    processed: number;
    pending: number;
    errors: number;
  };
  fileMonitor: {
    monitoring: boolean;
    rdioAudioDir: string;
    ems_audioDir: string;
    processedFiles: number;
    lastScanTime: string;
    directoryExists: boolean;
  };
  unprocessedSegments: number;
  activeTranscriptions: Array<{
    id: string;
    segmentId: string;
    stage: 'starting' | 'whisper' | 'cleanup' | 'classification' | 'complete';
    progress: number;
    message: string;
    error?: string;
  }>;
}

export function AudioStatusPanel() {
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testTranscription, setTestTranscription] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [audioUploadLoading, setAudioUploadLoading] = useState(false);
  const [audioUploadResult, setAudioUploadResult] = useState<any>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<{ isRunning: boolean; status: string } | null>(null);
  const [transcriptionLoading, setTranscriptionLoading] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/audio/status');
        if (response.ok) {
          const data = await response.json();
          setAudioStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch audio status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    fetchTranscriptionStatus();
    const interval = setInterval(() => {
      fetchStatus();
      fetchTranscriptionStatus();
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchTranscriptionStatus = async () => {
    try {
      const response = await fetch('/api/transcription/status');
      if (response.ok) {
        const data = await response.json();
        setTranscriptionStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch transcription status:', error);
    }
  };

  const handleTestTranscription = async () => {
    if (!testTranscription.trim()) return;
    
    setTestLoading(true);
    try {
      const response = await fetch('/api/audio/test-transcription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: testTranscription }),
      });
      
      if (!response.ok) {
        throw new Error('Test transcription failed');
      }
      
      const data = await response.json();
      
      console.log('Test transcription result:', response);
      alert('Test transcription processed successfully! Check the dashboard for the new call.');
      setTestTranscription('');
    } catch (error) {
      console.error('Test transcription failed:', error);
      alert('Test transcription failed. Please try again.');
    } finally {
      setTestLoading(false);
    }
  };

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
        console.log(`Transcription ${action} successful:`, result.message);
        // Refresh status immediately
        await fetchTranscriptionStatus();
      } else {
        const error = await response.json();
        alert(`Failed to ${action} transcription: ${error.error}`);
      }
    } catch (error) {
      console.error(`Error ${action}ing transcription:`, error);
      alert(`Failed to ${action} transcription. Please check the console for details.`);
    } finally {
      setTranscriptionLoading(false);
    }
  };

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setAudioUploadLoading(true);
    setAudioUploadResult(null);
    
    try {
      const formData = new FormData();
      formData.append('audio', file);
      
      const response = await fetch('/api/audio/upload-test', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const result = await response.json();
        setAudioUploadResult(result);
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Audio upload error:', error);
      alert('Upload failed. Please check the console for details.');
    } finally {
      setAudioUploadLoading(false);
      // Reset the file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };



  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Audio Processing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!audioStatus) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Audio Processing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            Failed to load audio processing status
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Rdio Scanner Server Management */}
      <RdioScannerControl />

      {/* Transcription Service Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Transcription Service
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span>Model</span>
            <Badge variant="outline">
              {audioStatus.transcriptionService.useAPI ? 'OpenAI Whisper' : 'Local Whisper'}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Processed</span>
              <span>{audioStatus.transcriptionService.processed}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Pending</span>
              <span>{audioStatus.transcriptionService.pending}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Errors</span>
              <span className={audioStatus.transcriptionService.errors > 0 ? "text-red-500" : ""}>
                {audioStatus.transcriptionService.errors}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Unprocessed Segments</span>
              <span>{audioStatus.unprocessedSegments}</span>
            </div>
            {audioStatus.unprocessedSegments > 0 && (
              <Progress value={(audioStatus.transcriptionService.processed / (audioStatus.transcriptionService.processed + audioStatus.unprocessedSegments)) * 100} />
            )}
          </div>

          {/* Active Transcriptions Progress */}
          {audioStatus.activeTranscriptions && audioStatus.activeTranscriptions.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Active Transcriptions</div>
              {audioStatus.activeTranscriptions.map((transcription) => (
                <div key={transcription.segmentId} className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                  <div className="flex justify-between items-center text-xs">
                    <code className="text-blue-600 dark:text-blue-400">{transcription.segmentId.slice(0, 8)}...</code>
                    <Badge variant="outline" className="text-xs">
                      {transcription.stage}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-black dark:text-gray-200">
                      <span>{transcription.message}</span>
                      <span className="font-mono">{transcription.progress}%</span>
                    </div>
                    <Progress value={transcription.progress} className="h-2" />
                  </div>
                  {transcription.error && (
                    <div className="text-xs text-red-600 dark:text-red-400">{transcription.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Transcription Control Buttons */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Transcription Processor</span>
              <Badge variant={transcriptionStatus?.isRunning ? "default" : "secondary"}>
                {transcriptionStatus?.isRunning ? "Running" : "Stopped"}
              </Badge>
            </div>
            
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleTranscriptionControl('start')}
                disabled={transcriptionLoading || transcriptionStatus?.isRunning}
                className="flex items-center gap-1"
              >
                <Play className="h-3 w-3" />
                Start
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleTranscriptionControl('stop')}
                disabled={transcriptionLoading || !transcriptionStatus?.isRunning}
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
          </div>
        </CardContent>
      </Card>

      {/* Test Audio Processing Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Test Audio Processing Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Test Emergency Transcript:</label>
            <textarea
              value={testTranscription}
              onChange={(e) => setTestTranscription(e.target.value)}
              placeholder="Enter a test emergency transcript to process through the AI classification pipeline..."
              className="w-full p-3 border rounded-md resize-none h-24"
            />
          </div>
          
          <div className="border-t pt-4 space-y-3">
            <label className="text-sm font-medium">Upload Audio File for Testing:</label>
            <div className="flex gap-2">
              <input
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.ogg"
                onChange={handleAudioUpload}
                disabled={audioUploadLoading}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 text-sm text-gray-600"
              />
              {audioUploadLoading && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  Processing...
                </div>
              )}
            </div>
            {audioUploadResult && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="text-sm font-medium text-green-800 mb-2">Upload Successful!</div>
                <div className="text-xs text-green-700 space-y-1">
                  <div><strong>Transcript:</strong> {audioUploadResult.transcription?.utterance}</div>
                  <div><strong>Call Type:</strong> {audioUploadResult.classification?.callType}</div>
                  <div><strong>Priority:</strong> {audioUploadResult.classification?.priority}</div>
                  <div><strong>Confidence:</strong> {(audioUploadResult.transcription?.confidence * 100).toFixed(1)}%</div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleTestTranscription}
              disabled={!testTranscription.trim() || testLoading}
              className="flex-1"
            >
              {testLoading ? 'Processing...' : 'Test Transcription Pipeline'}
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground">
            This will simulate the full audio processing pipeline: transcription → AI classification → database storage → real-time broadcast
          </div>
        </CardContent>
      </Card>

      {/* File Monitor Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            File Monitor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span>Monitoring Status</span>
            <Badge variant={audioStatus.fileMonitor.monitoring ? "default" : "destructive"}>
              {audioStatus.fileMonitor.monitoring ? (
                <Monitor className="h-3 w-3 mr-1" />
              ) : (
                <AlertTriangle className="h-3 w-3 mr-1" />
              )}
              {audioStatus.fileMonitor.monitoring ? 'Active' : 'Stopped'}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span>Directory Status</span>
            <Badge variant={audioStatus.fileMonitor.directoryExists ? "default" : "destructive"}>
              {audioStatus.fileMonitor.directoryExists ? (
                <CheckCircle className="h-3 w-3 mr-1" />
              ) : (
                <AlertTriangle className="h-3 w-3 mr-1" />
              )}
              {audioStatus.fileMonitor.directoryExists ? 'Found' : 'Missing'}
            </Badge>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Files Processed</span>
              <span>{audioStatus.fileMonitor.processedFiles}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Last Scan</span>
              <span className="text-xs">
                {new Date(audioStatus.fileMonitor.lastScanTime).toLocaleTimeString()}
              </span>
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              <div>Watching: {audioStatus.fileMonitor.rdioAudioDir}</div>
              <div>Processing: .../{audioStatus.fileMonitor.ems_audioDir.split('/').pop()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Call Linking System */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Call Linking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Detects incomplete emergency calls and merges adjacent audio segments when they belong to the same dispatch.
          </div>
          
          <div className="space-y-2">
            <Button
              onClick={async () => {
                try {
                  const response = await fetch('/api/calls/link-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  const result = await response.json();
                  console.log('Call linking result:', result);
                } catch (error) {
                  console.error('Error triggering call linking:', error);
                }
              }}
              size="sm"
              className="w-full"
            >
              <Link className="h-4 w-4 mr-1" />
              Link Split Calls
            </Button>
            
            <div className="text-xs text-muted-foreground">
              Analyzes all calls for incomplete patterns and attempts to merge split audio segments.
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  );
}
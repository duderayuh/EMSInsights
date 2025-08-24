import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RdioScannerControl } from './rdio-scanner-control';
import { 
  Mic, Cpu, Upload, AlertCircle, CheckCircle2, 
  Play, Square, RotateCcw, Link, Activity, 
  FileAudio, Server, Zap, Loader2 
} from 'lucide-react';

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
    }, 5000);

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
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleCallLinking = async () => {
    try {
      const response = await fetch('/api/calls/link-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      console.log('Call linking result:', result);
      alert('Call linking completed. Check console for details.');
    } catch (error) {
      console.error('Error triggering call linking:', error);
      alert('Call linking failed. Check console for details.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!audioStatus) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load audio processing status
        </AlertDescription>
      </Alert>
    );
  }

  // Calculate overall health status
  const systemHealth = {
    transcription: transcriptionStatus?.isRunning && audioStatus.transcriptionService.errors === 0,
    fileMonitor: audioStatus.fileMonitor.monitoring && audioStatus.fileMonitor.directoryExists,
    hasErrors: audioStatus.transcriptionService.errors > 0 || audioStatus.audioProcessor.errors > 0,
    processingActive: audioStatus.activeTranscriptions.length > 0
  };

  return (
    <div className="space-y-6">
      {/* Compact Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Transcription</p>
                <p className="text-2xl font-bold">{audioStatus.transcriptionService.processed}</p>
              </div>
              <div className={`p-2 rounded-full ${systemHealth.transcription ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                <Cpu className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{audioStatus.transcriptionService.pending}</p>
              </div>
              <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Files Processed</p>
                <p className="text-2xl font-bold">{audioStatus.fileMonitor.processedFiles}</p>
              </div>
              <div className={`p-2 rounded-full ${systemHealth.fileMonitor ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                <FileAudio className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-2xl font-bold">{audioStatus.transcriptionService.errors}</p>
              </div>
              <div className={`p-2 rounded-full ${systemHealth.hasErrors ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                {systemHealth.hasErrors ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Transcriptions Alert */}
      {audioStatus.activeTranscriptions && audioStatus.activeTranscriptions.length > 0 && (
        <Alert>
          <Activity className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">{audioStatus.activeTranscriptions.length} Active Transcription{audioStatus.activeTranscriptions.length > 1 ? 's' : ''}</p>
              {audioStatus.activeTranscriptions.map((transcription) => (
                <div key={transcription.segmentId} className="flex items-center gap-2">
                  <Progress value={transcription.progress} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground">{transcription.stage}</span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Control Tabs */}
      <Tabs defaultValue="services" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="services" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Services
          </TabsTrigger>
          <TabsTrigger value="testing" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Testing
          </TabsTrigger>
          <TabsTrigger value="rdio" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Rdio Scanner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Transcription Service</CardTitle>
                <Badge variant={transcriptionStatus?.isRunning ? "default" : "secondary"}>
                  {transcriptionStatus?.isRunning ? "Running" : "Stopped"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Model</p>
                  <p className="font-medium">{audioStatus.transcriptionService.useAPI ? 'OpenAI Whisper' : 'Local Whisper'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Unprocessed</p>
                  <p className="font-medium">{audioStatus.unprocessedSegments} segments</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTranscriptionControl('start')}
                  disabled={transcriptionLoading || transcriptionStatus?.isRunning}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Start
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTranscriptionControl('stop')}
                  disabled={transcriptionLoading || !transcriptionStatus?.isRunning}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTranscriptionControl('restart')}
                  disabled={transcriptionLoading}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Restart
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">File Monitor</CardTitle>
                <Badge variant={audioStatus.fileMonitor.monitoring ? "default" : "destructive"}>
                  {audioStatus.fileMonitor.monitoring ? 'Active' : 'Stopped'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Directory Status</span>
                <span className={audioStatus.fileMonitor.directoryExists ? "text-green-600" : "text-red-600"}>
                  {audioStatus.fileMonitor.directoryExists ? 'Found' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Scan</span>
                <span>{new Date(audioStatus.fileMonitor.lastScanTime).toLocaleTimeString()}</span>
              </div>
              <Button
                onClick={handleCallLinking}
                size="sm"
                variant="outline"
                className="w-full"
              >
                <Link className="h-4 w-4 mr-1" />
                Link Split Calls
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Audio Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Test Transcript</label>
                <textarea
                  value={testTranscription}
                  onChange={(e) => setTestTranscription(e.target.value)}
                  placeholder="Enter test emergency transcript..."
                  className="w-full p-3 border rounded-md resize-none h-20 text-sm"
                />
                <Button 
                  onClick={handleTestTranscription}
                  disabled={!testTranscription.trim() || testLoading}
                  className="w-full"
                  size="sm"
                >
                  {testLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Test Transcription
                    </>
                  )}
                </Button>
              </div>

              <div className="border-t pt-4 space-y-2">
                <label className="text-sm font-medium">Upload Audio File</label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioUpload}
                    disabled={audioUploadLoading}
                    className="flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {audioUploadLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {audioUploadResult && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="text-sm space-y-1">
                      <p><strong>Type:</strong> {audioUploadResult.classification?.callType}</p>
                      <p><strong>Priority:</strong> {audioUploadResult.classification?.priority}</p>
                      <p><strong>Confidence:</strong> {(audioUploadResult.transcription?.confidence * 100).toFixed(1)}%</p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rdio">
          <RdioScannerControl />
        </TabsContent>
      </Tabs>
    </div>
  );
}
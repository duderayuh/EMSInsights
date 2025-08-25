import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/useWebSocket";
import WaveSurfer from "wavesurfer.js";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Download, 
  Link2, 
  SkipForward,
  Radio,
  Loader2
} from "lucide-react";

interface TalkGroup {
  talkgroupId: string;
  displayName: string;
  systemName: string;
  category?: string;
  isMonitored: boolean;
}

interface AudioFile {
  id: string;
  audioSegmentId?: string;
  rdioCallId?: number;
  timestamp: string;
  duration: number;
  talkgroup: string;
  audioUrl?: string;
  title?: string;
  callType?: string;
  location?: string;
}

export function AudioPlaybar() {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  // Load autoplay state from sessionStorage
  const [autoplay, setAutoplay] = useState(() => {
    const saved = sessionStorage.getItem('audioPlaybarAutoplay');
    return saved !== null ? saved === 'true' : true; // Default to true
  });
  
  // Default to 10202 (countywide dispatch primary)
  const [selectedTalkgroup, setSelectedTalkgroup] = useState<string>(() => {
    const saved = sessionStorage.getItem('audioPlaybarTalkgroup');
    return saved || "10202";
  });
  const [currentAudio, setCurrentAudio] = useState<AudioFile | null>(null);
  const [audioQueue, setAudioQueue] = useState<AudioFile[]>([]);
  const processedCallsRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  
  // Connect to WebSocket for real-time call updates
  const { calls: liveCalls } = useWebSocket('/ws');

  // Hardcode the main talkgroups that are always available
  const defaultTalkgroups: TalkGroup[] = [
    {
      talkgroupId: "10202",
      displayName: "Countywide Dispatch Primary",
      systemName: "Marion County",
      category: "Dispatch",
      isMonitored: true
    },
    {
      talkgroupId: "10258",
      displayName: "Hospital Communications",
      systemName: "Marion County",
      category: "Hospital",
      isMonitored: true
    },
    {
      talkgroupId: "10270",
      displayName: "Fire Dispatch",
      systemName: "Marion County",
      category: "Fire",
      isMonitored: true
    }
  ];
  
  // Fetch available talkgroups from API and merge with defaults
  const { data: apiTalkgroups = [] } = useQuery<TalkGroup[]>({
    queryKey: ['/api/talkgroups'],
    refetchInterval: 30000,
  });
  
  // Merge API talkgroups with defaults, avoiding duplicates
  const talkgroups = [...defaultTalkgroups, ...apiTalkgroups.filter(tg => 
    !defaultTalkgroups.some(dt => dt.talkgroupId === tg.talkgroupId)
  )];

  // Track last check time for processing
  const lastCheckTimeRef = useRef<number>(Date.now());
  
  // Process new and updated calls from WebSocket when autoplay is enabled
  useEffect(() => {
    if (!autoplay) return;
    if (!liveCalls || liveCalls.length === 0) return;
    
    // Find calls that should be auto-played
    const eligibleCalls = liveCalls.filter(call => {
      // Create unique ID for tracking
      const uniqueId = `${call.id}-${call.audioSegmentId || 'no-audio'}`;
      
      // Skip if already processed
      if (processedCallsRef.current.has(uniqueId)) return false;
      
      // Must have audio segment ID to play
      const hasAudio = call.audioSegmentId;
      if (!hasAudio) return false;
      
      // Check talkgroup match
      const matchesTalkgroup = selectedTalkgroup === "all" || 
        (call.talkgroup && call.talkgroup === selectedTalkgroup);
      if (!matchesTalkgroup) return false;
      
      // Check if call is dispatch (not hospital)
      const isDispatchCall = !call.talkgroup || 
        (call.talkgroup !== '10258' && call.talkgroup !== '10255' && call.talkgroup !== '10256');
      if (!isDispatchCall) return false;
      
      // Check if call is recent (within last 10 minutes to allow for processing time)
      const callTime = new Date(call.timestamp).getTime();
      const isRecent = (Date.now() - callTime) < 10 * 60 * 1000;
      if (!isRecent) return false;
      
      return true;
    });
    
    if (eligibleCalls.length > 0) {
      console.log(`[AudioPlaybar] Found ${eligibleCalls.length} eligible calls for auto-play`);
      
      // Sort by timestamp (oldest first for queue order)
      const sortedCalls = eligibleCalls.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Add to queue
      const newAudioFiles: AudioFile[] = sortedCalls.map(call => {
        const uniqueId = `${call.id}-${call.audioSegmentId || 'no-audio'}`;
        processedCallsRef.current.add(uniqueId);
        
        console.log(`[AudioPlaybar] Queuing call ${call.id}: ${call.callType} at ${call.location || 'unknown location'}`);
        
        return {
          id: uniqueId,
          audioSegmentId: call.audioSegmentId,
          timestamp: call.timestamp instanceof Date ? call.timestamp.toISOString() : call.timestamp,
          duration: 0,
          talkgroup: call.talkgroup || '',
          title: `${call.callType || (call.transcript ? 'Dispatch' : 'New Call')} at ${call.location || 'Location TBD'}`,
          callType: call.callType || 'Dispatch',
          location: call.location || 'Processing...'
        };
      });
      
      setAudioQueue(prev => {
        // Add new items and limit queue size to 20 items
        const updated = [...prev, ...newAudioFiles].slice(0, 20);
        console.log(`[AudioPlaybar] Queue updated: ${updated.length} items total`);
        return updated;
      });
      
      // Start playing if nothing is currently playing
      if (!currentAudio && !isPlaying && newAudioFiles.length > 0) {
        const firstItem = newAudioFiles[0];
        console.log('[AudioPlaybar] Auto-starting playback of first item:', firstItem.id);
        setCurrentAudio(firstItem);
        setAudioQueue(prev => prev.slice(1));
      }
    }
    
    // Update last check time
    lastCheckTimeRef.current = Date.now();
  }, [liveCalls, autoplay, selectedTalkgroup, currentAudio, isPlaying]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (waveformRef.current && !wavesurferRef.current) {
      wavesurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: 'rgba(96, 165, 250, 0.5)', // Light blue with opacity
        progressColor: 'rgba(59, 130, 246, 0.9)', // Brighter blue for progress
        cursorColor: 'rgba(255, 255, 255, 0.7)',
        barWidth: 3,
        barRadius: 4,
        barGap: 2,
        height: 40,
        normalize: true,
        backend: 'MediaElement',
      });

      wavesurferRef.current.on('ready', () => {
        setDuration(wavesurferRef.current?.getDuration() || 0);
      });

      wavesurferRef.current.on('audioprocess', () => {
        setCurrentTime(wavesurferRef.current?.getCurrentTime() || 0);
      });

      wavesurferRef.current.on('play', () => setIsPlaying(true));
      wavesurferRef.current.on('pause', () => setIsPlaying(false));
      wavesurferRef.current.on('finish', () => {
        setIsPlaying(false);
      });
    }

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, []);
  
  // Handle audio finished - runs when wavesurfer fires 'finish' event
  useEffect(() => {
    if (!isPlaying && wavesurferRef.current && currentAudio) {
      const handleFinish = () => {
        console.log('[AudioPlaybar] Audio finished, checking queue...', { queueLength: audioQueue.length, autoplay });
        // Auto-play next in queue if autoplay is enabled
        if (audioQueue.length > 0 && autoplay) {
          const nextAudio = audioQueue[0];
          console.log('[AudioPlaybar] Playing next in queue:', nextAudio.title || nextAudio.id);
          setCurrentAudio(nextAudio);
          setAudioQueue(prev => prev.slice(1));
        } else if (autoplay) {
          console.log('[AudioPlaybar] Queue empty, waiting for new calls...');
          setCurrentAudio(null);
        } else {
          console.log('[AudioPlaybar] Autoplay disabled, stopping playback');
          setCurrentAudio(null);
        }
      };
      
      wavesurferRef.current.on('finish', handleFinish);
      return () => {
        wavesurferRef.current?.un('finish', handleFinish);
      };
    }
  }, [isPlaying, autoplay, audioQueue, currentAudio]);

  // Load audio when currentAudio changes
  useEffect(() => {
    if (currentAudio && wavesurferRef.current) {
      const audioUrl = currentAudio.audioUrl || 
        (currentAudio.audioSegmentId ? `/api/audio/segment/${currentAudio.audioSegmentId}` : null);
      
      if (audioUrl) {
        console.log('Loading audio:', audioUrl);
        wavesurferRef.current.load(audioUrl);
        // Auto-play when loaded if autoplay is enabled
        wavesurferRef.current.once('ready', () => {
          if (autoplay) {
            wavesurferRef.current?.play();
          }
        });
      }
    }
  }, [currentAudio]);

  // Update volume
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted]);

  // Clean up old processed calls periodically
  useEffect(() => {
    const interval = setInterval(() => {
      // Keep only the last 50 processed call IDs
      if (processedCallsRef.current.size > 50) {
        const callIds = Array.from(processedCallsRef.current);
        processedCallsRef.current = new Set(callIds.slice(-50));
        console.log('[AudioPlaybar] Cleaned up old processed calls, keeping last 50');
      }
    }, 30000); // Clean up every 30 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Save autoplay state changes to sessionStorage
  useEffect(() => {
    console.log('[AudioPlaybar] Autoplay state changed:', autoplay);
    sessionStorage.setItem('audioPlaybarAutoplay', String(autoplay));
    if (autoplay) {
      console.log('[AudioPlaybar] Autoplay enabled - will queue new dispatch calls automatically');
    }
  }, [autoplay]);
  
  // Save selected talkgroup to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('audioPlaybarTalkgroup', selectedTalkgroup);
  }, [selectedTalkgroup]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      if (isPlaying) {
        wavesurferRef.current.pause();
      } else {
        wavesurferRef.current.play();
      }
    }
  };

  const handleSkipNext = () => {
    if (audioQueue.length > 0) {
      const [next, ...rest] = audioQueue;
      setCurrentAudio(next);
      setAudioQueue(rest);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
  };

  const handleDownload = async () => {
    if (currentAudio) {
      const audioUrl = currentAudio.audioUrl || 
        (currentAudio.audioSegmentId ? `/api/audio/segment/${currentAudio.audioSegmentId}` : null);
      
      if (audioUrl) {
        try {
          // Fetch the audio file
          const response = await fetch(audioUrl);
          const blob = await response.blob();
          
          // Create a blob URL and download
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `dispatch_${currentAudio.callType?.replace(/[^a-zA-Z0-9]/g, '_') || 'call'}_${new Date(currentAudio.timestamp).toISOString().slice(0, 19).replace(/[^0-9]/g, '')}.m4a`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Clean up the blob URL
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } catch (error) {
          console.error('Error downloading audio:', error);
          toast({
            title: "Download Failed",
            description: "Unable to download audio file",
            variant: "destructive"
          });
        }
      }
    }
  };

  const handleCopyLink = async () => {
    if (currentAudio) {
      const audioUrl = currentAudio.audioUrl || 
        (currentAudio.audioSegmentId ? `/api/audio/segment/${currentAudio.audioSegmentId}` : null);
      
      if (audioUrl) {
        const fullUrl = `${window.location.origin}${audioUrl}`;
        try {
          await navigator.clipboard.writeText(fullUrl);
          toast({
            title: "Link Copied",
            description: "Direct audio link copied to clipboard",
          });
        } catch (error) {
          console.error('Error copying link:', error);
          toast({
            title: "Copy Failed",
            description: "Unable to copy link to clipboard",
            variant: "destructive"
          });
        }
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get filtered talkgroups that are monitored
  const monitoredTalkgroups = talkgroups.filter(tg => tg.isMonitored);

  return (
    <Card className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-gray-900/95 to-gray-800/95 backdrop-blur-xl border-t border-gray-700 shadow-2xl">
      <div className="px-3 sm:px-6 py-2 sm:py-3">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          {/* Mobile Layout - First Row */}
          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
            {/* Talkgroup Selector */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-initial sm:min-w-[240px]">
              <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10 backdrop-blur">
                <Radio className="h-3.5 sm:h-4 w-3.5 sm:w-4 text-blue-400" />
              </div>
              <Select value={selectedTalkgroup} onValueChange={setSelectedTalkgroup}>
                <SelectTrigger className="w-[140px] sm:w-[180px] bg-gray-800/50 border-gray-700 hover:bg-gray-700/50 transition-colors text-xs sm:text-sm">
                  <SelectValue placeholder="Select Talkgroup" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="all">All Talkgroups</SelectItem>
                  <SelectItem value="10202">Countywide Dispatch Primary</SelectItem>
                  <SelectItem value="10258">Hospital Communications</SelectItem>
                  <SelectItem value="10270">Fire Dispatch</SelectItem>
                  {monitoredTalkgroups
                    .filter(tg => !['10202', '10258', '10270'].includes(tg.talkgroupId))
                    .map(tg => (
                      <SelectItem key={tg.talkgroupId} value={tg.talkgroupId}>
                        {tg.displayName}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant={isPlaying ? "default" : "secondary"}
                onClick={handlePlayPause}
                disabled={!currentAudio}
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all"
              >
                {isPlaying ? 
                  <Pause className="h-4 sm:h-5 w-4 sm:w-5 text-white" /> : 
                  <Play className="h-4 sm:h-5 w-4 sm:w-5 text-white ml-0.5" />
                }
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={handleSkipNext}
                disabled={audioQueue.length === 0}
                className="h-7 w-7 sm:h-9 sm:w-9 rounded-full hover:bg-gray-700/50 disabled:opacity-30"
              >
                <SkipForward className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              </Button>
            </div>

            {/* Mobile Only - Queue Badge */}
            <div className="sm:hidden">
              {audioQueue.length > 0 && (
                <Badge variant="secondary" className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                  {audioQueue.length}
                </Badge>
              )}
            </div>
          </div>

          {/* Waveform - Full Width on Mobile */}
          <div className="w-full sm:flex-1 flex items-center gap-2 sm:gap-3 bg-gray-800/30 rounded-lg px-2 sm:px-3 py-1">
            <span className="text-[10px] sm:text-xs font-mono text-blue-400 w-10 sm:w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <div ref={waveformRef} className="flex-1 h-10 sm:h-12 rounded" />
            <span className="text-[10px] sm:text-xs font-mono text-gray-400 w-10 sm:w-12">
              {formatTime(duration)}
            </span>
          </div>

          {/* Desktop Only - Additional Controls */}
          <div className="hidden sm:flex items-center gap-4">
            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsMuted(!isMuted)}
                className="h-8 w-8 rounded-full hover:bg-gray-700/50"
              >
                {isMuted ? 
                  <VolumeX className="h-4 w-4 text-gray-400" /> : 
                  <Volume2 className="h-4 w-4 text-gray-300" />
                }
              </Button>
              <Slider
                value={[volume]}
                onValueChange={handleVolumeChange}
                max={1}
                step={0.05}
                className="w-20"
              />
            </div>

            {/* Autoplay Toggle */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-800/30">
              <Label htmlFor="autoplay" className="text-xs text-gray-400 cursor-pointer">
                Autoplay New Calls
              </Label>
              <Switch
                id="autoplay"
                checked={autoplay}
                onCheckedChange={(checked) => {
                  setAutoplay(checked);
                  console.log('[AudioPlaybar] Autoplay toggled:', checked);
                }}
                className="data-[state=checked]:bg-green-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDownload}
                disabled={!currentAudio}
                className="h-8 w-8 rounded-full hover:bg-gray-700/50 disabled:opacity-30"
                title="Download Audio"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCopyLink}
                disabled={!currentAudio}
                className="h-8 w-8 rounded-full hover:bg-gray-700/50 disabled:opacity-30"
                title="Copy Link"
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Queue Indicator */}
            {audioQueue.length > 0 && (
              <Badge variant="secondary" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                Queue: {audioQueue.length}
              </Badge>
            )}
            
            {/* New Call Indicator */}
            {autoplay && audioQueue.length === 0 && (
              <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
                Auto-play Active
              </Badge>
            )}

            {/* Loading Indicator */}
            {!currentAudio && selectedTalkgroup !== "all" && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Waiting...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
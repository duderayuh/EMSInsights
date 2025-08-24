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
}

export function AudioPlaybar() {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [selectedTalkgroup, setSelectedTalkgroup] = useState<string>("all");
  const [currentAudio, setCurrentAudio] = useState<AudioFile | null>(null);
  const [audioQueue, setAudioQueue] = useState<AudioFile[]>([]);
  const { toast } = useToast();

  // Fetch available talkgroups
  const { data: talkgroups = [] } = useQuery<TalkGroup[]>({
    queryKey: ['/api/talkgroups'],
    refetchInterval: 30000,
  });

  // Fetch live audio stream for selected talkgroup
  const { data: liveAudio } = useQuery<AudioFile[]>({
    queryKey: ['/api/audio/live', selectedTalkgroup],
    refetchInterval: 2000,
    enabled: selectedTalkgroup !== "all"
  });

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
        if (autoplay && audioQueue.length > 0) {
          playNextInQueue();
        }
      });
    }

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, []);

  // Load audio when currentAudio changes
  useEffect(() => {
    if (currentAudio && wavesurferRef.current) {
      const audioUrl = currentAudio.audioUrl || 
        (currentAudio.audioSegmentId ? `/api/audio/segment/${currentAudio.audioSegmentId}` :
         currentAudio.rdioCallId ? `/api/audio/rdio/${currentAudio.rdioCallId}` : null);
      
      if (audioUrl) {
        wavesurferRef.current.load(audioUrl);
        if (autoplay) {
          wavesurferRef.current.play();
        }
      }
    }
  }, [currentAudio, autoplay]);

  // Update volume
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted]);

  // Handle live audio updates
  useEffect(() => {
    if (liveAudio && liveAudio.length > 0) {
      const newAudio = liveAudio[0];
      if (!currentAudio || currentAudio.id !== newAudio.id) {
        if (autoplay) {
          setCurrentAudio(newAudio);
        } else {
          setAudioQueue(prev => [...prev, newAudio].slice(-10)); // Keep last 10 items
        }
      }
    }
  }, [liveAudio, currentAudio, autoplay]);

  const playNextInQueue = () => {
    if (audioQueue.length > 0) {
      const [next, ...rest] = audioQueue;
      setCurrentAudio(next);
      setAudioQueue(rest);
    }
  };

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
    playNextInQueue();
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
  };

  const handleDownload = () => {
    if (currentAudio) {
      const audioUrl = currentAudio.audioUrl || 
        (currentAudio.audioSegmentId ? `/api/audio/segment/${currentAudio.audioSegmentId}` :
         currentAudio.rdioCallId ? `/api/audio/rdio/${currentAudio.rdioCallId}` : null);
      
      if (audioUrl) {
        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = `talkgroup_${currentAudio.talkgroup}_${currentAudio.timestamp}.m4a`;
        link.click();
      }
    }
  };

  const handleCopyLink = () => {
    if (currentAudio) {
      const clipUrl = `${window.location.origin}/audio/${currentAudio.id}`;
      navigator.clipboard.writeText(clipUrl);
      toast({
        title: "Link Copied",
        description: "Audio clip link has been copied to clipboard",
      });
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
                  {monitoredTalkgroups.map(tg => (
                    <SelectItem key={tg.talkgroupId} value={tg.talkgroupId}>
                      {tg.displayName}
                    </SelectItem>
                  ))}
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
                Autoplay
              </Label>
              <Switch
                id="autoplay"
                checked={autoplay}
                onCheckedChange={setAutoplay}
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
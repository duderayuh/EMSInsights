import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ToggleLeft,
  ToggleRight,
  Radio
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
        waveColor: '#4CAF50',
        progressColor: '#2196F3',
        cursorColor: '#fff',
        barWidth: 2,
        barRadius: 3,
        height: 48,
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
    <Card className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur border-t">
      <div className="flex items-center gap-4">
        {/* Talkgroup Selector */}
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedTalkgroup} onValueChange={setSelectedTalkgroup}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select Talkgroup" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Talkgroups</SelectItem>
              {monitoredTalkgroups.map(tg => (
                <SelectItem key={tg.talkgroupId} value={tg.talkgroupId}>
                  {tg.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Play/Pause Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handlePlayPause}
          disabled={!currentAudio}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        {/* Skip Next */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSkipNext}
          disabled={audioQueue.length === 0}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        {/* Waveform */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12">
            {formatTime(currentTime)}
          </span>
          <div ref={waveformRef} className="flex-1 h-12" />
          <span className="text-xs text-muted-foreground w-12">
            {formatTime(duration)}
          </span>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Slider
            value={[volume]}
            onValueChange={handleVolumeChange}
            max={1}
            step={0.1}
            className="w-24"
          />
        </div>

        {/* Autoplay Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Autoplay</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAutoplay(!autoplay)}
          >
            {autoplay ? 
              <ToggleRight className="h-4 w-4 text-green-500" /> : 
              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            }
          </Button>
        </div>

        {/* Download and Link Buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            disabled={!currentAudio}
            title="Download Audio"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyLink}
            disabled={!currentAudio}
            title="Copy Link"
          >
            <Link2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Queue Indicator */}
        {audioQueue.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Queue: {audioQueue.length}
          </div>
        )}
      </div>
    </Card>
  );
}
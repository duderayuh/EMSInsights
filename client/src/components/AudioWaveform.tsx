import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioWaveformProps {
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onDuration?: (duration: number) => void;
  onEnded?: () => void;
  height?: number;
  waveColor?: string;
  progressColor?: string;
  disabled?: boolean;
}

export function AudioWaveform({
  audioUrl,
  isPlaying,
  onPlayPause,
  onTimeUpdate,
  onDuration,
  onEnded,
  height = 60,
  waveColor = '#94a3b8',
  progressColor = '#3b82f6',
  disabled = false
}: AudioWaveformProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl || disabled) return;

    // Create WaveSurfer instance
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor,
      progressColor,
      cursorColor: '#1e40af',
      barWidth: 2,
      barRadius: 3,
      height,
      normalize: true,
      backend: 'WebAudio',
      interact: true,
      dragToSeek: true
    });

    wavesurferRef.current = wavesurfer;
    setIsLoading(true);
    setError(false);

    // Load audio
    wavesurfer.load(audioUrl);

    // Event handlers
    wavesurfer.on('ready', () => {
      setIsLoading(false);
      if (onDuration) {
        onDuration(wavesurfer.getDuration());
      }
    });

    wavesurfer.on('error', (err) => {
      console.error('Waveform error:', err);
      setIsLoading(false);
      setError(true);
    });

    wavesurfer.on('audioprocess', () => {
      if (onTimeUpdate) {
        onTimeUpdate(wavesurfer.getCurrentTime());
      }
    });

    wavesurfer.on('finish', () => {
      if (onEnded) {
        onEnded();
      }
    });

    wavesurfer.on('interaction', () => {
      if (onTimeUpdate) {
        onTimeUpdate(wavesurfer.getCurrentTime());
      }
    });

    // Cleanup
    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
    };
  }, [audioUrl, height, waveColor, progressColor, disabled]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!wavesurferRef.current || disabled) return;

    if (isPlaying) {
      wavesurferRef.current.play();
    } else {
      wavesurferRef.current.pause();
    }
  }, [isPlaying, disabled]);

  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (disabled || error) {
    return (
      <div className="flex items-center justify-center h-16 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {error ? 'Audio unavailable' : 'No audio'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className={`w-8 h-8 rounded-full p-0 ${
            disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
          }`}
          onClick={onPlayPause}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-white" />
          ) : isPlaying ? (
            <Pause className="h-3 w-3 text-white" />
          ) : (
            <Play className="h-3 w-3 text-white ml-0.5" />
          )}
        </Button>
        <div className="flex-1">
          <div ref={waveformRef} className="w-full" />
          {isLoading && (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              <span className="ml-2 text-xs text-gray-500">Loading waveform...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface AudioAnalysis {
  isPureNoise: boolean;
  hasVoiceActivity: boolean;
  duration: number;
  silenceRatio: number;
  energyRatio: number;
  trimmedFilePath?: string;
  error?: string;
}

export class AudioPreprocessor {
  // Energy threshold for detecting beeps/tones vs voice
  private readonly BEEP_ENERGY_THRESHOLD = 0.85; // Lowered for better beep detection
  private readonly MIN_VOICE_DURATION = 0.5; // seconds
  private readonly SILENCE_THRESHOLD = -35; // dB - adjusted for dispatch radio quality
  private readonly STATIC_FREQUENCY_THRESHOLD = 0.8; // Threshold for static detection
  private readonly DISPATCH_MIN_SPEECH_RATIO = 0.2; // Minimum speech ratio for valid dispatch audio

  async analyzeAudio(audioPath: string): Promise<AudioAnalysis> {
    if (!existsSync(audioPath)) {
      return {
        isPureNoise: true,
        hasVoiceActivity: false,
        duration: 0,
        silenceRatio: 1,
        energyRatio: 0,
        error: 'Audio file not found'
      };
    }

    try {
      console.log(`Analyzing audio for dispatch content: ${audioPath}`);
      
      // Get audio duration and basic info
      const duration = await this.getAudioDuration(audioPath);
      console.log(`Audio duration: ${duration.toFixed(2)}s`);
      
      // Analyze for beeps/tones using FFmpeg
      const energyAnalysis = await this.analyzeEnergyDistribution(audioPath);
      
      // Detect voice activity and silence
      const voiceAnalysis = await this.detectVoiceActivity(audioPath);
      
      // Trim silence if voice is detected
      let trimmedFilePath: string | undefined;
      if (voiceAnalysis.hasVoice && voiceAnalysis.silenceRatio < 0.7) {
        trimmedFilePath = await this.trimSilence(audioPath);
      }

      // Determine if it's pure noise/beeps
      const isPureNoise = this.isPureNoiseOrBeeps(energyAnalysis, voiceAnalysis);

      return {
        isPureNoise,
        hasVoiceActivity: voiceAnalysis.hasVoice,
        duration,
        silenceRatio: voiceAnalysis.silenceRatio,
        energyRatio: energyAnalysis.monoToneRatio,
        trimmedFilePath
      };
    } catch (error) {
      console.error('Audio preprocessing error:', error);
      return {
        isPureNoise: false,
        hasVoiceActivity: true, // Assume voice to be safe
        duration: 0,
        silenceRatio: 0,
        energyRatio: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getAudioDuration(audioPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      return parseFloat(stdout.trim()) || 0;
    } catch (error) {
      console.error('Error getting audio duration:', error);
      return 0;
    }
  }

  private async analyzeEnergyDistribution(audioPath: string): Promise<{ monoToneRatio: number }> {
    try {
      // Use FFmpeg to analyze frequency spectrum
      const { stdout } = await execAsync(
        `ffmpeg -i "${audioPath}" -af "showfreqs=s=1024x512:mode=line:fscale=log" -f null - 2>&1 | grep -E "freq\\[|mag\\[" | head -20`
      );

      // Simple heuristic: if most energy is concentrated in narrow frequency bands, it's likely a beep/tone
      // This is a simplified approach - in production, you'd want more sophisticated FFT analysis
      
      // Alternative: analyze RMS energy variations
      const { stdout: rmsOutput } = await execAsync(
        `ffmpeg -i "${audioPath}" -af "astats=metadata=1:reset=1" -f null - 2>&1 | grep "RMS level" | head -10`
      );

      // If RMS levels are very consistent, it's likely a monotone beep
      const rmsValues = rmsOutput.match(/-?\d+\.\d+/g)?.map(v => parseFloat(v)) || [];
      if (rmsValues.length > 0) {
        const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
        const variance = rmsValues.reduce((sum, val) => sum + Math.pow(val - avgRms, 2), 0) / rmsValues.length;
        const stdDev = Math.sqrt(variance);
        
        // Low standard deviation in RMS = monotone sound
        const monoToneRatio = stdDev < 3 ? 0.9 : 0.3;
        return { monoToneRatio };
      }

      return { monoToneRatio: 0.5 }; // Uncertain
    } catch (error) {
      console.error('Error analyzing energy distribution:', error);
      return { monoToneRatio: 0.5 };
    }
  }

  private async detectVoiceActivity(audioPath: string): Promise<{ hasVoice: boolean; silenceRatio: number }> {
    try {
      // Use FFmpeg silencedetect filter
      const { stderr } = await execAsync(
        `ffmpeg -i "${audioPath}" -af "silencedetect=n=${this.SILENCE_THRESHOLD}dB:d=0.3" -f null - 2>&1`
      );

      // Parse silence detection output
      const silenceMatches = stderr.match(/silence_duration: (\d+\.?\d*)/g) || [];
      const totalSilence = silenceMatches.reduce((sum, match) => {
        const duration = parseFloat(match.split(':')[1]);
        return sum + duration;
      }, 0);

      const audioDuration = await this.getAudioDuration(audioPath);
      const silenceRatio = audioDuration > 0 ? totalSilence / audioDuration : 1;

      // If more than 90% silence, probably no voice
      const hasVoice = silenceRatio < 0.9 && audioDuration > this.MIN_VOICE_DURATION;

      return { hasVoice, silenceRatio };
    } catch (error) {
      console.error('Error detecting voice activity:', error);
      return { hasVoice: true, silenceRatio: 0.5 }; // Assume voice to be safe
    }
  }

  private async trimSilence(audioPath: string): Promise<string | undefined> {
    try {
      const outputPath = audioPath.replace(/\.(\w+)$/, '_trimmed.$1');
      
      // Use FFmpeg to remove silence from beginning and end
      await execAsync(
        `ffmpeg -i "${audioPath}" -af "silenceremove=start_periods=1:start_duration=0.2:start_threshold=${this.SILENCE_THRESHOLD}dB:detection=peak,aformat=dblp,areverse,silenceremove=start_periods=1:start_duration=0.2:start_threshold=${this.SILENCE_THRESHOLD}dB:detection=peak,aformat=dblp,areverse" -y "${outputPath}"`
      );

      if (existsSync(outputPath)) {
        return outputPath;
      }
    } catch (error) {
      console.error('Error trimming silence:', error);
    }
    return undefined;
  }

  private isPureNoiseOrBeeps(
    energyAnalysis: { monoToneRatio: number },
    voiceAnalysis: { hasVoice: boolean; silenceRatio: number }
  ): boolean {
    // If no voice activity detected
    if (!voiceAnalysis.hasVoice) {
      console.log('Audio detected as pure noise: No voice activity');
      return true;
    }

    // If energy distribution suggests monotone beep
    if (energyAnalysis.monoToneRatio > this.BEEP_ENERGY_THRESHOLD) {
      console.log(`Audio detected as beep/tone: Monotone ratio ${energyAnalysis.monoToneRatio.toFixed(2)}`);
      return true;
    }

    // If mostly silence
    if (voiceAnalysis.silenceRatio > 0.95) {
      console.log(`Audio detected as silence: Silence ratio ${voiceAnalysis.silenceRatio.toFixed(2)}`);
      return true;
    }
    
    // Additional check for dispatch radio static patterns
    if (energyAnalysis.monoToneRatio > 0.7 && voiceAnalysis.silenceRatio > 0.5) {
      console.log('Audio detected as radio static: Combined high monotone and silence');
      return true;
    }
    
    // Check for too little speech content for dispatch audio
    const speechRatio = 1 - voiceAnalysis.silenceRatio;
    if (speechRatio < this.DISPATCH_MIN_SPEECH_RATIO) {
      console.log(`Audio has insufficient speech content: ${(speechRatio * 100).toFixed(1)}%`);
      return true;
    }

    return false;
  }

  async cleanupTrimmedFile(trimmedPath: string): Promise<void> {
    try {
      if (existsSync(trimmedPath)) {
        const { unlink } = await import('fs/promises');
        await unlink(trimmedPath);
      }
    } catch (error) {
      console.error('Error cleaning up trimmed file:', error);
    }
  }
}

export const audioPreprocessor = new AudioPreprocessor();
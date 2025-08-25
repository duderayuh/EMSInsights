import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface AudioEnhancementOptions {
  enableNoiseReduction?: boolean;
  enableNormalization?: boolean;
  enableHighPassFilter?: boolean;
  enableCompression?: boolean;
  enableSilenceTrimming?: boolean;
  targetLoudness?: number; // in LUFS
  highPassFrequency?: number; // in Hz
}

export interface AudioAnalysisResult {
  duration: number;
  averageLoudness: number;
  peakAmplitude: number;
  signalToNoiseRatio: number;
  hasClipping: boolean;
  silenceRatio: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
}

class AudioEnhancementService {
  private tempDir = '/tmp/audio_enhancement';
  
  constructor() {
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Analyze audio quality metrics
   */
  async analyzeAudioQuality(audioPath: string): Promise<AudioAnalysisResult> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', audioPath,
        '-af', 'loudnorm=print_format=json',
        '-f', 'null',
        '-'
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg analysis failed: ${stderr}`));
          return;
        }

        try {
          // Parse loudness metrics from FFmpeg output - find the JSON block
          const loudnormMatch = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
          let averageLoudness = -23; // Default LUFS
          
          if (loudnormMatch) {
            try {
              // Clean up the JSON string before parsing
              const cleanJson = loudnormMatch[0].replace(/\s+/g, ' ').trim();
              const metrics = JSON.parse(cleanJson);
              averageLoudness = parseFloat(metrics.input_i || -23);
            } catch (jsonError) {
              console.warn('Could not parse loudness metrics, using defaults:', jsonError);
            }
          }

          // Extract duration
          const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          let duration = 0;
          if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
          }

          // Estimate signal-to-noise ratio based on loudness
          const snr = Math.max(0, 60 + averageLoudness); // Rough estimation
          
          // Determine quality based on metrics
          let quality: 'poor' | 'fair' | 'good' | 'excellent';
          if (snr < 10 || averageLoudness < -40) {
            quality = 'poor';
          } else if (snr < 20 || averageLoudness < -30) {
            quality = 'fair';
          } else if (snr < 30 || averageLoudness < -20) {
            quality = 'good';
          } else {
            quality = 'excellent';
          }

          resolve({
            duration,
            averageLoudness,
            peakAmplitude: 0, // Would need additional processing
            signalToNoiseRatio: snr,
            hasClipping: stderr.includes('clipping'),
            silenceRatio: 0, // Would need additional processing
            quality
          });
        } catch (error) {
          reject(error);
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Enhance audio with multiple processing techniques
   */
  async enhanceAudio(
    inputPath: string,
    options: AudioEnhancementOptions = {}
  ): Promise<string> {
    const {
      enableNoiseReduction = true,
      enableNormalization = true,
      enableHighPassFilter = true,
      enableCompression = true,
      enableSilenceTrimming = true,
      targetLoudness = -16,
      highPassFrequency = 100
    } = options;

    const outputPath = path.join(this.tempDir, `enhanced_${uuidv4()}.wav`);
    const filters: string[] = [];

    // Build filter chain
    if (enableHighPassFilter) {
      // Remove low-frequency rumble and noise
      filters.push(`highpass=f=${highPassFrequency}`);
    }

    if (enableNoiseReduction) {
      // Apply noise reduction using spectral subtraction
      filters.push('afftdn=nf=-25:nt=w:om=o');
    }

    if (enableCompression) {
      // Apply dynamic range compression for more consistent volume
      filters.push('compand=attacks=0.3:decays=0.8:soft-knee=2:points=-80/-80|-60/-40|-40/-30|-20/-20|0/-10');
    }

    if (enableSilenceTrimming) {
      // Remove silence at beginning and end
      filters.push('silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse');
    }

    if (enableNormalization) {
      // Normalize audio to target loudness
      filters.push(`loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11`);
    }

    // Add clarity enhancement for speech
    filters.push('equalizer=f=3000:t=h:w=200:g=3'); // Boost speech frequencies

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-af', filters.join(','),
        '-ar', '16000', // Optimal sample rate for Whisper
        '-ac', '1', // Convert to mono for better speech recognition
        '-c:a', 'pcm_s16le', // 16-bit PCM format
        '-y', // Overwrite output
        outputPath
      ];

      console.log(`Enhancing audio with filters: ${filters.join(' → ')}`);
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`Audio enhanced successfully: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg enhancement failed: ${stderr}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Apply advanced speech enhancement specifically for EMS dispatch audio
   */
  async enhanceEMSAudio(inputPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `ems_enhanced_${uuidv4()}.wav`);

    // EMS-specific enhancement pipeline optimized for radio dispatch
    const filters = [
      // Pre-emphasis filter to boost high frequencies lost in radio transmission
      'aemphasis=mode=reproduction:type=cd',
      
      // Bandpass filter optimized for human speech in radio communications
      'highpass=f=80:poles=2',  // Gentler high-pass to preserve low speech frequencies
      'lowpass=f=4000:poles=2',  // Extended to 4kHz for better consonant clarity
      
      // Advanced spectral noise reduction with aggressive settings for radio noise
      'afftdn=nf=-35:nt=w:om=o:tr=true:bn=0:rf=0.8',
      
      // Remove radio interference patterns (60Hz hum and harmonics)
      'bandreject=f=60:w=3:t=h',
      'bandreject=f=120:w=3:t=h',
      'bandreject=f=180:w=3:t=h',
      
      // Adaptive noise gate to remove static between speech
      'agate=threshold=0.01:attack=0.5:release=50:detection=rms:ratio=10',
      
      // Two-stage compression for consistent volume
      'compand=attacks=0.05:decays=0.1:soft-knee=2:points=-80/-80|-60/-40|-30/-20|-20/-15|-10/-8|0/-3',
      'compand=attacks=0.3:decays=0.8:soft-knee=6:points=-70/-70|-40/-30|-20/-20|-10/-15|0/-10',
      
      // De-esser to reduce sibilance from radio distortion
      'deesser=i=0.4:m=0.5:f=6500:s=4',
      
      // Speech clarity enhancement with focus on intelligibility
      'equalizer=f=250:t=h:w=100:g=-2',    // Reduce muddiness
      'equalizer=f=800:t=q:w=1.5:g=3',     // Boost fundamental speech frequencies
      'equalizer=f=1500:t=q:w=1.5:g=4',    // Enhance voice presence
      'equalizer=f=2800:t=q:w=1.5:g=5',    // Boost consonant clarity
      'equalizer=f=3500:t=q:w=1.5:g=3',    // Additional clarity
      'equalizer=f=5000:t=h:w=500:g=-3',   // Reduce high-frequency noise
      
      // Psychoacoustic enhancement
      'asubboost=dry=0.3:wet=0.7:decay=0.6:feedback=0.9:cutoff=80',
      'aphaser=type=t:speed=0.5:decay=0.4',
      
      // Dynamic range optimization
      'dynaudnorm=f=150:g=15:p=0.9:m=10.0:r=0.0:n=1:c=1:b=1',
      
      // Final loudness normalization for consistent output
      'loudnorm=I=-12:TP=-1:LRA=7:measured_I=-30:measured_LRA=15:measured_TP=-10',
      
      // Aggressive silence removal
      'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB:stop_periods=-1:stop_silence=0.02:stop_threshold=-45dB'
    ];

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-af', filters.join(','),
        '-ar', '16000',  // Optimal for Whisper
        '-ac', '1',      // Mono for speech
        '-c:a', 'pcm_s16le',  // 16-bit PCM
        '-sample_fmt', 's16',  // Ensure 16-bit samples
        '-f', 'wav',     // WAV format
        '-y',
        outputPath
      ];

      console.log('Applying EMS-specific audio enhancement...');
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`EMS audio enhanced: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`EMS enhancement failed: ${stderr}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Clean up temporary enhanced audio files
   */
  async cleanupEnhancedFile(filePath: string): Promise<void> {
    try {
      if (filePath.includes(this.tempDir)) {
        await fs.unlink(filePath);
        console.log(`Cleaned up enhanced audio: ${filePath}`);
      }
    } catch (error) {
      console.error(`Failed to clean up enhanced audio: ${error}`);
    }
  }

  /**
   * Batch process multiple audio files
   */
  async batchEnhance(
    audioPaths: string[],
    options?: AudioEnhancementOptions
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    for (const audioPath of audioPaths) {
      try {
        const enhancedPath = await this.enhanceAudio(audioPath, options);
        results.set(audioPath, enhancedPath);
      } catch (error) {
        console.error(`Failed to enhance ${audioPath}:`, error);
      }
    }
    
    return results;
  }
}

export const audioEnhancementService = new AudioEnhancementService();
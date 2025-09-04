import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

export interface ConversionOptions {
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
  deleteOriginal?: boolean;
  outputDir?: string;
}

export class AudioConverterService {
  private readonly DEFAULT_BITRATE = '64k';
  private readonly DEFAULT_SAMPLE_RATE = 22050;
  private readonly DEFAULT_CHANNELS = 1; // Mono for voice
  private readonly TEMP_DIR = '/tmp/telegram_audio';
  private conversionCache: Map<string, string> = new Map();

  constructor() {
    // Ensure temp directory exists
    this.ensureTempDirectory();
  }

  private async ensureTempDirectory(): Promise<void> {
    try {
      if (!existsSync(this.TEMP_DIR)) {
        const { mkdir } = await import('fs/promises');
        await mkdir(this.TEMP_DIR, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  async convertToMP3(
    inputPath: string,
    options: ConversionOptions = {}
  ): Promise<string> {
    // Check if file exists
    if (!existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Check cache first
    const cacheKey = this.getCacheKey(inputPath);
    if (this.conversionCache.has(cacheKey)) {
      const cachedPath = this.conversionCache.get(cacheKey)!;
      if (existsSync(cachedPath)) {
        console.log(`Using cached MP3: ${cachedPath}`);
        return cachedPath;
      }
      // Cache entry is stale, remove it
      this.conversionCache.delete(cacheKey);
    }

    const {
      bitrate = this.DEFAULT_BITRATE,
      sampleRate = this.DEFAULT_SAMPLE_RATE,
      channels = this.DEFAULT_CHANNELS,
      deleteOriginal = false,
      outputDir = this.TEMP_DIR
    } = options;

    // Generate output filename
    const inputBaseName = path.basename(inputPath, path.extname(inputPath));
    const outputFileName = `${inputBaseName}_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, outputFileName);

    try {
      console.log(`Converting audio to MP3: ${inputPath} -> ${outputPath}`);

      // FFmpeg command for voice-optimized MP3 conversion
      const ffmpegCommand = `ffmpeg -i "${inputPath}" \
        -codec:a libmp3lame \
        -b:a ${bitrate} \
        -ar ${sampleRate} \
        -ac ${channels} \
        -af "compand=.3|.3:1|1:-90/-60|-60/-40|-40/-30|-20/-20:6:0:-90:0.2" \
        -y "${outputPath}"`;

      const { stderr } = await execAsync(ffmpegCommand);
      
      // FFmpeg outputs to stderr even for successful operations
      if (stderr && stderr.includes('error')) {
        console.error('FFmpeg stderr:', stderr);
      }

      // Verify output file was created
      if (!existsSync(outputPath)) {
        throw new Error('MP3 conversion failed - output file not created');
      }

      // Cache the conversion
      this.conversionCache.set(cacheKey, outputPath);

      // Optionally delete original
      if (deleteOriginal && inputPath !== outputPath) {
        try {
          await unlink(inputPath);
          console.log(`Deleted original file: ${inputPath}`);
        } catch (error) {
          console.error('Failed to delete original file:', error);
        }
      }

      // Clean up old cache entries if cache is getting large
      if (this.conversionCache.size > 100) {
        this.cleanupCache();
      }

      console.log(`Audio conversion complete: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('Audio conversion failed:', error);
      throw new Error(`Failed to convert audio: ${error}`);
    }
  }

  async concatenateAudioFiles(
    inputPaths: string[],
    outputFileName?: string
  ): Promise<string> {
    if (inputPaths.length === 0) {
      throw new Error('No input files provided');
    }

    // Filter out non-existent files
    const validPaths = inputPaths.filter(path => existsSync(path));
    if (validPaths.length === 0) {
      throw new Error('No valid input files found');
    }

    const outputName = outputFileName || `combined_${Date.now()}.mp3`;
    const outputPath = path.join(this.TEMP_DIR, outputName);

    try {
      if (validPaths.length === 1) {
        // If only one file, just convert it
        return await this.convertToMP3(validPaths[0]);
      }

      console.log(`Concatenating ${validPaths.length} audio files`);

      // Create a temporary file list for FFmpeg concat
      const listFilePath = path.join(this.TEMP_DIR, `concat_list_${Date.now()}.txt`);
      const fileListContent = validPaths.map(p => `file '${p}'`).join('\n');
      
      const { writeFile } = await import('fs/promises');
      await writeFile(listFilePath, fileListContent);

      // FFmpeg concat command
      const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" \
        -codec:a libmp3lame \
        -b:a ${this.DEFAULT_BITRATE} \
        -ar ${this.DEFAULT_SAMPLE_RATE} \
        -ac ${this.DEFAULT_CHANNELS} \
        -y "${outputPath}"`;

      await execAsync(ffmpegCommand);

      // Clean up list file
      await unlink(listFilePath);

      if (!existsSync(outputPath)) {
        throw new Error('Concatenation failed - output file not created');
      }

      console.log(`Audio concatenation complete: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('Audio concatenation failed:', error);
      throw new Error(`Failed to concatenate audio: ${error}`);
    }
  }

  async getAudioDuration(audioPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      return parseFloat(stdout.trim()) || 0;
    } catch (error) {
      console.error('Failed to get audio duration:', error);
      return 0;
    }
  }

  async getAudioInfo(audioPath: string): Promise<any> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -print_format json -show_format -show_streams "${audioPath}"`
      );
      return JSON.parse(stdout);
    } catch (error) {
      console.error('Failed to get audio info:', error);
      return null;
    }
  }

  private getCacheKey(inputPath: string): string {
    return crypto.createHash('md5').update(inputPath).digest('hex');
  }

  private cleanupCache(): void {
    // Remove entries for files that no longer exist
    const entriesToDelete: string[] = [];
    
    for (const [key, path] of this.conversionCache) {
      if (!existsSync(path)) {
        entriesToDelete.push(key);
      }
    }

    for (const key of entriesToDelete) {
      this.conversionCache.delete(key);
    }

    console.log(`Cleaned up ${entriesToDelete.length} stale cache entries`);
  }

  async cleanupTempFiles(olderThanHours: number = 24): Promise<void> {
    try {
      const { readdir, stat, unlink } = await import('fs/promises');
      const files = await readdir(this.TEMP_DIR);
      const now = Date.now();
      const maxAge = olderThanHours * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith('.mp3')) continue;
        
        const filePath = path.join(this.TEMP_DIR, file);
        const stats = await stat(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          await unlink(filePath);
          console.log(`Deleted old temp file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup temp files:', error);
    }
  }

  clearCache(): void {
    this.conversionCache.clear();
    console.log('Audio conversion cache cleared');
  }
}

export const audioConverter = new AudioConverterService();
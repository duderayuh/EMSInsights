import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class AudioConverterService {
  private ffmpegPath = 'ffmpeg'; // Will use system FFmpeg
  
  constructor() {
    this.checkFfmpegAvailable();
  }
  
  private async checkFfmpegAvailable() {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      console.log('FFmpeg is available for audio conversion');
    } catch (error) {
      console.error('FFmpeg not found. Audio conversion will not be available.');
      console.error('Install FFmpeg to enable audio conversion to MP3');
    }
  }
  
  async convertToMp3(inputPath: string, outputPath?: string): Promise<string | null> {
    try {
      // Check if input file exists
      const inputStats = await fs.stat(inputPath);
      if (!inputStats.isFile()) {
        console.error(`Input file does not exist: ${inputPath}`);
        return null;
      }
      
      // Generate output path if not provided
      if (!outputPath) {
        const dir = path.dirname(inputPath);
        const baseName = path.basename(inputPath, path.extname(inputPath));
        outputPath = path.join(dir, `${baseName}.mp3`);
      }
      
      // Check if MP3 already exists
      try {
        await fs.access(outputPath);
        console.log(`MP3 file already exists: ${outputPath}`);
        return outputPath;
      } catch {
        // File doesn't exist, proceed with conversion
      }
      
      // Build FFmpeg command
      // -i: input file
      // -acodec mp3: use MP3 codec
      // -ab 128k: audio bitrate (128 kbps for good quality/size balance)
      // -ar 44100: sample rate
      // -y: overwrite output file if exists
      const command = `ffmpeg -i "${inputPath}" -acodec mp3 -ab 128k -ar 44100 -y "${outputPath}"`;
      
      console.log(`Converting audio to MP3: ${inputPath} -> ${outputPath}`);
      
      // Execute conversion
      const { stderr } = await execAsync(command, {
        timeout: 30000 // 30 second timeout
      });
      
      // Check if output file was created
      try {
        const outputStats = await fs.stat(outputPath);
        if (outputStats.isFile() && outputStats.size > 0) {
          console.log(`Successfully converted to MP3: ${outputPath} (${outputStats.size} bytes)`);
          return outputPath;
        }
      } catch (error) {
        console.error(`Output file not created: ${outputPath}`);
        return null;
      }
      
      return outputPath;
      
    } catch (error) {
      console.error('Error converting audio to MP3:', error);
      return null;
    }
  }
  
  async convertM4aToMp3(inputPath: string): Promise<string | null> {
    // Specialized method for M4A to MP3 conversion
    return this.convertToMp3(inputPath);
  }
  
  async convertWavToMp3(inputPath: string): Promise<string | null> {
    // Specialized method for WAV to MP3 conversion
    return this.convertToMp3(inputPath);
  }
  
  async batchConvert(inputPaths: string[]): Promise<Array<{ input: string; output: string | null }>> {
    const results = [];
    
    for (const inputPath of inputPaths) {
      const output = await this.convertToMp3(inputPath);
      results.push({ input: inputPath, output });
    }
    
    return results;
  }
  
  async getAudioDuration(filePath: string): Promise<number | null> {
    try {
      // Use ffprobe to get audio duration
      const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
      
      const { stdout } = await execAsync(command, {
        timeout: 5000
      });
      
      const duration = parseFloat(stdout.trim());
      if (!isNaN(duration)) {
        return duration;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting audio duration:', error);
      return null;
    }
  }
  
  async getAudioInfo(filePath: string): Promise<any> {
    try {
      // Get detailed audio information using ffprobe
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
      
      const { stdout } = await execAsync(command, {
        timeout: 5000
      });
      
      return JSON.parse(stdout);
    } catch (error) {
      console.error('Error getting audio info:', error);
      return null;
    }
  }
  
  async cleanupOldMp3Files(directory: string, maxAgeMs: number = 86400000): Promise<number> {
    // Clean up MP3 files older than maxAgeMs (default 24 hours)
    let deletedCount = 0;
    
    try {
      const files = await fs.readdir(directory);
      const now = Date.now();
      
      for (const file of files) {
        if (!file.endsWith('.mp3')) continue;
        
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        const age = now - stats.mtime.getTime();
        
        if (age > maxAgeMs) {
          await fs.unlink(filePath);
          deletedCount++;
          console.log(`Deleted old MP3 file: ${filePath}`);
        }
      }
      
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old MP3 files from ${directory}`);
      }
      
    } catch (error) {
      console.error('Error cleaning up MP3 files:', error);
    }
    
    return deletedCount;
  }
  
  getStatus() {
    return {
      service: 'AudioConverter',
      ffmpegAvailable: true, // This should be checked properly
      supportedFormats: ['m4a', 'wav', 'mp3', 'aac', 'ogg', 'flac']
    };
  }
}

// Export singleton instance
export const audioConverter = new AudioConverterService();
import { storage } from '../storage';
import { join } from 'path';
import { createWriteStream, mkdirSync, existsSync, unlinkSync } from 'fs';
import archiver from 'archiver';
import Database from 'better-sqlite3';

export class HospitalExportService {
  private tempDir = join(process.cwd(), 'temp_exports');

  constructor() {
    this.ensureTempDir();
  }

  private ensureTempDir() {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async exportHospitalCall(hospitalCallId: number): Promise<string> {
    const hospitalCall = await storage.getHospitalCall(hospitalCallId);
    if (!hospitalCall) {
      throw new Error('Hospital call not found');
    }

    const segments = await storage.getHospitalCallSegments(hospitalCallId);
    if (segments.length === 0) {
      throw new Error('No segments found for this hospital call');
    }

    // Create export directory
    const exportDir = join(this.tempDir, `hospital-call-${hospitalCallId}-${Date.now()}`);
    mkdirSync(exportDir, { recursive: true });

    // Connect to Rdio Scanner database
    const rdioDbPath = join(process.cwd(), 'rdio-scanner-server/rdio-scanner.db');
    if (!existsSync(rdioDbPath)) {
      throw new Error('Rdio Scanner database not found');
    }

    const rdioDb = new Database(rdioDbPath, { readonly: true });

    try {
      const audioFiles: string[] = [];
      
      // Export each audio segment
      for (const segment of segments) {
        const metadata = segment.metadata as any;
        const rdioCallId = metadata?.rdioCallId;
        
        if (!rdioCallId) {
          console.warn(`Segment ${segment.id} has no rdioCallId, skipping`);
          continue;
        }

        try {
          const stmt = rdioDb.prepare('SELECT audio, audioType FROM rdioScannerCalls WHERE id = ?');
          const result = stmt.get(rdioCallId) as { audio: Buffer; audioType: string } | undefined;
          
          if (!result || !result.audio) {
            console.warn(`No audio found for Rdio call ${rdioCallId}, skipping`);
            continue;
          }

          // Determine file extension
          let extension = '.m4a';
          if (result.audioType === 'audio/wav') extension = '.wav';
          else if (result.audioType === 'audio/mp3') extension = '.mp3';

          const filename = `segment-${segment.sequenceNumber.toString().padStart(2, '0')}-${segment.audioSegmentId}${extension}`;
          const filepath = join(exportDir, filename);
          
          // Write audio file
          const fs = await import('fs');
          fs.writeFileSync(filepath, result.audio);
          audioFiles.push(filename);
          
          console.log(`Exported audio file: ${filename}`);
        } catch (error) {
          console.error(`Error exporting segment ${segment.id}:`, error);
        }
      }

      // Create metadata file
      const metadataPath = join(exportDir, 'call-metadata.json');
      const metadata = {
        hospitalCall: {
          id: hospitalCall.id,
          conversationId: hospitalCall.conversationId,
          timestamp: hospitalCall.timestamp,
          talkgroup: hospitalCall.talkgroup,
          system: hospitalCall.system,
          hospitalName: hospitalCall.hospitalName,
          status: hospitalCall.status,
          sorDetected: hospitalCall.sorDetected,
          sorPhysician: hospitalCall.sorPhysician
        },
        segments: segments.map(s => ({
          id: s.id,
          sequenceNumber: s.sequenceNumber,
          timestamp: s.timestamp,
          transcript: s.transcript,
          confidence: s.confidence,
          speakerType: s.speakerType,
          speakerIdentity: s.speakerIdentity,
          duration: s.duration
        })),
        audioFiles,
        exportedAt: new Date().toISOString(),
        exportedBy: 'EMS-Insight System'
      };

      const fs = await import('fs');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      // Create ZIP file
      const zipPath = join(this.tempDir, `hospital-call-${hospitalCallId}-export.zip`);
      await this.createZipFile(exportDir, zipPath);

      // Clean up temporary directory
      await this.cleanupDirectory(exportDir);

      return zipPath;
    } finally {
      rdioDb.close();
    }
  }

  private async createZipFile(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      output.on('close', () => {
        console.log(`ZIP file created: ${(archive as any).pointer()} total bytes`);
        resolve();
      });

      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  private async cleanupDirectory(dirPath: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        fs.unlinkSync(filePath);
      }
      fs.rmdirSync(dirPath);
    } catch (error) {
      console.error('Error cleaning up directory:', error);
    }
  }

  async cleanupExportFile(filePath: string): Promise<void> {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error cleaning up export file:', error);
    }
  }
}

export const hospitalExportService = new HospitalExportService();
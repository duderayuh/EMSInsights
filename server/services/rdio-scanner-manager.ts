import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { EventEmitter } from 'events';

export class RdioScannerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private serverDir: string;
  private pidFile: string;
  private port: number = 3001;
  private autoRestart: boolean = true;
  private restartAttempts: number = 0;
  private maxRestartAttempts: number = 5;
  private restartDelay: number = 2000; // 2 seconds (faster restart)
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckFrequency: number = 10000; // 10 seconds (more frequent)
  private lastHealthCheck: Date = new Date();
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 3;

  constructor() {
    super();
    this.serverDir = join(process.cwd(), 'rdio-scanner-server');
    this.pidFile = join(this.serverDir, 'rdio-scanner.pid');
    
    // Setup process cleanup
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  /**
   * Start the Rdio Scanner server with automatic management
   */
  async start(): Promise<boolean> {
    try {
      // Check if already running
      if (this.isRunning()) {
        console.log('Rdio Scanner server is already running');
        return true;
      }

      // Clean up any stale PID file
      if (existsSync(this.pidFile)) {
        try {
          const pid = parseInt(readFileSync(this.pidFile, 'utf8'));
          try {
            process.kill(pid, 0); // Check if process exists
          } catch (err) {
            // Process doesn't exist, remove stale PID file
            unlinkSync(this.pidFile);
          }
        } catch (err) {
          unlinkSync(this.pidFile);
        }
      }

      console.log('Starting Rdio Scanner server...');
      
      const rdioScannerBinary = join(this.serverDir, 'rdio-scanner');
      
      if (!existsSync(rdioScannerBinary)) {
        throw new Error(`Rdio Scanner binary not found at ${rdioScannerBinary}`);
      }

      // Log deployment status but allow Rdio Scanner to run
      const isDeployment = process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === 'production';
      
      if (isDeployment) {
        console.log('Deployment environment detected - attempting to start Rdio Scanner locally');
      }

      // Start the server process with proper binding for external access
      this.process = spawn(rdioScannerBinary, ['-listen', `0.0.0.0:${this.port}`], {
        cwd: this.serverDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      });

      if (!this.process.pid) {
        throw new Error('Failed to start Rdio Scanner server - no PID');
      }

      // Write PID file
      writeFileSync(this.pidFile, this.process.pid.toString());

      // Setup process event handlers
      this.process.on('error', (error) => {
        console.error('Rdio Scanner server error:', error);
        this.emit('error', error);
        this.handleProcessExit(1);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`Rdio Scanner server exited with code ${code} and signal ${signal}`);
        this.handleProcessExit(code || 0);
      });

      this.process.stdout?.on('data', (data) => {
        console.log(`[Rdio Scanner] ${data.toString().trim()}`);
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[Rdio Scanner Error] ${data.toString().trim()}`);
      });

      // Allow process to run independently
      this.process.unref();

      // Start health monitoring
      this.startHealthMonitoring();

      console.log(`Rdio Scanner server started with PID ${this.process.pid} on port ${this.port}`);
      this.emit('started', { pid: this.process.pid, port: this.port });
      
      // Reset restart attempts on successful start
      this.restartAttempts = 0;
      
      return true;
    } catch (error) {
      console.error('Failed to start Rdio Scanner server:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Stop the Rdio Scanner server
   */
  async stop(): Promise<boolean> {
    try {
      this.autoRestart = false;
      
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (!existsSync(this.pidFile)) {
        console.log('Rdio Scanner server is not running (no PID file)');
        return true;
      }

      const pid = parseInt(readFileSync(this.pidFile, 'utf8'));
      
      try {
        // Try graceful shutdown first
        process.kill(pid, 'SIGTERM');
        
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if still running
        try {
          process.kill(pid, 0);
          // Still running, force kill
          process.kill(pid, 'SIGKILL');
        } catch (err) {
          // Process already stopped
        }
        
        if (existsSync(this.pidFile)) {
          unlinkSync(this.pidFile);
        }
        console.log('Rdio Scanner server stopped successfully');
        this.emit('stopped');
        return true;
      } catch (err) {
        // Process already stopped or doesn't exist
        if (existsSync(this.pidFile)) {
          unlinkSync(this.pidFile);
        }
        console.log('Rdio Scanner server was already stopped');
        this.emit('stopped');
        return true;
      }
    } catch (error) {
      console.error('Failed to stop Rdio Scanner server:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Check if the Rdio Scanner server is running
   */
  isRunning(): boolean {
    if (!existsSync(this.pidFile)) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(this.pidFile, 'utf8'));
      process.kill(pid, 0); // Check if process exists
      return true;
    } catch (err) {
      // Process doesn't exist, remove stale PID file
      try {
        unlinkSync(this.pidFile);
      } catch (unlinkErr) {
        // Ignore unlink errors
      }
      return false;
    }
  }

  /**
   * Get server status
   */
  getStatus() {
    const running = this.isRunning();
    let pid = null;
    
    if (running && existsSync(this.pidFile)) {
      try {
        pid = parseInt(readFileSync(this.pidFile, 'utf8'));
      } catch (err) {
        // Ignore read errors
      }
    }

    return {
      running,
      pid,
      port: this.port,
      autoRestart: this.autoRestart,
      restartAttempts: this.restartAttempts,
      maxRestartAttempts: this.maxRestartAttempts,
      consecutiveFailures: this.consecutiveFailures,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  /**
   * Force restart immediately (used when proxy requests fail)
   */
  async forceRestart(): Promise<boolean> {
    console.log('Force restarting Rdio Scanner due to connection failure');
    
    // Stop current process
    if (this.process) {
      try {
        this.process.kill('SIGKILL');
      } catch (err) {
        // Ignore kill errors
      }
    }
    
    // Clean up PID file
    if (existsSync(this.pidFile)) {
      try {
        unlinkSync(this.pidFile);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    
    // Reset counters
    this.consecutiveFailures = 0;
    this.restartAttempts = 0;
    this.process = null;
    
    // Start immediately
    return await this.start();
  }

  /**
   * Enable automatic restart
   */
  enableAutoRestart(): void {
    this.autoRestart = true;
    console.log('Automatic restart enabled for Rdio Scanner server');
  }

  /**
   * Disable automatic restart
   */
  disableAutoRestart(): void {
    this.autoRestart = false;
    console.log('Automatic restart disabled for Rdio Scanner server');
  }

  /**
   * Handle process exit and restart if needed
   */
  private handleProcessExit(code: number): void {
    this.process = null;
    
    // Clean up PID file
    if (existsSync(this.pidFile)) {
      try {
        unlinkSync(this.pidFile);
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    this.emit('exited', { code, restartAttempts: this.restartAttempts });

    // Attempt restart if enabled and within limits
    if (this.autoRestart && this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++;
      console.log(`Rdio Scanner server exited with code ${code}. Attempting restart ${this.restartAttempts}/${this.maxRestartAttempts} in ${this.restartDelay}ms...`);
      
      setTimeout(() => {
        this.start().catch(error => {
          console.error('Failed to restart Rdio Scanner server:', error);
          this.emit('restart-failed', error);
        });
      }, this.restartDelay);
    } else if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(`Rdio Scanner server failed to restart after ${this.maxRestartAttempts} attempts. Giving up.`);
      this.emit('restart-failed', new Error('Max restart attempts reached'));
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const running = this.isRunning();
        this.lastHealthCheck = new Date();
        
        // Test actual connectivity to the server
        let isHealthy = false;
        if (running) {
          try {
            const response = await fetch(`http://localhost:${this.port}/`, {
              method: 'HEAD',
              timeout: 5000
            });
            isHealthy = response.ok;
          } catch (error) {
            console.log('Rdio Scanner connectivity test failed:', error);
            isHealthy = false;
          }
        }
        
        if (!running || !isHealthy) {
          this.consecutiveFailures++;
          console.log(`Rdio Scanner health check failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}) - Process running: ${running}, Connectivity: ${isHealthy}`);
          
          if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.autoRestart) {
            console.log('Maximum consecutive failures reached, restarting Rdio Scanner');
            this.restartAttempts = 0; // Reset attempts for health check restarts
            this.start().catch(error => {
              console.error('Health check restart failed:', error);
              this.emit('health-check-failed', error);
            });
          }
        } else {
          // Reset failure count on successful health check
          this.consecutiveFailures = 0;
          this.emit('health-check-passed');
        }
      } catch (error) {
        this.consecutiveFailures++;
        console.error(`Health check error (${this.consecutiveFailures}/${this.maxConsecutiveFailures}):`, error);
        
        if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.autoRestart) {
          console.log('Maximum consecutive health check errors reached, restarting Rdio Scanner');
          this.restartAttempts = 0;
          this.start().catch(error => {
            console.error('Health check restart failed:', error);
            this.emit('health-check-failed', error);
          });
        }
      }
    }, this.healthCheckFrequency);
    
    console.log(`Health monitoring started - checking every ${this.healthCheckFrequency/1000} seconds`);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }
}

export const rdioScannerManager = new RdioScannerManager();
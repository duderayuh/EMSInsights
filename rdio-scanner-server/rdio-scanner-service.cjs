#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class RdioScannerService {
  constructor() {
    this.serverPath = path.join(__dirname, 'rdio-scanner');
    this.pidFile = path.join(__dirname, 'rdio-scanner.pid');
    this.logFile = path.join(__dirname, 'rdio-scanner.log');
    this.process = null;
  }

  async start() {
    if (this.isRunning()) {
      console.log('Rdio Scanner Server is already running');
      return false;
    }

    console.log('Starting Rdio Scanner Server on port 3001...');
    
    const args = ['-listen', ':3001'];
    
    this.process = spawn(this.serverPath, args, {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore'
    });

    // Save PID
    fs.writeFileSync(this.pidFile, this.process.pid.toString());
    
    this.process.on('error', (err) => {
      console.error('Failed to start Rdio Scanner:', err);
      this.cleanup();
    });

    this.process.on('close', (code) => {
      console.log(`Rdio Scanner server exited with code ${code}`);
      this.cleanup();
    });

    // Unref so parent can exit
    this.process.unref();
    
    console.log(`Rdio Scanner Server started with PID: ${this.process.pid}`);
    return true;
  }

  stop() {
    if (!this.isRunning()) {
      console.log('Rdio Scanner Server is not running');
      return false;
    }

    const pid = this.getPid();
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`Stopped Rdio Scanner Server (PID: ${pid})`);
        this.cleanup();
        return true;
      } catch (err) {
        console.error('Error stopping server:', err);
        this.cleanup();
        return false;
      }
    }
    return false;
  }

  isRunning() {
    const pid = this.getPid();
    if (!pid) return false;
    
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      this.cleanup();
      return false;
    }
  }

  getPid() {
    try {
      if (fs.existsSync(this.pidFile)) {
        return parseInt(fs.readFileSync(this.pidFile, 'utf8'));
      }
    } catch (err) {
      // PID file might be corrupted
    }
    return null;
  }

  cleanup() {
    if (fs.existsSync(this.pidFile)) {
      fs.unlinkSync(this.pidFile);
    }
  }

  status() {
    const running = this.isRunning();
    const pid = this.getPid();
    
    return {
      running,
      pid: running ? pid : null,
      port: 3001,
      url: running ? 'http://localhost:3001' : null,
      adminUrl: running ? 'http://localhost:3001/admin' : null
    };
  }

  getLogs(lines = 50) {
    try {
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf8');
        return content.split('\n').slice(-lines).join('\n');
      }
    } catch (err) {
      console.error('Error reading logs:', err);
    }
    return '';
  }
}

// CLI interface
if (require.main === module) {
  const service = new RdioScannerService();
  const command = process.argv[2];

  switch (command) {
    case 'start':
      service.start();
      break;
    case 'stop':
      service.stop();
      break;
    case 'restart':
      service.stop();
      setTimeout(() => service.start(), 1000);
      break;
    case 'status':
      console.log(JSON.stringify(service.status(), null, 2));
      break;
    case 'logs':
      console.log(service.getLogs());
      break;
    default:
      console.log('Usage: node rdio-scanner-service.js [start|stop|restart|status|logs]');
      process.exit(1);
  }
}

module.exports = RdioScannerService;
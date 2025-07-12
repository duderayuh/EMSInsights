#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Start Rdio Scanner Server
const serverPath = path.join(__dirname, 'rdio-scanner');
const args = ['-listen', ':3001'];

console.log('Starting Rdio Scanner Server on port 3001...');

const rdioServer = spawn(serverPath, args, {
  stdio: 'inherit',
  cwd: __dirname
});

rdioServer.on('error', (err) => {
  console.error('Failed to start Rdio Scanner:', err);
});

rdioServer.on('close', (code) => {
  console.log(`Rdio Scanner server exited with code ${code}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Stopping Rdio Scanner server...');
  rdioServer.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Stopping Rdio Scanner server...');
  rdioServer.kill();
  process.exit(0);
});
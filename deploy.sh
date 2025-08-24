#!/bin/bash

# EMS-Insight Deployment Script for Digital Ocean Droplet

echo "Starting EMS-Insight deployment..."

# Check for .env file
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please create .env with required variables:"
    echo "  DATABASE_URL"
    echo "  OPENAI_API_KEY"
    echo "  APPLE_KEY_ID"
    echo "  APPLE_MAPKIT_JS_KEY"
    echo "  APPLE_TEAM_ID"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Create audio processing directory
mkdir -p ems_audio_processing

# Create rdio-scanner database directory
mkdir -p rdio-scanner-server

# Check if rdio-scanner.db exists
if [ ! -f rdio-scanner-server/rdio-scanner.db ]; then
    echo "WARNING: rdio-scanner.db not found in rdio-scanner-server/"
    echo "The application may not work properly without this database"
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the application
echo "Building application..."
npm run build

# Stop existing PM2 process if running
pm2 stop ems-insight 2>/dev/null || true
pm2 delete ems-insight 2>/dev/null || true

# Start with ecosystem config
echo "Starting application with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Display status
echo ""
echo "Deployment complete! Check status with:"
echo "  pm2 status"
echo "  pm2 logs ems-insight"
echo ""
echo "If the app keeps restarting, check logs with:"
echo "  pm2 logs ems-insight --lines 100"
# EMS-Insight - Emergency Dispatch Analytics Dashboard

A real-time emergency dispatch monitoring system that processes SDRTrunk audio feeds, transcribes calls using AI, and provides comprehensive analytics through an interactive web dashboard.

## Features

### Core Functionality
- **Audio Ingestion**: Continuous processing of SDRTrunk UDP/pipe audio feeds
- **Real-time Transcription**: OpenAI Whisper-based speech-to-text conversion
- **AI Classification**: Automatic call type detection and EMS priority assignment
- **Text Similarity Search**: Find similar incidents using vector embeddings
- **Live Dashboard**: Real-time updates via WebSocket connections
- **Interactive Mapping**: Geographic visualization of emergency calls
- **Trend Analysis**: Statistical analysis with anomaly detection

### Technical Stack
- **Frontend**: React + TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL with pgvector extension
- **Real-time**: WebSocket connections for live updates
- **Audio Processing**: FFmpeg, OpenAI Whisper
- **NLP**: Custom classification pipeline with keyword detection
- **Visualization**: Leaflet maps, Plotly charts

## Quick Start - macOS Deployment

### One-Command Installation

1. Download and extract the deployment package
2. Run the automated installer:
```bash
chmod +x deploy-macos.sh
./deploy-macos.sh
```

### What Gets Installed

- ✅ **Complete EMS-Insight application** with React dashboard
- ✅ **PostgreSQL database** with automated schema setup  
- ✅ **Local Whisper transcription** for speech-to-text processing
- ✅ **Rdio Scanner integration** for emergency radio monitoring
- ✅ **Real-time WebSocket** updates and live audio processing
- ✅ **AI-powered transcript cleanup** using Anthropic Claude
- ✅ **Geographic mapping** with emergency call location plotting

### After Installation

1. **Access Dashboard**: http://localhost:5000
2. **Login**: admin/password or methodist/methodist
3. **Configure API Keys**: Edit `.env` file with your Anthropic API key
4. **Start Monitoring**: Emergency calls appear automatically on the map

## Create Deployment Package

To package the entire system for distribution:

```bash
./package-deployment.sh
```

This creates a complete `ems-insight-macos-[date].tar.gz` package ready for installation on any Mac.

## Manual Installation (Advanced)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ with pgvector extension
- FFmpeg and Python 3.9+
- Anthropic API key for transcript cleanup

### Manual Setup

1. **Clone and Install**
```bash
git clone <repository-url>
cd ems-insight
npm install

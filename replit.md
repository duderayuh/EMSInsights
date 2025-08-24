# EMS-Insight - Emergency Dispatch Analytics Dashboard

## Overview
EMS-Insight is a real-time emergency dispatch monitoring system designed to process SDRTrunk audio feeds, transcribe calls using AI, and provide comprehensive analytics through an interactive web dashboard. It is built for Indianapolis-Marion County EMS dispatch channels with architecture designed for future multi-city expansion. The project's vision is to enhance emergency response coordination and public health monitoring through actionable real-time data.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Build Tool**: Vite
- **State Management**: TanStack Query (server state), React hooks (local state)
- **Real-time Updates**: WebSocket connection
- **Mapping**: Google Maps API for interactive geographic visualization and accurate geocoding
- **Charts**: Plotly for statistical analysis
- **UI/UX Decisions**: Dark mode support, clear text contrast, simplified interface focusing on call type and location, consistent visual elements across all components. Mobile-optimized with PWA support.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **API Design**: RESTful endpoints with WebSocket support
- **Audio Processing**: FFmpeg for manipulation, continuous processing of SDRTrunk UDP/pipe feeds, 30-second segmentation.
- **Speech Recognition**: OpenAI Whisper (primary) and local Whisper (fallback) for word-for-word verbatim transcription.
- **Real-time Communication**: Dedicated WebSocket server for live updates.
- **AI Classification**: Custom NLP using keyword detection for call type categorization (medical, fire, MVC), text similarity via vector embeddings, configurable keyword spotting.
- **Data Flow**: Audio Ingestion → Segmentation → Transcription → Classification → Storage → Real-time Updates → Analytics.
- **Core Components**: Audio Processing Pipeline, AI Classification System, Real-time Dashboard, WebSocket Service.
- **Incident Tracking**: Automated system to track incident lifecycle from dispatch to completion, including real-time drive time calculations to hospitals and automatic status updates.
- **Unit Tracking**: Comprehensive system to identify, tag, and track emergency response units based on call transcripts.
- **Data Quality Management**: Automated and manual tools for correcting transcription errors, address validation, and filtering non-emergency content.
- **Role-Based Access Control**: Three-tier system (user, hospital_admin, super_admin) with granular permissions.

### Data Storage
- **Primary Database**: PostgreSQL with pgvector extension for text embeddings.
- **ORM**: Drizzle ORM.
- **Audio Files**: Local filesystem storage for audio segments.
- **Critical Rule**: The `rdio-scanner.db` file is **READ-ONLY** and must **NEVER** be modified or deleted, as it contains critical audio files.

### Feature Specifications
- **Real-time Dashboard**: Live call updates, interactive map with emoji markers for call types, statistical analytics, full-text search, similarity-based incident matching, priority/type-based filtering.
- **Audio Management**: Continuous audio ingestion, segmentation, verbatim transcription, audio playback for historical calls, automated audio file cleanup post-transcription.
- **AI-Powered Insights**: AI-driven classification of emergency calls, unit extraction, address extraction and geocoding, medical director insights generation.
- **Hospital Communications**: Specific handling and classification of EMS-Hospital communications, including conversation grouping and analysis.
- **Administration**: Comprehensive admin panel for call management, user management, settings configuration (call types, talkgroups, transcription dictionary), and data quality monitoring.
- **Deployment**: Optimized for Replit's container system, one-click run, Docker Compose support for local development, macOS and Windows installation packages.

## External Dependencies

### Core Services
- **PostgreSQL**: Primary database.
- **OpenAI Whisper**: Speech-to-text transcription.
- **SDRTrunk**: Audio feed source.
- **Rdio Scanner Database**: Read-only SQLite database for audio content.
- **Google Maps API**: Mapping, geocoding, and address validation.

### Development Tools
- **Drizzle Kit**: Database schema management.
- **Vite**: Frontend build tool.
- **TypeScript**: Language.

### Optional Services
- **Neon Database**: Managed PostgreSQL hosting option.
- **FlightRadar24 API**: Real-time helicopter tracking.
- **OpenWeatherMap API**: Weather overlays.
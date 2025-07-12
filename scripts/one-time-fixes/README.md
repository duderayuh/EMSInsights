# One-Time Fix Scripts

This directory contains utility scripts that were used for historical database maintenance and repair tasks. These scripts are **NOT** part of the main EMS-Insight application and are provided for reference only.

## Script Categories

### Database Repair Scripts
- `fix-*.ts` - Scripts for fixing various database issues (addresses, transcriptions, units, etc.)
- `reclassify-*.ts` - Scripts for reclassifying call types and improving data quality
- `comprehensive-*.ts` - Comprehensive database analysis and repair scripts

### Testing & Validation Scripts
- `test-*.ts` - Scripts for testing specific functionality and validation
- `check-*.ts` - Scripts for checking system status and data quality
- `debug-*.ts` - Scripts for debugging specific issues

### Data Migration Scripts
- `migrate-*.ts` - Scripts for migrating data structures and roles
- `geocode-*.ts` - Scripts for geocoding and address validation
- `create-*.ts` - Scripts for creating incidents from existing data
- `restore-*.ts` - Scripts for restoring historical data
- `verify-*.ts` - Scripts for verifying system functionality

### Analysis Scripts
- `simple-*.ts` - Simplified analysis and reporting scripts

## Usage

These scripts were designed to be run manually from the command line using:
```bash
npx tsx scripts/one-time-fixes/script-name.ts
```

⚠️ **Important Notes:**
- These scripts are for reference only and should not be run on a clean database
- They were created to fix specific historical data issues
- Running these scripts may require database modifications or API keys
- Always backup your database before running any maintenance scripts

## Main Application Files

The actual EMS-Insight application uses these files instead:
- `server/` - Main server application
- `client/` - React frontend
- `shared/` - Shared schemas and types
- `package.json` - Project dependencies and scripts

## Database Status

The current database is at a clean state (0 calls) with:
- ✅ 990 comprehensive unit tags (all unit types 1-99)
- ✅ Complete system configuration preserved
- ✅ Ready for fresh real-time data ingestion
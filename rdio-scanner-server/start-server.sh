#!/bin/bash

# Start Rdio Scanner Server
cd "$(dirname "$0")"
./rdio-scanner -listen :3001 &
echo "Rdio Scanner Server started on port 3001"
echo "PID: $!"
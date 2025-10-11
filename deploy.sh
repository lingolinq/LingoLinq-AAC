#!/bin/bash
# Simple deployment script for Fly.io

echo "🚀 Deploying LingoLinq-AAC to Fly.io..."
/c/Users/skawa/.fly/bin/flyctl.exe deploy --config fly.toml --dockerfile Dockerfile.singlestage

#!/bin/bash
set -e

echo "=== Installing LingoLinq DevTools ==="

# Load NVM
export NVM_DIR="/usr/local/share/nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
else
    echo "ERROR: NVM not found"
    exit 1
fi

# Set Node 20 as default
nvm use 20
nvm alias default 20

# Install CLIs
npm install -g @google/generative-ai-cli
npm install -g @anthropic-ai/sdk

# Ruby setup
gem install bundler -v 2.6.8 --conservative || true
bundle _2.6.8_ config set --local path 'vendor/bundle' || true
bundle _2.6.8_ install --jobs 4 || true

echo "=== LingoLinq DevTools Installed ==="

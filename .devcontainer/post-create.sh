#!/bin/bash
set -e

echo "=== Post-Create Script Starting ==="

# Load NVM (installed by the devcontainer feature)
export NVM_DIR="/usr/local/share/nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "Loading NVM..."
    \. "$NVM_DIR/nvm.sh"
else
    echo "ERROR: NVM not found at $NVM_DIR"
    exit 1
fi

# Verify Node is available
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install Node 18 alongside Node 20
echo "Installing Node 18..."
nvm install 18
nvm alias node18 18

# Set Node 20 as default
nvm use 20
nvm alias default 20

# Install CLIs globally with Node 20
echo "Installing CLIs..."
npm install -g @google/generative-ai-cli
npm install -g @anthropic-ai/sdk

# Ruby setup
echo "Setting up Ruby gems..."
gem install bundler -v 2.6.8 --conservative || true
bundle _2.6.8_ config set --local path 'vendor/bundle' || true
bundle _2.6.8_ install --jobs 4 || true

echo "=== Post-Create Script Complete ==="

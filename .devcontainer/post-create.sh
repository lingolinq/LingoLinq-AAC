#!/bin/bash
set -e

echo "=== Post-Create Script Starting ==="

# Load NVM
export NVM_DIR="/usr/local/share/nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "Loading NVM..."
    \. "$NVM_DIR/nvm.sh"
else
    echo "ERROR: NVM not found at $NVM_DIR"
    exit 1
fi

# Verify Node
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install Node 18 alongside Node 20
echo "Installing Node 18..."
nvm install 18
nvm alias node18 18

# Set Node 20 as default
nvm use 20
nvm alias default 20

# Install CLIs globally
echo "Installing Gemini and Claude CLIs..."
npm install -g @google/generative-ai-cli
npm install -g @anthropic-ai/sdk

# Verify CLI installs
echo "Gemini CLI version: $(genai version || echo 'Not found')"
echo "Claude SDK version: $(npm list -g @anthropic-ai/sdk || echo 'Not found')"

# Ruby setup
echo "Setting up Ruby gems..."
gem install bundler -v 2.6.8 --conservative || true
bundle _2.6.8_ config set --local path 'vendor/bundle' || true
bundle _2.6.8_ install --jobs 4 || true

# Install Redis
echo "Installing Redis..."
sudo apt-get update
sudo apt-get install -y redis-server
sudo service redis-server start

# Install PostgreSQL
echo "Installing PostgreSQL..."
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo service postgresql start

# Configure PostgreSQL for the current user
sudo -u postgres psql -c "CREATE USER $(whoami) WITH SUPERUSER CREATE DATABASE $(whoami) OWNER $(whoami);" || true

echo "=== Post-Create Script Complete ==="

nvm use 20


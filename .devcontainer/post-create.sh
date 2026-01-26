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

# Setup NVM auto-switching
echo "Setting up NVM auto-switching..."
cat >> ~/.bashrc << 'NVMEOF'

# Auto-switch Node version when entering directory with .nvmrc
autoload_nvmrc() {
  local nvmrc_path
  nvmrc_path="$(nvm_find_nvmrc)"

  if [ -n "$nvmrc_path" ]; then
    local nvmrc_node_version
    nvmrc_node_version=$(nvm version "$(cat "${nvmrc_path}")")

    if [ "$nvmrc_node_version" = "N/A" ]; then
      nvm install
    elif [ "$nvmrc_node_version" != "$(nvm version)" ]; then
      nvm use --silent
    fi
  elif [ -n "$(PWD=$OLDPWD nvm_find_nvmrc)" ] && [ "$(nvm version)" != "$(nvm version default)" ]; then
    nvm use default --silent
  fi
}

# Hook into cd command
cd() {
  builtin cd "$@" && autoload_nvmrc
}

# Run on shell startup
autoload_nvmrc
NVMEOF

echo "=== Setting up Ember frontend ==="

# Install frontend dependencies with Node 18
cd app/frontend
nvm use 18
export NODE_OPTIONS=--openssl-legacy-provider
npm install
npx bower install --allow-root
cd ../..

# Switch back to Node 20 for general use
nvm use 20

echo "=== Post-Create Script Complete ==="
echo ""
echo "To start the app: bin/fresh_start"
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:8184"


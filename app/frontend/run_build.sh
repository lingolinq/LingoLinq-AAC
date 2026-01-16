#!/bin/bash
exec 2>&1 # Redirect stderr to stdout

echo "--- Script Started ---"
echo "Current Dir: $(pwd)"

export NVM_DIR="/usr/local/share/nvm"
echo "Loading NVM from $NVM_DIR/nvm.sh"

if [ -f "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  echo "NVM loaded. Version: $(nvm --version)"
else
  echo "ERROR: NVM not found at $NVM_DIR/nvm.sh"
  exit 1
fi

echo "Switching to Node 18..."
nvm use 18 || { echo "Failed to switch node"; exit 1; }

echo "Node Version: $(node -v)"

cd app/frontend || { echo "Failed to cd to app/frontend"; exit 1; }

export NODE_OPTIONS=--openssl-legacy-provider
echo "Starting ember build..."

npx ember build --environment=development
echo "Build finished at $(date)"

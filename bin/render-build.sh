#!/usr/bin/env bash
# exit on error
set -o errexit

echo "=== Starting Render Build ==="

# Try to load nvm
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  echo "Loading nvm from $NVM_DIR/nvm.sh"
  . "$NVM_DIR/nvm.sh"
elif [ -s "/usr/local/share/nvm/nvm.sh" ]; then
  echo "Loading nvm from /usr/local/share/nvm/nvm.sh"
  . "/usr/local/share/nvm/nvm.sh"
else
  echo "nvm not found in standard locations, trying to install..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Verify nvm is loaded
if command -v nvm >/dev/null 2>&1; then
  echo "nvm loaded successfully"
  echo "Installing Node 18..."
  nvm install 18
  nvm use 18
  echo "Node version: $(node -v)"
  echo "NPM version: $(npm -v)"
else
  echo "WARNING: nvm could not be loaded. Using system node: $(node -v)"
fi

echo "=== Installing Ruby Dependencies ==="
bundle install
bundle exec rake extras:assert_js

echo "=== Building Frontend (Ember) ==="
cd app/frontend
npm install
npx bower install --allow-root
npx ember build --environment production
cd ../..

echo "=== Compiling Rails Assets ==="
bundle exec rake assets:precompile
bundle exec rake assets:clean

echo "=== Build Complete ==="

#!/usr/bin/env bash
# exit on error
set -o errexit

echo "=== Starting Render Build ==="

# Ensure NVM is available in Render
export NVM_DIR="/usr/local/share/nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  echo "Loading nvm from $NVM_DIR/nvm.sh"
  . "$NVM_DIR/nvm.sh"
else
  echo "NVM not found, installing..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
fi

echo "=== Forcing Node 18 for Ember build ==="
nvm install 18
nvm use 18
echo "Node version for Ember: $(node -v)"
echo "NPM version: $(npm -v)"

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

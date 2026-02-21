#!/usr/bin/env bash
# exit on error
set -o errexit
set -x # Enable debug logging

echo "=== Starting Render Build ==="

# Try all known NVM locations, otherwise install it
# Note: We disable errexit (set +e) during sourcing because nvm.sh 
# often returns non-zero codes during initialization which kills the script.
set +e
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
elif [ -s "/opt/render/.nvm/nvm.sh" ]; then
  export NVM_DIR="/opt/render/.nvm"
  . "$NVM_DIR/nvm.sh"
else
  echo "NVM not found, installing..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
fi
set -e

echo "=== Using Node 18 for Ember ==="
nvm install 18
nvm use 18
echo "Node version for Ember: $(node -v)"
echo "NPM version: $(npm -v)"

echo "=== Installing Ruby Dependencies ==="
bundle install
bundle exec rake extras:assert_js

# Precompile assets with placeholders first so routes can load (Rack::Offline
# needs asset_path for application.css/js, which requires precompiled assets).
# We will precompile again after Ember build to include the real frontend.
echo "=== Precompiling Rails assets (placeholder pass) ==="
bundle exec rake assets:precompile

echo "=== Copying terms (requires Rails env + asset pipeline) ==="
bundle exec rake extras:copy_terms

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

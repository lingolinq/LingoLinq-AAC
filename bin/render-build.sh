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

# SKIP_OFFLINE_MANIFEST: routes.rb loads Rack::Offline which calls asset_path;
# assets don't exist until after precompile, so skip it during build tasks.
export SKIP_OFFLINE_MANIFEST=1
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

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

echo "=== Using Node 20 for Ember ==="
nvm install 20
nvm use 20
echo "Node version for Ember: $(node -v)"
echo "NPM version: $(npm -v)"

echo "=== Installing Ruby Dependencies ==="
bundle install
bundle exec rake extras:assert_js

bundle exec rake extras:copy_terms

echo "=== Building Frontend (Ember) ==="
cd app/frontend
npm install
# Only run bower install if bower.json exists (migrating away from bower)
if [ -f "bower.json" ]; then
  echo "Installing Bower dependencies..."
  npx bower install --allow-root
else
  echo "No bower.json found, skipping bower install"
fi
npx ember build --environment production
cd ../..

echo "=== Copying Ember build output into Rails asset paths ==="
cp -f app/frontend/dist/assets/frontend.js  app/assets/javascripts/frontend.js
cp -f app/frontend/dist/assets/vendor.js    app/assets/javascripts/vendor.js
cp -f app/frontend/dist/assets/frontend.css app/assets/stylesheets/frontend.css
cp -f app/frontend/dist/assets/vendor.css   app/assets/stylesheets/vendor.css
echo "frontend.js:  $(wc -c < app/assets/javascripts/frontend.js) bytes"
echo "vendor.js:    $(wc -c < app/assets/javascripts/vendor.js) bytes"
echo "frontend.css: $(wc -c < app/assets/stylesheets/frontend.css) bytes"
echo "vendor.css:   $(wc -c < app/assets/stylesheets/vendor.css) bytes"

echo "=== Compiling Rails Assets ==="
# Clobber stale Sprockets cache and precompiled assets to force a clean build.
# Without this, Sprockets may serve cached output from a previous build even
# though the Ember-compiled frontend.js/frontend.css have changed.
rm -rf tmp/cache/assets
bundle exec rake assets:clobber
bundle exec rake assets:precompile

echo "=== Build Complete ==="

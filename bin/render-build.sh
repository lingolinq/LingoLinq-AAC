#!/usr/bin/env bash
# exit on error
set -o errexit
set -x # Enable debug logging

echo "=== Starting Render Build ==="

echo "=== Installing jemalloc ==="
apt-get update -qq && apt-get install -y -qq libjemalloc-dev > /dev/null
JEMALLOC_PATH=$(find /usr/lib -name 'libjemalloc.so*' -type f | head -1)
echo "jemalloc installed at: $JEMALLOC_PATH"

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

echo "=== Using Node 22 for Ember ==="
nvm install 22
nvm use 22
echo "Node version for Ember: $(node -v)"
echo "NPM version: $(npm -v)"

echo "=== Installing Ruby Dependencies ==="
bundle install
bundle exec rake extras:assert_js

bundle exec rake extras:copy_terms

echo "=== Building Frontend (Ember) ==="
cd app/frontend
npm install
npx ember build --environment production
cd ../..

echo "=== Copying Ember build output into Rails asset paths ==="
cp -f app/frontend/dist/assets/frontend.js  app/assets/javascripts/frontend.js
cp -f app/frontend/dist/assets/vendor.js    app/assets/javascripts/vendor.js
# ember-auto-import entry bundle (runtime + npm deps such as the ember-shepherd
# v2 addon's services/tour). Without copying this onto the Sprockets load path,
# the bundle that DEFINES those modules is never loaded on the Rails-served app
# and tours crash with "Could not find module 'ember-shepherd/services/tour'".
# Stable filename comes from autoImport.webpack.output in
# app/frontend/ember-cli-build.js; concatenated via application.js manifest.
cp -f app/frontend/dist/assets/auto-import-app.js app/assets/javascripts/auto-import-app.js
cp -f app/frontend/dist/assets/frontend.css app/assets/stylesheets/frontend.css
cp -f app/frontend/dist/assets/vendor.css   app/assets/stylesheets/vendor.css
echo "frontend.js:        $(wc -c < app/assets/javascripts/frontend.js) bytes"
echo "vendor.js:          $(wc -c < app/assets/javascripts/vendor.js) bytes"
echo "auto-import-app.js: $(wc -c < app/assets/javascripts/auto-import-app.js) bytes"
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

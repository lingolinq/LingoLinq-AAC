#!/usr/bin/env bash
# exit on error
set -o errexit

echo "🚀 Starting Render build process for LingoLinq-AAC..."

# Set Node.js version for compatibility
export NODE_VERSION=18
echo "🔧 Using Node.js version $NODE_VERSION"

# Install dependencies
echo "📦 Installing Ruby dependencies..."
bundle install

# Build frontend assets
echo "🎨 Building Ember.js frontend assets..."
cd app/frontend

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund

# Install bower globally and dependencies
echo "🎯 Installing bower and dependencies..."
npm install -g bower
bower install --allow-root --config.interactive=false

# Build the frontend
echo "🔨 Building Ember application..."
./node_modules/.bin/ember build --environment=production

cd ../..

# Precompile Rails assets
echo "🏗️  Precompiling Rails assets..."
bundle exec rake assets:precompile

# Run database migrations
echo "🗄️  Running database migrations..."
bundle exec rake db:migrate

echo "✅ Build process completed successfully!"
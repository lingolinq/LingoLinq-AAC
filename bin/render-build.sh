#!/usr/bin/env bash
# exit on error
set -o errexit

echo "🚀 Starting Render build process for LingoLinq-AAC..."

# Set Node.js version for compatibility
export NODE_VERSION=20
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

# Install bower dependencies
echo "🎯 Installing bower dependencies..."
if npx bower install --allow-root --config.interactive=false; then
  echo "✅ Bower dependencies installed successfully"
else
  echo "⚠️  Bower install failed, continuing without bower dependencies"
fi

# Build the frontend
echo "🔨 Building Ember application..."
if ./node_modules/.bin/ember build --environment=production; then
  echo "✅ Ember build completed successfully"
elif npm run build; then
  echo "✅ Ember build completed via npm run build"
else
  echo "❌ Ember build failed"
  exit 1
fi

cd ../..

# Precompile Rails assets
echo "🏗️  Precompiling Rails assets..."
bundle exec rake assets:precompile

# Run database migrations
echo "🗄️  Running database migrations..."
bundle exec rake db:migrate

echo "✅ Build process completed successfully!"
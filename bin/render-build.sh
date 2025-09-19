#!/usr/bin/env bash
# exit on error
set -o errexit

echo "🚀 Starting Render build process for LingoLinq-AAC..."

# Install dependencies
echo "📦 Installing Ruby dependencies..."
bundle install

# Build frontend assets
echo "🎨 Building Ember.js frontend assets..."
cd app/frontend

# Clear any cached dependencies
echo "🧹 Clearing npm cache..."
npm cache clean --force

# Install dependencies with legacy peer deps flag for Ember 3.12
echo "📦 Installing frontend dependencies..."
npm install --legacy-peer-deps

# Install bower dependencies if bower.json exists
if [ -f "bower.json" ]; then
  echo "🎯 Installing bower dependencies..."
  npx bower install --allow-root
fi

# Build the frontend
echo "🔨 Building Ember application..."
npm run build

cd ../..

# Precompile Rails assets
echo "🏗️  Precompiling Rails assets..."
bundle exec rake assets:precompile

# Run database migrations
echo "🗄️  Running database migrations..."
bundle exec rake db:migrate

echo "✅ Build process completed successfully!"
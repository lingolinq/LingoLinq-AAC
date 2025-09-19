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
npm install
npm run build
cd ../..

# Precompile Rails assets
echo "🏗️  Precompiling Rails assets..."
bundle exec rake assets:precompile

# Run database migrations
echo "🗄️  Running database migrations..."
bundle exec rake db:migrate

echo "✅ Build process completed successfully!"
#!/bin/bash
set -e

echo "🚀 Starting LingoLinq AAC Development Environment"

# Install system dependencies
echo "📦 Installing system dependencies..."
apt-get update -q
apt-get install -y -q build-essential libpq-dev git nodejs npm curl

# Install Node.js 18
echo "📥 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y -q nodejs

# Show versions
echo "✅ Ruby: $(ruby -v)"
echo "✅ Node: $(node -v)"

# Install bundler
echo "✅ Bundler: Installing..."
gem install bundler -q

# Change to app directory
cd /app

# Clean any existing bundle state
echo "🧹 Cleaning bundle state..."
bundle clean --force || true
rm -rf .bundle/config || true

# Configure bundler for container environment
echo "⚙️  Configuring bundler..."
bundle config set --local deployment false
bundle config set --local path '/usr/local/bundle'
bundle config set --local without ''
bundle config set --local jobs 4
bundle config set --local retry 3

# Install gems
echo "📚 Installing Ruby gems..."
bundle install

# Verify gem installation
echo "🔍 Verifying gem installation..."
bundle exec gem list | grep rails || echo "Rails not found in bundle"
bundle check || echo "Bundle check failed"

# Set up database
echo "🗄️  Setting up database..."
bundle exec rails db:create || echo "Database may already exist"
bundle exec rails db:migrate || echo "Migration failed"

# Start Rails server
echo "🌟 Starting Rails server..."
bundle exec rails server -b 0.0.0.0 -p 3000
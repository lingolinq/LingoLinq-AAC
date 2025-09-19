#!/bin/bash
set -e

echo "🚀 Starting LingoLinq-AAC..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until bundle exec rails db:version > /dev/null 2>&1; do
  echo "Database not ready, waiting..."
  sleep 2
done

# Run migrations
echo "🗄️  Running database migrations..."
bundle exec rails db:migrate

# Precompile assets if needed
echo "🎨 Precompiling assets..."
bundle exec rails assets:precompile

# Start the server
echo "🌟 Starting Rails server..."
exec bundle exec puma -C config/puma.rb
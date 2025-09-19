#!/bin/bash
set -e

echo "🚀 Starting LingoLinq-AAC Worker..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until bundle exec rails db:version > /dev/null 2>&1; do
  echo "Database not ready, waiting..."
  sleep 2
done

# Start the worker
echo "🔧 Starting Resque worker..."
exec bundle exec resque:work QUEUE=*
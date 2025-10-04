#!/bin/bash
set -e

echo "🚀 Starting LingoLinq-AAC..."

# Skip obf gem installation - it's been permanently removed
echo "🚫 OBF gem disabled (removed from application)"

# Keep obf gem disabled for runtime
export DISABLE_OBF_GEM=true

# Wait for PostgreSQL database to be ready
echo "⏳ Waiting for PostgreSQL database..."
until bundle exec rails db:version > /dev/null 2>&1; do
  echo "Database not ready, waiting..."
  sleep 2
done

echo "✅ Database is ready"

# Compile assets at runtime if they don't exist
if [ ! -d "public/assets" ] || [ -z "$(ls -A public/assets 2>/dev/null)" ]; then
  echo "🎨 Compiling assets at runtime..."
  RAILS_ENV=production bundle exec rake assets:precompile
  echo "✅ Assets compiled successfully"
else
  echo "📁 Assets already exist, skipping compilation"
fi

# Run database migrations
echo "🔄 Running database migrations..."
bundle exec rails db:migrate

echo "🌟 Starting Rails server..."
exec bundle exec puma -C config/puma.rb
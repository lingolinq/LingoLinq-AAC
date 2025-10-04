#!/bin/bash
set -e

echo "🚀 Starting LingoLinq-AAC..."

# Skip obf gem installation - it's been permanently removed
echo "🚫 OBF gem disabled (removed from application)"

# Keep obf gem disabled for runtime
export DISABLE_OBF_GEM=true

# Skip database check - the database may not be migrated yet
echo "⏳ Skipping database check, will run migrations..."

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
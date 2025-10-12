#!/bin/bash
set -e

echo "🚀 Starting LingoLinq-AAC..."

# Skip obf gem installation - it's been permanently removed
echo "🚫 OBF gem disabled (removed from application)"

# Keep obf gem disabled for runtime
export DISABLE_OBF_GEM=true

# Unset bundler-specific variables per official Docker guide
# https://bundler.io/guides/bundler_docker_guide.html
echo "🔧 Unsetting BUNDLE_PATH and BUNDLE_BIN for Docker compatibility..."
unset BUNDLE_PATH
unset BUNDLE_BIN

# CRITICAL FIX: Force platform-specific gems only (prevent 'ruby' platform fallback)
# Without this, Bundler tries to resolve BOTH 'ruby' and 'x86_64-linux' platforms
# pg gem doesn't have a universal 'ruby' version, causing resolution to fail
echo "🔧 Setting BUNDLE_FORCE_RUBY_PLATFORM=false to use Linux-native gems..."
export BUNDLE_FORCE_RUBY_PLATFORM=false

# Skip database check - the database may not be migrated yet
echo "⏳ Skipping database check, will run migrations..."

# Compile assets at runtime if they don't exist
# if [ ! -d "public/assets" ] || [ -z "$(ls -A public/assets 2>/dev/null)" ]; then
#   echo "🎨 Compiling assets at runtime..."
#   RAILS_ENV=production bundle exec rake assets:precompile
#   echo "✅ Assets compiled successfully"
# else
#   echo "📁 Assets already exist, skipping compilation"
# fi

# Run database migrations (db:create not needed on Fly.io - DB already exists)
echo "🔄 Running database migrations..."
bundle exec rails db:migrate

echo "🌟 Starting Rails server on 0.0.0.0:3000..."
exec bundle exec puma -C config/puma.rb -b '0.0.0.0'
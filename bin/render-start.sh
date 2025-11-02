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

echo "🔄 Running database migrations..."
bundle exec rake db:create db:migrate db:seed

# Note: Assets are precompiled during Docker build (see Dockerfile)
# They do not need to be compiled at runtime

echo "🌟 Starting Rails server..."
exec bundle exec puma -C config/puma.rb

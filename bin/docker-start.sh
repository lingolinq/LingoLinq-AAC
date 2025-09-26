#!/bin/bash
set -e

echo "🚀 Starting LingoLinq AAC..."

# Verify bundle configuration
echo "🔍 Verifying bundle configuration..."
bundle config list
echo "📍 Bundle path: $(bundle config get path)"

# Verify gems are accessible
echo "🔍 Checking gem availability..."
if ! bundle check; then
    echo "❌ Bundle check failed. Attempting to fix..."
    echo "🔧 Reconfiguring bundle..."
    
    # Reset bundle configuration to defaults
    bundle config set --local deployment false
    bundle config set --local path /usr/local/bundle
    
    # Re-check gems
    if ! bundle check; then
        echo "❌ Gems still not found. Reinstalling..."
        bundle install --verbose
    fi
fi

echo "✅ Bundle check passed"

# List critical gems to verify they're available
echo "🔍 Verifying critical gems..."
critical_gems=("rails" "psych" "irb" "sass-rails" "rdoc" "sassc-rails")
for gem in "${critical_gems[@]}"; do
    if bundle exec gem list "$gem" | grep -q "$gem"; then
        echo "  ✅ $gem found"
    else
        echo "  ❌ $gem NOT found"
        echo "🔧 Attempting to install $gem..."
        bundle exec gem install "$gem" || echo "⚠️  Could not install $gem"
    fi
done

# Wait for database
echo "⏳ Waiting for database..."
until bundle exec rails db:version > /dev/null 2>&1; do
    echo "Database not ready, waiting..."
    sleep 2
done
echo "✅ Database is ready"

# Run migrations
echo "🔄 Running database migrations..."
if ! bundle exec rails db:migrate; then
    echo "❌ Database migrations failed! Error details:"
    bundle exec rails db:migrate --verbose
    echo "🔍 Checking database status..."
    bundle exec rails db:version || echo "Could not get database version"
    echo "🔍 Checking database connection..."
    bundle exec rails runner "puts ActiveRecord::Base.connection.active?" || echo "Could not test database connection"
    echo "🚨 Migration failure - attempting to continue anyway..."
fi

# Start the application
echo "🌟 Starting Rails server..."
exec bundle exec puma -C config/puma.rb
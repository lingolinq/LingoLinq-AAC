#!/bin/bash

# LingoLinq Docker Psych Gem Fix Script
# Implements the documented solutions from DOCKER_ISSUES.md

echo "🔧 LingoLinq Docker Psych Gem Fix"
echo "=================================="

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
cd docker && docker-compose down

# Solution 1: Regenerate Gemfile.lock in container
echo "🔄 Attempting Solution 1: Regenerate Gemfile.lock in clean container..."
docker-compose up -d db redis
docker-compose run --rm web bash -c "
    echo '🔍 Current bundler config:' &&
    bundle config &&
    echo '🗑️  Removing old Gemfile.lock...' &&
    rm -f Gemfile.lock &&
    echo '📦 Installing gems from scratch...' &&
    bundle install
"

# Test if Rails server can start
echo "🧪 Testing Rails server startup..."
timeout 30s docker-compose run --rm web bash -c "
    echo '🚀 Testing Rails server startup...' &&
    timeout 10s bundle exec rails server -b 0.0.0.0 -p 3000 &
    SERVER_PID=\$! &&
    sleep 5 &&
    kill \$SERVER_PID 2>/dev/null &&
    echo '✅ Rails server started successfully!'
" && SOLUTION1_SUCCESS=true || SOLUTION1_SUCCESS=false

if [ "$SOLUTION1_SUCCESS" = true ]; then
    echo "✅ Solution 1 worked! Rails server can start."
    docker-compose down
    exit 0
fi

# Solution 2: Fix bundler configuration
echo "🔄 Attempting Solution 2: Fix bundler configuration..."
docker-compose run --rm web bash -c "
    echo '⚙️  Updating bundler configuration...' &&
    bundle config set --local deployment false &&
    bundle config set --local cache_path /usr/local/bundle/cache &&
    bundle install --redownload
"

# Test again
echo "🧪 Testing Rails server startup (Solution 2)..."
timeout 30s docker-compose run --rm web bash -c "
    timeout 10s bundle exec rails server -b 0.0.0.0 -p 3000 &
    SERVER_PID=\$! &&
    sleep 5 &&
    kill \$SERVER_PID 2>/dev/null &&
    echo '✅ Rails server started successfully!'
" && SOLUTION2_SUCCESS=true || SOLUTION2_SUCCESS=false

if [ "$SOLUTION2_SUCCESS" = true ]; then
    echo "✅ Solution 2 worked! Rails server can start."
    docker-compose down
    exit 0
fi

# Solution 3: Different Ruby base image (requires rebuilding)
echo "🔄 Attempting Solution 3: Different Ruby base image..."
echo "This requires modifying the Dockerfile. Creating backup..."

cp Dockerfile Dockerfile.backup
sed -i 's/ruby:3.2.8-slim/ruby:3.2.8/' Dockerfile

echo "📦 Building with full Ruby image..."
docker-compose build web

# Test with new image
echo "🧪 Testing Rails server startup (Solution 3)..."
timeout 30s docker-compose run --rm web bash -c "
    timeout 10s bundle exec rails server -b 0.0.0.0 -p 3000 &
    SERVER_PID=\$! &&
    sleep 5 &&
    kill \$SERVER_PID 2>/dev/null &&
    echo '✅ Rails server started successfully!'
" && SOLUTION3_SUCCESS=true || SOLUTION3_SUCCESS=false

if [ "$SOLUTION3_SUCCESS" = true ]; then
    echo "✅ Solution 3 worked! Rails server can start with full Ruby image."
    echo "🏗️  The Dockerfile has been updated to use ruby:3.2.8 instead of ruby:3.2.8-slim"
    rm Dockerfile.backup
    docker-compose down
    exit 0
else
    echo "🔄 Restoring original Dockerfile..."
    mv Dockerfile.backup Dockerfile
fi

# If all solutions failed
echo "❌ All documented solutions failed."
echo "📋 Manual troubleshooting needed:"
echo "   1. Check Docker logs: docker-compose logs web"
echo "   2. Try manual bundle install in container"
echo "   3. Consider updating to Rails 7 or Ruby 3.3"
echo ""
echo "🔍 Current status:"
docker-compose run --rm web bundle exec rails console --help >/dev/null 2>&1 && echo "   ✅ Rails console works" || echo "   ❌ Rails console fails"
docker-compose run --rm web bundle exec rails routes >/dev/null 2>&1 && echo "   ✅ Rails routes work" || echo "   ❌ Rails routes fail"
docker-compose down

exit 1
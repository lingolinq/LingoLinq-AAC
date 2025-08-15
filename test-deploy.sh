#!/bin/bash

# LingoLinq AAC Test Deployment Script
# This script runs on the test/repo-reorganization branch to validate deployments

set -e  # Exit on any error

echo "🚀 LingoLinq AAC Test Deployment"
echo "================================"

# Check if we're on the correct branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "test/repo-reorganization" ]; then
    echo "❌ Error: Must be on test/repo-reorganization branch"
    echo "   Current branch: $current_branch"
    echo "   Run: git checkout test/repo-reorganization"
    exit 1
fi

echo "✅ On test/repo-reorganization branch"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "   Please start Docker Desktop"
    exit 1
fi

echo "✅ Docker is running"

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker/docker-compose.simple.yml down

# Start the application
echo "🚀 Starting LingoLinq AAC services..."
docker-compose -f docker/docker-compose.simple.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check PostgreSQL
if docker-compose -f docker/docker-compose.simple.yml exec postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "❌ PostgreSQL is not ready"
    exit 1
fi

# Check Redis
if docker-compose -f docker/docker-compose.simple.yml exec redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready"
else
    echo "❌ Redis is not ready"
    exit 1
fi

# Wait a bit more for Rails to fully start
echo "⏳ Waiting for Rails to start..."
sleep 20

# Test Rails application
echo "🔍 Testing Rails application..."
for i in {1..10}; do
    if curl -s http://localhost:3000 > /dev/null; then
        echo "✅ Rails application is responding"
        break
    else
        if [ $i -eq 10 ]; then
            echo "❌ Rails application is not responding after 10 attempts"
            echo "📋 Showing backend logs:"
            docker-compose -f docker/docker-compose.simple.yml logs backend --tail=20
            exit 1
        fi
        echo "   Attempt $i/10 - waiting for Rails..."
        sleep 3
    fi
done

# Run database tests
echo "🔍 Testing database connection..."
if docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails runner "puts 'Database connection: OK'" 2>/dev/null | grep -q "OK"; then
    echo "✅ Database connection is working"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Show running services
echo "📊 Service Status:"
docker-compose -f docker/docker-compose.simple.yml ps

echo ""
echo "🎉 Test Deployment Successful!"
echo "================================"
echo "📍 Application URL: http://localhost:3000"
echo "📍 Database: localhost:5432 (postgres/password)"
echo "📍 Redis: localhost:6379"
echo ""
echo "🛑 To stop services: docker-compose -f docker/docker-compose.simple.yml down"
echo "🔍 To view logs: docker-compose -f docker/docker-compose.simple.yml logs backend -f"
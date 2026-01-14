#!/bin/bash
# Setup Redis and PostgreSQL in Dev Container
# Run this INSIDE the VS Code dev container terminal

set -e

echo "🔧 Setting up Redis and PostgreSQL in dev container..."
echo ""

# Update package lists
echo "📦 Updating package lists..."
sudo apt-get update -qq

# Install Redis
echo "📦 Installing Redis..."
sudo apt-get install -y redis-server redis-tools

# Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt-get install -y postgresql postgresql-contrib

echo ""
echo "✅ Installation complete!"
echo ""

# Start Redis
echo "🚀 Starting Redis..."
sudo service redis-server start
sleep 2

# Verify Redis
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running!"
else
    echo "❌ Redis failed to start"
    exit 1
fi

# Start PostgreSQL
echo "🚀 Starting PostgreSQL..."
sudo service postgresql start
sleep 2

# Verify PostgreSQL
if pg_isready > /dev/null 2>&1; then
    echo "✅ PostgreSQL is running!"
else
    echo "❌ PostgreSQL failed to start"
    exit 1
fi

# Configure PostgreSQL user
echo "👤 Configuring PostgreSQL user..."
sudo su - postgres -c "psql -c \"CREATE USER vscode WITH SUPERUSER CREATEDB;\"" 2>/dev/null || echo "User already exists"
sudo su - postgres -c "psql -c \"ALTER USER vscode WITH PASSWORD 'vscode';\"" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All services are ready!"
echo ""
echo "Redis:      ✓ Running"
echo "PostgreSQL: ✓ Running"
echo ""
echo "Now run: ./bin/fresh_start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

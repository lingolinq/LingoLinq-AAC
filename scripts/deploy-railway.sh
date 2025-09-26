#!/bin/bash
# Railway Deployment Automation Script (Unix/Linux/Mac)
# Usage: ./scripts/deploy-railway.sh [project-name] [--skip-checks] [--force]

set -e

PROJECT_NAME="${1:-lingolinq-aac}"
SKIP_CHECKS=false
FORCE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
    esac
done

echo "🚄 LingoLinq AAC - Railway Deployment Automation"
echo "================================================="

# Check if we're in the right directory
if [ ! -f "Dockerfile" ]; then
    echo "❌ Error: Dockerfile not found in current directory"
    echo "   Please run this script from the project root directory"
    exit 1
fi

# Pre-deployment checks
if [ "$SKIP_CHECKS" = false ]; then
    echo ""
    echo "🔍 Running pre-deployment checks..."

    # Check if Railway CLI is installed
    if command -v railway &> /dev/null; then
        RAILWAY_VERSION=$(railway --version 2>/dev/null || echo "unknown")
        echo "   ✅ Railway CLI found: $RAILWAY_VERSION"
    else
        echo "   ❌ Railway CLI not found"
        echo "   Installing Railway CLI..."
        if command -v npm &> /dev/null; then
            npm install -g @railway/cli
        else
            echo "   ❌ npm not found. Please install Node.js and npm first"
            echo "   Or install Railway CLI manually: https://docs.railway.app/develop/cli#install"
            exit 1
        fi
        echo "   ✅ Railway CLI installed successfully"
    fi

    # Check if logged in to Railway
    echo "   🔐 Checking Railway authentication..."
    if AUTH_CHECK=$(railway whoami 2>/dev/null); then
        echo "   ✅ Logged in as: $AUTH_CHECK"
    else
        echo "   ❌ Not logged in to Railway"
        echo "   Please run: railway login"
        exit 1
    fi

    # Check git status
    echo "   📝 Checking git status..."
    if [ -n "$(git status --porcelain)" ] && [ "$FORCE" = false ]; then
        echo "   ⚠️  Uncommitted changes detected:"
        git status --porcelain
        read -p "   Continue deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "   Deployment cancelled"
            exit 0
        fi
    fi

    # Check if we're on the right commit
    CURRENT_COMMIT=$(git rev-parse --short HEAD)
    echo "   📊 Current commit: $CURRENT_COMMIT"

    if [ "$CURRENT_COMMIT" = "2f2c2f2" ]; then
        echo "   ✅ On working Docker build commit"
    else
        echo "   ⚠️  Not on the validated working commit (2f2c2f2)"
        if [ "$FORCE" = false ]; then
            read -p "   Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "   Deployment cancelled"
                exit 0
            fi
        fi
    fi
fi

echo ""
echo "🚀 Starting Railway deployment..."

# Check if project exists
echo "🔍 Checking for existing Railway project..."
if railway status &>/dev/null; then
    echo "✅ Found existing Railway project"
    railway status
else
    echo "📦 No existing project found, creating new one..."
    railway init
fi

# Deploy to Railway
echo ""
echo "🚀 Deploying to Railway..."
echo "   This may take 5-10 minutes for the first deployment..."

if railway up --detach; then
    echo "✅ Deployment started successfully!"
else
    echo "❌ Railway deployment failed"
    echo "💡 Troubleshooting tips:"
    echo "   - Check Railway dashboard for detailed logs"
    echo "   - Try: railway logs"
    echo "   - Reset build cache in Railway dashboard if needed"
    exit 1
fi

# Get deployment status
echo ""
echo "📊 Getting deployment status..."
sleep 3
railway status

# Try to get the domain
echo ""
echo "🌐 Getting application URL..."
if DOMAIN=$(railway domain 2>/dev/null); then
    echo "🎉 Application URL: $DOMAIN"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Wait for deployment to complete (check Railway dashboard)"
    echo "   2. Test the URL: $DOMAIN"
    echo "   3. Check login page: $DOMAIN/login"
    echo "   4. Verify no JavaScript errors in browser console"
else
    echo "⚠️  No domain found yet - generate one in Railway dashboard"
fi

echo ""
echo "🔗 Useful Railway commands:"
echo "   railway logs           # View application logs"
echo "   railway status         # Check deployment status"
echo "   railway open           # Open Railway dashboard"
echo "   railway domain         # Get application URL"

echo ""
echo "🎯 Deployment initiated successfully!"
echo "   Monitor progress in the Railway dashboard or run: railway logs"
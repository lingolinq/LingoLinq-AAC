#!/bin/bash
# Fly.io Deployment Automation Script (Unix/Linux/Mac)
# Usage: ./scripts/deploy-flyio.sh [app-name] [--skip-checks] [--force] [--region=ord]

set -e

APP_NAME="${1:-lingolinq-aac}"
SKIP_CHECKS=false
FORCE=false
REGION="ord"

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
        --region=*)
            REGION="${arg#*=}"
            shift
            ;;
    esac
done

echo "✈️ LingoLinq AAC - Fly.io Deployment Automation"
echo "==============================================="

# Check if we're in the right directory
if [ ! -f "Dockerfile" ]; then
    echo "❌ Error: Dockerfile not found in current directory"
    echo "   Please run this script from the project root directory"
    exit 1
fi

if [ ! -f "fly.toml" ]; then
    echo "❌ Error: fly.toml not found in current directory"
    echo "   Please run this script from the project root directory"
    exit 1
fi

# Pre-deployment checks
if [ "$SKIP_CHECKS" = false ]; then
    echo ""
    echo "🔍 Running pre-deployment checks..."

    # Check if Fly CLI is installed
    if command -v fly &> /dev/null; then
        FLY_VERSION=$(fly version 2>/dev/null || echo "unknown")
        echo "   ✅ Fly CLI found: $FLY_VERSION"
    else
        echo "   ❌ Fly CLI not found"
        echo "   Please install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/"
        echo "   Or run: curl -L https://fly.io/install.sh | sh"
        exit 1
    fi

    # Check if logged in to Fly.io
    echo "   🔐 Checking Fly.io authentication..."
    if AUTH_CHECK=$(fly auth whoami 2>/dev/null); then
        echo "   ✅ Logged in as: $AUTH_CHECK"
    else
        echo "   ❌ Not logged in to Fly.io"
        echo "   Please run: fly auth login"
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
echo "🚀 Starting Fly.io deployment..."

# Check if app exists
echo "🔍 Checking for existing Fly.io app..."
if fly apps list | grep -q "$APP_NAME"; then
    echo "✅ Found existing Fly.io app: $APP_NAME"
    fly apps list | grep "$APP_NAME"
else
    echo "📦 App not found, creating new Fly.io app..."
    if fly apps create "$APP_NAME" --region "$REGION"; then
        echo "✅ Created new Fly.io app: $APP_NAME"
    else
        echo "❌ Failed to create Fly.io app"
        exit 1
    fi
fi

# Set required secrets
echo ""
echo "🔑 Setting up environment secrets..."
echo "   Setting SECRET_KEY_BASE..."

# Generate a secure secret key
SECRET_KEY=$(openssl rand -base64 64 | tr -d '\n')
if fly secrets set SECRET_KEY_BASE="$SECRET_KEY" --app "$APP_NAME"; then
    echo "   ✅ SECRET_KEY_BASE configured"
else
    echo "   ❌ Failed to set SECRET_KEY_BASE"
    exit 1
fi

# Create PostgreSQL database
echo ""
echo "🗄️ Setting up PostgreSQL database..."
if fly postgres list | grep -q "$APP_NAME-db"; then
    echo "   ✅ PostgreSQL database already exists"
else
    echo "   Creating PostgreSQL database..."
    if fly postgres create --name "$APP_NAME-db" --region "$REGION" --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1; then
        echo "   🔗 Attaching database to app..."
        if fly postgres attach "$APP_NAME-db" --app "$APP_NAME"; then
            echo "   ✅ Database created and attached successfully"
        else
            echo "   ❌ Failed to attach database"
            exit 1
        fi
    else
        echo "   ❌ Failed to create PostgreSQL database"
        exit 1
    fi
fi

# Deploy to Fly.io
echo ""
echo "🚀 Deploying to Fly.io..."
echo "   This may take 5-10 minutes for the first deployment..."

if fly deploy --remote-only --ha=false; then
    echo "✅ Deployment completed successfully!"
else
    echo "❌ Fly.io deployment failed"
    echo "💡 Troubleshooting tips:"
    echo "   - Check deployment logs: fly logs"
    echo "   - Review app status: fly status"
    echo "   - Check machine status: fly machine list"
    exit 1
fi

# Run database migrations
echo ""
echo "🗃️ Running database migrations..."
if fly ssh console --command "rails db:migrate" --app "$APP_NAME"; then
    echo "   ✅ Database migrations completed"
else
    echo "   ⚠️  Database migration failed - you may need to run this manually"
    echo "   Run: fly ssh console --command 'rails db:migrate'"
fi

# Get deployment status and URL
echo ""
echo "📊 Getting deployment status..."
fly status --app "$APP_NAME"

echo ""
echo "🌐 Getting application URL..."
APP_URL="https://$APP_NAME.fly.dev"
echo "🎉 Application URL: $APP_URL"

echo ""
echo "📋 Next steps:"
echo "   1. Test the URL: $APP_URL"
echo "   2. Check login page: $APP_URL/login"
echo "   3. Verify no JavaScript errors in browser console"
echo "   4. Run monitoring script: ./scripts/monitor-deployment.sh $APP_URL"

echo ""
echo "🔗 Useful Fly.io commands:"
echo "   fly logs              # View application logs"
echo "   fly status            # Check deployment status"
echo "   fly open              # Open application in browser"
echo "   fly ssh console       # SSH into the application"
echo "   fly machine list      # List running machines"

echo ""
echo "🎯 Deployment completed successfully!"
echo "   Your application should be available at: $APP_URL"
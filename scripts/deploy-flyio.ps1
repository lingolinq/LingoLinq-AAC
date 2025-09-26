# Fly.io Deployment Automation Script
# Usage: .\scripts\deploy-flyio.ps1 [-AppName "lingolinq-aac"] [-SkipPreChecks]

param(
    [string]$AppName = "lingolinq-aac",
    [switch]$SkipPreChecks = $false,
    [switch]$Force = $false,
    [string]$Region = "ord"
)

Write-Host "✈️ LingoLinq AAC - Fly.io Deployment Automation" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "Dockerfile")) {
    Write-Host "❌ Error: Dockerfile not found in current directory" -ForegroundColor Red
    Write-Host "   Please run this script from the project root directory" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "fly.toml")) {
    Write-Host "❌ Error: fly.toml not found in current directory" -ForegroundColor Red
    Write-Host "   Please run this script from the project root directory" -ForegroundColor Yellow
    exit 1
}

# Pre-deployment checks
if (-not $SkipPreChecks) {
    Write-Host "`n🔍 Running pre-deployment checks..." -ForegroundColor Yellow

    # Check if Fly CLI is installed
    try {
        $flyVersion = fly version 2>$null
        Write-Host "   ✅ Fly CLI found: $flyVersion" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Fly CLI not found" -ForegroundColor Red
        Write-Host "   Please install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/" -ForegroundColor Yellow
        Write-Host "   Or use: iwr https://fly.io/install.ps1 -useb | iex" -ForegroundColor Yellow
        exit 1
    }

    # Check if logged in to Fly.io
    Write-Host "   🔐 Checking Fly.io authentication..." -ForegroundColor Blue
    try {
        $authCheck = fly auth whoami 2>$null
        if ($authCheck) {
            Write-Host "   ✅ Logged in as: $authCheck" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Not logged in to Fly.io" -ForegroundColor Red
            Write-Host "   Please run: fly auth login" -ForegroundColor Yellow
            exit 1
        }
    } catch {
        Write-Host "   ❌ Fly.io authentication check failed" -ForegroundColor Red
        Write-Host "   Please run: fly auth login" -ForegroundColor Yellow
        exit 1
    }

    # Check git status
    Write-Host "   📝 Checking git status..." -ForegroundColor Blue
    $gitStatus = git status --porcelain
    if ($gitStatus -and -not $Force) {
        Write-Host "   ⚠️  Uncommitted changes detected:" -ForegroundColor Yellow
        Write-Host $gitStatus -ForegroundColor Gray
        $continue = Read-Host "   Continue deployment? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-Host "   Deployment cancelled" -ForegroundColor Yellow
            exit 0
        }
    }

    # Check if we're on the right commit
    $currentCommit = git rev-parse --short HEAD
    Write-Host "   📊 Current commit: $currentCommit" -ForegroundColor Blue

    if ($currentCommit -eq "2f2c2f2") {
        Write-Host "   ✅ On working Docker build commit" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Not on the validated working commit (2f2c2f2)" -ForegroundColor Yellow
        if (-not $Force) {
            $continue = Read-Host "   Continue anyway? (y/N)"
            if ($continue -ne "y" -and $continue -ne "Y") {
                Write-Host "   Deployment cancelled" -ForegroundColor Yellow
                exit 0
            }
        }
    }
}

Write-Host "`n🚀 Starting Fly.io deployment..." -ForegroundColor Green

# Check if app exists
Write-Host "🔍 Checking for existing Fly.io app..." -ForegroundColor Blue
try {
    $appInfo = fly apps list | Select-String $AppName
    if ($appInfo) {
        Write-Host "✅ Found existing Fly.io app: $AppName" -ForegroundColor Green
        Write-Host $appInfo -ForegroundColor Gray
    } else {
        Write-Host "📦 App not found, creating new Fly.io app..." -ForegroundColor Yellow
        fly apps create $AppName --region $Region
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to create Fly.io app" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Created new Fly.io app: $AppName" -ForegroundColor Green
    }
} catch {
    Write-Host "📦 Creating new Fly.io app..." -ForegroundColor Yellow
    fly apps create $AppName --region $Region
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to create Fly.io app" -ForegroundColor Red
        exit 1
    }
}

# Set required secrets
Write-Host "`n🔑 Setting up environment secrets..." -ForegroundColor Blue
Write-Host "   Setting SECRET_KEY_BASE..." -ForegroundColor Gray

# Generate a secure secret key
$secretKey = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
fly secrets set SECRET_KEY_BASE="$secretKey" --app $AppName

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to set SECRET_KEY_BASE" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ SECRET_KEY_BASE configured" -ForegroundColor Green

# Create PostgreSQL database
Write-Host "`n🗄️ Setting up PostgreSQL database..." -ForegroundColor Blue
try {
    $dbExists = fly postgres list | Select-String "$AppName-db"
    if (-not $dbExists) {
        Write-Host "   Creating PostgreSQL database..." -ForegroundColor Yellow
        fly postgres create --name "$AppName-db" --region $Region --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ❌ Failed to create PostgreSQL database" -ForegroundColor Red
            exit 1
        }

        Write-Host "   🔗 Attaching database to app..." -ForegroundColor Yellow
        fly postgres attach "$AppName-db" --app $AppName
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ❌ Failed to attach database" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "   ✅ PostgreSQL database already exists" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Database setup may need manual configuration" -ForegroundColor Yellow
}

# Deploy to Fly.io
Write-Host "`n🚀 Deploying to Fly.io..." -ForegroundColor Green
Write-Host "   This may take 5-10 minutes for the first deployment..." -ForegroundColor Yellow

fly deploy --remote-only --ha=false
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Fly.io deployment failed" -ForegroundColor Red
    Write-Host "💡 Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "   - Check deployment logs: fly logs" -ForegroundColor Gray
    Write-Host "   - Review app status: fly status" -ForegroundColor Gray
    Write-Host "   - Check machine status: fly machine list" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green

# Run database migrations
Write-Host "`n🗃️ Running database migrations..." -ForegroundColor Blue
fly ssh console --command "rails db:migrate" --app $AppName
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Database migration failed - you may need to run this manually" -ForegroundColor Yellow
    Write-Host "   Run: fly ssh console --command 'rails db:migrate'" -ForegroundColor Gray
}

# Get deployment status and URL
Write-Host "`n📊 Getting deployment status..." -ForegroundColor Blue
fly status --app $AppName

Write-Host "`n🌐 Getting application URL..." -ForegroundColor Blue
$appUrl = "https://$AppName.fly.dev"
Write-Host "🎉 Application URL: $appUrl" -ForegroundColor Green

Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Test the URL: $appUrl" -ForegroundColor Gray
Write-Host "   2. Check login page: $appUrl/login" -ForegroundColor Gray
Write-Host "   3. Verify no JavaScript errors in browser console" -ForegroundColor Gray
Write-Host "   4. Run monitoring script: .\scripts\monitor-deployment.ps1 -Url $appUrl" -ForegroundColor Gray

Write-Host "`n🔗 Useful Fly.io commands:" -ForegroundColor Cyan
Write-Host "   fly logs              # View application logs" -ForegroundColor Gray
Write-Host "   fly status            # Check deployment status" -ForegroundColor Gray
Write-Host "   fly open              # Open application in browser" -ForegroundColor Gray
Write-Host "   fly ssh console       # SSH into the application" -ForegroundColor Gray
Write-Host "   fly machine list      # List running machines" -ForegroundColor Gray

Write-Host "`n🎯 Deployment completed successfully!" -ForegroundColor Green
Write-Host "   Your application should be available at: $appUrl" -ForegroundColor Yellow
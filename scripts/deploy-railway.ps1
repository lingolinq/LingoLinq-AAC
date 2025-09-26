# Railway Deployment Automation Script
# Usage: .\scripts\deploy-railway.ps1 [-ProjectName "your-project-name"] [-SkipPreChecks]

param(
    [string]$ProjectName = "lingolinq-aac",
    [switch]$SkipPreChecks = $false,
    [switch]$Force = $false
)

Write-Host "🚄 LingoLinq AAC - Railway Deployment Automation" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "Dockerfile")) {
    Write-Host "❌ Error: Dockerfile not found in current directory" -ForegroundColor Red
    Write-Host "   Please run this script from the project root directory" -ForegroundColor Yellow
    exit 1
}

# Pre-deployment checks
if (-not $SkipPreChecks) {
    Write-Host "`n🔍 Running pre-deployment checks..." -ForegroundColor Yellow

    # Check if Railway CLI is installed
    try {
        $railwayVersion = railway --version 2>$null
        Write-Host "   ✅ Railway CLI found: $railwayVersion" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Railway CLI not found" -ForegroundColor Red
        Write-Host "   Installing Railway CLI..." -ForegroundColor Yellow
        npm install -g @railway/cli
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ❌ Failed to install Railway CLI" -ForegroundColor Red
            exit 1
        }
        Write-Host "   ✅ Railway CLI installed successfully" -ForegroundColor Green
    }

    # Check if logged in to Railway
    Write-Host "   🔐 Checking Railway authentication..." -ForegroundColor Blue
    try {
        $authCheck = railway whoami 2>$null
        if ($authCheck) {
            Write-Host "   ✅ Logged in as: $authCheck" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Not logged in to Railway" -ForegroundColor Red
            Write-Host "   Please run: railway login" -ForegroundColor Yellow
            exit 1
        }
    } catch {
        Write-Host "   ❌ Railway authentication check failed" -ForegroundColor Red
        Write-Host "   Please run: railway login" -ForegroundColor Yellow
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

Write-Host "`n🚀 Starting Railway deployment..." -ForegroundColor Green

# Check if project exists
Write-Host "🔍 Checking for existing Railway project..." -ForegroundColor Blue
try {
    $existingProject = railway status 2>$null
    if ($existingProject) {
        Write-Host "✅ Found existing Railway project" -ForegroundColor Green
        Write-Host $existingProject -ForegroundColor Gray
    } else {
        Write-Host "📦 No existing project found, creating new one..." -ForegroundColor Yellow
        railway init
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to initialize Railway project" -ForegroundColor Red
            exit 1
        }
    }
} catch {
    Write-Host "📦 Creating new Railway project..." -ForegroundColor Yellow
    railway init
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to initialize Railway project" -ForegroundColor Red
        exit 1
    }
}

# Deploy to Railway
Write-Host "`n🚀 Deploying to Railway..." -ForegroundColor Green
Write-Host "   This may take 5-10 minutes for the first deployment..." -ForegroundColor Yellow

railway up --detach
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Railway deployment failed" -ForegroundColor Red
    Write-Host "💡 Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "   - Check Railway dashboard for detailed logs" -ForegroundColor Gray
    Write-Host "   - Try: railway logs" -ForegroundColor Gray
    Write-Host "   - Reset build cache in Railway dashboard if needed" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Deployment started successfully!" -ForegroundColor Green

# Get deployment status
Write-Host "`n📊 Getting deployment status..." -ForegroundColor Blue
Start-Sleep -Seconds 3
railway status

# Try to get the domain
Write-Host "`n🌐 Getting application URL..." -ForegroundColor Blue
try {
    $domain = railway domain
    if ($domain) {
        Write-Host "🎉 Application URL: $domain" -ForegroundColor Green
        Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
        Write-Host "   1. Wait for deployment to complete (check Railway dashboard)" -ForegroundColor Gray
        Write-Host "   2. Test the URL: $domain" -ForegroundColor Gray
        Write-Host "   3. Check login page: $domain/login" -ForegroundColor Gray
        Write-Host "   4. Verify no JavaScript errors in browser console" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  No domain found yet - generate one in Railway dashboard" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not retrieve domain - check Railway dashboard" -ForegroundColor Yellow
}

Write-Host "`n🔗 Useful Railway commands:" -ForegroundColor Cyan
Write-Host "   railway logs           # View application logs" -ForegroundColor Gray
Write-Host "   railway status         # Check deployment status" -ForegroundColor Gray
Write-Host "   railway open           # Open Railway dashboard" -ForegroundColor Gray
Write-Host "   railway domain         # Get application URL" -ForegroundColor Gray

Write-Host "`n🎯 Deployment initiated successfully!" -ForegroundColor Green
Write-Host "   Monitor progress in the Railway dashboard or run: railway logs" -ForegroundColor Yellow
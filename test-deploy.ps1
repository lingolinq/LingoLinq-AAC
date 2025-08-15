# LingoLinq AAC Test Deployment Script (PowerShell)
# This script runs on the test/repo-reorganization branch to validate deployments

param(
    [switch]$SkipBranchCheck
)

Write-Host "🚀 LingoLinq AAC Test Deployment" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check if we're on the correct branch
if (-not $SkipBranchCheck) {
    $currentBranch = & git branch --show-current
    if ($currentBranch -ne "test/repo-reorganization") {
        Write-Host "❌ Error: Must be on test/repo-reorganization branch" -ForegroundColor Red
        Write-Host "   Current branch: $currentBranch" -ForegroundColor Yellow
        Write-Host "   Run: git checkout test/repo-reorganization" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ On test/repo-reorganization branch" -ForegroundColor Green
}

# Check if Docker is running
try {
    & docker info *>$null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Docker is not running" -ForegroundColor Red
    Write-Host "   Please start Docker Desktop" -ForegroundColor Yellow
    exit 1
}

# Stop any existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
& docker-compose -f docker/docker-compose.simple.yml down

# Start the application
Write-Host "🚀 Starting LingoLinq AAC services..." -ForegroundColor Cyan
& docker-compose -f docker/docker-compose.simple.yml up -d

# Wait for services to be ready
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service health
Write-Host "🔍 Checking service health..." -ForegroundColor Cyan

# Check PostgreSQL
$pgReady = & docker-compose -f docker/docker-compose.simple.yml exec postgres pg_isready -U postgres 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL is ready" -ForegroundColor Green
} else {
    Write-Host "❌ PostgreSQL is not ready" -ForegroundColor Red
    exit 1
}

# Check Redis
$redisReady = & docker-compose -f docker/docker-compose.simple.yml exec redis redis-cli ping 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Redis is ready" -ForegroundColor Green
} else {
    Write-Host "❌ Redis is not ready" -ForegroundColor Red
    exit 1
}

# Wait a bit more for Rails to fully start
Write-Host "⏳ Waiting for Rails to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 20

# Test Rails application
Write-Host "🔍 Testing Rails application..." -ForegroundColor Cyan
$railsReady = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "✅ Rails application is responding" -ForegroundColor Green
        $railsReady = $true
        break
    } catch {
        if ($i -eq 10) {
            Write-Host "❌ Rails application is not responding after 10 attempts" -ForegroundColor Red
            Write-Host "📋 Showing backend logs:" -ForegroundColor Yellow
            & docker-compose -f docker/docker-compose.simple.yml logs backend --tail=20
            exit 1
        }
        Write-Host "   Attempt $i/10 - waiting for Rails..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
}

# Run database tests
Write-Host "🔍 Testing database connection..." -ForegroundColor Cyan
$dbTest = & docker-compose -f docker/docker-compose.simple.yml exec backend bundle exec rails runner "puts 'Database connection: OK'" 2>$null
if ($dbTest -match "OK") {
    Write-Host "✅ Database connection is working" -ForegroundColor Green
} else {
    Write-Host "❌ Database connection failed" -ForegroundColor Red
    exit 1
}

# Show running services
Write-Host "📊 Service Status:" -ForegroundColor Cyan
& docker-compose -f docker/docker-compose.simple.yml ps

Write-Host ""
Write-Host "🎉 Test Deployment Successful!" -ForegroundColor Green -BackgroundColor Black
Write-Host "================================" -ForegroundColor Green
Write-Host "📍 Application URL: http://localhost:3000" -ForegroundColor White
Write-Host "📍 Database: localhost:5432 (postgres/password)" -ForegroundColor White
Write-Host "📍 Redis: localhost:6379" -ForegroundColor White
Write-Host ""
Write-Host "🛑 To stop services: docker-compose -f docker/docker-compose.simple.yml down" -ForegroundColor Yellow
Write-Host "🔍 To view logs: docker-compose -f docker/docker-compose.simple.yml logs backend -f" -ForegroundColor Yellow
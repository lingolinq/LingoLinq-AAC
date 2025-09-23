# Quick Deployment Script - Choose Platform
# Usage: .\scripts\quick-deploy.ps1 [-Platform "railway"|"flyio"] [-AppName "lingolinq-aac"]

param(
    [ValidateSet("railway", "flyio", "both")]
    [string]$Platform = "railway",
    [string]$AppName = "lingolinq-aac",
    [switch]$Monitor = $true
)

Write-Host "🚀 LingoLinq AAC - Quick Deployment" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "Dockerfile")) {
    Write-Host "❌ Error: Not in project root directory" -ForegroundColor Red
    Write-Host "   Please run this script from the LingoLinq-AAC root directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "📊 Deployment Configuration:" -ForegroundColor Blue
Write-Host "   Platform: $Platform" -ForegroundColor Gray
Write-Host "   App Name: $AppName" -ForegroundColor Gray
Write-Host "   Monitoring: $Monitor" -ForegroundColor Gray

Write-Host "`n🔍 Quick pre-flight check..." -ForegroundColor Yellow

# Check git status
$currentCommit = git rev-parse --short HEAD
Write-Host "   Current commit: $currentCommit" -ForegroundColor Blue

if ($currentCommit -eq "2f2c2f2") {
    Write-Host "   ✅ On verified working commit" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Not on verified commit (2f2c2f2)" -ForegroundColor Yellow
    $continue = Read-Host "   Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "   Deployment cancelled" -ForegroundColor Yellow
        exit 0
    }
}

# Railway deployment
if ($Platform -eq "railway" -or $Platform -eq "both") {
    Write-Host "`n🚄 Deploying to Railway..." -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green

    try {
        & ".\scripts\deploy-railway.ps1" -ProjectName $AppName -SkipPreChecks
        $railwaySuccess = $true
        Write-Host "✅ Railway deployment completed!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Railway deployment failed: $($_.Exception.Message)" -ForegroundColor Red
        $railwaySuccess = $false
    }

    if ($railwaySuccess -and $Monitor) {
        Write-Host "`n📊 Starting Railway monitoring..." -ForegroundColor Blue
        Start-Sleep -Seconds 10
        try {
            & ".\scripts\monitor-deployment.ps1" -CheckInterval 30 -MaxAttempts 10
        } catch {
            Write-Host "⚠️  Monitoring failed, but deployment may still be successful" -ForegroundColor Yellow
        }
    }
}

# Fly.io deployment
if ($Platform -eq "flyio" -or $Platform -eq "both") {
    Write-Host "`n✈️ Deploying to Fly.io..." -ForegroundColor Green
    Write-Host "=========================" -ForegroundColor Green

    try {
        & ".\scripts\deploy-flyio.ps1" -AppName $AppName -SkipPreChecks
        $flyioSuccess = $true
        Write-Host "✅ Fly.io deployment completed!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Fly.io deployment failed: $($_.Exception.Message)" -ForegroundColor Red
        $flyioSuccess = $false
    }

    if ($flyioSuccess -and $Monitor) {
        Write-Host "`n📊 Starting Fly.io monitoring..." -ForegroundColor Blue
        Start-Sleep -Seconds 10
        try {
            $flyUrl = "https://$AppName.fly.dev"
            & ".\scripts\monitor-deployment.ps1" -Url $flyUrl -CheckInterval 30 -MaxAttempts 10
        } catch {
            Write-Host "⚠️  Monitoring failed, but deployment may still be successful" -ForegroundColor Yellow
        }
    }
}

# Final summary
Write-Host "`n🎯 DEPLOYMENT SUMMARY" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

if ($Platform -eq "railway" -or $Platform -eq "both") {
    if ($railwaySuccess) {
        Write-Host "✅ Railway: SUCCESSFUL" -ForegroundColor Green
        Write-Host "   Check Railway dashboard for final URL" -ForegroundColor Gray
    } else {
        Write-Host "❌ Railway: FAILED" -ForegroundColor Red
    }
}

if ($Platform -eq "flyio" -or $Platform -eq "both") {
    if ($flyioSuccess) {
        Write-Host "✅ Fly.io: SUCCESSFUL" -ForegroundColor Green
        Write-Host "   URL: https://$AppName.fly.dev" -ForegroundColor Gray
    } else {
        Write-Host "❌ Fly.io: FAILED" -ForegroundColor Red
    }
}

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Test login functionality at deployed URL(s)" -ForegroundColor Gray
Write-Host "2. Check browser console for JavaScript errors" -ForegroundColor Gray
Write-Host "3. Verify core AAC features work correctly" -ForegroundColor Gray
Write-Host "4. Use verification checklist: .ai\docs\DEPLOYMENT_VERIFICATION_CHECKLIST.md" -ForegroundColor Gray

Write-Host "`n🔗 Useful Commands:" -ForegroundColor Cyan
if ($Platform -eq "railway" -or $Platform -eq "both") {
    Write-Host "Railway logs: railway logs" -ForegroundColor Gray
    Write-Host "Railway status: railway status" -ForegroundColor Gray
}
if ($Platform -eq "flyio" -or $Platform -eq "both") {
    Write-Host "Fly.io logs: fly logs" -ForegroundColor Gray
    Write-Host "Fly.io status: fly status" -ForegroundColor Gray
}

Write-Host "`n🎉 Deployment process complete!" -ForegroundColor Green
# Deployment Monitoring Script
# Usage: .\scripts\monitor-deployment.ps1 [-Url "https://your-app.railway.app"] [-CheckInterval 30]

param(
    [string]$Url = "",
    [int]$CheckInterval = 30,
    [int]$MaxAttempts = 20,
    [switch]$Verbose = $false
)

Write-Host "📊 LingoLinq AAC - Deployment Monitor" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Get Railway app URL if not provided
if (-not $Url) {
    Write-Host "🔍 Getting Railway application URL..." -ForegroundColor Blue
    try {
        $Url = railway domain 2>$null
        if ($Url) {
            Write-Host "✅ Found Railway URL: $Url" -ForegroundColor Green
        } else {
            Write-Host "❌ Could not get Railway URL automatically" -ForegroundColor Red
            $Url = Read-Host "Please enter your application URL"
        }
    } catch {
        Write-Host "❌ Railway CLI not available or no project found" -ForegroundColor Red
        $Url = Read-Host "Please enter your application URL"
    }
}

# Ensure URL has https://
if ($Url -notmatch "^https?://") {
    $Url = "https://$Url"
}

Write-Host "`n🎯 Monitoring deployment at: $Url" -ForegroundColor Green
Write-Host "⏱️  Check interval: $CheckInterval seconds" -ForegroundColor Blue
Write-Host "🔢 Max attempts: $MaxAttempts" -ForegroundColor Blue

# Health check endpoints
$endpoints = @{
    "Main Page" = "$Url"
    "Health Check" = "$Url/health"
    "Login Page" = "$Url/login"
}

$attempt = 0
$allHealthy = $false

do {
    $attempt++
    Write-Host "`n🔄 Check #$attempt of $MaxAttempts" -ForegroundColor Yellow
    Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

    $healthyCount = 0
    $totalEndpoints = $endpoints.Count

    foreach ($endpointName in $endpoints.Keys) {
        $endpointUrl = $endpoints[$endpointName]

        try {
            Write-Host "   Testing $endpointName..." -NoNewline -ForegroundColor Blue

            $response = Invoke-WebRequest -Uri $endpointUrl -Method GET -TimeoutSec 30 -UseBasicParsing

            if ($response.StatusCode -eq 200) {
                Write-Host " ✅ OK ($($response.StatusCode))" -ForegroundColor Green
                $healthyCount++

                if ($Verbose) {
                    Write-Host "      Response time: $($response.Headers['X-Response-Time'] -or 'N/A')" -ForegroundColor Gray
                    Write-Host "      Content length: $($response.Content.Length) bytes" -ForegroundColor Gray
                }

                # Check for specific JavaScript errors on login page
                if ($endpointName -eq "Login Page" -and $response.Content) {
                    if ($response.Content -match "LingoLinqAAC\.track_error is not a function") {
                        Write-Host "      ⚠️  WARNING: JavaScript namespace error detected" -ForegroundColor Yellow
                    } else {
                        Write-Host "      ✅ No JavaScript namespace errors detected" -ForegroundColor Green
                    }
                }

            } else {
                Write-Host " ⚠️  Unexpected status: $($response.StatusCode)" -ForegroundColor Yellow
            }

        } catch {
            $errorMessage = $_.Exception.Message
            if ($errorMessage -match "timeout") {
                Write-Host " ⏰ TIMEOUT" -ForegroundColor Yellow
            } elseif ($errorMessage -match "404") {
                Write-Host " 📄 NOT FOUND" -ForegroundColor Yellow
            } elseif ($errorMessage -match "50[0-9]") {
                Write-Host " 🔥 SERVER ERROR" -ForegroundColor Red
            } else {
                Write-Host " ❌ ERROR" -ForegroundColor Red
            }

            if ($Verbose) {
                Write-Host "      Error: $errorMessage" -ForegroundColor Gray
            }
        }
    }

    # Summary for this check
    Write-Host "   📊 Summary: $healthyCount/$totalEndpoints endpoints healthy" -ForegroundColor Cyan

    if ($healthyCount -eq $totalEndpoints) {
        $allHealthy = $true
        Write-Host "   🎉 All endpoints are healthy!" -ForegroundColor Green
        break
    }

    if ($attempt -lt $MaxAttempts) {
        Write-Host "   ⏳ Waiting $CheckInterval seconds before next check..." -ForegroundColor Blue
        Start-Sleep -Seconds $CheckInterval
    }

} while ($attempt -lt $MaxAttempts)

# Final summary
Write-Host "`n📋 FINAL DEPLOYMENT STATUS" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

if ($allHealthy) {
    Write-Host "✅ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
    Write-Host "   All endpoints are responding correctly" -ForegroundColor Green
    Write-Host "   Application is ready for use" -ForegroundColor Green

    Write-Host "`n🔗 Application URLs:" -ForegroundColor Cyan
    foreach ($endpointName in $endpoints.Keys) {
        Write-Host "   $endpointName`: $($endpoints[$endpointName])" -ForegroundColor Gray
    }

    Write-Host "`n🧪 Recommended next steps:" -ForegroundColor Cyan
    Write-Host "   1. Test login functionality manually" -ForegroundColor Gray
    Write-Host "   2. Check browser console for JavaScript errors" -ForegroundColor Gray
    Write-Host "   3. Verify application features work as expected" -ForegroundColor Gray
    Write-Host "   4. Set up monitoring for production use" -ForegroundColor Gray

} else {
    Write-Host "❌ DEPLOYMENT INCOMPLETE" -ForegroundColor Red
    Write-Host "   Some endpoints are not responding correctly" -ForegroundColor Red
    Write-Host "   Check Railway logs for more details: railway logs" -ForegroundColor Yellow

    Write-Host "`n🔧 Troubleshooting steps:" -ForegroundColor Cyan
    Write-Host "   1. Check Railway dashboard for build errors" -ForegroundColor Gray
    Write-Host "   2. Review deployment logs: railway logs" -ForegroundColor Gray
    Write-Host "   3. Verify environment variables are set correctly" -ForegroundColor Gray
    Write-Host "   4. Try redeploying: railway up --detach" -ForegroundColor Gray
}

Write-Host "`n⏰ Total monitoring time: $([math]::Round(($attempt * $CheckInterval) / 60, 1)) minutes" -ForegroundColor Blue
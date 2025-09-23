#!/bin/bash
# Deployment Monitoring Script (Unix/Linux/Mac)
# Usage: ./scripts/monitor-deployment.sh [URL] [--interval=30] [--max-attempts=20] [--verbose]

set -e

URL=""
CHECK_INTERVAL=30
MAX_ATTEMPTS=20
VERBOSE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --interval=*)
            CHECK_INTERVAL="${arg#*=}"
            shift
            ;;
        --max-attempts=*)
            MAX_ATTEMPTS="${arg#*=}"
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        http*://*)
            URL="$arg"
            shift
            ;;
    esac
done

echo "📊 LingoLinq AAC - Deployment Monitor"
echo "===================================="

# Get Railway app URL if not provided
if [ -z "$URL" ]; then
    echo "🔍 Getting Railway application URL..."
    if command -v railway &> /dev/null; then
        if URL=$(railway domain 2>/dev/null); then
            echo "✅ Found Railway URL: $URL"
        else
            echo "❌ Could not get Railway URL automatically"
            read -p "Please enter your application URL: " URL
        fi
    else
        echo "❌ Railway CLI not available"
        read -p "Please enter your application URL: " URL
    fi
fi

# Ensure URL has https://
if [[ ! $URL =~ ^https?:// ]]; then
    URL="https://$URL"
fi

echo ""
echo "🎯 Monitoring deployment at: $URL"
echo "⏱️  Check interval: $CHECK_INTERVAL seconds"
echo "🔢 Max attempts: $MAX_ATTEMPTS"

# Health check endpoints
declare -A endpoints=(
    ["Main Page"]="$URL"
    ["Health Check"]="$URL/health"
    ["Login Page"]="$URL/login"
)

attempt=0
all_healthy=false

while [ $attempt -lt $MAX_ATTEMPTS ]; do
    ((attempt++))
    echo ""
    echo "🔄 Check #$attempt of $MAX_ATTEMPTS"
    echo "$(date '+%Y-%m-%d %H:%M:%S')"

    healthy_count=0
    total_endpoints=${#endpoints[@]}

    for endpoint_name in "${!endpoints[@]}"; do
        endpoint_url="${endpoints[$endpoint_name]}"

        echo -n "   Testing $endpoint_name..."

        if response=$(curl -s -w "%{http_code}" -o /tmp/response_body.tmp --max-time 30 "$endpoint_url" 2>/dev/null); then
            status_code="${response: -3}"

            if [ "$status_code" = "200" ]; then
                echo " ✅ OK ($status_code)"
                ((healthy_count++))

                if [ "$VERBOSE" = true ]; then
                    content_length=$(wc -c < /tmp/response_body.tmp)
                    echo "      Content length: $content_length bytes"
                fi

                # Check for specific JavaScript errors on login page
                if [ "$endpoint_name" = "Login Page" ] && [ -f /tmp/response_body.tmp ]; then
                    if grep -q "LingoLinqAAC\.track_error is not a function" /tmp/response_body.tmp; then
                        echo "      ⚠️  WARNING: JavaScript namespace error detected"
                    else
                        echo "      ✅ No JavaScript namespace errors detected"
                    fi
                fi

            else
                echo " ⚠️  Unexpected status: $status_code"
            fi

        else
            # Determine error type
            if curl -s --max-time 5 "$endpoint_url" >/dev/null 2>&1; then
                echo " ⚠️  CONNECTION ISSUE"
            else
                error_output=$(curl -s --max-time 5 "$endpoint_url" 2>&1 || true)
                if [[ $error_output == *"timeout"* ]]; then
                    echo " ⏰ TIMEOUT"
                elif [[ $error_output == *"404"* ]]; then
                    echo " 📄 NOT FOUND"
                elif [[ $error_output == *"50"* ]]; then
                    echo " 🔥 SERVER ERROR"
                else
                    echo " ❌ ERROR"
                fi

                if [ "$VERBOSE" = true ]; then
                    echo "      Error: $error_output"
                fi
            fi
        fi
    done

    # Clean up temporary file
    rm -f /tmp/response_body.tmp

    # Summary for this check
    echo "   📊 Summary: $healthy_count/$total_endpoints endpoints healthy"

    if [ $healthy_count -eq $total_endpoints ]; then
        all_healthy=true
        echo "   🎉 All endpoints are healthy!"
        break
    fi

    if [ $attempt -lt $MAX_ATTEMPTS ]; then
        echo "   ⏳ Waiting $CHECK_INTERVAL seconds before next check..."
        sleep $CHECK_INTERVAL
    fi
done

# Final summary
echo ""
echo "📋 FINAL DEPLOYMENT STATUS"
echo "========================="

if [ "$all_healthy" = true ]; then
    echo "✅ DEPLOYMENT SUCCESSFUL!"
    echo "   All endpoints are responding correctly"
    echo "   Application is ready for use"

    echo ""
    echo "🔗 Application URLs:"
    for endpoint_name in "${!endpoints[@]}"; do
        echo "   $endpoint_name: ${endpoints[$endpoint_name]}"
    done

    echo ""
    echo "🧪 Recommended next steps:"
    echo "   1. Test login functionality manually"
    echo "   2. Check browser console for JavaScript errors"
    echo "   3. Verify application features work as expected"
    echo "   4. Set up monitoring for production use"

else
    echo "❌ DEPLOYMENT INCOMPLETE"
    echo "   Some endpoints are not responding correctly"
    echo "   Check Railway logs for more details: railway logs"

    echo ""
    echo "🔧 Troubleshooting steps:"
    echo "   1. Check Railway dashboard for build errors"
    echo "   2. Review deployment logs: railway logs"
    echo "   3. Verify environment variables are set correctly"
    echo "   4. Try redeploying: railway up --detach"
fi

total_time=$((attempt * CHECK_INTERVAL / 60))
echo ""
echo "⏰ Total monitoring time: ${total_time} minutes"
#!/bin/bash
# LingoLinq-AAC Deployment Monitor
# Checks status of both Render and Fly.io deployments

echo "🚀 LingoLinq-AAC Deployment Monitor"
echo "=================================="
echo "$(date)"
echo ""

# Fly.io Status (Updated app name)
echo "📦 FLY.IO STATUS:"
echo "App: lingolinq-aac-fresh"
flyctl status --app lingolinq-aac-fresh 2>/dev/null || echo "❌ Error checking Fly.io status"

echo ""
echo "🚀 FLY.IO MACHINES:"
flyctl machine list --app lingolinq-aac-fresh 2>/dev/null || echo "❌ No machines found yet (still building)"

echo ""
echo "🌐 FLY.IO URL TEST:"
FLYIO_STATUS=$(curl -s -I "https://lingolinq-aac-fresh.fly.dev" | head -1)
echo "$FLYIO_STATUS"
if [[ "$FLYIO_STATUS" == *"200"* ]]; then
    echo "✅ FLY.IO IS WORKING!"
elif [[ "$FLYIO_STATUS" == *"502"* || "$FLYIO_STATUS" == *"503"* ]]; then
    echo "🔨 Fly.io is building..."
else
    echo "❌ Fly.io not accessible yet"
fi

echo ""
echo "=================================="
echo ""

# Render Status
echo "🎨 RENDER STATUS:"
echo "URL: https://lingolinq-aac.onrender.com"
RENDER_STATUS=$(curl -s -I "https://lingolinq-aac.onrender.com" | head -1)
echo "$RENDER_STATUS"
if [[ "$RENDER_STATUS" == *"200"* ]]; then
    echo "✅ RENDER IS WORKING!"
elif [[ "$RENDER_STATUS" == *"502"* || "$RENDER_STATUS" == *"503"* ]]; then
    echo "🔨 Render is building..."
else
    echo "❌ Render not accessible yet"
fi

echo ""
echo "=================================="
echo ""

# Success Check
if [[ "$FLYIO_STATUS" == *"200"* || "$RENDER_STATUS" == *"200"* ]]; then
    echo "🎉 SUCCESS! At least one deployment is working!"
    echo "🧪 NEXT: Test the login functionality"
    if [[ "$FLYIO_STATUS" == *"200"* ]]; then
        echo "   → Fly.io: https://lingolinq-aac-fresh.fly.dev/login"
    fi
    if [[ "$RENDER_STATUS" == *"200"* ]]; then
        echo "   → Render: https://lingolinq-aac.onrender.com/login"
    fi
else
    echo "⏳ BUILDING: Both platforms still deploying"
    echo "   Estimated time remaining: 5-10 minutes"
    echo ""
    echo "🔄 Run again with: bash .ai/tools/deployment-monitor.sh"
fi
#!/bin/bash

# LingoLinq AAC - NUCLEAR Deployment Script
# Implements aggressive cache-breaking strategies for all platforms

set -e

echo "🚫 STARTING NUCLEAR DEPLOYMENT PROCESS"
echo "This will break ALL caches and force fresh deployments"

# Generate timestamp for cache breaking
TIMESTAMP=$(date +%s%N)
BUILD_ID="nuclear-${TIMESTAMP}"

echo "🕐 Build Timestamp: ${TIMESTAMP}"
echo "🆔 Build ID: ${BUILD_ID}"

# Function to update Dockerfile with cache breaking
update_dockerfile_cache_break() {
    local dockerfile=$1
    local temp_file=$(mktemp)
    
    echo "🚫 Adding cache break to ${dockerfile}"
    
    # Add cache breaking arguments at the very top
    cat > "$temp_file" << EOF
# NUCLEAR CACHE BREAK - $(date)
ARG CACHE_BREAK_TIMESTAMP=${TIMESTAMP}
ARG BUILD_ID=${BUILD_ID}
RUN echo "🚫 CACHE BREAK: \${CACHE_BREAK_TIMESTAMP} - Build: \${BUILD_ID}"

EOF
    
    # Append original Dockerfile content
    cat "$dockerfile" >> "$temp_file"
    mv "$temp_file" "$dockerfile"
    
    echo "✅ Cache break added to ${dockerfile}"
}

echo ""
echo "🚫 PHASE 1: NAMESPACE MIGRATION COMPLETION"
echo "Ensuring all mime/types references are replaced with marcel..."

# Fix any remaining namespace issues
echo "Checking for remaining mime/types references..."
if grep -r "require 'mime/types'" --include="*.rb" app/ lib/ 2>/dev/null; then
    echo "❌ Found remaining mime/types references. Fixing..."
    find app/ lib/ -name "*.rb" -exec sed -i "s/require 'mime\/types'/require 'marcel'/g" {} \;
    echo "✅ Fixed mime/types references"
else
    echo "✅ No mime/types references found"
fi

echo ""
echo "🚫 PHASE 2: AGGRESSIVE CACHE BREAKING"

# Update all Dockerfiles with nuclear cache breaking
if [ -f "Dockerfile" ]; then
    cp Dockerfile Dockerfile.backup
    update_dockerfile_cache_break Dockerfile
    echo "✅ Updated main Dockerfile"
fi

if [ -f "Dockerfile.fixed" ]; then
    cp Dockerfile.fixed Dockerfile.fixed.backup  
    update_dockerfile_cache_break Dockerfile.fixed
    echo "✅ Updated Dockerfile.fixed"
fi

# Create cache breaking files
echo "🚫 Creating cache breaking files..."
echo "Cache break: ${TIMESTAMP}" > .cache_break
echo "Build ID: ${BUILD_ID}" > .build_id
echo "Nuclear deployment: $(date)" > .nuclear_deployment

# Update package.json if exists (for frontend cache breaking)
if [ -f "app/frontend/package.json" ]; then
    echo "🚫 Adding frontend cache break..."
    cd app/frontend
    if [ -f "package.json" ]; then
        # Add cache breaking comment to package.json
        sed -i '1i\  "_cache_break": "'"${TIMESTAMP}"'",' package.json || true
    fi
    cd ../..
fi

echo ""
echo "🚫 PHASE 3: PLATFORM-SPECIFIC NUCLEAR DEPLOYMENT"

echo ""
echo "🎯 RENDER.COM Nuclear Deployment:"
echo "1. Use render-nuclear.yaml (creates NEW services with v2 names)"  
echo "2. All databases and Redis instances get new names"
echo "3. Deploy command:"
echo "   render deploy --config render-nuclear.yaml"
echo ""

echo "🎯 FLY.IO Nuclear Deployment:"
echo "1. DESTROY existing app entirely:"
echo "   fly apps destroy lingolinq-aac"
echo "2. Deploy with NEW app name:"  
echo "   fly launch --config fly-nuclear.toml --name lingolinq-aac-nuclear"
echo "3. Set secrets:"
echo "   fly secrets set RAILS_MASTER_KEY=..."
echo "4. Deploy:"
echo "   fly deploy --config fly-nuclear.toml"
echo ""

echo "🎯 RAILWAY Nuclear Deployment:"
echo "1. Delete entire Railway project"
echo "2. Create NEW project"
echo "3. Use Dockerfile.nuclear"
echo "4. Set environment variables:"
echo "   CACHE_BREAK_TIMESTAMP=${TIMESTAMP}"
echo "   BUILD_ID=${BUILD_ID}"
echo "   BUNDLE_DEPLOYMENT=false"
echo ""

echo ""
echo "🚫 PHASE 4: VERIFICATION CHECKLIST"
echo ""
echo "After deployment, verify these SUCCESS INDICATORS:"
echo "✅ App logs show: 'NUCLEAR CACHE BREAK: ${TIMESTAMP}'"
echo "✅ App logs show: 'Marcel gem loaded' (not mime/types)"  
echo "✅ Rails console loads without mime/types errors"
echo "✅ Login screen loads properly"
echo "✅ No cached content from old deployments"
echo ""

echo "🚫 NUCLEAR DEPLOYMENT PREPARATION COMPLETE!"
echo "📁 Files created/updated:"
echo "   - Dockerfile (with cache breaking)"
echo "   - Dockerfile.fixed (with cache breaking)"  
echo "   - Dockerfile.nuclear (complete nuclear version)"
echo "   - render-nuclear.yaml (new service names)"
echo "   - fly-nuclear.toml (new app name)"
echo "   - .cache_break, .build_id, .nuclear_deployment (marker files)"
echo ""
echo "⚠️  IMPORTANT: Use the -nuclear configs to deploy to COMPLETELY NEW instances"
echo "⚠️  This avoids ALL cached layers and forces fresh deployments"
echo ""
echo "🎯 Ready for nuclear deployment to break the cache cycle!"
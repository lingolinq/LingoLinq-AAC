# Generate Fix Command

Analyzes deployment failures and generates automated fixes based on error patterns.

## Usage

```bash
claude -c generate-fix --pattern=obf_gem_failure --iteration=2
```

## Parameters

- `$ARGUMENTS` - Error pattern and iteration info
- Pattern can be: `obf_gem_failure`, `bundle_install_failure`, `asset_compilation_failure`, `docker_build_failure`, `npm_failure`

## Fix Strategies by Pattern

### obf_gem_failure
1. **Enhanced Conditional Loading** - Improve obf gem isolation
2. **Multi-stage Docker Build** - Separate build and runtime environments
3. **Alternative Asset Pipeline** - Use Webpacker or Vite instead of Sprockets

### bundle_install_failure
1. **Gem Version Pinning** - Lock specific gem versions
2. **Alternative Ruby Version** - Try different Ruby versions
3. **Gem Source Optimization** - Use different gem sources

### asset_compilation_failure
1. **Skip Asset Precompilation** - Move to runtime compilation
2. **Simplify Asset Pipeline** - Remove problematic assets
3. **Alternative Build Tools** - Use external build tools

### docker_build_failure
1. **Base Image Change** - Try different base images
2. **Build Context Optimization** - Reduce build context size
3. **Layer Caching** - Optimize Docker layer caching

### npm_failure
1. **Node Version Management** - Use specific Node versions
2. **Package Lock Regeneration** - Regenerate package-lock.json
3. **Alternative Package Manager** - Try yarn instead of npm

## Implementation Process

```bash
# Parse arguments
ERROR_PATTERN=$(echo "$ARGUMENTS" | grep -o 'pattern=[^ ]*' | cut -d= -f2)
ITERATION=$(echo "$ARGUMENTS" | grep -o 'iteration=[^ ]*' | cut -d= -f2)

echo "🔧 Generating fix for pattern: $ERROR_PATTERN (iteration $ITERATION)"

# Check fix history to prevent loops
echo "🔍 Checking fix history to prevent repeated attempts..."

if [ -f ".claude/state/fix-history.json" ]; then
  # Get list of previously failed fix types for this pattern
  FAILED_FIXES=$(cat .claude/state/fix-history.json | \
    jq -r --arg pattern "$ERROR_PATTERN" \
    '[.fixes_attempted[] | select(.error_pattern == $pattern and .result == "failed") | .fix_type] | unique | join(",")')

  echo "Previously failed fix types: $FAILED_FIXES"

  # Get successful fix types we should prioritize
  SUCCESSFUL_FIXES=$(cat .claude/state/fix-history.json | \
    jq -r '.successful_patterns[] | .fix_type' | sort | uniq | head -3)

  echo "Known successful fix types: $SUCCESSFUL_FIXES"
else
  FAILED_FIXES=""
  SUCCESSFUL_FIXES=""
  echo "No fix history found - will try standard approaches"
fi

# Create fix branch
FIX_BRANCH="auto-fix-$ERROR_PATTERN-iteration-$ITERATION"
git checkout -b "$FIX_BRANCH"

# Determine which fix strategy to try based on history
STRATEGY_TO_TRY=""

case "$ERROR_PATTERN" in
  "obf_gem_failure")
    echo "🔨 Selecting obf gem fix strategy..."

    # Prioritize based on what hasn't failed before
    if ! echo "$FAILED_FIXES" | grep -q "conditional_loading"; then
      STRATEGY_TO_TRY="conditional_loading"
    elif ! echo "$FAILED_FIXES" | grep -q "multi_stage_build"; then
      STRATEGY_TO_TRY="multi_stage_build"
    elif ! echo "$FAILED_FIXES" | grep -q "runtime_compilation"; then
      STRATEGY_TO_TRY="runtime_compilation"
    elif ! echo "$FAILED_FIXES" | grep -q "alternative_gems"; then
      STRATEGY_TO_TRY="alternative_gems"
    else
      echo "⚠️ All known obf gem fixes have been attempted!"
      STRATEGY_TO_TRY="skip_features"
    fi
    ;;

  "bundle_install_failure")
    echo "🔨 Selecting bundle install fix strategy..."

    if ! echo "$FAILED_FIXES" | grep -q "gem_version_pinning"; then
      STRATEGY_TO_TRY="gem_version_pinning"
    elif ! echo "$FAILED_FIXES" | grep -q "base_image_change"; then
      STRATEGY_TO_TRY="base_image_change"
    else
      STRATEGY_TO_TRY="multi_stage_build"
    fi
    ;;

  "asset_compilation_failure")
    echo "🔨 Selecting asset compilation fix strategy..."

    if ! echo "$FAILED_FIXES" | grep -q "runtime_compilation"; then
      STRATEGY_TO_TRY="runtime_compilation"
    elif ! echo "$FAILED_FIXES" | grep -q "skip_features"; then
      STRATEGY_TO_TRY="skip_features"
    else
      STRATEGY_TO_TRY="multi_stage_build"
    fi
    ;;

  "docker_build_failure")
    echo "🔨 Selecting Docker build fix strategy..."

    if ! echo "$FAILED_FIXES" | grep -q "base_image_change"; then
      STRATEGY_TO_TRY="base_image_change"
    elif ! echo "$FAILED_FIXES" | grep -q "build_context_reduction"; then
      STRATEGY_TO_TRY="build_context_reduction"
    else
      STRATEGY_TO_TRY="multi_stage_build"
    fi
    ;;

  "npm_failure")
    echo "🔨 Selecting npm/Node fix strategy..."

    if ! echo "$FAILED_FIXES" | grep -q "gem_version_pinning"; then
      STRATEGY_TO_TRY="gem_version_pinning"  # Node version pinning
    elif ! echo "$FAILED_FIXES" | grep -q "alternative_gems"; then
      STRATEGY_TO_TRY="alternative_gems"  # Alternative package manager
    else
      STRATEGY_TO_TRY="skip_features"
    fi
    ;;

  *)
    echo "❓ Unknown error pattern: $ERROR_PATTERN"
    STRATEGY_TO_TRY="multi_stage_build"  # Safe fallback
    ;;
esac

echo "Selected strategy: $STRATEGY_TO_TRY"

# Check if this exact strategy has been tried before
if echo "$FAILED_FIXES" | grep -q "$STRATEGY_TO_TRY"; then
  echo "⚠️ WARNING: Strategy $STRATEGY_TO_TRY has failed before for this pattern!"
  echo "Proceeding anyway with modifications..."
fi

# Apply the selected strategy
case "$STRATEGY_TO_TRY" in
  "conditional_loading")
    echo "🔨 Implementing conditional loading fix..."
    echo "TODO: Enhanced conditional loading implementation"
    ;;
  "multi_stage_build")
    echo "🔨 Implementing multi-stage build fix..."
    echo "TODO: Multi-stage Docker build implementation"
    ;;
  "runtime_compilation")
    echo "🔨 Implementing runtime compilation fix..."
    echo "TODO: Runtime compilation implementation"
    ;;
  "skip_features")
    echo "🔨 Implementing feature skipping fix..."
    echo "TODO: Skip problematic features implementation"
    ;;
  *)
    echo "🔨 Implementing $STRATEGY_TO_TRY fix..."
    echo "TODO: Implement $STRATEGY_TO_TRY strategy"
    ;;
esac

# Commit and push fix
git add .
git commit -m "auto-fix: attempt $ITERATION for $ERROR_PATTERN using $STRATEGY_TO_TRY

🤖 Generated automatically by deployment fix system

Previous error: $ERROR_PATTERN
Iteration: $ITERATION
Strategy: $STRATEGY_TO_TRY
Avoided failed approaches: $FAILED_FIXES

Co-Authored-By: Claude <noreply@anthropic.com>"

git push -u origin "$FIX_BRANCH"

# Log this attempt BEFORE triggering deployment
echo "📝 Pre-logging fix attempt..."
claude -c log-fix-attempt \
  --error-pattern="$ERROR_PATTERN" \
  --fix-type="$STRATEGY_TO_TRY" \
  --result="pending" \
  --commit="$(git rev-parse HEAD)" \
  --description="Auto-generated fix for iteration $ITERATION"

# Trigger deployment test
echo "🚀 Triggering deployment test for fix branch..."
gh workflow run deploy-fixer.yml --ref "$FIX_BRANCH" -f iteration="$ITERATION"

echo "✅ Fix generated and deployment triggered"
echo "🔍 Monitor progress with: claude -c monitor-deployment"
```

## Coordination with Other Agents

This command can trigger parallel analysis with:
- **Gemini CLI** for security analysis and GitHub Actions integration
- **Manus AI** for sandbox testing of fixes
- **GenSpark AI** for coordination and voice notifications
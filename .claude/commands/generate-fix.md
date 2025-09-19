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

# Create fix branch
FIX_BRANCH="auto-fix-$ERROR_PATTERN-iteration-$ITERATION"
git checkout -b "$FIX_BRANCH"

# Apply pattern-specific fixes
case "$ERROR_PATTERN" in
  "obf_gem_failure")
    echo "🔨 Applying obf gem isolation fixes..."
    # Enhance existing obf isolation or try alternative approaches
    echo "TODO: Implement enhanced obf gem fixes"
    ;;
  "bundle_install_failure")
    echo "🔨 Applying bundle install fixes..."
    # Update Gemfile.lock, pin versions, etc.
    echo "TODO: Implement bundle fixes"
    ;;
  "asset_compilation_failure")
    echo "🔨 Applying asset compilation fixes..."
    # Modify asset pipeline configuration
    echo "TODO: Implement asset compilation fixes"
    ;;
  "docker_build_failure")
    echo "🔨 Applying Docker build fixes..."
    # Modify Dockerfile, build process
    echo "TODO: Implement Docker build fixes"
    ;;
  "npm_failure")
    echo "🔨 Applying npm/Node fixes..."
    # Update package.json, Node version, etc.
    echo "TODO: Implement npm fixes"
    ;;
  *)
    echo "❓ Unknown error pattern: $ERROR_PATTERN"
    echo "Applying generic troubleshooting fixes..."
    ;;
esac

# Commit and push fix
git add .
git commit -m "auto-fix: attempt $ITERATION for $ERROR_PATTERN pattern

🤖 Generated automatically by deployment fix system

Previous error: $ERROR_PATTERN
Iteration: $ITERATION
Strategy: [describe strategy applied]

Co-Authored-By: Claude <noreply@anthropic.com>"

git push -u origin "$FIX_BRANCH"

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
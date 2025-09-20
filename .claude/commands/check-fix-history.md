# Check Fix History Command

Prevents automation loops by checking if a fix has been attempted before.

## Usage

```bash
claude -c check-fix-history --error-pattern=obf_gem_failure --fix-type=conditional_loading
```

## Parameters

- `--error-pattern`: The error pattern being addressed
- `--fix-type`: The type of fix being attempted

## Fix Types

- `conditional_loading` - Conditional gem loading with environment variables
- `multi_stage_build` - Multi-stage Docker builds
- `runtime_compilation` - Move asset compilation to runtime
- `gem_version_pinning` - Pin specific gem versions
- `base_image_change` - Change Docker base image
- `alternative_gems` - Replace problematic gems
- `skip_features` - Skip problematic features entirely
- `build_context_reduction` - Reduce Docker build context
- `dependency_isolation` - Isolate specific dependencies

## Process

```bash
# Parse arguments
ERROR_PATTERN=$(echo "$ARGUMENTS" | grep -o 'error-pattern=[^ ]*' | cut -d= -f2)
FIX_TYPE=$(echo "$ARGUMENTS" | grep -o 'fix-type=[^ ]*' | cut -d= -f2)

echo "🔍 Checking fix history for pattern: $ERROR_PATTERN, fix type: $FIX_TYPE"

# Load fix history
if [ ! -f ".claude/state/fix-history.json" ]; then
  echo "📝 Creating new fix history file..."
  cat > .claude/state/fix-history.json << EOF
{
  "version": "1.0",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "description": "Tracks all attempted fixes to prevent automation loops",
  "fixes_attempted": [],
  "successful_patterns": [],
  "failed_patterns": [],
  "blacklisted_approaches": [],
  "next_fix_id": 1
}
EOF
fi

# Check if this exact fix has been tried before
PREVIOUS_ATTEMPTS=$(cat .claude/state/fix-history.json | \
  jq --arg pattern "$ERROR_PATTERN" --arg fix "$FIX_TYPE" \
  '[.fixes_attempted[] | select(.error_pattern == $pattern and .fix_type == $fix)] | length')

if [ "$PREVIOUS_ATTEMPTS" -gt 0 ]; then
  echo "⚠️  DUPLICATE FIX DETECTED!"
  echo "This fix has been attempted $PREVIOUS_ATTEMPTS time(s) before."

  # Get details of previous attempts
  cat .claude/state/fix-history.json | \
    jq --arg pattern "$ERROR_PATTERN" --arg fix "$FIX_TYPE" \
    '.fixes_attempted[] | select(.error_pattern == $pattern and .fix_type == $fix)'

  # Check if it's blacklisted
  BLACKLISTED=$(cat .claude/state/fix-history.json | \
    jq --arg pattern "$ERROR_PATTERN" --arg fix "$FIX_TYPE" \
    '[.blacklisted_approaches[] | select(.error_pattern == $pattern and .fix_type == $fix)] | length')

  if [ "$BLACKLISTED" -gt 0 ]; then
    echo "❌ FIX IS BLACKLISTED - Do not attempt again!"
    exit 1
  fi

  echo "💡 Suggesting alternative approaches..."
  # Suggest alternatives based on successful patterns
  cat .claude/state/fix-history.json | \
    jq --arg pattern "$ERROR_PATTERN" \
    '.successful_patterns[] | select(.error_pattern == $pattern)'

  echo "🤔 Consider trying a different fix type or combining approaches."
  exit 2
else
  echo "✅ Fix not attempted before - safe to proceed"
  exit 0
fi
```

## Exit Codes

- `0`: Safe to proceed (fix not attempted before)
- `1`: Fix is blacklisted (do not attempt)
- `2`: Fix attempted before (suggest alternatives)
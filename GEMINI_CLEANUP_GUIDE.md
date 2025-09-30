# Gemini CLI Repository Cleanup Guide

## Problem Solved
Prevents Gemini CLI from exhausting token quotas when analyzing large repositories by:
1. **Excluding vendor directories** - Ignores 3,000+ bower/node_modules files
2. **Using faster model** - Switches to `gemini-2.0-flash-exp` (60 req/min vs 2 req/min)
3. **Phased execution** - Breaks cleanup into manageable phases with rate limiting

## Quick Start

### Check Quota Status
```bash
devin gemini-safe
# or
bin/repo-cleanup-gemini quota
```

### Run Specific Cleanup Phase
```bash
# Phase 1: Identify duplicates
devin cleanup gemini 1

# Phase 2: Review AI docs
devin cleanup gemini 2

# Phase 3: Review dev docs
devin cleanup gemini 3

# Phase 4: Review root files
devin cleanup gemini 4
```

### Run All Phases (Takes ~5-10 minutes)
```bash
devin cleanup gemini all
# or
bin/repo-cleanup-gemini all
```

## What Each Phase Does

### Phase 1: Identify Duplicate Documentation
- Scans root-level and `docs/` markdown files
- Identifies duplicate content across multiple files
- Detects outdated or superseded documentation
- Recommends consolidation actions
- **Files analyzed**: ~30-40 markdown files

### Phase 2: Review AI Development Documentation
- Reviews `.ai/docs/`, `docs/ai/`, `CLAUDE.md`, `GEMINI.md`
- Finds overlapping AI tool instructions
- Identifies redundant onboarding guides
- Recommends consolidation of AI-related docs
- **Files analyzed**: ~15-20 markdown files

### Phase 3: Review Development Documentation
- Reviews `docs/development/` and `docs/planning/`
- Identifies outdated setup instructions
- Finds completed roadmap items that can be archived
- Detects duplicate architecture documentation
- **Files analyzed**: ~25-35 markdown files

### Phase 4: Review Root-Level Documentation
- Reviews all root-level `*.md` files
- Determines essential vs. non-essential files
- Recommends files to move to subdirectories
- Identifies consolidation opportunities with README.md
- **Files analyzed**: ~10-15 markdown files

## Configuration Files

### .geminiignore
Located at: `C:\Users\skawa\LingoLinq-AAC\.geminiignore`

Excludes from Gemini analysis:
- `app/frontend/bower_components/` (29MB+)
- `app/frontend/node_modules/` (size varies)
- `vendor/bundle/`, `log/`, `tmp/`, etc.
- Generated assets and build artifacts
- AI session files and temporary data

**Result**: Reduces scannable files from 3,320+ to ~150 relevant files

### ~/.gemini/settings.json
Located at: `C:\Users\skawa\.gemini\settings.json`

Key settings:
```json
{
  "general": {
    "model": "gemini-2.0-flash-exp"
  },
  "performance": {
    "cacheEnabled": true,
    "rateLimitingEnabled": true
  }
}
```

**Benefits**:
- `gemini-2.0-flash-exp`: 60 requests/min (vs 2 req/min for gemini-2.5-pro)
- `cacheEnabled`: Reuses previously loaded context
- `rateLimitingEnabled`: Prevents hitting rate limits

## Rate Limiting Strategy

The `bin/repo-cleanup-gemini` script includes:
- **3-second delay** between Gemini API calls
- **Quota check** before starting each phase
- **Graceful degradation** if rate limit hit
- **Context size limiting** via .geminiignore

## Troubleshooting

### Still Getting 429 Errors?
1. **Check your quota**: `devin gemini-safe`
2. **Wait 60 seconds**: Free tier resets per-minute quota
3. **Run phases individually**: Instead of "all", run phases 1-4 separately
4. **Verify .geminiignore**: Ensure bower_components/ is excluded

### Gemini Not Using .geminiignore?
The `.geminiignore` file works similarly to `.gitignore` but is specific to Gemini CLI 0.6.1+. If it's not being respected:
1. Check Gemini CLI version: `gemini --version` (should be 0.6.1+)
2. Ensure `.geminiignore` is in repository root
3. Try specifying files explicitly in the script

### Model Not Changing?
If Gemini still uses `gemini-2.5-pro`:
1. Verify `~/.gemini/settings.json` has `"model": "gemini-2.0-flash-exp"`
2. Pass model explicitly: `gemini "prompt" --model gemini-2.0-flash-exp`
3. Check for project-level `.gemini/settings.json` overrides

## Best Practices

### Before Running Cleanup
1. **Check quota**: `devin gemini-safe`
2. **Review .geminiignore**: Ensure large dirs are excluded
3. **Run one phase first**: Test with phase 1 before running all
4. **Commit your work**: Cleanup may recommend destructive actions

### During Cleanup
1. **Monitor output**: Watch for rate limit warnings
2. **Save recommendations**: Gemini outputs JSON reports
3. **Don't interrupt**: Let each phase complete
4. **Wait between phases**: If running manually, wait 10-15 seconds

### After Cleanup
1. **Review recommendations**: Don't blindly delete files
2. **Test changes**: Ensure removed files aren't referenced elsewhere
3. **Archive, don't delete**: Move to `.ai/archive/` instead of deleting
4. **Update documentation**: Reflect changes in README.md

## Example Session

```bash
# 1. Check quota
$ devin gemini-safe
✅ Quota available

# 2. Run phase 1 to identify duplicates
$ devin cleanup gemini 1
📋 Phase 1: Identify Duplicate/Redundant Documentation
🤖 Running Gemini (rate-limited)...
[Gemini outputs JSON report with recommendations]

# 3. Review recommendations and decide on actions

# 4. Run remaining phases
$ devin cleanup gemini 2
$ devin cleanup gemini 3
$ devin cleanup gemini 4

# 5. Archive files instead of deleting
$ mkdir -p .ai/archive/pre-cleanup-$(date +%Y%m%d)
$ mv OUTDATED_FILE.md .ai/archive/pre-cleanup-20250930/
```

## Integration with devin Command

The `devin` helper now includes:

```bash
# Check Gemini quota
devin gemini-safe

# Run cleanup phases
devin cleanup gemini [phase]
devin cleanup gemini 1      # Phase 1 only
devin cleanup gemini all    # All phases

# View cleanup help
bin/repo-cleanup-gemini help
```

## Token Usage Comparison

### Before Optimization
- **Model**: gemini-2.5-pro
- **Rate Limit**: 2 requests/minute
- **Files Scanned**: 3,320+
- **Result**: Token exhaustion in <1 minute

### After Optimization
- **Model**: gemini-2.0-flash-exp
- **Rate Limit**: 60 requests/minute (30x faster)
- **Files Scanned**: ~150 (via .geminiignore)
- **Result**: Completes all phases in 5-10 minutes

## Related Files
- `.geminiignore` - File exclusion patterns
- `~/.gemini/settings.json` - Gemini CLI configuration
- `bin/repo-cleanup-gemini` - Phased cleanup orchestrator
- `bin/devin` - Development helper with cleanup commands
- `bin/token-status` - AI token usage monitoring

## Support
For issues with:
- **Gemini CLI**: https://github.com/google/gemini-cli
- **Token exhaustion**: Check this guide and `.geminiignore`
- **Project-specific**: See `CLAUDE.md` for project context

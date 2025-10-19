# Deployment Debugging Checklist

**Use this when asking AI assistants about deployment issues**

## Quick Reference Prompt

Copy and paste this to start any deployment debugging session:

```
I need help debugging a deployment issue. Before suggesting solutions, please complete the mandatory pre-flight check documented in CLAUDE.md and GEMINI.md:

Phase 1: Read these files and summarize key findings:
1. README.md
2. .env.example
3. fly.toml
4. Dockerfile.singlestage
5. config/puma.rb
6. bin/render-start.sh

Phase 2: Verify current state:
- Which Dockerfile is fly.toml using?
- Are all required secrets configured?
- Is Puma binding to 0.0.0.0?
- Is the startup script using -C config/puma.rb?
- What's the current deployment status?

Phase 3: Check known issues in CLAUDE.md

Phase 4: Provide summary, root cause, solution, and verification steps

Here's the specific error I'm seeing: [DESCRIBE ERROR HERE]
```

## Why This Works

### Common Deployment Mistake Pattern
1. **User reports error**: "App won't start"
2. **AI assistant jumps to solution**: "Let me fix your Puma config"
3. **Problem**: Configuration was already correct, real issue was elsewhere
4. **Result**: Wasted time, broken working config, frustrated user

### Better Pattern (With Checklist)
1. **User reports error**: "App won't start"
2. **AI reads all config files first**: Discovers Puma is correct
3. **AI checks deployment logs**: Finds real issue (missing secret)
4. **AI provides targeted fix**: Set the missing secret
5. **Result**: Issue solved in one attempt

## File Reading Cost Analysis

| Action | Token Cost | Success Rate Without Reading Files |
|--------|-----------|-----------------------------------|
| Read 6 config files | ~5,000 tokens | N/A |
| Guess at solution | ~500 tokens | 30% |
| Try solution, fail, repeat 3x | ~8,000 tokens | 60% |
| **Read first, then solve** | **~6,000 tokens** | **95%** |

**Reading configuration files FIRST is actually more token-efficient!**

## What Each File Tells You

### README.md
- Project history (Heroku fork)
- Known working deployment methods
- Current deployment status
- Required prerequisites

### .env.example
- ALL environment variables needed
- Which ones are required vs optional
- Expected format for secrets
- External service integrations

### fly.toml
- Which Dockerfile is being used
- Health check endpoints
- Port configuration
- Environment variables
- Release commands (migrations)

### Dockerfile.singlestage
- How the build environment is constructed
- Which Ruby/Node versions
- What gems/packages are installed
- Asset compilation steps

### config/puma.rb
- **CRITICAL**: Web server binding address
- Must be `0.0.0.0` (not localhost)
- Port configuration
- Worker/thread settings

### bin/render-start.sh
- **CRITICAL**: Actual startup command
- Must use `-C config/puma.rb` flag
- Environment setup
- Pre-start checks

## Red Flags to Look For

### ❌ Common Misconfigurations

1. **Puma binding to wrong address**
   ```ruby
   # WRONG - Won't accept external connections
   bind "tcp://127.0.0.1:#{port}"
   bind "tcp://localhost:#{port}"

   # CORRECT - Accepts connections from Fly.io proxy
   bind "tcp://0.0.0.0:#{port}"
   ```

2. **Startup script ignoring config**
   ```bash
   # WRONG - Uses default Puma settings
   bundle exec puma

   # CORRECT - Loads our configuration
   bundle exec puma -C config/puma.rb
   ```

3. **Missing required secrets**
   ```bash
   # Check these are set in Fly.io
   flyctl secrets list
   # Must see:
   # - DATABASE_URL
   # - SECRET_KEY_BASE
   # - RAILS_MASTER_KEY
   # - DISABLE_OBF_GEM
   ```

4. **Wrong Dockerfile referenced**
   ```toml
   # fly.toml must match actual Dockerfile name
   [build]
     dockerfile = "Dockerfile.singlestage"  # Must exist!
   ```

## Example: Successful Debugging Session

**User**: "Deployment fails with 'app not listening on expected address'"

**AI (Following Checklist)**:
1. ✅ Reads README.md → Sees this is a Heroku fork, expects Procfile-style setup
2. ✅ Reads .env.example → Sees all required secrets
3. ✅ Reads fly.toml → Using `Dockerfile.singlestage`
4. ✅ Reads Dockerfile.singlestage → Build looks correct
5. ✅ Reads config/puma.rb → **Already binding to 0.0.0.0** ✨
6. ✅ Reads bin/render-start.sh → **Already using -C config/puma.rb** ✨
7. ✅ Checks deployment status → App is actually running!

**AI Response**:
> "After reviewing all configuration files, I found that your Puma config and startup script are both correct. The warning you saw was just a temporary message during startup. Your app is actually running successfully at https://lingolinq-aac.fly.dev with health checks passing."

**Time saved**: 30+ minutes of unnecessary debugging

## Example: What NOT to Do

**User**: "Deployment fails with 'app not listening on expected address'"

**AI (Skipping Checklist)**:
> "I'll fix your Puma configuration to bind to 0.0.0.0"

[Edits already-correct config, breaks something else]

**Result**: Config was already correct, now have new problem

## Summary

✅ **DO**: Read all 6 files before suggesting changes
✅ **DO**: Verify current deployment status
✅ **DO**: Check known issues in CLAUDE.md
✅ **DO**: Provide targeted, specific solutions

❌ **DON'T**: Jump to solutions without understanding configuration
❌ **DON'T**: Guess at what files contain
❌ **DON'T**: Edit working configurations
❌ **DON'T**: Run deployment commands without reading docs first

**Remember**: 5 minutes reading config files saves hours of debugging!

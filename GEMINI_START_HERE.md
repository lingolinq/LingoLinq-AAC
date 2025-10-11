# Gemini CLI - Start Here (Streamlined Handoff)

## 🚨 CURRENT PROBLEM (Oct 6, 2025)

**Symptom:** App loads but CSS/JS/images return 500 errors (see screenshot)
**Status:** Redis ✅ Database ✅ App Running ✅ Assets ❌

## 🎯 YOUR MISSION

Fix asset serving. Investigation priority:
1. Check if `/app/public/assets/` exists in container
2. Check `config/environments/production.rb` asset settings
3. Verify asset precompilation succeeded in Docker build

## ⚠️ TOKEN SAVERS (READ FIRST!)

```bash
# ✅ ALWAYS use --detach on deploys (saves 25,000 tokens)
flyctl deploy --app lingolinq-aac --detach
sleep 180
flyctl status --app lingolinq-aac

# ✅ ALWAYS pipe logs through tail/head
flyctl logs --app lingolinq-aac | tail -30

# ❌ NEVER run bare deploy or logs (burns quota instantly)
```

## 🔍 INVESTIGATION COMMANDS

```bash
# 1. Check if assets exist
flyctl ssh console --app lingolinq-aac --command "ls -lah /app/public/assets/ | head -20"

# 2. Check production.rb config
flyctl ssh console --app lingolinq-aac --command "grep 'assets\|static' /app/config/environments/production.rb"

# 3. Check logs for asset errors (TAIL IT!)
flyctl logs --app lingolinq-aac | grep -i "500\|asset\|sprocket" | tail -30
```

## ❌ DON'T RE-FIX (Already Working)

- ✅ Redis: Deployed, connected, working
- ✅ Database: PostgreSQL connected
- ✅ Bundler: Using 2.5.6 (don't change)
- ✅ `config/initializers/resque.rb`: Conditional on REDIS_URL
- ✅ `app/models/concerns/permissions.rb`: Has nil check on line 24

## 📚 FULL DETAILS (Only read if needed)

- **Architecture**: `GEMINI.md`
- **Previous attempts**: `DEBUGGING_LOG.md` (327 lines - only read if stuck)
- **Today's fixes**: `GEMINI_HANDOFF_OCT6.md` (300 lines - comprehensive context)

## 🎬 START COMMAND

```bash
# First, check if assets were precompiled
flyctl ssh console --app lingolinq-aac --command "ls /app/public/assets/"
```

**Expected:** Should list files like `application-9ff0235dc34d39a6....css`
**If missing:** Asset precompilation failed in Docker build
**If exists:** Configuration issue in production.rb or fly.toml

---
**Quick Win Hypothesis:** Assets compiled but `config.assets.compile = true` causing runtime failures. Should be `false` with precompiled assets.

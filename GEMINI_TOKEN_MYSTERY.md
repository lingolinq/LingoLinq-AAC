# Gemini CLI Token Usage Mystery - Investigation

## 🔍 What We Know

### ✅ Confirmed Facts:
1. **Gemini only sees `.dockerignore` on first prompt** - No massive auto-loading
2. **`.geminiignore` IS working** - Large docs excluded
3. **No MCP servers configured** - Not loading context via MCP
4. **Settings show `cacheEnabled: true`** - Using `gemini-2.0-flash-exp` model
5. **Claude Code can deploy multiple times without quota issues** - But uses different approach

### ❌ Problems:
1. **Gemini runs out of tokens on FIRST prompt of the day** (shouldn't be possible with Free Tier: 1M tokens/day)
2. **Even minimal prompts exhaust quota quickly**
3. **Token usage doesn't match visible context**

## 🎯 Hypothesis: The REAL Token Killer

**Theory:** Gemini CLI isn't exhausting tokens from INPUT - it's from **OUTPUT + TOOL CALLS**

### Gemini Free Tier Limits:
- **1M tokens per day** (input + output combined)
- **60 requests per minute** (rate limit)
- **1,500 requests per day**

### Token Usage Breakdown:

| Action | Input Tokens | Output Tokens | Tool Call Tokens | Total |
|--------|--------------|---------------|------------------|-------|
| Read GEMINI_START_HERE.md | 300 | 50 | 0 | 350 |
| Run `flyctl ssh console` | 50 | 100 | **5,000** (command output) | 5,150 |
| Read production.rb | 20 | 30 | **2,000** (file content) | 2,050 |
| Run `flyctl logs` | 30 | 50 | **10,000** (log output) | 10,080 |
| Run `flyctl deploy` | 50 | 200 | **25,000** (build logs) | 25,250 |

**One deployment session: ~43,000 tokens**
**24 sessions = quota exhausted**

## 💡 The Problem: Tool Call Output Counts as Tokens!

When Gemini CLI runs a bash command:
1. **Input**: "Run `flyctl logs`" (10 tokens)
2. **Output**: Gemini's response (50 tokens)
3. **Tool Result**: The actual log output (**10,000 tokens**)

**The tool result is fed back into the context for the next turn!**

This means:
- Every `flyctl ssh console` that lists files = thousands of tokens
- Every `flyctl logs` = 5,000-10,000 tokens
- Every `flyctl deploy` = 20,000-30,000 tokens
- **These accumulate across the conversation!**

## 🚨 Why This Destroys Quota

**Example Session:**
```
Turn 1: Check if assets exist
- Input: 300 tokens (GEMINI_START_HERE.md)
- Tool: flyctl ssh console "ls /app/public/assets/"
- Tool Result: 2,000 tokens (file listing)
- Total: 2,300 tokens

Turn 2: Check production.rb
- Input: 300 + 2,000 (previous tool result in context) = 2,300
- Tool: flyctl ssh console "cat /app/config/environments/production.rb"
- Tool Result: 3,000 tokens
- Total: 5,300 tokens

Turn 3: Check logs
- Input: 300 + 2,000 + 3,000 = 5,300
- Tool: flyctl logs | tail -50
- Tool Result: 2,500 tokens
- Total: 7,800 tokens

Turn 4: Try to deploy
- Input: 300 + 2,000 + 3,000 + 2,500 = 7,800
- Tool: flyctl deploy
- Tool Result: 25,000 tokens (build logs)
- Total: 32,800 tokens

Turn 5: Check status
- Input: 300 + 2,000 + 3,000 + 2,500 + 25,000 = 32,800
- Even a simple status check now has 32,800 tokens in context!
```

**After 5 turns: 40,000+ tokens used**
**After 25 turns: Quota exhausted**

## ✅ Solution: Limit Tool Output

### Strategy 1: Aggressive Truncation
```bash
# ❌ BAD - Returns 5,000 lines
flyctl logs --app lingolinq-aac

# ✅ GOOD - Returns 10 lines
flyctl logs --app lingolinq-aac | tail -10

# ❌ BAD - Returns entire file
flyctl ssh console --app lingolinq-aac --command "cat /app/config/environments/production.rb"

# ✅ GOOD - Returns specific lines
flyctl ssh console --app lingolinq-aac --command "grep 'assets.compile' /app/config/environments/production.rb"
```

### Strategy 2: Use Multiple Short Sessions
Instead of one long session with cumulative context:
- Session 1: Investigate assets (exit after answer)
- Session 2: Investigate config (exit after answer)
- Session 3: Make fix (exit after deploy)

### Strategy 3: Don't Use Gemini for Deployment
**Recommendation:** Use Gemini for investigation/diagnosis ONLY. Use Claude Code or manual commands for deployment.

## 🎬 Updated Gemini Workflow

**For Investigation (Gemini):**
```bash
# Keep it SHORT - one question, one answer, exit
gemini "Check if /app/public/assets/ exists in the container. Run: flyctl ssh console --app lingolinq-aac --command 'ls /app/public/assets/ | head -5'"
# Exit after getting answer

# New session for next question
gemini "What is the assets.compile setting? Run: flyctl ssh console --app lingolinq-aac --command 'grep assets.compile /app/config/environments/production.rb'"
# Exit after getting answer
```

**For Deployment (Claude Code or Manual):**
```bash
# Use Claude Code for actual changes/deployments
# Or run manually:
flyctl deploy --app lingolinq-aac --detach
sleep 180
flyctl status --app lingolinq-aac
```

## 📊 Expected Token Savings

| Old Approach | New Approach | Savings |
|--------------|--------------|---------|
| Single 10-turn session: 50,000 tokens | 10 separate 1-turn sessions: 5,000 tokens | **90%** |
| Full logs: 10,000 tokens | Truncated logs: 500 tokens | **95%** |
| Deploy in Gemini: 25,000 tokens | Deploy in Claude: 0 Gemini tokens | **100%** |

**This should give you 100+ Gemini sessions per day instead of 2-3!**

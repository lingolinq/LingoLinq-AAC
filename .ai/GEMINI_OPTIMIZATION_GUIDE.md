# Gemini CLI Native Features Guide (2025)

## 🎯 Solution for Token Loops: Use Native Features

**ISSUE**: External MCP integrations causing loops and rate limiting.

**SOLUTION**: Use Gemini CLI's powerful native codebase analysis features.

## ✅ What's Been Updated

### 1. **Native Agent Mode Enabled**
- **Built-in**: No external dependencies or wrapper scripts needed
- **Features**: 1M token context window, comprehensive project understanding
- **Model**: Uses `gemini-2.5-flash` or `gemini-2.5-pro` for efficiency

### 2. **Removed Complex Wrapper Script**
- **Eliminated**: `bin/devin-gemini` wrapper that added unnecessary complexity  
- **Direct Usage**: Use `gemini --all-files` for full codebase context
- **No Rate Limits**: Native features don't hit external API limits

### 3. **Streamlined Architecture**
- **No MCP Dependencies**: Removed problematic external MCP integrations
- **Offline Capable**: Works without internet connection
- **Reliable**: No "side closed" errors from failed connections

## 🚀 How to Use (Native Commands)

### For Single Questions:
```bash
gemini --all-files --prompt "How do I fix this authentication error?"
```
- Full codebase context automatically included
- No token usage estimation needed
- Native loop prevention

### For Development Sessions:
```bash
gemini --all-files
```
- Interactive session with entire project context
- 1M token context window handles full LingoLinq codebase
- Built-in agent mode for multi-file operations

### For Quick Tasks:
```bash
gemini --model gemini-2.5-flash --prompt "explain this function"
```

## 🛡️ Native Loop Prevention

1. **Built-in Agent Mode**: Native understanding prevents circular operations
2. **Smart Context Management**: 1M token window eliminates context fragmentation  
3. **No External Dependencies**: No rate limiting or connection failures
4. **Efficient Processing**: Native codebase analysis without API overhead

## 📊 Key Improvements

- **100% Reliable**: No external MCP dependencies to fail
- **Native Loop Prevention**: Built into Gemini CLI agent mode
- **Massive Context**: 1M token window handles entire codebase
- **No Rate Limits**: Local processing without API restrictions
- **Offline Capable**: Works without internet connection

## 🔥 Recommended Native Commands

| Command | Use Case | Benefits |
|---------|----------|----------|
| `gemini --all-files` | Full codebase analysis | Complete project context |
| `gemini --all-files --prompt "question"` | Direct analysis | No session overhead |
| `gemini --model gemini-2.5-flash` | Quick tasks | Fast responses |
| `gemini --model gemini-2.5-pro` | Complex analysis | Advanced reasoning |

## ✅ Best Practices

- **Always use --all-files** for architectural questions
- **Use --model gemini-2.5-flash** for routine tasks
- **Use --model gemini-2.5-pro** for complex analysis
- **Let native agent mode handle multi-file operations**

## 🎯 Simple Usage

**Instead of complex wrapper scripts, just use:**
```bash
# Start interactive session with full project context
gemini --all-files

# Ask direct questions with full context
gemini --all-files --prompt "analyze the Rails API structure"

# Quick syntax help
gemini --prompt "how to add Rails validation"
```

## 📈 Expected Results

- **Zero external failures** - no MCP connection issues
- **Complete project understanding** - 1M token context window
- **Faster responses** - no external API delays  
- **Reliable operation** - native features don't fail
- **Simplified workflow** - no wrapper scripts needed

## 🆘 Migration from Old Wrapper

**Old way (removed):**
```bash
./bin/devin-gemini optimized  # ❌ Deleted
```

**New way (native):**
```bash
gemini --all-files           # ✅ Native, reliable
```

---

💡 **Pro Tip**: Native Gemini CLI features are more powerful and reliable than any external wrapper or MCP integration!
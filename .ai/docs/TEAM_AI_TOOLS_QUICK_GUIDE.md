<!-- Last Updated: September 17, 2025 -->

# Team AI Tools Quick Guide - LingoLinq AAC

## 🚀 Quick Start Options

### **Option 1: Launch Both Tools (Recommended)**
```bash
# From project root in PowerShell
./.ai/tools/launch-agentic.ps1
```
This opens two separate windows:
- **Claude Code** with MCP/DeepWiki integration
- **Gemini CLI** with full codebase context

### **Option 2: Launch Individually**
```bash
# Claude Code with DeepWiki MCP
claude

# Gemini with full codebase context
gemini --all-files
```

---

## 🤖 Tool Comparison

| Feature | Claude Code + DeepWiki MCP | Gemini CLI --all-files |
|---------|---------------------------|------------------------|
| **Best For** | Architecture analysis, documentation queries | Code changes, debugging, syntax help |
| **Context Method** | MCP server (efficient) | Native 1M token window |
| **Codebase Access** | Via structured queries | Full file contents loaded |
| **Token Usage** | Minimal (MCP handles it) | Uses native context window |
| **Strengths** | Deep repo understanding, documentation | Direct code manipulation, large context |

---

## 🔍 Claude Code + DeepWiki MCP

### **What It Does**
- Connects to our repository through the DeepWiki MCP server
- Provides structured access to codebase without loading everything into tokens
- Can answer questions about architecture, components, and documentation

### **How to Use**

#### **If Not Already Running:**
```bash
# Start Claude Code from project root
cd C:\Users\skawa\LingoLinq-AAC
claude
```

#### **If Already in Claude Code Session:**
The MCP integration is automatic - just ask questions about the codebase:

```
Ask questions like:
• "What is the main architecture of this Rails + Ember project?"
• "How does user authentication work in this system?"
• "What are the main components of the AAC board system?"
• "Show me the recent changes in this repository"
```

#### **Manual MCP Commands (if needed):**
```bash
# Use specific MCP config
claude --mcp-config ".ai/tools/deepwiki-mcp/claude-mcp-config.json"
```

### **Best Use Cases:**
- 📖 Understanding project architecture
- 🔍 Finding specific functionality
- 📚 Getting documentation summaries
- 🗺️ Mapping code relationships

---

## 🔥 Gemini CLI --all-files

### **What It Does**
- Loads the entire codebase into Gemini's 1M token context window
- Provides direct access to all file contents
- Ideal for code changes and detailed analysis

### **How to Use**

#### **If Not Already Running:**
```bash
# Start Gemini with full codebase from project root
cd C:\Users\skawa\LingoLinq-AAC
gemini --all-files
```

#### **If Already in Gemini Session:**
```bash
# Exit current session (Ctrl+C or type 'exit')
# Restart with full context
gemini --all-files
```

#### **Alternative Gemini Commands:**
```bash
# Start with specific focus
gemini --all-files "Help me understand the Rails models"

# Debug mode (if needed)
gemini --all-files --debug
```

### **Best Use Cases:**
- ✏️ Making code changes across multiple files
- 🐛 Debugging complex issues
- 🔍 Finding specific code patterns
- ⚡ Quick syntax and logic questions

---

## 🛠️ Context Management Tools

### **Update Project Context**
```bash
# Update recent changes context (helps both tools)
./bin/devin update

# Generate fresh architecture map
./bin/devin generate

# Get current project context
./bin/devin context
```

### **For Deep Repository Questions**
```bash
# These show MCP commands to run manually if needed
./bin/devin ask "your question"
./bin/devin analyze repo
./bin/devin review commit-hash
```

---

## 💡 Pro Tips

### **When to Use Which Tool**

**Start with Claude Code + MCP when you need:**
- High-level understanding of the codebase
- Architecture explanations
- Documentation queries
- Understanding relationships between components

**Switch to Gemini --all-files when you need:**
- To make specific code changes
- Debug specific functions or classes
- Search for specific code patterns
- Work with multiple files simultaneously

### **Session Management**

**Claude Code:**
- MCP connection is automatic
- Just ask questions naturally
- No need to restart for different queries

**Gemini CLI:**
- Always start with `--all-files` for full context
- If you started without `--all-files`, restart the session
- Use `exit` or `Ctrl+C` to restart with better flags

### **Performance Tips**

1. **Update context regularly:**
   ```bash
   ./bin/devin update  # Updates recent changes
   ```

2. **Use specific queries:**
   - ✅ "How does user authentication work in this Rails app?"
   - ❌ "Tell me everything about this codebase"

3. **Combine tools:**
   - Use Claude for understanding architecture
   - Use Gemini for implementing changes

---

## ✅ Verifying MCP Connection

### **How to Tell if DeepWiki MCP is Working**

**The startup screen won't mention MCP - this is normal!** Here's how to verify:

#### **Method 1: Ask About Your Codebase**
```
Ask Claude Code:
• "What is this LingoLinq AAC project about?"
• "What are the main Rails models in this application?"
• "How does the Ember frontend communicate with Rails?"
```

**✅ MCP Working:** Detailed, specific answers about your actual codebase
**❌ MCP Not Working:** Generic Rails/Ember answers, no specific knowledge

#### **Method 2: Check Available Tools**
```
Ask: "What MCP tools do you have access to?"
```
You should see: `mcp__deepwiki__ask_question`, `mcp__deepwiki__read_wiki_structure`, etc.

#### **Method 3: Test Direct MCP Usage**
```
Ask: "Use your DeepWiki tools to analyze this repository structure"
```

### **Signs MCP is Working vs Not Working**

| ✅ MCP Working | ❌ MCP Not Working |
|----------------|-------------------|
| Mentions specific files like `app/frontend/app/app.js` | Generic Rails/Ember information |
| Knows about LingoLinq AAC features | No knowledge of your project |
| References actual code structure | Says "I don't have access to files" |
| Mentions recent changes/commits | Only general programming advice |

---

## 🚨 Troubleshooting

### **Common Issues**

| Problem | Solution |
|---------|----------|
| "Token exhaustion" in Gemini | Use `gemini --all-files` instead of other commands |
| Claude can't see codebase | Verify you're in project root, MCP should be automatic |
| Gemini seems limited | Make sure you started with `--all-files` flag |
| Context seems outdated | Run `./bin/devin update` to refresh |

### **Reset Everything**
```bash
# Update context
./bin/devin update

# Restart both tools fresh
./.ai/tools/launch-agentic.ps1
```

---

## 📚 Quick Reference Commands

```bash
# Launch both tools
./.ai/tools/launch-agentic.ps1

# Individual launches
claude                          # Claude with MCP
gemini --all-files             # Gemini with full context

# Context management
./bin/devin update             # Update recent changes
./bin/devin context            # Show current context
./bin/devin generate           # Fresh architecture map

# Manual MCP (if needed)
claude --mcp-config ".ai/tools/deepwiki-mcp/claude-mcp-config.json"
```

## 🎯 Getting Started Checklist

1. ✅ Navigate to project root: `cd C:\Users\skawa\LingoLinq-AAC`
2. ✅ Update context: `./bin/devin update`
3. ✅ Launch tools: `./.ai/tools/launch-agentic.ps1`
4. ✅ Test Claude: Ask "What is this Rails + Ember project about?"
5. ✅ Test Gemini: Ask "Show me the main application models"

---

*Need help? Check the full documentation in `.ai/tools/AI_DEVELOPMENT_COMMANDS.md` or ask in your AI session!*
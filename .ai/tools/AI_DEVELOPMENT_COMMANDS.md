# LingoLinq AAC - AI Development Assistant Commands

## Terminal Requirements
- **Windows**: Use Git Bash, WSL, or PowerShell
- **Mac/Linux**: Regular terminal/bash
- **Location**: Run commands from the LingoLinq AAC project root directory

## Quick Start

### Launch Both AI Assistants
```bash
# Start both Claude Code and Gemini CLI in separate windows
./.ai/tools/launch-agentic.ps1  # PowerShell script (Windows)
```

### Individual AI Sessions
```bash
# Claude Code (with MCP/DeepWiki integration)
claude

# Gemini CLI (native features - full codebase context)
gemini --all-files
```

---

## Core Commands

### Project Context & Analysis

#### `./bin/devin context`
**Purpose**: Get comprehensive project architecture context  
**Uses**: Claude MCP system  
**Example**: 
```bash
./bin/devin context          # Full project context
./bin/devin context backend  # Backend-specific context
```

#### `gemini --all-files`
**Purpose**: Start Gemini with full codebase context  
**Uses**: Native 1M token context window  
**Example**:
```bash
gemini --all-files           # Full project context (recommended)
```

### AI Question & Answer

#### `./bin/devin ask "your question"`
**Purpose**: Ask Claude AI with full project context  
**Best for**: Architecture questions, complex analysis  
**Example**:
```bash
./bin/devin ask "How does the user authentication system work?"
./bin/devin ask "What are the main security vulnerabilities?"
```

#### `gemini --all-files --prompt "your question"`
**Purpose**: Ask Gemini with full codebase context  
**Best for**: Architecture analysis, code explanations, complex questions  
**Example**:
```bash
gemini --all-files --prompt "How do I add a new Rails model?"
gemini --all-files --prompt "Explain the Ember.js routing structure"
```

### Code Analysis & Review

#### `./bin/devin analyze repo`
**Purpose**: Deep architectural analysis of entire codebase  
**Output**: Architecture summary, hotspots, legacy risks  
**Example**:
```bash
./bin/devin analyze repo     # Full repository analysis
```

#### `./bin/devin analyze changes`
**Purpose**: Analyze recent Git changes for patterns and risks  
**Example**:
```bash
./bin/devin analyze changes  # Review recent commits
```

#### `./bin/devin review HEAD~5`
**Purpose**: AI code review of specific commits  
**Style**: "Roast-style" review (frank feedback)  
**Example**:
```bash
./bin/devin review HEAD~3    # Review last 3 commits
./bin/devin review abc123    # Review specific commit
```

### Context Management

#### `./bin/devin update`
**Purpose**: Update project context from recent Git changes  
**When to use**: Before asking complex questions or analysis  
**Example**:
```bash
./bin/devin update           # Refresh context with latest changes
```

#### `./bin/devin generate`
**Purpose**: Generate fresh architecture map  
**When to use**: After major structural changes  
**Example**:
```bash
./bin/devin generate         # Create new architecture overview
```

#### `gemini --all-files --prompt "generate project overview"`
**Purpose**: Generate comprehensive project analysis using full codebase  
**Example**:
```bash
gemini --all-files --prompt "generate a comprehensive project architecture overview"
```

### Documentation & Export

#### `./bin/devin export wiki`
**Purpose**: Export project context as formatted markdown  
**Output**: Documentation-ready markdown  
**Example**:
```bash
./bin/devin export wiki      # Generate project documentation
```

#### `./bin/devin deepwiki <url>`
**Purpose**: Aggregate DeepWiki content from external source  
**Example**:
```bash
./bin/devin deepwiki https://deepwiki.com/yourorg/yourproject
```

---

## Usage Patterns

### 🔥 Most Common Workflows

1. **Quick Question about Code**:
   ```bash
   gemini --all-files --prompt "How does board synchronization work?"
   ```

2. **Deep Architecture Analysis**:
   ```bash
   ./bin/devin update
   ./bin/devin analyze repo
   ```

3. **Code Review Session**:
   ```bash
   ./bin/devin review HEAD~5
   ```

4. **Get Full Project Context**:
   ```bash
   ./bin/devin context
   ```

### 🎯 Tool Selection Guide

| Task | Use Claude (`./bin/devin`) | Use Gemini (`gemini --all-files`) |
|------|---------------------------|----------------------------------|
| Architecture analysis | ✅ MCP + visual diagrams | ✅ Full codebase context |
| Code reviews | ✅ Roast-style feedback | ✅ Comprehensive feedback |
| Quick code questions | ⚠️ Might be overkill | ✅ Fast with full context |
| Complex integrations | ✅ Full system + external APIs | ✅ Full system awareness |
| Simple syntax help | ⚠️ Overkill | ✅ Perfect fit |
| Multi-file operations | ✅ Plan mode | ✅ Native agent mode |

---

## Troubleshooting

### Common Issues

**"Command not found" errors:**
```bash
# Make devin script executable
chmod +x ./bin/devin

# Check if Gemini CLI is installed
gemini --version
```

**"No project context found":**
```bash
# Generate fresh context for Claude
./bin/devin generate

# For Gemini, use --all-files for automatic context
gemini --all-files
```

**Gemini issues:**
- Always use `gemini --all-files` for full project context
- Use `gemini --model gemini-2.5-flash` for faster responses
- Native features prevent loops - no wrapper scripts needed

**Claude MCP connection issues:**
- Check if `.ai/tools/deepwiki-mcp/` exists
- Try `./bin/devin update` first

---

## Team Guidelines

### 👥 For New Team Members
1. Start with `gemini --all-files` for comprehensive codebase understanding
2. Use `./bin/devin context` for visual architecture diagrams
3. Ask specific questions rather than open-ended ones

### 👨‍💻 For Developers  
1. Run `./bin/devin update` before major analysis
2. Use `./bin/devin review` for commit feedback
3. Use `./bin/devin analyze changes` weekly

### 🏗️ For Architecture Decisions
1. Always use Claude (`./bin/devin`) for architectural questions
2. Get fresh context with `./bin/devin generate` 
3. Document decisions in project files

---

## Security Note
These tools only read your local codebase and don't send sensitive data externally beyond what the AI services normally process. All context is generated from your local Git repository.
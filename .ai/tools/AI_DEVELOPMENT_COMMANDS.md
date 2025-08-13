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

# Gemini CLI (standalone mode)
./bin/devin-gemini simple
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

#### `./bin/devin-gemini context`
**Purpose**: Get basic project context for Gemini  
**Uses**: Local files only  
**Example**:
```bash
./bin/devin-gemini context   # Basic project overview
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

#### `./bin/devin-gemini ask "your question"`
**Purpose**: Ask Gemini with basic project context  
**Best for**: Code explanations, quick questions  
**Example**:
```bash
./bin/devin-gemini ask "How do I add a new Rails model?"
./bin/devin-gemini ask "Explain the Ember.js routing structure"
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

#### `./bin/devin-gemini generate`
**Purpose**: Generate basic project overview for Gemini  
**Example**:
```bash
./bin/devin-gemini generate  # Create Gemini-specific context
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
   ./bin/devin-gemini ask "How does board synchronization work?"
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

| Task | Use Claude (`./bin/devin`) | Use Gemini (`./bin/devin-gemini`) |
|------|---------------------------|-----------------------------------|
| Architecture analysis | ✅ Better with MCP context | ❌ Limited context |
| Code reviews | ✅ Roast-style feedback | ⚠️ Basic feedback |
| Quick code questions | ⚠️ Might be overkill | ✅ Fast and simple |
| Complex integrations | ✅ Full system awareness | ❌ Limited awareness |
| Simple syntax help | ⚠️ Overkill | ✅ Perfect fit |

---

## Troubleshooting

### Common Issues

**"Command not found" errors:**
```bash
# Make scripts executable
chmod +x ./bin/devin
chmod +x ./bin/devin-gemini
```

**"No project context found":**
```bash
# Generate fresh context
./bin/devin generate
./bin/devin-gemini generate
```

**Gemini hanging/looping:**
- Use `./bin/devin-gemini` commands (standalone mode)
- Avoid the original `gemini -a` if it loops

**Claude MCP connection issues:**
- Check if `.ai/tools/deepwiki-mcp/` exists
- Try `./bin/devin update` first

---

## Team Guidelines

### 👥 For New Team Members
1. Start with `./bin/devin-gemini simple` for basic questions
2. Use `./bin/devin context` to understand the architecture
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
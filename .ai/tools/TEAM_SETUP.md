# LingoLinq AAC - Cross-Platform AI Development Setup

## Quick Setup for All Team Members

### Prerequisites
- Node.js 18+ installed
- Git bash (Windows), Terminal (macOS/Linux)
- Access to project repository

### 1. Install Required CLI Tools

**Claude CLI (Required)**
```bash
npm install -g @anthropic-ai/claude-cli
```

**Gemini CLI (Optional)**
```bash
npm install -g @google/generative-ai-cli
```

### 2. Configure API Keys

**For Claude:**
Add to your shell profile (`.bashrc`, `.zshrc`, etc.):
```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key-here"
```

**For Gemini (if using):**
```bash
export GOOGLE_AI_API_KEY="your-google-ai-api-key-here"
```

**Windows Users:**
Use PowerShell or add to your environment variables:
```powershell
setx ANTHROPIC_API_KEY "your-anthropic-api-key-here"
setx GOOGLE_AI_API_KEY "your-google-ai-api-key-here"
```

### 3. Validate Your Setup

After installation, test that everything works:
```bash
./bin/devin validate
```

Expected output:
```
🔍 Validating AI CLI setup...

✅ Claude CLI found: [path to claude]
   Version: [version number]
✅ Gemini CLI found: [path to gemini]
   Version: [version number]

🔑 Environment variables:
✅ ANTHROPIC_API_KEY is set
✅ GOOGLE_AI_API_KEY is set
```

## Usage Examples

### Quick Questions (Lightweight Context)
```bash
# Fast, cost-effective queries (~200 tokens)
./bin/devin ask "How do I add a new communication board?"
./bin/devin ask "What's the API endpoint for user authentication?"
./bin/devin ask "How do I run the test suite?"
```

### Detailed Questions (Full Context)
```bash
# Comprehensive analysis with full project context (~4K tokens)
./bin/devin ask-full "Explain the complete Rails API architecture"
./bin/devin ask-full "How does the Ember frontend sync with the backend?"
./bin/devin ask-full "What's the best way to add a new AAC feature?"
```

### Direct CLI Access
```bash
# Direct access without project context
./bin/devin claude "Debug this error in the authentication system"
./bin/devin gemini "Suggest improvements to the UI components"
```

### Advanced Commands
```bash
# Code review with context
./bin/devin review HEAD~3..HEAD

# Deep analysis
./bin/devin analyze repo
./bin/devin analyze changes

# Context management
./bin/devin update          # Refresh project context
./bin/devin context         # View current context
./bin/devin generate        # Generate fresh architecture map
```

## Platform-Specific Setup

### Windows Users
- **Git Bash (Recommended)**: Works with all commands
- **WSL**: Full Linux compatibility
- **Command Prompt**: Basic functionality
- **PowerShell**: Use for environment variable setup

**Common paths for CLIs:**
- `%APPDATA%\npm\claude.exe`
- `%APPDATA%\npm\gemini.exe`

### macOS Users
- **Intel Macs**: CLIs typically in `/usr/local/bin/`
- **Apple Silicon**: CLIs in `/opt/homebrew/bin/`
- Ensure Homebrew's bin directory is in your PATH

### Linux Users
- CLIs typically in `/usr/local/bin/` or `~/.local/bin/`
- Ensure npm global bin directory is in PATH:
  ```bash
  echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
  ```

## Troubleshooting

### "Command not found" errors
1. **Check installation:**
   ```bash
   ./bin/devin validate
   ```

2. **Verify npm global path:**
   ```bash
   npm config get prefix
   echo $PATH | grep -q "$(npm config get prefix)/bin" && echo "✅ PATH OK" || echo "❌ PATH missing npm bin"
   ```

3. **Fix PATH issues:**
   ```bash
   # Add to your shell profile
   export PATH="$(npm config get prefix)/bin:$PATH"
   ```

### API Key Issues
- Ensure keys are set as environment variables (not just for current session)
- Test with direct CLI commands:
  ```bash
  claude --help
  gemini --version
  ```
- Check key permissions in respective AI platforms

### npm Global Installation Issues
```bash
# Set custom npm prefix (if needed)
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"

# Reinstall CLIs
npm install -g @anthropic-ai/claude-cli @google/generative-ai-cli
```

### Windows-Specific Issues
- Use Git Bash for best compatibility
- If using WSL, install CLIs inside WSL environment
- Ensure Windows PATH includes npm global directory

## Team Best Practices

### Token Efficiency Guidelines
- **Use `ask` for**: Quick syntax questions, simple how-to queries, debugging help
- **Use `ask-full` for**: Architecture decisions, complex feature planning, code reviews
- **Use direct `claude`/`gemini` for**: General programming questions unrelated to project

### Context Management
- Run `./bin/devin update` before major analysis sessions
- Use `./bin/devin generate` after significant architectural changes
- Team leads should update context documentation regularly

### Multi-Model Workflow
- **Claude (`ask-full`)**: Senior developer decisions, code architecture, security
- **Gemini (`gemini-full`)**: Heavy lifting tasks, data analysis, documentation
- **Both**: Cross-validate important architectural decisions

## Advanced Features

### MCP Integration
The system includes Model Context Protocol (MCP) integration for:
- DeepWiki repository analysis
- Enhanced context sharing across AI models
- Persistent conversation context

### Custom Context
Project context is automatically managed in `.ai/context/` including:
- Architecture decisions
- Recent changes
- Team workflow patterns
- Implementation roadmaps

## Getting Help

1. **Validate setup**: `./bin/devin validate`
2. **Check commands**: `./bin/devin` (shows all available commands)
3. **Test with simple query**: `./bin/devin ask "Hello, are you working?"`

For team-specific issues, consult the project's `.ai/context/TEAM_WORKFLOW.md` file.
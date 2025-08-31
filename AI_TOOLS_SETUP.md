# AI Development Tools - New Team Setup Guide

## What These Tools Do
The LingoLinq AAC project includes AI development assistants that understand the codebase deeply. Instead of explaining the project structure every time, these tools provide instant context about:
- AAC communication boards and speech synthesis
- Rails + Ember.js architecture
- Database schemas and API patterns
- Mobile app coordination

## Quick Setup (5 minutes)

### 1. Install Claude Code (Primary AI Tool)
```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-cli

# Get your API key from: https://console.anthropic.com
export ANTHROPIC_API_KEY="your-anthropic-api-key-here"

# Windows users:
setx ANTHROPIC_API_KEY "your-anthropic-api-key-here"
```

### 2. Validate Setup
```bash
./bin/devin validate
```

**Expected output:**
```
✅ Claude CLI found: claude
✅ ANTHROPIC_API_KEY is set
✅ DeepWiki MCP integration ready
```

### 3. For Gemini AI (Optional)
If you want to use Gemini AI, install it separately and use Gemini's native "all files" feature instead of the Devin integration:
```bash
npm install -g @google/generative-ai-cli
export GOOGLE_AI_API_KEY="your-google-ai-api-key-here"
```
Then use Gemini directly with its built-in file understanding capabilities.

## How to Use AI Tools

### Quick Questions (Lightweight)
```bash
./bin/devin ask "How do I add a new communication board?"
./bin/devin ask "What's the API endpoint for user authentication?"
./bin/devin ask "How does the Ember frontend talk to Rails?"
```

### Complex Analysis (Full Context)
```bash
./bin/devin analyze repo
./bin/devin analyze changes
./bin/devin review HEAD~5..HEAD
```

### Code Reviews and Documentation
```bash
./bin/devin export wiki    # Generate project documentation
./bin/devin review abc123  # AI code review of commit
```

## What Makes This Special

### Pre-loaded Project Knowledge
The AI tools automatically know about:
- ✅ **Architecture**: Rails 6.1.7.10 + Ember.js 3.12 + PostgreSQL
- ✅ **Domain**: AAC communication, speech synthesis, accessibility requirements
- ✅ **Current Issues**: Ember.js needs upgrade, npm vulnerabilities, Docker setup
- ✅ **File Structure**: Where models, controllers, frontend components live
- ✅ **Recent Changes**: Git history and recent development work

### Cross-Platform Support  
The `bin/devin` script automatically finds Claude/Gemini on:
- Windows (npm global directories)
- macOS (homebrew, npm global)
- Linux (standard paths)

### Token Optimization
- **`ask`**: ~200 tokens (quick questions)
- **`ask-full`**: ~4K tokens (complex analysis)
- Saves money vs explaining project every time

## Advanced Features

### MCP (Model Context Protocol) - Optional
If you want enhanced repository analysis:

```bash
# The MCP configuration exists but is optional
# See .ai/tools/mcp/README.md for advanced setup
```

**Note**: MCP setup is more complex and not required for basic AI assistance.

## Troubleshooting

### "Command not found" errors
1. Check CLI installation: `npm list -g | grep claude`
2. Verify PATH includes npm global: `echo $PATH`  
3. Re-run validation: `./bin/devin validate`

### "API key not set" errors
1. Check environment variable: `echo $ANTHROPIC_API_KEY`
2. Restart terminal after setting keys
3. For persistent setup, add to `.bashrc` or `.zshrc`

### "Context not found" errors
1. Make sure you're in the project root directory
2. Check `.ai/context/` directory exists
3. Try updating context: `git log --oneline -10` (should work)

## Cost Management

### Token Usage Guidelines
- **Development questions**: Use `ask` (200 tokens ≈ $0.001)
- **Architecture decisions**: Use `ask-full` (4K tokens ≈ $0.02) 
- **Debugging**: Use `claude` directly for specific errors

### Best Practices
- Be specific in questions to avoid back-and-forth
- Use lightweight `ask` for syntax/quick questions
- Save `ask-full` for complex architectural decisions

## What New Teams Should Focus On

### Start With These Commands
1. `./bin/devin ask "What should I work on first?"`
2. `./bin/devin ask-full "Explain the current technical debt priorities"`
3. `./bin/devin ask "How do I run the development environment?"`

### Common Use Cases
- **Onboarding**: Understanding codebase structure and patterns
- **Debugging**: Getting help with Rails/Ember specific errors  
- **Security**: Guidance on fixing npm vulnerabilities and Ember upgrades
- **Architecture**: Planning frontend modernization approach

---

**Ready to start?** Run `./bin/devin validate` then try `./bin/devin ask "Hello, what can you help me with?"`
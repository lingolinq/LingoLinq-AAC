<!-- Last Updated: September 17, 2025 -->

# LingoLinq AAC - AI Development Assistant Guide

## 🎯 For Experienced Developers: Why This Matters

**TL;DR**: This setup gives you AI assistants that actually understand LingoLinq AAC's Rails + Ember architecture, AAC domain knowledge, and your current codebase state. Think of it as having a senior developer who's already studied the entire project sitting next to you.

### **Real Value for Full-Stack Development:**

**🔍 Instant Legacy Code Understanding**
- Ask "How does the board navigation system work?" and get Rails model relationships + Ember controller flows
- "What's the data flow for speech synthesis?" → Get the complete Web Speech API integration path
- No more spending hours tracing through unfamiliar code to understand AAC-specific patterns

**🛠️ Modernization & Refactoring Assistance**
- Paste any legacy file: "How should I modernize this Rails controller?"
- Get upgrade paths that preserve AAC functionality and accessibility requirements
- "Show me how to convert this Ember component to modern patterns" with context-aware suggestions

**🐛 Intelligent Debugging**
- "Why might speech synthesis fail on mobile?" → Get AAC-specific debugging steps
- AI understands your exact Rails/Ember setup, not generic answers
- Get UX/UI bug analysis that considers AAC user accessibility needs

**⚡ Feature Development Acceleration**
- "How do I add a new communication board feature?" → Get architecture guidance that fits existing patterns
- AI knows your JSON API structure, mobile app compatibility requirements, and AAC standards
- Get code suggestions that follow your project's established conventions

### **Practical Development Scenarios:**

```bash
# Understanding unfamiliar AAC code
./bin/devin ask "Explain the board merger system and how it handles conflicts"

# Modernization planning  
./bin/devin ask "What's the best way to upgrade this Ember component to modern syntax while preserving accessibility?"

# Bug hunting
./bin/devin ask "User reports speech synthesis cuts off on iOS Safari - what should I check?"

# Feature planning
./bin/devin ask "I need to add voice recording to boards - show me the existing audio pipeline and where to integrate"
```

### **What Makes This Different from ChatGPT/Generic AI:**

| Generic AI | LingoLinq AI Setup |
|------------|-------------------|
| "Here's how Rails models generally work" | "Your Board model has these specific AAC relationships and here's how it integrates with the Ember frontend" |
| "Try using Web Speech API" | "Your speech synthesis is implemented in app/frontend/app/utils/speech.js with these AAC-specific customizations" |
| "Here's a basic accessibility pattern" | "Your switch navigation follows these specific patterns in the codebase and here's how to extend it" |
| Generic code examples | Code suggestions that match your existing patterns and AAC requirements |

### **The MCP (Model Context Protocol) Advantage:**
- **Deep Codebase Knowledge**: AI has read and understands your entire Rails + Ember structure
- **AAC Domain Expertise**: Understands communication boards, speech synthesis, accessibility standards
- **Current State Awareness**: Knows your recent commits, current branch, and project evolution
- **Architecture Understanding**: Gets the Rails API + Ember frontend + mobile app coordination

**Bottom Line**: Instead of explaining your project context every time, the AI already knows LingoLinq AAC inside and out.

---

## Prerequisites & Setup

### Prerequisites
- **Git** installed and configured
- **Node.js 18+** installed
- **Ruby 3.2.8+** installed (for full development)
- **Terminal**: Git Bash (Windows), Terminal (Mac/Linux)

### Step-by-Step Setup

#### 1. Clone and Configure Repository
```bash
# Clone the repository (if not already done)
git clone https://github.com/your-org/LingoLinq-AAC.git
cd LingoLinq-AAC

# Create environment file
cp .env.example .env
# OR for Docker setup:
cp .env.docker.example .env
```

#### 2. Add Your API Keys to .env
```bash
# Required for AI assistants
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_claude_api_key_here

# Required Rails settings (generate random strings)
SECURE_ENCRYPTION_KEY=your_random_24_char_string_here
SECURE_NONCE_KEY=your_other_random_24_char_string_here
COOKIE_KEY=your_cookie_encryption_key_here

# Basic settings
DEFAULT_HOST=localhost:3000
USER_KEY=your.email@company.com
```

#### 3. Get API Keys (Free)

**Gemini API Key (Free with generous limits):**
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API Key" or "Create API Key"
4. Copy the key to your `.env` file

**Claude API Key (Free $5 credit):**
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up for an account
3. Navigate to "API Keys" section
4. Create a new API key
5. Copy the key to your `.env` file

#### 4. Install Dependencies
```bash
# Install DeepWiki MCP server
cd .ai/tools/deepwiki-mcp
npm install
cd ../../..

# Install Claude Code CLI (separate installation)
# Visit: https://docs.anthropic.com/en/docs/claude-code
```

#### 5. Make Scripts Executable (Mac/Linux/WSL)
```bash
chmod +x bin/devin
# Gemini setup is automatic - no file needed
chmod +x .ai/tools/launch-agentic.ps1
```

#### 6. Test Setup
```bash
# Test DeepWiki MCP server
cd .ai/tools/deepwiki-mcp
npm start
# (Ctrl+C to stop, then cd back to root)

# Test AI assistants
./bin/devin context
gemini --all-files
```

### Quick Launch
```bash
# Start both Claude and Gemini assistants
./.ai/tools/launch-agentic.ps1
```

---

## 📋 Core Commands Reference

### Claude Code (Deep Analysis & Architecture)
*Use for: Complex questions, architecture analysis, code reviews, refactoring*

| Command | Usage | When to Use |
|---------|-------|-------------|
| `claude` | Launch Claude Code with full MCP context | Starting deep development sessions |
| `./bin/devin context` | Get comprehensive project overview | New team members, architecture reviews |
| `./bin/devin ask "question"` | Ask complex questions with full context | Architecture decisions, complex debugging |
| `./bin/devin analyze repo` | Deep repository analysis | Code audits, technical debt assessment |
| `./bin/devin review <commit>` | AI code review with project context | Before merging PRs, post-commit reviews |
| `./bin/devin update` | Refresh project context after changes | After branch switches, major commits |
| `./bin/devin generate` | Generate fresh architecture map | After major refactoring, new features |

### Gemini CLI (Quick Questions & Simple Tasks)
*Use for: Quick syntax help, simple explanations, rapid iterations*

| Command | Usage | When to Use |
|---------|-------|-------------|
| `gemini --all-files` | Start clean Gemini session | Quick questions, syntax help |
| `gemini --all-files "question"` | Ask with full codebase context | Complex development questions |

### Project Context & Documentation

| Command | Usage | When to Use |
|---------|-------|-------------|
| `./bin/devin context architecture` | Get architecture-specific context | Understanding system design |
| `./bin/devin context dependencies` | View dependency information | Dependency management, updates |
| `./bin/devin export wiki` | Export context as markdown | Sharing context with external tools |
| `./bin/devin deepwiki <url>` | Aggregate external documentation | Incorporating external resources |

---

## 🎯 Common Workflows

### 🔍 **New Team Member Onboarding**
```bash
# 1. Get project overview
./bin/devin context

# 2. Understand architecture
./bin/devin ask "Explain the Rails + Ember.js structure for AAC communication"

# 3. Get development setup guidance
./bin/devin ask "What do I need to know to start developing AAC features?"
```

### 🛠️ **Before Starting New Feature**
```bash
# 1. Analyze current state
./bin/devin analyze repo

# 2. Get architectural guidance
./bin/devin ask "How should I implement [feature] in the AAC system?"

# 3. Review related code
./bin/devin ask "Show me similar implementations for [related feature]"
```

### 🔍 **Code Review Process**
```bash
# Review specific commits
./bin/devin review HEAD~3

# Review current branch against main
./bin/devin review main..HEAD

# Get refactoring suggestions
# (In Claude Code session)
refactor app/models/board.rb
```

### 🐛 **Debugging AAC Issues**
```bash
# For complex AAC-specific bugs
./bin/devin ask "Why might speech synthesis fail for board navigation?"

# For quick syntax issues
gemini --all-files "Rails error: undefined method for Board"
```

### 📚 **Learning AAC Development**
```bash
# Understand AAC concepts
./bin/devin ask "Explain communication boards and Open Board Format"

# Learn project patterns
./bin/devin ask "What are the key AAC accessibility patterns in this codebase?"
```

---

## 🔥 Pro Tips

### **Choosing the Right Tool**

**Use Claude Code (`./bin/devin`) when:**
- Working on AAC-specific features
- Need deep architectural understanding
- Reviewing complex code changes
- Planning major refactoring
- Understanding accessibility requirements

**Use Gemini (`gemini --all-files`) when:**
- Quick syntax questions
- Simple debugging
- Fast iteration on small changes
- General programming concepts

### **Best Practices**

1. **Always start from project root**: Commands must be run from `LingoLinq-AAC/` directory
2. **Update context after branch switches**: Run `./bin/devin update` when changing branches
3. **Use specific questions**: Instead of "How does this work?", ask "How does board navigation work in the AAC system?"
4. **Leverage AAC context**: The AI understands accessibility, communication boards, and AAC-specific requirements

### **Advanced Usage**

```bash
# Analyze specific directories
./bin/devin analyze app/models/

# Get help with AAC standards
./bin/devin ask "How do we ensure WCAG compliance for communication boards?"

# Review accessibility features
./bin/devin ask "Analyze switch navigation implementation"

# Understand mobile app compatibility
./bin/devin ask "How does the JSON API support mobile AAC apps?"
```

---

## 💡 Helpful Tips & Troubleshooting

### **API Key Tips**
- **Gemini is completely free** with generous daily limits (perfect for development)
- **Claude gives $5 free credit** when you sign up (usually lasts weeks/months for development)
- **Keep your keys private** - never commit them to git or share publicly
- **Rate limits**: If you hit limits, the commands will show clear error messages

### **Setup Tips**
- **Windows users**: Use Git Bash for best compatibility with the scripts
- **The launch script handles dependencies**: Running `./.ai/tools/launch-agentic.ps1` will check and install missing dependencies automatically
- **No Ruby needed for AI features**: You can use all AI commands without setting up the full Rails environment
- **Docker alternative**: Use `.env.docker.example` if you prefer containerized development

### **Usage Tips**
- **Start with simple questions** to test your setup: `gemini --all-files "Hello"`
- **Use specific AAC terminology** - the AI understands communication boards, speech synthesis, accessibility features
- **Branch awareness**: The AI knows which branch you're on and your recent changes
- **Session persistence**: Claude Code sessions remember context until you close them

### **Common Issues & Solutions**

| Problem | Solution |
|---------|----------|
| "Command not found" | Make sure you're in the project root directory |
| "Permission denied" | Run `chmod +x bin/devin` on Mac/Linux |
| API key errors | Double-check your `.env` file has the correct key names |
| MCP server won't start | Run `cd .ai/tools/deepwiki-mcp && npm install` |
| Gemini loops/hangs | Use `gemini --all-files` instead of other gemini commands |
| Context seems old | Run `./bin/devin update` to refresh project context |

### **Pro Tips for Team Collaboration**
- **Share context exports**: Use `./bin/devin export wiki` to share AI-generated documentation
- **Coordinate on branches**: The AI understands your current branch and recent changes
- **Review together**: Use `./bin/devin review <commit>` for team code reviews
- **Onboard new members**: Have them run `./bin/devin context` for instant project understanding

---

## 📖 AAC-Specific Knowledge

The AI assistants understand:
- **Communication Boards**: Visual grids, navigation, hierarchy
- **Speech Synthesis**: Web Speech API, TTS voices, pronunciation
- **Accessibility**: Switch navigation, eye gaze, scanning, dwell timing
- **Open Board Format**: Import/export, compatibility
- **Multi-platform**: Mobile, tablet, desktop responsiveness
- **Offline Support**: IndexedDB, sync capabilities
- **Supervision Tools**: Progress tracking, usage analytics

---

## 🎓 Learning Resources

Ask the AI about:
- AAC development best practices
- Accessibility compliance (WCAG, Section 508)
- Rails + Ember.js patterns specific to AAC
- Communication board design principles
- Mobile AAC app development

---

## 📚 Related Documentation

- **[Main README](../../README.md)** - Project overview and basic setup
- **[API Documentation](./API_DOCUMENTATION.md)** - Complete REST API reference
- **[Setup Guide](./SETUP.md)** - Development environment setup
- **[Contributing Guide](./CONTRIBUTING.md)** - Contribution workflow
- **[Claude Instructions](../ai/CLAUDE.md)** - Claude-specific development guidance
- **[Command Reference](../../.ai/tools/AI_DEVELOPMENT_COMMANDS.md)** - Detailed command documentation

---

**Remember**: These AI assistants have deep understanding of LingoLinq AAC's architecture, AAC requirements, and accessibility needs. Don't hesitate to ask complex, domain-specific questions!
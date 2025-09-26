# LingoLinq Development Team Workflow

## Team Structure
- **Human Developers**: Cross-platform development team (Windows, macOS, Linux)
- **AI Agents**: Specialized roles (backend, frontend, design, AI/ML)
- **Coordination**: Through shared documentation, context files, and unified AI tools

## Cross-Platform AI Development Setup

### Quick Start for New Team Members
1. **Install CLI Tools**: `npm install -g @anthropic-ai/claude-cli @google/generative-ai-cli`
2. **Configure API Keys**: Set `ANTHROPIC_API_KEY` and `GOOGLE_AI_API_KEY`
3. **Validate Setup**: `./bin/devin validate`
4. **Read Guide**: `.ai/tools/TEAM_SETUP.md`

### Universal Commands (All Platforms)
```bash
# Quick questions (lightweight, ~200 tokens)
./bin/devin ask "How do I implement feature X?"

# Full context analysis (~4K tokens)
./bin/devin ask-full "Explain the complete architecture for Y"

# Direct CLI access
./bin/devin claude "Debug this specific error"
./bin/devin gemini "Generate documentation for Z"

# Validate environment
./bin/devin validate
```

## AI Agent Roles
### Backend Agent
- **Tools**: `./bin/devin ask-full` for Rails/Ruby architecture decisions
- **Focus**: Database optimization, API development, Security, Performance
- **Context**: Uses full project context for architectural decisions

### Frontend Agent
- **Tools**: `./bin/devin ask` for quick Ember.js questions, `ask-full` for complex UI decisions
- **Focus**: Modern JavaScript frameworks, Accessibility compliance, Component design
- **Context**: Lightweight for syntax, full for architecture

### Design Agent
- **Tools**: `./bin/devin gemini-full` for comprehensive UX analysis
- **Focus**: UX/UI modernization, AAC-specific patterns, Component library
- **Context**: Full project context for design system decisions

### AI/ML Agent
- **Tools**: Both Claude and Gemini for cross-validation of AI decisions
- **Focus**: LLM integration, Model training, AI feature development, MCP configuration
- **Context**: Full context for AI integration decisions

## Development Workflow

### 1. Environment Setup
- **New Team Members**: Follow `.ai/tools/TEAM_SETUP.md`
- **Validation**: Run `./bin/devin validate` before starting work
- **Platform Check**: Ensure CLI tools work on your specific OS

### 2. Session Start
- **Context Refresh**: `./bin/devin update`
- **Architecture Review**: `./bin/devin context` 
- **Recent Changes**: `./bin/devin analyze changes`

### 3. Task Execution
- **Quick Questions**: Use `./bin/devin ask` for syntax, simple how-to
- **Complex Analysis**: Use `./bin/devin ask-full` for architecture, design decisions
- **Cross-Validation**: Use both Claude and Gemini for critical decisions

### 4. Code Review Process
```bash
# Context-aware code review
./bin/devin review HEAD~3..HEAD

# Deep analysis with Gemini
./bin/devin review-gemini HEAD~1

# Repository-wide analysis
./bin/devin analyze repo
```

### 5. Documentation Updates
- **Context Files**: Update `.ai/context/` files after major changes
- **Architecture**: Run `./bin/devin generate` after structural changes
- **Team Workflow**: Keep this file updated with new practices

## Token Optimization Guidelines

### Use `ask` (Lightweight) for:
- Syntax questions
- Simple how-to queries  
- Quick debugging help
- Basic API questions

### Use `ask-full` (Full Context) for:
- Architecture decisions
- Complex feature planning
- Security considerations
- Integration questions

### Use Direct CLI for:
- General programming questions
- Non-project specific queries
- Testing AI functionality

## Multi-Platform Considerations

### Windows Team Members
- **Git Bash**: Recommended for full compatibility
- **WSL**: Full Linux experience
- **PowerShell**: For environment variable setup
- **Paths**: CLI auto-detection handles Windows paths

### macOS Team Members  
- **Intel Macs**: CLIs in `/usr/local/bin/`
- **Apple Silicon**: CLIs in `/opt/homebrew/bin/`
- **Homebrew**: Ensure bin directory in PATH

### Linux Team Members
- **Distribution Agnostic**: Works with all major distros
- **npm Global**: Ensure npm bin in PATH
- **User Install**: Supports both system and user installations

## Troubleshooting

### Common Issues
1. **CLI Not Found**: Run `./bin/devin validate` and check PATH
2. **API Key Issues**: Verify environment variables are persistent
3. **Platform Issues**: Use validation script for diagnosis
4. **Context Stale**: Run `./bin/devin update` before major work

### Team Support
- **Setup Issues**: Consult `.ai/tools/TEAM_SETUP.md`
- **Platform Problems**: Use `.ai/tools/validate-setup.sh`
- **MCP Issues**: Check `.ai/tools/deepwiki-mcp/README.md`

## Advanced Features

### MCP Integration
- **DeepWiki**: Automatic repository analysis
- **Context Protocol**: Enhanced AI understanding
- **Configuration**: Team-shared in `.ai/tools/deepwiki-mcp/`

### Team Coordination
- **Shared Context**: `.ai/context/` files synchronized
- **Cross-Agent**: Multi-model validation for decisions
- **Documentation**: Auto-generated and maintained

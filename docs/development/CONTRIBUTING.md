# Contributing to LingoLinq AAC

## Overview
LingoLinq AAC is a modern AAC (Augmentative and Alternative Communication) application
forked from CoughDrop/SweetSuite, being modernized with AI assistance.

## AI-Assisted Development Workflow

This project leverages comprehensive AI development assistants to accelerate development and maintain code quality.

### 🚀 Quick Start for New Contributors
1. **Get instant project understanding**:
   ```bash
   ./bin/devin context
   ```
2. **Ask architecture questions**:
   ```bash
   ./bin/devin ask "How should I implement a new AAC board feature?"
   ```
3. **Review code changes**:
   ```bash
   ./bin/devin review HEAD~3
   ```

### 📖 Complete AI Development Guide
**[→ Full AI Development Guide](./AI_DEVELOPMENT_GUIDE.md)** - Comprehensive setup, commands, and workflows

### For Human Contributors
- **Start with AI context**: Run `./bin/devin context` to understand the project architecture
- **Use AI for guidance**: Ask specific questions about AAC patterns, Rails/Ember integration, accessibility requirements
- **Code reviews**: Use `./bin/devin review <commit>` for detailed feedback on changes
- **Update context**: When making architectural changes, run `./bin/devin update` to refresh AI context

### Development Workflow with AI
1. **Before coding**: Ask the AI about architectural patterns and existing implementations
2. **During development**: Use AI for debugging AAC-specific issues and accessibility concerns
3. **Before committing**: Get AI code review and ensure AAC compliance
4. **Documentation updates**: Let AI help explain complex AAC concepts and patterns

### Key AI Capabilities
- **AAC Domain Expertise**: Understanding of communication boards, speech synthesis, accessibility
- **Architecture Knowledge**: Rails + Ember patterns, API design, mobile coordination
- **Code Analysis**: Context-aware suggestions that fit existing patterns
- **Accessibility Focus**: WCAG compliance and AAC user needs

For detailed commands and workflows, see the [AI Development Guide](./AI_DEVELOPMENT_GUIDE.md).

# DeepWiki MCP Server for LingoLinq AAC

This is a Model Context Protocol (MCP) server that provides intelligent documentation assistance for the LingoLinq AAC project.

## Features

- **Project Architecture Analysis**: Understands the Rails + Ember.js structure
- **Context-Aware Documentation**: Generates relevant documentation based on current development
- **Development Workflow Integration**: Works with git hooks and development scripts
- **AI-Powered Insights**: Provides intelligent suggestions for code and documentation

## Usage

### Start the Server

```bash
cd .ai/tools/deepwiki-mcp
npm start
```

### Integration with Git Hooks

The server is automatically triggered by git hooks to update project context:

- **post-commit**: Updates context after code changes
- **post-merge**: Updates context after merges

### Integration with bin/devin

The `bin/devin` script uses this MCP server for:

- Generating project architecture maps
- Updating context for AI assistants
- Analyzing recent changes

## Configuration

Environment variables:

- `DEEPWIKI_PORT`: Server port (default: 3001)
- `DEEPWIKI_LOG_LEVEL`: Logging level (default: info)

## Files Generated

- `.ai/context/recent-changes.txt`: Recent git changes summary
- `.ai/context/PROJECT_MAP.md`: Project architecture overview

## Development

This MCP server is designed to evolve with the LingoLinq AAC project. Future enhancements may include:

- Real-time documentation generation
- Code analysis and suggestions
- Integration with AI development tools
- Advanced project insights

## Requirements

- Node.js 18+
- Git repository access
- Write access to `.ai/context/` directory
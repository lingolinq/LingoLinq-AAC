# MCP Configuration for LingoLinq AAC

## Overview
Model Context Protocol (MCP) configurations for enhanced AI capabilities in LingoLinq AAC development.

## Available Configurations

### claude-mcp-config.json
Primary MCP configuration for Claude Code with:
- **DeepWiki**: Repository analysis and documentation
- **Filesystem**: Secure file access for AI agents

## Usage

### With Claude Code
Set the MCP configuration path:
```bash
export CLAUDE_MCP_CONFIG_PATH="$(pwd)/.ai/tools/mcp/claude-mcp-config.json"
```

Or use directly:
```bash
claude --mcp-config ".ai/tools/mcp/claude-mcp-config.json" --print "Analyze this repository"
```

### With bin/devin
The enhanced `bin/devin` script automatically uses MCP configurations for:
- Repository analysis
- Context management
- DeepWiki integration

## Configuration Details

### DeepWiki MCP
- **Repository**: `swahlquist/LingoLinq-AAC`
- **Capabilities**: Code analysis, architecture insights, documentation generation
- **Usage**: Automatic in `bin/devin deepwiki` commands

### Filesystem MCP
- **Access**: Controlled file system access
- **Allowed Paths**: Workspace, temp directories, current directory
- **Security**: Limited scope for safe AI file operations

## Team Setup

### Prerequisites
```bash
# Install MCP servers
npm install -g mcp-deepwiki @modelcontextprotocol/server-filesystem
```

### Environment Variables
Add to your shell profile:
```bash
export CLAUDE_MCP_CONFIG_PATH="$(pwd)/.ai/tools/mcp/claude-mcp-config.json"
export DEEPWIKI_REPO="swahlquist/LingoLinq-AAC"
```

## Troubleshooting

### "MCP server not found" errors
1. Ensure MCP servers are installed globally
2. Check npm global path is in PATH
3. Verify configuration file syntax with `jq`

### DeepWiki connection issues
1. Verify repository name is correct
2. Check internet connectivity
3. Ensure DeepWiki service is available

### Filesystem access denied
1. Check allowed paths in configuration
2. Verify current working directory
3. Ensure proper permissions on target directories

## Security Notes

- MCP configurations limit AI access to specified directories only
- DeepWiki operates read-only on repository data
- Never add sensitive directories to filesystem allowed paths
- Review MCP server permissions regularly

## Extending MCP Configuration

To add new MCP servers:
1. Install the MCP server package
2. Add configuration to `claude-mcp-config.json`
3. Update this documentation
4. Test with validation commands
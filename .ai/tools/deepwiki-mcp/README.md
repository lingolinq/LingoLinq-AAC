# DeepWiki MCP Configuration

This directory contains the Model Context Protocol (MCP) configuration for the DeepWiki server integration.

## Files

- `claude-mcp-config.json` - MCP server configuration for Claude Code integration
- `README.md` - This documentation file

## Usage

### With Claude Code

1. Use the MCP configuration automatically by referencing this path:
   ```bash
   claude --mcp-config ".ai/tools/deepwiki-mcp/claude-mcp-config.json"
   ```

2. Or set the environment variable:
   ```bash
   export MCP_CONFIG_PATH=".ai/tools/deepwiki-mcp/claude-mcp-config.json"
   claude
   ```

### Configuration Details

The configuration provides two MCP servers:

1. **DeepWiki**: Repository analysis and documentation access
   - Uses `npx mcp-deepwiki` for installation-free usage
   - Configured for `swahlquist/LingoLinq-AAC` repository

2. **Filesystem**: File system operations
   - Provides safe file access within allowed paths
   - Configured for workspace, tmp, and current directory

## Environment Requirements

- Node.js (for `npx` commands)
- Network access for package installation
- Git repository access for DeepWiki functionality

## Security

- Filesystem access is limited to approved paths
- All packages are installed via trusted npm registry
- No persistent installations required (`--yes` flag with npx)
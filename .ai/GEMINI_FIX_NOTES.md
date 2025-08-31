# Gemini Loop Fix - 2025-08-29

## Problem
- "side closed" errors causing infinite loops
- Gemini consuming all tokens due to retries
- MCP Deepwiki rate limiting (HTTP 429 errors)

## Root Causes
1. **MCP Deepwiki Rate Limiting**: GitHub API limits hit when fetching repo data
2. **Failed Error Recovery**: Recursive retry loops without circuit breaker
3. **Timeout Issues**: 15-second MCP timeout too aggressive
4. **No Circuit Breaker**: Config had settings but no implementation

## Solutions Applied
1. **Added Circuit Breaker**: 5-minute cooldown after MCP failures
2. **Disabled MCP Integration**: Temporary disable in config to prevent loops
3. **Enhanced Error Handling**: Proper fallback to local context
4. **Failure Marker System**: Track and prevent repeated MCP attempts

## Files Modified
- `bin/devin-gemini`: Added circuit breaker logic in get_mcp_context()
- `.ai/agents/gemini/config-optimized-2025.json`: Disabled MCP integration

## Testing
1. Run `bash bin/devin-gemini optimized` - should work without MCP errors
2. Check `.ai/logs/mcp-failure-marker` exists after MCP failures
3. Verify fallback to local context works properly

## Future Steps
1. Investigate GitHub API token limits for mcp-deepwiki
2. Implement exponential backoff in MCP calls
3. Consider alternative context sources
4. Re-enable MCP integration once rate limiting resolved
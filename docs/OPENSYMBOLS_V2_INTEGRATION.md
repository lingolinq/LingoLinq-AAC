# OpenSymbols API v2 Integration

This document describes the integration of the OpenSymbols API v2 into LingoLinq-AAC.

## Overview

LingoLinq-AAC now supports both the **OpenSymbols API v1** (legacy) and **v2** (current) for symbol search functionality. The system automatically uses v2 when configured with a shared secret, and falls back to v1 if only the legacy token is available.

## What Changed

### New Files

**`lib/open_symbols.rb`** - A new Ruby module that handles all OpenSymbols v2 API interactions, including authentication, token management, and symbol search.

### Modified Files

**`lib/uploader.rb`** - Updated the `find_images` method to detect and use the v2 API when the `OPENSYMBOLS_SECRET` environment variable is configured. The existing v1 API code remains as a fallback for backward compatibility.

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# OpenSymbols API v2 (recommended)
OPENSYMBOLS_SECRET=your_shared_secret_here

# OpenSymbols API v1 (legacy, optional fallback)
OPENSYMBOLS_TOKEN=your_legacy_token_here
```

### Getting a Shared Secret

To obtain an OpenSymbols API v2 shared secret:

1. Visit https://www.opensymbols.org/api
2. Scroll to the "Request a Shared Secret" section
3. Fill out the form with:
   - **Organization**: LingoLinq-AAC or your organization name
   - **Email**: Your contact email
   - **Purpose**: Describe how you'll use the API (e.g., "Symbol search for AAC communication boards")
4. Submit the form and wait for the shared secret to be provided

## How It Works

### Authentication Flow

The v2 API uses a two-step authentication process:

1. **Generate Access Token**: The system makes a POST request to `/api/v2/token` with the shared secret to receive a short-lived access token
2. **Use Access Token**: The access token is included in subsequent API requests as a Bearer token in the Authorization header

### Token Caching

To minimize API calls and improve performance, access tokens are cached in Redis with the following characteristics:

- **Cache Duration**: 50 minutes (tokens typically expire after 60 minutes)
- **Buffer Time**: 5 minutes before expiry to ensure tokens don't expire mid-request
- **Automatic Refresh**: If a 401 response is received, the cache is cleared and a new token is generated

### Symbol Search

The `OpenSymbols.search` method provides flexible symbol searching with support for:

- **Query Modifiers**: Limit results to specific repositories (`repo:arasaac`) or favor certain libraries (`favor:tawasol`)
- **Locale Support**: Search in different languages using 2-character locale codes
- **Safe Search**: Filter inappropriate content (enabled by default)
- **High Contrast**: Favor high-contrast symbols for better visibility

### Backward Compatibility

The integration maintains full backward compatibility with the existing v1 API implementation. If `OPENSYMBOLS_SECRET` is not configured, the system automatically falls back to using `OPENSYMBOLS_TOKEN` with the v1 API endpoint.

## API Reference

### OpenSymbols Module Methods

#### `OpenSymbols.search(query, locale:, safe:, repo:, favor:, high_contrast:)`

Search for symbols using the OpenSymbols v2 API.

**Parameters:**
- `query` (String, required): Search term(s)
- `locale` (String, optional): Language code (default: 'en')
- `safe` (Boolean, optional): Enable safe search (default: true)
- `repo` (String, optional): Limit to specific repository
- `favor` (String, optional): Favor specific repository
- `high_contrast` (Boolean, optional): Favor high-contrast results (default: false)

**Returns:** Array of symbol hashes with keys: `id`, `symbol_key`, `name`, `locale`, `license`, `license_url`, `author`, `author_url`, `source_url`, `skins`, `repo_key`, `hc`, `extension`, `image_url`, `width`, `height`

**Example:**
```ruby
# Basic search
results = OpenSymbols.search('cat', locale: 'en')

# Search in specific repository
results = OpenSymbols.search('dog', repo: 'arasaac')

# Favor a specific library
results = OpenSymbols.search('house', favor: 'tawasol')

# High-contrast symbols
results = OpenSymbols.search('sun', high_contrast: true)
```

#### `OpenSymbols.find_images(keyword, library, locale, protected_source:)`

Search for symbols and return results in LingoLinq format (compatible with existing `Uploader.find_images` interface).

**Parameters:**
- `keyword` (String, required): Search term
- `library` (String, required): Library name (e.g., 'arasaac', 'opensymbols', 'pcs')
- `locale` (String, required): Language code
- `protected_source` (String, optional): Protected source identifier for premium libraries

**Returns:** Array of symbol hashes in LingoLinq format with keys: `url`, `thumbnail_url`, `content_type`, `width`, `height`, `external_id`, `public`, `protected`, `protected_source`, `license`

**Example:**
```ruby
# Search ARASAAC library
results = OpenSymbols.find_images('cat', 'arasaac', 'en')

# Search all OpenSymbols libraries
results = OpenSymbols.find_images('dog', 'opensymbols', 'en')

# Search premium library (requires subscription)
results = OpenSymbols.find_images('house', 'pcs', 'en', protected_source: 'pcs')
```

#### `OpenSymbols.access_token`

Get a valid access token, using cache if available or generating a new one if needed.

**Returns:** String (access token) or nil if unable to generate

**Example:**
```ruby
token = OpenSymbols.access_token
# => "abc123xyz..."
```

## Supported Libraries

The integration supports the following OpenSymbols libraries:

- **noun-project**: The Noun Project symbols
- **sclera**: Sclera Pictograms
- **arasaac**: ARASAAC symbols
- **mulberry**: Mulberry Symbols
- **tawasol**: Tawasol symbols (Arabic)
- **twemoji**: Twitter Emoji
- **opensymbols**: All OpenSymbols libraries
- **pcs**: PCS symbols (premium, requires subscription)
- **symbolstix**: SymbolStix symbols (premium, requires subscription)

## Error Handling

The integration includes robust error handling for common scenarios:

- **Missing Secret**: Logs error and returns empty results
- **Token Expiry**: Automatically detects 401 responses, clears cache, and regenerates token
- **Rate Limiting**: Detects 429 responses and logs warning
- **Network Errors**: Catches exceptions and logs errors
- **Invalid Responses**: Handles malformed JSON and missing data gracefully

## Testing

To test the integration:

1. **Set up environment variables** in your `.env` file
2. **Start Rails console**: `rails console`
3. **Test token generation**:
   ```ruby
   token = OpenSymbols.access_token
   puts token
   ```
4. **Test symbol search**:
   ```ruby
   results = OpenSymbols.search('cat')
   puts results.first.inspect
   ```
5. **Test LingoLinq format**:
   ```ruby
   results = OpenSymbols.find_images('dog', 'arasaac', 'en')
   puts results.first.inspect
   ```

## Migration from v1 to v2

To migrate from the legacy v1 API to v2:

1. **Request a shared secret** from https://www.opensymbols.org/api
2. **Add the secret** to your `.env` file as `OPENSYMBOLS_SECRET`
3. **Restart your application** - the system will automatically detect and use v2
4. **Optional**: Remove `OPENSYMBOLS_TOKEN` once you've confirmed v2 is working

You can keep both `OPENSYMBOLS_SECRET` and `OPENSYMBOLS_TOKEN` configured for a transition period. The system will prefer v2 but fall back to v1 if needed.

## Performance Considerations

The v2 integration includes several performance optimizations:

- **Token Caching**: Access tokens are cached in Redis to minimize authentication requests
- **Timeout Handling**: Requests timeout after 10 seconds to prevent hanging
- **Error Recovery**: Automatic retry on token expiry (one retry only)
- **Efficient Parsing**: Results are parsed once and cached appropriately

## Security Notes

**Important**: The shared secret must be kept secure and never exposed in client-side code or version control.

- Store the secret in environment variables only
- Never commit the secret to Git
- Use server-side API calls only (never expose the secret to JavaScript)
- Rotate the secret periodically if compromised

## Troubleshooting

### "OPENSYMBOLS_SECRET not configured" error

**Solution**: Add `OPENSYMBOLS_SECRET=your_secret_here` to your `.env` file and restart the application.

### "Failed to generate OpenSymbols token" error

**Possible causes**:
- Invalid shared secret
- Network connectivity issues
- OpenSymbols API is down

**Solution**: Check your shared secret, verify network connectivity, and check OpenSymbols status.

### Empty search results

**Possible causes**:
- No symbols match the search query
- API throttling (429 response)
- Token expired and failed to regenerate

**Solution**: Check Rails logs for specific error messages, try a different search term, or wait if throttled.

### Token keeps expiring

**Possible causes**:
- Redis not running or not accessible
- Cache not being saved properly

**Solution**: Verify Redis is running and accessible, check Redis connection in Rails console.

## Future Enhancements

Potential improvements for future versions:

- **Skin Tone Support**: Implement skin tone variant URL generation for symbols with `skins: true`
- **Local Caching**: Download and cache frequently used symbols locally
- **Batch Requests**: Support searching multiple terms in parallel
- **Analytics**: Track symbol usage and search patterns
- **Fallback Images**: Provide default images when API is unavailable

## Support

For issues with the OpenSymbols API itself, contact OpenSymbols support or visit https://www.opensymbols.org/api

For issues with this integration, check the Rails logs and ensure all environment variables are properly configured.

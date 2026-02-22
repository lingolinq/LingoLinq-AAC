# OpenSymbols v2 API - Quick Start Guide

This guide will help you quickly set up and start using the OpenSymbols v2 API integration in LingoLinq-AAC.

## Step 1: Get Your Shared Secret

Before you can use the OpenSymbols API, you need to request a shared secret from OpenSymbols.

1. Visit **https://www.opensymbols.org/api**
2. Scroll down to the **"Request a Shared Secret"** section
3. Fill out the form:
   - **Organization**: Your organization name (e.g., "LingoLinq-AAC Development")
   - **Email**: Your contact email address
   - **Purpose**: Brief description of how you'll use the API
     
     Example: *"Symbol search functionality for LingoLinq-AAC, an open-source AAC (Augmentative and Alternative Communication) application. We will use the API to help users find appropriate communication symbols for their boards."*

4. Click **Submit**
5. Wait for OpenSymbols to provide your shared secret via email

**Note**: The shared secret is typically provided quickly, but may take up to 24-48 hours.

## Step 2: Configure Your Environment

Once you have your shared secret, add it to your environment configuration.

### For Development

1. Open your `.env` file in the LingoLinq-AAC directory
2. Add the following line:
   ```bash
   OPENSYMBOLS_SECRET=your_shared_secret_here
   ```
3. Save the file

### For Production

Add the `OPENSYMBOLS_SECRET` environment variable to your production environment using your hosting platform's configuration method:

- **Heroku**: `heroku config:set OPENSYMBOLS_SECRET=your_secret`
- **Render**: Add to environment variables in the dashboard
- **Docker**: Add to your docker-compose.yml or environment file
- **Other platforms**: Follow your platform's documentation for setting environment variables

## Step 3: Test the Integration

Run the provided test script to verify everything is working:

```bash
cd /path/to/LingoLinq-AAC
ruby test_opensymbols_integration.rb
```

You should see output indicating successful token generation and symbol searches. If you see any errors, check that:

1. Your `OPENSYMBOLS_SECRET` is correctly set in `.env`
2. You have internet connectivity
3. The shared secret is valid (not expired or revoked)

## Step 4: Restart Your Application

For the changes to take effect, restart your Rails application:

```bash
# If using foreman
foreman start

# If using heroku local
heroku local

# If running rails server directly
rails server
```

## Step 5: Verify in the Application

Test the symbol search functionality in your LingoLinq-AAC application:

1. Log in to your LingoLinq-AAC instance
2. Create or edit a communication board
3. Try adding a new button with a symbol
4. Search for a symbol (e.g., "cat", "dog", "house")
5. Verify that symbols are returned from the OpenSymbols library

## Usage Examples

### In Rails Console

You can test the integration directly in the Rails console:

```bash
rails console
```

Then try these commands:

```ruby
# Basic symbol search
results = OpenSymbols.search('cat')
puts "Found #{results.length} results"
puts results.first.inspect

# Search in specific repository
results = OpenSymbols.search('dog', repo: 'arasaac')

# Search in different language
results = OpenSymbols.search('gato', locale: 'es')

# Get results in LingoLinq format
results = OpenSymbols.find_images('cat', 'arasaac', 'en')
puts results.first['url']
```

### In Application Code

The integration is automatically used when you call `Uploader.find_images` with OpenSymbols libraries:

```ruby
# This will use the v2 API if OPENSYMBOLS_SECRET is configured
results = Uploader.find_images('cat', 'arasaac', 'en', user)
results = Uploader.find_images('dog', 'opensymbols', 'en', user)
results = Uploader.find_images('house', 'mulberry', 'en', user)
```

## Supported Symbol Libraries

The integration supports searching these OpenSymbols libraries:

- **arasaac** - ARASAAC symbols (Spanish-focused, widely used)
- **mulberry** - Mulberry Symbols (UK-focused)
- **noun-project** - The Noun Project symbols
- **sclera** - Sclera Pictograms
- **tawasol** - Tawasol symbols (Arabic)
- **twemoji** - Twitter Emoji
- **opensymbols** - All OpenSymbols libraries combined
- **pcs** - PCS symbols (premium, requires subscription)
- **symbolstix** - SymbolStix symbols (premium, requires subscription)

## Monitoring and Troubleshooting

### Check Rails Logs

Monitor your Rails logs for OpenSymbols API activity:

```bash
tail -f log/development.log | grep -i opensymbols
```

### Common Issues

**"OPENSYMBOLS_SECRET not configured" error**
- Solution: Add `OPENSYMBOLS_SECRET` to your `.env` file and restart

**"Failed to generate OpenSymbols token" error**
- Check that your shared secret is correct
- Verify internet connectivity
- Check OpenSymbols API status

**Empty search results**
- Try different search terms
- Check if you're being throttled (429 responses in logs)
- Verify the library name is correct

**Token keeps expiring**
- Ensure Redis is running (required for token caching)
- Check Redis connectivity in Rails console: `RedisAccess.redis.ping`

### Enable Debug Logging

To see more detailed information about API calls, you can temporarily add logging to the OpenSymbols module:

```ruby
# In lib/open_symbols.rb, add puts statements:
def self.search(query, ...)
  puts "OpenSymbols search: #{query}"
  # ... rest of method
end
```

## Backward Compatibility

The integration maintains full backward compatibility with the v1 API. If you have `OPENSYMBOLS_TOKEN` configured but not `OPENSYMBOLS_SECRET`, the system will automatically use the v1 API.

You can run both configurations simultaneously during a transition period:

```bash
# In .env
OPENSYMBOLS_SECRET=your_v2_shared_secret
OPENSYMBOLS_TOKEN=your_v1_token  # Fallback
```

## Performance Tips

1. **Redis Caching**: Ensure Redis is running to enable access token caching
2. **Connection Pooling**: The integration uses Typhoeus with connection pooling
3. **Timeout Settings**: Requests timeout after 10 seconds to prevent hanging
4. **Rate Limiting**: Be mindful of API rate limits; cache results when possible

## Next Steps

- Read the full documentation: `OPENSYMBOLS_V2_INTEGRATION.md`
- Review the code: `lib/open_symbols.rb`
- Run the test suite: `rspec spec/lib/open_symbols_spec.rb`
- Monitor API usage and performance in production

## Getting Help

- **OpenSymbols API Issues**: Contact OpenSymbols support at https://www.opensymbols.org
- **Integration Issues**: Check the Rails logs and review `OPENSYMBOLS_V2_INTEGRATION.md`
- **LingoLinq-AAC Issues**: Check the project README and documentation

## Security Reminder

**Never commit your shared secret to version control!**

- Keep `OPENSYMBOLS_SECRET` in `.env` (which is in `.gitignore`)
- Use environment variables in production
- Rotate the secret if it's ever compromised
- Never expose the secret in client-side code

---

**You're all set!** The OpenSymbols v2 API integration is now ready to use in your LingoLinq-AAC application.

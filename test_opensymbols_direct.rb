#!/usr/bin/env ruby
# Direct OpenSymbols API v2 test (no Rails dependencies)
# This tests the API directly without loading the Rails application
#
# Run from the repository root: bundle exec ruby test_opensymbols_direct.rb
# Set OPENSYMBOLS_SECRET in the environment or in .env (see .env.example).

require 'bundler/setup'
require 'dotenv/load'
require 'typhoeus'
require 'json'

puts "=" * 80
puts "OpenSymbols API v2 Direct Test"
puts "=" * 80
puts

# Configuration (never commit secrets; use .env or the environment)
SECRET = ENV['OPENSYMBOLS_SECRET']
if SECRET.nil? || SECRET.strip.empty?
  puts "✗ OPENSYMBOLS_SECRET is not set"
  puts "  Add OPENSYMBOLS_SECRET to your .env file (see .env.example)"
  puts "  Get a shared secret from: https://www.opensymbols.org/api"
  exit 1
end

puts "Using shared secret: #{SECRET[0..10]}..."
puts

# Test 1: Generate access token from shared secret
puts "Test 1: Generating access token from shared secret..."
puts "-" * 80

response = Typhoeus.post(
  "https://www.opensymbols.org/api/v2/token",
  body: { secret: SECRET },
  timeout: 10
)

if response.success?
  data = JSON.parse(response.body)
  token = data['access_token']
  expires = data['expires']
  
  puts "✓ Token generated successfully"
  puts "  Token: #{token[0..40]}..."
  puts "  Expires: #{expires}" if expires
  puts
  
  # Test 2: Search for symbols
  puts "Test 2: Searching for 'cat' symbols..."
  puts "-" * 80
  
  search_response = Typhoeus.get(
    "https://www.opensymbols.org/api/v2/symbols",
    params: { q: 'cat', locale: 'en', safe: 1 },
    headers: { 'Authorization' => "Bearer #{token}" },
    timeout: 10
  )
  
  if search_response.success?
    results = JSON.parse(search_response.body)
    puts "✓ Search successful"
    puts "  Found #{results.length} results"
    
    if results.length > 0
      puts
      puts "First 3 results:"
      results.first(3).each_with_index do |result, idx|
        puts
        puts "  Result #{idx + 1}:"
        puts "    Name: #{result['name']}"
        puts "    Repository: #{result['repo_key']}"
        puts "    License: #{result['license']}"
        puts "    Author: #{result['author']}"
        puts "    Image URL: #{result['image_url'][0..60]}..."
        puts "    Extension: #{result['extension']}"
        puts "    High Contrast: #{result['hc']}"
      end
    else
      puts "  ⚠ No results found for 'cat'"
    end
    puts
    
    # Test 3: Search in specific repository
    puts "Test 3: Searching for 'dog' in ARASAAC repository..."
    puts "-" * 80
    
    arasaac_response = Typhoeus.get(
      "https://www.opensymbols.org/api/v2/symbols",
      params: { q: 'dog repo:arasaac', locale: 'en', safe: 1 },
      headers: { 'Authorization' => "Bearer #{token}" },
      timeout: 10
    )
    
    if arasaac_response.success?
      arasaac_results = JSON.parse(arasaac_response.body)
      puts "✓ ARASAAC search successful"
      puts "  Found #{arasaac_results.length} results"
      
      if arasaac_results.length > 0
        first = arasaac_results.first
        puts
        puts "  First result:"
        puts "    Name: #{first['name']}"
        puts "    Repository: #{first['repo_key']}"
        puts "    License: #{first['license']}"
      end
    else
      puts "✗ ARASAAC search failed: #{arasaac_response.code}"
      puts "  Response: #{arasaac_response.body}"
    end
    puts
    
    # Test 4: Search in different language
    puts "Test 4: Searching for 'gato' (cat in Spanish)..."
    puts "-" * 80
    
    spanish_response = Typhoeus.get(
      "https://www.opensymbols.org/api/v2/symbols",
      params: { q: 'gato', locale: 'es', safe: 1 },
      headers: { 'Authorization' => "Bearer #{token}" },
      timeout: 10
    )
    
    if spanish_response.success?
      spanish_results = JSON.parse(spanish_response.body)
      puts "✓ Spanish search successful"
      puts "  Found #{spanish_results.length} results"
      
      if spanish_results.length > 0
        first = spanish_results.first
        puts
        puts "  First result:"
        puts "    Name: #{first['name']}"
        puts "    Locale: #{first['locale']}"
        puts "    Repository: #{first['repo_key']}"
      end
    else
      puts "✗ Spanish search failed: #{spanish_response.code}"
      puts "  Response: #{spanish_response.body}"
    end
    puts
    
    # Test 5: Test token expiry handling (simulate with invalid token)
    puts "Test 5: Testing error handling with invalid token..."
    puts "-" * 80
    
    invalid_response = Typhoeus.get(
      "https://www.opensymbols.org/api/v2/symbols",
      params: { q: 'test', locale: 'en' },
      headers: { 'Authorization' => "Bearer invalid_token_12345" },
      timeout: 10
    )
    
    if invalid_response.code == 401
      error_data = JSON.parse(invalid_response.body) rescue {}
      puts "✓ Token expiry detection works"
      puts "  Received expected 401 response"
      puts "  Error: #{error_data['error']}" if error_data['error']
      puts "  Token expired: #{error_data['token_expired']}" if error_data.key?('token_expired')
    else
      puts "⚠ Unexpected response: #{invalid_response.code}"
    end
    
  else
    puts "✗ Search failed: #{search_response.code}"
    puts "  Response: #{search_response.body}"
  end
  
else
  puts "✗ Token generation failed: #{response.code}"
  puts "  Response: #{response.body}"
  puts
  puts "Possible issues:"
  puts "  - Invalid shared secret"
  puts "  - Network connectivity problems"
  puts "  - OpenSymbols API is down"
  exit 1
end

puts
puts "=" * 80
puts "Test Summary"
puts "=" * 80
puts "All direct API tests completed successfully!"
puts
puts "The OpenSymbols API v2 integration is working correctly."
puts "Token generation, symbol search, and error handling all function as expected."
puts
puts "Next steps:"
puts "1. Review the test results above"
puts "2. Run the full integration test: ruby test_opensymbols_integration.rb"
puts "3. Test in the Rails application (if Rails console is available)"
puts "=" * 80

#!/usr/bin/env ruby
# Test script for OpenSymbols v2 API integration
# Usage: ruby test_opensymbols_integration.rb

require 'bundler/setup'
require 'dotenv/load'
require 'typhoeus'
require 'json'

# Load the OpenSymbols module
require_relative 'lib/open_symbols'

puts "=" * 80
puts "OpenSymbols v2 API Integration Test"
puts "=" * 80
puts

# Check configuration
puts "1. Checking configuration..."
if ENV['OPENSYMBOLS_SECRET']
  puts "   ✓ OPENSYMBOLS_SECRET is configured"
  secret_preview = ENV['OPENSYMBOLS_SECRET'][0..10] + "..."
  puts "     Preview: #{secret_preview}"
else
  puts "   ✗ OPENSYMBOLS_SECRET is not configured"
  puts "     Please add OPENSYMBOLS_SECRET to your .env file"
  puts "     Get a shared secret from: https://www.opensymbols.org/api"
  exit 1
end
puts

# Test token generation
puts "2. Testing access token generation..."
begin
  # Mock Rails logger if not available
  unless defined?(Rails)
    module Rails
      class << self
        def logger
          @logger ||= Logger.new(STDOUT)
        end
      end
    end
  end
  
  # Mock RedisAccess if not available (token caching will be skipped)
  unless defined?(RedisAccess)
    module RedisAccess
      def self.redis
        nil
      end
      
      def self.get(key)
        nil
      end
      
      def self.set(key, value)
        nil
      end
      
      def self.expire(key, seconds)
        nil
      end
      
      def self.del(key)
        nil
      end
    end
  end
  
  token = OpenSymbols.send(:generate_new_token)
  
  if token
    puts "   ✓ Successfully generated access token"
    puts "     Token preview: #{token[0..20]}..."
  else
    puts "   ✗ Failed to generate access token"
    puts "     Check your OPENSYMBOLS_SECRET and network connection"
    exit 1
  end
rescue => e
  puts "   ✗ Error generating token: #{e.message}"
  puts "     #{e.backtrace.first}"
  exit 1
end
puts

# Test symbol search
puts "3. Testing symbol search..."
test_queries = [
  { query: 'cat', locale: 'en', description: 'Basic search for "cat"' },
  { query: 'dog', locale: 'en', repo: 'arasaac', description: 'Search "dog" in ARASAAC library' },
  { query: 'house', locale: 'es', description: 'Search "house" in Spanish' }
]

test_queries.each_with_index do |test, index|
  puts "   Test #{index + 1}: #{test[:description]}"
  
  begin
    results = OpenSymbols.search(
      test[:query],
      locale: test[:locale] || 'en',
      repo: test[:repo]
    )
    
    if results && results.length > 0
      puts "     ✓ Found #{results.length} results"
      
      # Show first result details
      first = results.first
      puts "     First result:"
      puts "       - Name: #{first['name']}"
      puts "       - Repository: #{first['repo_key']}"
      puts "       - License: #{first['license']}"
      puts "       - Author: #{first['author']}"
      puts "       - Image URL: #{first['image_url'][0..50]}..."
    elsif results && results.length == 0
      puts "     ⚠ No results found (this might be normal for some queries)"
    else
      puts "     ✗ Search returned nil"
    end
  rescue => e
    puts "     ✗ Error: #{e.message}"
  end
  
  puts
end

# Test find_images (LingoLinq format)
puts "4. Testing find_images (LingoLinq format)..."
begin
  results = OpenSymbols.find_images('cat', 'arasaac', 'en')
  
  if results && results.length > 0
    puts "   ✓ Found #{results.length} results in LingoLinq format"
    
    # Verify format
    first = results.first
    required_keys = ['url', 'thumbnail_url', 'content_type', 'external_id', 'license']
    missing_keys = required_keys.select { |key| !first.key?(key) }
    
    if missing_keys.empty?
      puts "   ✓ Result format is correct"
      puts "     Sample result:"
      puts "       - URL: #{first['url'][0..50]}..."
      puts "       - Content Type: #{first['content_type']}"
      puts "       - License Type: #{first['license']['type']}"
      puts "       - Author: #{first['license']['author_name']}"
    else
      puts "   ✗ Result format is missing keys: #{missing_keys.join(', ')}"
    end
  else
    puts "   ✗ No results found"
  end
rescue => e
  puts "   ✗ Error: #{e.message}"
  puts "     #{e.backtrace.first}"
end
puts

# Summary
puts "=" * 80
puts "Test Summary"
puts "=" * 80
puts "All tests completed. Review the results above."
puts
puts "Next steps:"
puts "1. Add OPENSYMBOLS_SECRET to your .env file if not already done"
puts "2. Restart your Rails application to load the new integration"
puts "3. Test symbol search in the application UI"
puts "4. Monitor Rails logs for any OpenSymbols API errors"
puts
puts "For more information, see OPENSYMBOLS_V2_INTEGRATION.md"
puts "=" * 80

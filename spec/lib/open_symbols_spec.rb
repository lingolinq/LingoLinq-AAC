require 'spec_helper'

describe OpenSymbols do
  describe "access_token" do
    it "should generate a new token if not cached" do
      expect(ENV).to receive(:[]).with('OPENSYMBOLS_SECRET').and_return('test_secret').at_least(1).times
      
      response = double(success?: true, body: '{"access_token": "test_token_123"}', code: 200)
      expect(Typhoeus).to receive(:post).with(
        "https://www.opensymbols.org/api/v2/token",
        body: { secret: 'test_secret' },
        timeout: 10
      ).and_return(response)
      
      token = OpenSymbols.access_token
      expect(token).to eq('test_token_123')
    end
    
    it "should return nil if OPENSYMBOLS_SECRET is not configured" do
      expect(ENV).to receive(:[]).with('OPENSYMBOLS_SECRET').and_return(nil)
      
      token = OpenSymbols.access_token
      expect(token).to be_nil
    end
    
    it "should return nil if token generation fails" do
      expect(ENV).to receive(:[]).with('OPENSYMBOLS_SECRET').and_return('test_secret').at_least(1).times
      
      response = double(success?: false, body: 'Error', code: 403)
      expect(Typhoeus).to receive(:post).and_return(response)
      
      token = OpenSymbols.access_token
      expect(token).to be_nil
    end
  end
  
  describe "search" do
    it "should search for symbols with basic query" do
      expect(OpenSymbols).to receive(:access_token).and_return('test_token_123')
      
      response_body = [{
        'id' => 123,
        'symbol_key' => 'cat-abc',
        'name' => 'cat',
        'locale' => 'en',
        'license' => 'CC BY-SA',
        'license_url' => 'https://creativecommons.org/licenses/by-sa/4.0/',
        'author' => 'Test Author',
        'author_url' => 'https://example.com',
        'source_url' => 'https://example.com/cat',
        'skins' => false,
        'repo_key' => 'arasaac',
        'hc' => false,
        'extension' => 'png',
        'image_url' => 'https://example.com/cat.png',
        'width' => 500,
        'height' => 500,
        'search_string' => nil,
        'unsafe_result' => false
      }].to_json
      
      response = double(success?: true, body: response_body, code: 200)
      expect(Typhoeus).to receive(:get).with(
        "https://www.opensymbols.org/api/v2/symbols",
        params: { q: 'cat', locale: 'en', safe: 1 },
        headers: { 'Authorization' => 'Bearer test_token_123' },
        timeout: 10
      ).and_return(response)
      
      results = OpenSymbols.search('cat')
      expect(results.length).to eq(1)
      expect(results[0]['name']).to eq('cat')
      expect(results[0]['repo_key']).to eq('arasaac')
    end
    
    it "should add repo modifier to query" do
      expect(OpenSymbols).to receive(:access_token).and_return('test_token_123')
      
      response = double(success?: true, body: '[]', code: 200)
      expect(Typhoeus).to receive(:get).with(
        "https://www.opensymbols.org/api/v2/symbols",
        params: { q: 'dog repo:arasaac', locale: 'en', safe: 1 },
        headers: { 'Authorization' => 'Bearer test_token_123' },
        timeout: 10
      ).and_return(response)
      
      results = OpenSymbols.search('dog', repo: 'arasaac')
      expect(results).to eq([])
    end
    
    it "should add favor modifier to query" do
      expect(OpenSymbols).to receive(:access_token).and_return('test_token_123')
      
      response = double(success?: true, body: '[]', code: 200)
      expect(Typhoeus).to receive(:get).with(
        "https://www.opensymbols.org/api/v2/symbols",
        params: { q: 'house favor:tawasol', locale: 'en', safe: 1 },
        headers: { 'Authorization' => 'Bearer test_token_123' },
        timeout: 10
      ).and_return(response)
      
      results = OpenSymbols.search('house', favor: 'tawasol')
      expect(results).to eq([])
    end
    
    it "should add high contrast modifier to query" do
      expect(OpenSymbols).to receive(:access_token).and_return('test_token_123')
      
      response = double(success?: true, body: '[]', code: 200)
      expect(Typhoeus).to receive(:get).with(
        "https://www.opensymbols.org/api/v2/symbols",
        params: { q: 'sun hc:1', locale: 'en', safe: 1 },
        headers: { 'Authorization' => 'Bearer test_token_123' },
        timeout: 10
      ).and_return(response)
      
      results = OpenSymbols.search('sun', high_contrast: true)
      expect(results).to eq([])
    end
    
    it "should handle 401 token expiry and retry" do
      expect(OpenSymbols).to receive(:access_token).and_return('expired_token').ordered
      
      # First request returns 401
      expired_response = double(success?: false, body: '{"token_expired": true}', code: 401)
      expect(Typhoeus).to receive(:get).and_return(expired_response).ordered
      
      # Should clear cache and generate new token
      expect(OpenSymbols).to receive(:clear_token_cache).ordered
      expect(OpenSymbols).to receive(:generate_new_token).and_return('new_token').ordered
      
      # Second request succeeds
      success_response = double(success?: true, body: '[]', code: 200)
      expect(Typhoeus).to receive(:get).and_return(success_response).ordered
      
      results = OpenSymbols.search('test')
      expect(results).to eq([])
    end
    
    it "should handle 429 throttling" do
      expect(OpenSymbols).to receive(:access_token).and_return('test_token_123')
      
      response = double(success?: false, body: '{"throttled": true}', code: 429)
      expect(Typhoeus).to receive(:get).and_return(response)
      
      results = OpenSymbols.search('test')
      expect(results).to eq([])
    end
    
    it "should return empty array if no access token" do
      expect(OpenSymbols).to receive(:access_token).and_return(nil)
      
      results = OpenSymbols.search('test')
      expect(results).to eq([])
    end
    
    it "should return empty array for blank query" do
      results = OpenSymbols.search('')
      expect(results).to eq([])
      
      results = OpenSymbols.search(nil)
      expect(results).to eq([])
    end
  end
  
  describe "find_images" do
    it "should convert search results to LingoLinq format" do
      search_results = [{
        'id' => 123,
        'symbol_key' => 'cat-abc',
        'name' => 'cat',
        'locale' => 'en',
        'license' => 'CC BY-SA',
        'license_url' => 'https://creativecommons.org/licenses/by-sa/4.0/',
        'author' => 'Test Author',
        'author_url' => 'https://example.com',
        'source_url' => 'https://example.com/cat',
        'skins' => false,
        'repo_key' => 'arasaac',
        'hc' => false,
        'extension' => 'png',
        'image_url' => 'https://example.com/cat.png',
        'width' => 500,
        'height' => 500
      }]
      
      expect(OpenSymbols).to receive(:search).with('cat', locale: 'en', repo: 'arasaac', favor: nil).and_return(search_results)
      
      results = OpenSymbols.find_images('cat', 'arasaac', 'en')
      
      expect(results.length).to eq(1)
      expect(results[0]['url']).to eq('https://example.com/cat.png')
      expect(results[0]['thumbnail_url']).to eq('https://example.com/cat.png')
      expect(results[0]['content_type']).to eq('image/png')
      expect(results[0]['width']).to eq(500)
      expect(results[0]['height']).to eq(500)
      expect(results[0]['external_id']).to eq(123)
      expect(results[0]['public']).to eq(true)
      expect(results[0]['protected']).to eq(false)
      expect(results[0]['license']['type']).to eq('CC BY-SA')
      expect(results[0]['license']['author_name']).to eq('Test Author')
    end
    
    it "should use repo modifier for specific libraries" do
      expect(OpenSymbols).to receive(:search).with('dog', locale: 'en', repo: 'arasaac', favor: nil).and_return([])
      OpenSymbols.find_images('dog', 'arasaac', 'en')
      
      expect(OpenSymbols).to receive(:search).with('cat', locale: 'en', repo: 'mulberry', favor: nil).and_return([])
      OpenSymbols.find_images('cat', 'mulberry', 'en')
      
      expect(OpenSymbols).to receive(:search).with('house', locale: 'en', repo: 'twemoji', favor: nil).and_return([])
      OpenSymbols.find_images('house', 'twemoji', 'en')
    end
    
    it "should use favor modifier for tawasol" do
      expect(OpenSymbols).to receive(:search).with('test', locale: 'en', repo: nil, favor: 'tawasol').and_return([])
      OpenSymbols.find_images('test', 'tawasol', 'en')
    end
    
    it "should not use repo modifier for opensymbols library" do
      expect(OpenSymbols).to receive(:search).with('test', locale: 'en', repo: nil, favor: nil).and_return([])
      OpenSymbols.find_images('test', 'opensymbols', 'en')
    end

    it "should mark protected sources correctly" do
      search_results = [{
        'id' => 123,
        'image_url' => 'https://example.com/test.png',
        'extension' => 'png',
        'license' => 'Private',
        'license_url' => 'https://example.com/license',
        'author' => 'PCS',
        'author_url' => 'https://example.com'
      }]

      expect(OpenSymbols).to receive(:search).and_return(search_results)

      results = OpenSymbols.find_images('test', 'pcs', 'en', protected_source: 'pcs')

      expect(results[0]['public']).to eq(false)
      expect(results[0]['protected']).to eq(true)
      expect(results[0]['protected_source']).to eq('pcs')
    end
  end

  describe 'defaults' do
    it 'should use bulk API for specific repositories' do
      expect(OpenSymbols).to receive(:access_token).and_return('test_token')
      expect(Typhoeus).to receive(:post).with(
        'https://www.opensymbols.org/api/v2/repositories/arasaac/defaults',
        hash_including(
          body: { words: ['cat', 'dog'], allow_search: true, locale: 'en' }.to_json,
          headers: { 'Authorization' => 'Bearer test_token', 'Content-Type' => 'application/json' }
        )
      ).and_return(double(success?: true, body: {
        'cat' => { 'image_url' => 'https://example.com/cat.png', 'extension' => 'png', 'width' => 100, 'height' => 100, 'id' => '1', 'license' => 'CC', 'license_url' => nil, 'author' => nil, 'author_url' => nil, 'source_url' => nil }
      }.to_json, code: 200))

      results = OpenSymbols.defaults('arasaac', ['cat', 'dog'], 'en')
      expect(results.keys).to eq(['cat'])
      expect(results['cat']['image_url']).to eq('https://example.com/cat.png')
    end

    it 'should fall back to per-word search for opensymbols meta-repo' do
      expect(OpenSymbols).to receive(:search).with('cat', locale: 'en', repo: nil, favor: nil).and_return([{ 'image_url' => 'https://example.com/cat.png', 'id' => 1 }])
      expect(OpenSymbols).to receive(:search).with('dog', locale: 'en', repo: nil, favor: nil).and_return([])

      results = OpenSymbols.defaults('opensymbols', ['cat', 'dog'], 'en')
      expect(results).to eq('cat' => { 'image_url' => 'https://example.com/cat.png', 'id' => 1 })
    end

    it 'should fall back to per-word search for tawasol' do
      expect(OpenSymbols).to receive(:search).with('house', locale: 'en', repo: nil, favor: 'tawasol').and_return([])

      results = OpenSymbols.defaults('tawasol', ['house'], 'en')
      expect(results).to eq({})
    end
  end
end

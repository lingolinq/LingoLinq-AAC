require 'spec_helper'
require 'openssl'

# Locks the backward-compatibility guarantee of RedisInit.redis_options: a
# redis:// URI must keep producing the exact legacy connection hash (so the
# Render environment is untouched), while a rediss:// URI (GCP Memorystore,
# AUTH + TLS, SERVER_AUTHENTICATION) enables :ssl and validates against the
# supplied CA. See config/initializers/resque.rb.
describe RedisInit do
  let(:redis_uri)  { URI.parse('redis://:secret@redis.example:6379') }
  let(:rediss_uri) { URI.parse('rediss://:secret@redis.example:6378') }

  # Self-signed certs built in-memory; no files, no network.
  def build_cert(key, cn)
    cert = OpenSSL::X509::Certificate.new
    cert.version = 2
    cert.serial = 1
    cert.subject = cert.issuer = OpenSSL::X509::Name.parse("/CN=#{cn}")
    cert.public_key = key.public_key
    cert.not_before = Time.now - 3600
    cert.not_after = Time.now + 3600
    cert.sign(key, OpenSSL::Digest::SHA256.new)
    cert
  end

  around(:each) do |example|
    saved = ENV.values_at('REDIS_CA_FILE', 'REDIS_CA_CERT')
    ENV.delete('REDIS_CA_FILE')
    ENV.delete('REDIS_CA_CERT')
    example.run
    ENV['REDIS_CA_FILE'], ENV['REDIS_CA_CERT'] = saved
    ENV.delete('REDIS_CA_FILE') if saved[0].nil?
    ENV.delete('REDIS_CA_CERT') if saved[1].nil?
  end

  describe '.redis_options' do
    it 'returns the exact legacy hash for redis:// (no :ssl, Render unchanged)' do
      expect(RedisInit.redis_options(redis_uri)).to eq(
        :host => 'redis.example', :port => 6379, :password => 'secret'
      )
    end

    it 'merges extra options for redis:// without enabling ssl' do
      opts = RedisInit.redis_options(redis_uri, :timeout => 5)
      expect(opts).to eq(
        :host => 'redis.example', :port => 6379, :password => 'secret', :timeout => 5
      )
      expect(opts).not_to have_key(:ssl)
    end

    it 'enables :ssl for rediss:// with no ssl_params when no CA env is set' do
      opts = RedisInit.redis_options(rediss_uri)
      expect(opts[:ssl]).to eq(true)
      expect(opts).not_to have_key(:ssl_params)
      expect(opts.values_at(:host, :port, :password)).to eq(['redis.example', 6378, 'secret'])
    end

    it 'uses ssl_params[:ca_file] for rediss:// when REDIS_CA_FILE is set' do
      ENV['REDIS_CA_FILE'] = '/secrets/server_ca.pem'
      opts = RedisInit.redis_options(rediss_uri)
      expect(opts[:ssl]).to eq(true)
      expect(opts[:ssl_params]).to eq(:ca_file => '/secrets/server_ca.pem')
    end

    it 'prefers REDIS_CA_FILE over inline REDIS_CA_CERT' do
      ENV['REDIS_CA_FILE'] = '/secrets/server_ca.pem'
      ENV['REDIS_CA_CERT'] = build_cert(OpenSSL::PKey::RSA.new(2048), 'ca').to_pem
      expect(RedisInit.redis_options(rediss_uri)[:ssl_params]).to eq(:ca_file => '/secrets/server_ca.pem')
    end

    it 'builds a cert_store from inline REDIS_CA_CERT with multiple concatenated certs' do
      key = OpenSSL::PKey::RSA.new(2048)
      ENV['REDIS_CA_CERT'] = build_cert(key, 'ca-old').to_pem + build_cert(key, 'ca-new').to_pem
      store = RedisInit.redis_options(rediss_uri)[:ssl_params][:cert_store]
      expect(store).to be_a(OpenSSL::X509::Store)
    end

    it 'does not crash when REDIS_CA_CERT contains a duplicate cert (rotation overlap)' do
      key = OpenSSL::PKey::RSA.new(2048)
      pem = build_cert(key, 'ca-dup').to_pem
      ENV['REDIS_CA_CERT'] = pem + pem
      expect { RedisInit.redis_options(rediss_uri) }.not_to raise_error
      expect(RedisInit.redis_options(rediss_uri)[:ssl_params][:cert_store]).to be_a(OpenSSL::X509::Store)
    end

    it 'skips a malformed (fenced-but-garbage) cert without crashing if a good one remains' do
      key = OpenSSL::PKey::RSA.new(2048)
      garbage = "-----BEGIN CERTIFICATE-----\nnot-valid-base64!!!\n-----END CERTIFICATE-----\n"
      ENV['REDIS_CA_CERT'] = build_cert(key, 'ca-good').to_pem + garbage
      expect { RedisInit.redis_options(rediss_uri) }.not_to raise_error
      expect(RedisInit.redis_options(rediss_uri)[:ssl_params][:cert_store]).to be_a(OpenSSL::X509::Store)
    end

    it 'raises a named error when REDIS_CA_CERT is set but yields zero valid certs' do
      ENV['REDIS_CA_CERT'] = "-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----\n"
      expect { RedisInit.redis_options(rediss_uri) }.to raise_error(/no valid certificates/)
    end
  end

  # The load-bearing security property: the ssl_params we hand to redis-rb must
  # produce a context that actually verifies the server cert (VERIFY_PEER), in
  # both the inline-CA and no-CA rediss:// cases. redis-rb forwards ssl_params
  # to OpenSSL::SSL::SSLContext#set_params, so mirror that here. Guards against a
  # future refactor silently downgrading to VERIFY_NONE.
  describe 'TLS verification is enforced for rediss://' do
    def verify_mode_for(opts)
      ctx = OpenSSL::SSL::SSLContext.new
      ctx.set_params(opts[:ssl_params] || {})
      ctx.verify_mode
    end

    it 'verifies the peer when no CA env is set (system store)' do
      expect(verify_mode_for(RedisInit.redis_options(rediss_uri))).to eq(OpenSSL::SSL::VERIFY_PEER)
    end

    it 'verifies the peer when an inline CA is supplied' do
      ENV['REDIS_CA_CERT'] = build_cert(OpenSSL::PKey::RSA.new(2048), 'ca').to_pem
      expect(verify_mode_for(RedisInit.redis_options(rediss_uri))).to eq(OpenSSL::SSL::VERIFY_PEER)
    end
  end

  # LL-c6dd65a2aa: the permission-cache token must no longer be the static 'abc'.
  # It is shared across all web/worker processes, so the resolver must be
  # deterministic (no randomness) and prefer an explicit env value, falling back
  # through deploy-identity env vars before the dev-only literal.
  describe '.resolved_cache_token' do
    around(:each) do |example|
      keys = %w[CACHE_TOKEN RENDER_GIT_COMMIT K_REVISION]
      saved = ENV.values_at(*keys)
      keys.each { |k| ENV.delete(k) }
      example.run
      keys.each_with_index { |k, i| saved[i].nil? ? ENV.delete(k) : ENV[k] = saved[i] }
    end

    it 'prefers CACHE_TOKEN when set' do
      ENV['CACHE_TOKEN'] = 'explicit-secret'
      ENV['RENDER_GIT_COMMIT'] = 'deadbeef'
      expect(RedisInit.resolved_cache_token).to eq('explicit-secret')
    end

    it 'falls back to the Render deploy SHA when CACHE_TOKEN is absent' do
      ENV['RENDER_GIT_COMMIT'] = 'deadbeef'
      ENV['K_REVISION'] = 'svc-00001-abc'
      expect(RedisInit.resolved_cache_token).to eq('deadbeef')
    end

    it 'falls back to the Cloud Run revision when no CACHE_TOKEN/Render SHA' do
      ENV['K_REVISION'] = 'svc-00001-abc'
      expect(RedisInit.resolved_cache_token).to eq('svc-00001-abc')
    end

    it 'treats a blank env value as unset (skips to the next source)' do
      ENV['CACHE_TOKEN'] = ''
      ENV['RENDER_GIT_COMMIT'] = 'deadbeef'
      expect(RedisInit.resolved_cache_token).to eq('deadbeef')
    end

    it 'falls back to the legacy literal only when nothing is set' do
      expect(RedisInit.resolved_cache_token).to eq('abc')
    end

    it 'is deterministic: repeated calls return the same value' do
      ENV['RENDER_GIT_COMMIT'] = 'deadbeef'
      expect(RedisInit.resolved_cache_token).to eq(RedisInit.resolved_cache_token)
    end
  end
end

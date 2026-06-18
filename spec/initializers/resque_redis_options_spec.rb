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
    saved = ENV.values_at('REDIS_CA_FILE', 'REDIS_CA_CERT', 'REDIS_TLS_VERIFY_HOSTNAME')
    ENV.delete('REDIS_CA_FILE')
    ENV.delete('REDIS_CA_CERT')
    ENV.delete('REDIS_TLS_VERIFY_HOSTNAME')
    example.run
    ENV['REDIS_CA_FILE'], ENV['REDIS_CA_CERT'], ENV['REDIS_TLS_VERIFY_HOSTNAME'] = saved
    ENV.delete('REDIS_CA_FILE') if saved[0].nil?
    ENV.delete('REDIS_CA_CERT') if saved[1].nil?
    ENV.delete('REDIS_TLS_VERIFY_HOSTNAME') if saved[2].nil?
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

  # Hostname verification is ON by default (so DNS-named TLS endpoints stay
  # safe) and is turned OFF only when REDIS_TLS_VERIFY_HOSTNAME is explicitly
  # false-y. Disabling it is required for Memorystore (connect-by-private-IP,
  # cert issued for the instance not the IP) and MUST NOT weaken CA-chain
  # verification, which stays at VERIFY_PEER. See config/initializers/resque.rb.
  describe 'hostname verification opt-out (REDIS_TLS_VERIFY_HOSTNAME)' do
    it 'leaves verify_hostname unset by default for rediss:// (verification ON)' do
      ENV['REDIS_CA_CERT'] = build_cert(OpenSSL::PKey::RSA.new(2048), 'ca').to_pem
      expect(RedisInit.redis_options(rediss_uri)[:ssl_params]).not_to have_key(:verify_hostname)
    end

    it 'sets verify_hostname=false when REDIS_TLS_VERIFY_HOSTNAME=false, keeping the CA store' do
      ENV['REDIS_CA_CERT'] = build_cert(OpenSSL::PKey::RSA.new(2048), 'ca').to_pem
      ENV['REDIS_TLS_VERIFY_HOSTNAME'] = 'false'
      ssl = RedisInit.redis_options(rediss_uri)[:ssl_params]
      expect(ssl[:verify_hostname]).to eq(false)
      expect(ssl[:cert_store]).to be_a(OpenSSL::X509::Store)
    end

    it 'treats truthy/unrelated values as verification ON (no opt-out)' do
      ENV['REDIS_CA_CERT'] = build_cert(OpenSSL::PKey::RSA.new(2048), 'ca').to_pem
      ENV['REDIS_TLS_VERIFY_HOSTNAME'] = 'true'
      expect(RedisInit.redis_options(rediss_uri)[:ssl_params]).not_to have_key(:verify_hostname)
    end

    it 'does not touch redis:// (no ssl_params) even when the flag is false' do
      ENV['REDIS_TLS_VERIFY_HOSTNAME'] = 'false'
      opts = RedisInit.redis_options(redis_uri)
      expect(opts).not_to have_key(:ssl)
      expect(opts).not_to have_key(:ssl_params)
    end

    it 'produces a context that disables the hostname check but stays VERIFY_PEER' do
      ENV['REDIS_CA_CERT'] = build_cert(OpenSSL::PKey::RSA.new(2048), 'ca').to_pem
      ENV['REDIS_TLS_VERIFY_HOSTNAME'] = 'off'
      ctx = OpenSSL::SSL::SSLContext.new
      ctx.set_params(RedisInit.redis_options(rediss_uri)[:ssl_params])
      expect(ctx.verify_hostname).to eq(false)
      expect(ctx.verify_mode).to eq(OpenSSL::SSL::VERIFY_PEER)
    end

    it 'fails closed when hostname verification is off but no CA is pinned' do
      ENV['REDIS_TLS_VERIFY_HOSTNAME'] = 'false'
      expect { RedisInit.redis_options(rediss_uri) }.to raise_error(%r{no REDIS_CA_FILE/REDIS_CA_CERT})
    end
  end
end

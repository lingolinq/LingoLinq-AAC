# frozen_string_literal: true

# Default answers for outside services that app code calls as a SIDE EFFECT of what most specs
# exercise. Specs never reach the internet (.claude/rules/testing.md, "External services"); these
# defaults stand in for the outside service so every spec that triggers the side effect does not
# need its own stub.
#
# Each default is the service's "nothing found" answer, which the calling code already handles.
# A spec that tests the call itself declares its own `stub_request` (WebMock uses the most recently
# declared matching stub) or stubs the Ruby method that makes it.
RSpec.configure do |config|
  config.before(:each) do
    # Board#check_image_url (app/models/board.rb), scheduled when a board is created with the
    # default icon: searches OpenSymbols for an icon matching the board's name.
    stub_request(:get, %r{\Ahttps://www\.opensymbols\.org/api/v1/symbols/search\?})
      .to_return(status: 200, body: '[]', headers: {'Content-Type' => 'application/json'})

    # example.com is the placeholder host in fixtures (fake image URLs) and in spec_helper's
    # upload fallback (`Uploader.remote_upload_params` posts to https://example.com/). The real
    # host answers 404 for those paths and 405 for a POST (measured 2026-10-08); answer the same.
    # App code only reads from it and posts to it: a PUT or DELETE is left unstubbed, so it fails.
    [:get, :head, :post].each do |method|
      stub_request(method, %r{\Ahttps?://(www\.)?example\.com/})
        .to_return(status: method == :post ? 405 : 404, body: '')
    end

    # S3 objects (uploads bucket, extra data, image URLs in fixtures, including the old CoughDrop
    # bucket): unsigned or unauthenticated requests get 403 Access Denied from S3 (measured
    # 2026-10-08); answer the same. Only reads and browser-style POST uploads (Uploader.remote_upload,
    # lib/uploader.rb:81) are answered: a PUT or DELETE (an SDK write) is left unstubbed, so it fails.
    [:get, :head, :post].each do |method|
      stub_request(method, %r{\Ahttps?://([\w.-]+\.)?s3[\w.-]*\.amazonaws\.com/})
        .to_return(status: 403, body: '<Error><Code>AccessDenied</Code></Error>',
                   headers: {'Content-Type' => 'application/xml'})
    end
  end

  # SafeHttp resolves the hostname itself (Addrinfo.getaddrinfo in resolve_addresses,
  # lib/safe_http.rb:67) before the request reaches WebMock, so without this a spec asks real DNS.
  # A public name gets a TEST-NET-3 documentation address, which SafeHttp's blocked_ipaddr?
  # (lib/safe_http.rb:125) allows, so the request goes on to the stubs above; it carries the
  # requested port and address family. Only an allowlist keeps the real resolver: localhost and
  # *.localhost (with or without a trailing dot), IP literals and numeric shorthands such as '10.1'
  # (10.0.0.1), which it answers without the network, so SafeHttp's address blocking sees what it
  # would see in production; and the Redis and database hosts named in the environment, which the
  # test run connects to. Any other name, including an unknown single label (which can still go
  # out through search domains, LLMNR or mDNS), gets the documentation address.
  #
  # A spec that tests resolution itself tags its group `own_resolver: true` and sets its own
  # expectations on Addrinfo. It must not get this default: once a plain
  # `expect(...).to receive` (exactly once) has been satisfied, rspec-mocks hands further calls to
  # an `allow` stub instead of failing, so a second lookup (DNS rebinding) would go unnoticed.
  config.before(:each) do |example|
    next if example.metadata[:own_resolver]

    allow(Addrinfo).to receive(:getaddrinfo).and_wrap_original do |original, host, *args, **opts|
      if OutsideServices.local_name?(host)
        original.call(host, *args, **opts)
      else
        OutsideServices.documentation_answer(*args)
      end
    end
  end

  # Fails an untagged example that sets its own expectation on Addrinfo.getaddrinfo, which the
  # default above would silently weaken. Runs before rspec-mocks verifies the example's mocks.
  config.after(:each) do |example|
    OutsideServices.refuse_untagged_resolver_expectations!(example.metadata)
  end
end

module OutsideServices
  # One dotted part of a numeric IPv4 shorthand: decimal, octal or hex ('10.1', '0x7f.0.0.1').
  NUMERIC_HOST = /\A(0x\h+|\d+)(\.(0x\h+|\d+)){0,3}\z/i

  # Where the test run finds Redis (config/initializers/resque.rb:5) and the database
  # (config/database.yml; CI sets DATABASE_URL in .github/workflows/ci.yml).
  SERVICE_URL_KEYS = %w[REDISCLOUD_URL OPENREDIS_URL REDISGREEN_URL REDISTOGO_URL REDIS_URL DATABASE_URL].freeze

  def self.service_hosts(env = ENV)
    hosts = SERVICE_URL_KEYS.map do |key|
      URI.parse(env[key].to_s).host
    rescue URI::InvalidURIError
      nil
    end
    (hosts + [env['DB_HOST']]).compact.map { |h| h.downcase.chomp('.') }.reject(&:empty?)
  end

  def self.local_name?(host, env = ENV)
    name = host.to_s.downcase.chomp('.')
    return true if name.empty? || name == 'localhost' || name.end_with?('.localhost')
    return true if name.match?(NUMERIC_HOST)
    return true if service_hosts(env).include?(name)
    IPAddr.new(name.delete_prefix('[').delete_suffix(']'))
    true
  rescue IPAddr::InvalidAddressError
    false
  end

  def self.refuse_untagged_resolver_expectations!(metadata)
    return if metadata[:own_resolver]
    return unless RSpec::Mocks.space.registered?(Addrinfo)
    double = RSpec::Mocks.space.proxy_for(Addrinfo).method_double_if_exists_for_message(:getaddrinfo)
    return unless double && double.expectations.any?

    raise 'This example sets an expectation on Addrinfo.getaddrinfo but its group is not tagged ' \
          'own_resolver: true, so the default resolver in spec/support/outside_services.rb would ' \
          'answer any extra call and the expectation could not fail on it. Tag the group.'
  end

  # The fake lookup result, for the arguments after the host in Addrinfo.getaddrinfo(host, service,
  # family, socktype): TEST-NET-3 (or 2001:db8::/32 when IPv6 is asked for) on the requested port.
  def self.documentation_answer(service = nil, family = nil, socktype = nil, *)
    ip = [Socket::AF_INET6, :INET6, :AF_INET6, 'AF_INET6'].include?(family) ? '2001:db8::10' : '203.0.113.10'
    port = service || 80
    [socktype == Socket::SOCK_DGRAM ? Addrinfo.udp(ip, port) : Addrinfo.tcp(ip, port)]
  end
end

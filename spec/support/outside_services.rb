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

    # SafeHttp resolves the hostname itself (Addrinfo.getaddrinfo in resolve_addresses,
    # lib/safe_http.rb:67) before the request reaches WebMock, so without this a spec asks real DNS.
    # A public name gets a TEST-NET-3 documentation address, which SafeHttp's blocked_ipaddr?
    # (lib/safe_http.rb:125) allows, so the request goes on to the stubs above. Local names (Redis
    # and database hosts such as localhost, or a single-label service name) and IP literals keep
    # the real resolver. A spec that tests resolution declares its own expectation on Addrinfo.
    allow(Addrinfo).to receive(:getaddrinfo).and_wrap_original do |original, host, *args, **opts|
      if OutsideServices.local_name?(host)
        original.call(host, *args, **opts)
      else
        [Addrinfo.tcp('203.0.113.10', 80)]
      end
    end
  end
end

module OutsideServices
  def self.local_name?(host)
    name = host.to_s
    return true if name.empty? || !name.include?('.') || name == 'localhost' || name.end_with?('.localhost')
    IPAddr.new(name.delete_prefix('[').delete_suffix(']'))
    true
  rescue IPAddr::InvalidAddressError
    false
  end
end

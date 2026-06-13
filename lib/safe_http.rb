require 'ffi'
require 'ipaddr'
require 'socket'
require 'timeout'
require 'ethon'

# SSRF-safe outbound HTTP: resolve hostnames once, validate all IPs, pin via
# libcurl CURLOPT_RESOLVE so connect-time DNS cannot rebind to internal targets.
module SafeHttp
  MAX_REDIRECTS = 5
  DNS_RESOLVE_TIMEOUT = 5
  # Carrier-grade NAT (RFC 6598). Intentionally blocked for SSRF defense even
  # though some cloud/CDN ranges overlap; hostname fetches should use public names.
  CGN_RANGE = IPAddr.new('100.64.0.0/10')
  NULL_8 = "\x00".b * 8
  NULL_10 = "\x00".b * 10
  NULL_12 = "\x00".b * 12
  FF_FF = "\xff\xff".b

  class << self
    def get(url, **opts)
      request(:get, url, **opts)
    end

    def head(url, **opts)
      request(:head, url, **opts)
    end

    def post(url, **opts)
      request(:post, url, **opts)
    end

    def request(method, url, **opts)
      current_url = url
      redirects = 0
      loop do
        prepared = prepare_request(current_url)
        return attach_effective_url(failed_response, nil) unless prepared

        response = execute_request(method, prepared, opts)
        response = attach_effective_url(response, prepared[:effective_url])

        redirect_url = redirect_target(response, prepared[:uri])
        unless redirect_url
          return response
        end

        redirects += 1
        return attach_effective_url(failed_response('too many redirects'), prepared[:effective_url]) if redirects > MAX_REDIRECTS

        current_url = redirect_url
      end
    end

    def blocked_address?(ip)
      return false if skip_blocked_checks?

      addr = coerce_ipaddr(ip)
      return true unless addr

      blocked_ipaddr?(addr)
    end

    def resolve_addresses(host)
      addrs = Timeout.timeout(DNS_RESOLVE_TIMEOUT) do
        Addrinfo.getaddrinfo(host, nil, Socket::AF_UNSPEC, Socket::SOCK_STREAM)
      end
      ips = addrs.map { |addr| normalize_resolved_ip(addr.ip_address) }.uniq
      return nil if ips.empty?

      ips.each do |ip|
        return nil if blocked_address?(ip)
      end
      ips
    rescue Timeout::Error, SocketError, SystemCallError
      nil
    end

    def resolve_pins(uri, ips)
      return nil if ips.nil? || ips.empty?

      host = uri.host
      port = uri.port
      formatted = ips.map { |ip| format_pin_address(ip) }.join(',')
      ["#{host}:#{port}:#{formatted}"]
    end

    def ip_literal_host?(host)
      !coerce_ipaddr(host).nil?
    end

    # Build a Typhoeus::Request with DNS pins for streaming/callback use (e.g. proxy).
    def build_typhoeus_request(url, **opts)
      prepared = prepare_request(url)
      return nil unless prepared

      request_opts = apply_typhoeus_request_opts(opts, prepared[:pins])
      request = Typhoeus::Request.new(prepared[:effective_url], **request_opts)
      attach_effective_url(request, prepared[:effective_url])
      request
    end

    private

    # Skipped in development so local/private endpoints remain reachable during dev.
    def skip_blocked_checks?
      defined?(Rails) && Rails.env.development?
    end

    def normalize_ip_literal(ip)
      ip.to_s.strip.sub(/\A\[/, '').sub(/\]\z/, '').sub(/%.*\z/, '')
    end

    def coerce_ipaddr(ip)
      normalized = normalize_ip_literal(ip)
      return nil if normalized.empty?

      IPAddr.new(normalized)
    rescue IPAddr::InvalidAddressError
      nil
    end

    def blocked_ipaddr?(addr)
      return true if addr.loopback? || addr.private? || addr.link_local? || CGN_RANGE.include?(addr)

      embedded = embedded_ipv4(addr)
      return blocked_ipaddr?(embedded) if embedded

      false
    end

    # Detect IPv4-compatible (::w.x.y.z), standard mapped (::ffff:w.x.y.z), and
    # non-canonical embeddings (e.g. ::ffff:0:7f00:1) that IPAddr range helpers miss.
    def embedded_ipv4(addr)
      return nil unless addr.ipv6?

      if addr.ipv4_mapped?
        return addr.native
      end

      bytes = addr.hton
      return ipv4_from_bytes(bytes[-4, 4]) if bytes_match?(bytes, 0, 12, NULL_12)

      if bytes_match?(bytes, 0, 10, NULL_10) && bytes_match?(bytes, 10, 2, FF_FF)
        return ipv4_from_bytes(bytes[-4, 4])
      end

      if bytes_match?(bytes, 0, 8, NULL_8) && bytes_match?(bytes, 8, 2, FF_FF)
        return ipv4_from_bytes(bytes[-4, 4])
      end

      nil
    end

    def bytes_match?(bytes, offset, length, expected)
      bytes.byteslice(offset, length) == expected
    end

    def ipv4_from_bytes(bytes)
      IPAddr.new(bytes.unpack('C4').join('.'))
    rescue IPAddr::InvalidAddressError
      nil
    end

    def prepare_request(url)
      sanitized = Uploader.sanitize_url(url)
      return nil unless sanitized

      sanitized = escape_lessonpix_query(sanitized)

      uri = URI.parse(sanitized)
      return nil unless uri.host

      if ip_literal_host?(uri.host)
        literal = coerce_ipaddr(uri.host)
        return nil unless literal
        return nil if blocked_address?(literal)
        { effective_url: sanitized, uri: uri, pins: nil }
      else
        ips = resolve_addresses(uri.host)
        return nil unless ips

        pins = resolve_pins(uri, ips)
        return nil unless pins
        { effective_url: sanitized, uri: uri, pins: pins }
      end
    end

    def execute_request(method, prepared, opts)
      request_opts = apply_typhoeus_request_opts(opts, prepared[:pins])

      case method
      when :get
        Typhoeus.get(prepared[:effective_url], **request_opts)
      when :head
        Typhoeus.head(prepared[:effective_url], **request_opts)
      when :post
        Typhoeus.post(prepared[:effective_url], **request_opts)
      else
        raise ArgumentError, "unsupported HTTP method: #{method}"
      end
    end

    def redirect_target(response, base_uri)
      return nil unless response && response.code.to_i >= 300 && response.code.to_i < 400

      location = response.headers && (response.headers['Location'] || response.headers['location'])
      if location.present?
        return absolute_redirect_url(location, base_uri)
      end

      link = response.headers && (response.headers['Link'] || response.headers['link'])
      if link && response.code.to_i == 302
        extracted = link.split(/<|>/)[1]
        return absolute_redirect_url(extracted, base_uri) if extracted.present?
      end

      nil
    end

    def absolute_redirect_url(location, base_uri)
      location = normalize_redirect_url(location.to_s.strip)
      return nil if location.empty?

      redirect_uri = URI.parse(location) rescue nil
      return nil unless redirect_uri

      if redirect_uri.host.nil?
        URI.join(base_uri.to_s, location).to_s
      else
        location
      end
    rescue URI::InvalidURIError
      nil
    end

    def normalize_redirect_url(location)
      location = location.to_s.strip
      return '' if location.empty?

      escape_lessonpix_query(location)
    end

    def escape_lessonpix_query(location)
      if location.match(/lessonpix\.com/) && location.include?('?') && location.match(/\.png/)
        location.sub(/\?/, '%3F')
      else
        location
      end
    end

    def normalize_resolved_ip(ip)
      addr = coerce_ipaddr(ip)
      return ip unless addr

      addr.ipv4_mapped? ? addr.native.to_s : addr.to_s
    end

    def format_pin_address(ip)
      ip.include?(':') ? "[#{ip}]" : ip
    end

    def apply_typhoeus_request_opts(opts, pins)
      request_opts = opts.merge(followlocation: false)
      request_opts[:resolve] = build_resolve_slist(pins) if pins
      request_opts
    end

    # Ethon 0.15+ requires CURLOPT_RESOLVE as a curl slist (FFI::Pointer), not a Ruby Array.
    def build_resolve_slist(pins)
      return nil if pins.nil? || pins.empty?

      list = nil
      pins.each do |pin|
        list = Ethon::Curl.slist_append(list, pin.to_s)
      end
      FFI::AutoPointer.new(list, Ethon::Curl.method(:slist_free_all))
    end

    def failed_response(message = 'blocked or invalid URL')
      OpenStruct.new(
        success?: false,
        code: 0,
        body: message,
        headers: {},
        return_message: message
      )
    end

    def attach_effective_url(response, effective_url)
      response.define_singleton_method(:effective_url) { effective_url }
      response
    end
  end
end

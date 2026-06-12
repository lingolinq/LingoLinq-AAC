require 'ipaddr'
require 'socket'

# SSRF-safe outbound HTTP: resolve hostnames once, validate all IPs, pin via
# libcurl CURLOPT_RESOLVE so connect-time DNS cannot rebind to internal targets.
module SafeHttp
  MAX_REDIRECTS = 5
  CGN_RANGE = IPAddr.new('100.64.0.0/10')

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
        attach_effective_url(response, prepared[:effective_url])

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

      addr = ip.is_a?(IPAddr) ? ip : IPAddr.new(ip.to_s)
      addr.loopback? || addr.private? || addr.link_local? || CGN_RANGE.include?(addr)
    rescue IPAddr::InvalidAddressError
      true
    end

    def resolve_addresses(host)
      addrs = Addrinfo.getaddrinfo(host, nil, Socket::AF_UNSPEC, Socket::SOCK_STREAM)
      ips = addrs.map(&:ip_address).uniq
      return nil if ips.empty?

      ips.each do |ip|
        return nil if blocked_address?(ip)
      end
      ips
    rescue SocketError, SystemCallError
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
      IPAddr.new(host.sub(/^\[/, '').sub(/\]$/, ''))
      true
    rescue IPAddr::InvalidAddressError
      false
    end

    private

    def skip_blocked_checks?
      defined?(Rails) && Rails.env.development?
    end

    def prepare_request(url)
      sanitized = Uploader.sanitize_url(url)
      return nil unless sanitized

      uri = URI.parse(sanitized)
      return nil unless uri.host

      if ip_literal_host?(uri.host)
        literal = IPAddr.new(uri.host.sub(/^\[/, '').sub(/\]$/, ''))
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
      request_opts = opts.merge(followlocation: false)
      request_opts[:resolve] = prepared[:pins] if prepared[:pins]

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
      return nil if location.empty?

      location = location.sub(/\?/, '%3F') if location.match(/lessonpix\.com/) && location.match(/\?.*\.png/)
      location
    end

    def format_pin_address(ip)
      ip.include?(':') ? "[#{ip}]" : ip
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

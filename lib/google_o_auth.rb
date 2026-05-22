require 'net/http'
require 'json'
require 'googleauth/id_tokens'

class GoogleOAuth
  class Error < StandardError; end

  SCOPES = ['openid', 'email', 'profile'].freeze
  STATE_TTL = 1.hour
  LINK_TTL = 15.minutes
  LOCAL_DEV_PORTS = [8184, 5000, 3000, 80, 443].freeze
  DEFAULT_DEV_FRONTEND_ORIGIN = 'http://localhost:8184'.freeze

  def self.default_dev_frontend_origin
    ENV['FRONTEND_ORIGIN'].presence || ENV['EMBER_DEV_ORIGIN'].presence || DEFAULT_DEV_FRONTEND_ORIGIN
  end

  def self.enabled?
    client_id.present? && client_secret.present?
  end

  def self.client_id
    ENV['GOOGLE_OAUTH_CLIENT_ID'].to_s.strip
  end

  def self.client_secret
    ENV['GOOGLE_OAUTH_CLIENT_SECRET'].to_s.strip
  end

  def self.valid_return_origin?(origin, request = nil)
    return false if origin.blank?

    uri = URI.parse(origin.to_s.strip)
    return false unless uri.is_a?(URI::HTTP) && uri.host.present?

    host = uri.host.downcase
    allowed_hosts = ['localhost', '127.0.0.1']
    default_host = ENV['DEFAULT_HOST'].to_s.strip
    allowed_hosts << default_host.downcase if default_host.present?
    if request && request.host.present?
      allowed_hosts << request.host.downcase
    end
    return false unless allowed_hosts.any? { |h| host == h || host.end_with?(".#{h}") }

    if ['localhost', '127.0.0.1'].include?(host)
      port = uri.port
      return LOCAL_DEV_PORTS.include?(port) || port.nil?
    end
    true
  rescue URI::InvalidURIError
    false
  end

  def self.infer_return_origin(request)
    referer = request.headers['Referer'].to_s
    if referer =~ %r{\A(https?://[^/?#]+)}
      candidate = Regexp.last_match(1)
      return candidate if valid_return_origin?(candidate, request)
    end
    forwarded_host = request.headers['X-Forwarded-Host'].to_s.strip
    if forwarded_host.present?
      proto = request.headers['X-Forwarded-Proto'].presence || request.scheme
      candidate = "#{proto}://#{forwarded_host}"
      return candidate if valid_return_origin?(candidate, request)
    end
    nil
  end

  def self.frontend_origin(request, config = nil)
    origin = config && config['return_origin'].to_s.strip
    origin = infer_return_origin(request) if origin.blank?
    if origin.blank? && Rails.env.development?
      origin = default_dev_frontend_origin
    end
    return origin if origin.present? && valid_return_origin?(origin, request)

    nil
  end

  def self.frontend_redirect_url(request, config, path)
    path = path.to_s
    path = "/#{path}" unless path.start_with?('/')
    origin = frontend_origin(request, config)
    if origin.present?
      base = origin.to_s.sub(%r{/+\z}, '')
      return "#{base}#{path}"
    end
    path
  end

  def self.callback_url(request, state_config = nil)
    origin = frontend_origin(request, state_config)
    if origin.present?
      base = origin.to_s.sub(%r{/+\z}, '')
      return "#{base}/auth/google/callback"
    end
    "#{request.protocol}#{request.host_with_port}/auth/google/callback"
  end

  def self.authorization_url(request, state_code, state_config = nil)
    state_config ||= fetch_state(state_code) || {}
    query = {
      client_id: client_id,
      redirect_uri: callback_url(request, state_config),
      response_type: 'code',
      scope: SCOPES.join(' '),
      state: state_code,
      access_type: 'online',
      prompt: 'select_account'
    }
    "https://accounts.google.com/o/oauth2/v2/auth?#{URI.encode_www_form(query)}"
  end

  def self.exchange_code(request, code, state_config = nil)
    uri = URI('https://oauth2.googleapis.com/token')
    req = Net::HTTP::Post.new(uri)
    req.set_form_data(
      code: code,
      client_id: client_id,
      client_secret: client_secret,
      redirect_uri: callback_url(request, state_config),
      grant_type: 'authorization_code'
    )
    res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(req) }
    body = JSON.parse(res.body) rescue {}
    unless res.is_a?(Net::HTTPSuccess) && body['id_token'].present?
      raise Error, body['error_description'] || body['error'] || 'token_exchange_failed'
    end
    verify_id_token(body['id_token'])
  end

  def self.verify_id_token(id_token)
    payload = Google::Auth::IDTokens.verify_oidc(id_token, aud: client_id)
    raise Error, 'invalid_id_token' unless payload.is_a?(Hash)
    payload
  rescue Google::Auth::IDTokens::SignatureError, Google::Auth::IDTokens::AudienceMismatchError => e
    raise Error, e.message
  end

  def self.store_state(code, config)
    Permissions.setex(RedisInit.default, "google_oauth_#{code}", STATE_TTL.to_i, config.to_json, true)
  end

  def self.fetch_state(code)
    json = RedisInit.default.get("google_oauth_#{code}")
    JSON.parse(json) rescue nil
  end

  def self.clear_state(code)
    RedisInit.default.del("google_oauth_#{code}")
  end

  def self.store_link(nonce, config)
    Permissions.setex(RedisInit.default, "google_link_#{nonce}", LINK_TTL.to_i, config.to_json, true)
  end

  def self.fetch_link(nonce)
    json = RedisInit.default.get("google_link_#{nonce}")
    JSON.parse(json) rescue nil
  end

  def self.clear_link(nonce)
    RedisInit.default.del("google_link_#{nonce}")
  end

  def self.profile_from_payload(payload)
    {
      sub: payload['sub'],
      email: payload['email'],
      email_verified: payload['email_verified'] == true || payload['email_verified'] == 'true',
      name: payload['name'],
      picture: payload['picture']
    }
  end
end

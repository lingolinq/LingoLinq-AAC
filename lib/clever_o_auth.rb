require 'net/http'
require 'json'
require 'base64'
require 'cgi'

class CleverOAuth
  class Error < StandardError; end

  AUTHORIZE_URL = 'https://clever.com/oauth/authorize'.freeze
  TOKEN_URL = 'https://clever.com/oauth/tokens'.freeze
  ME_URL = 'https://api.clever.com/v3.0/me'.freeze
  API_BASE = 'https://api.clever.com'.freeze
  STATE_TTL = 1.hour
  USER_TYPES = %w[student teacher staff district_admin].freeze

  def self.enabled?
    client_id.present? && client_secret.present?
  end

  def self.client_id
    ENV['CLEVER_CLIENT_ID'].to_s.strip
  end

  def self.client_secret
    ENV['CLEVER_CLIENT_SECRET'].to_s.strip
  end

  def self.callback_url(request, state_config = nil)
    origin = GoogleOAuth.frontend_origin(request, state_config)
    if origin.present?
      base = origin.to_s.sub(%r{/+\z}, '')
      return "#{base}/auth/clever/callback"
    end
    "#{request.protocol}#{request.host_with_port}/auth/clever/callback"
  end

  def self.authorization_url(request, state_code, state_config = nil)
    state_config ||= fetch_state(state_code) || {}
    query = {
      response_type: 'code',
      redirect_uri: callback_url(request, state_config),
      client_id: client_id,
      state: state_code
    }
    district_id = state_config['district_id'].to_s.strip
    query[:district_id] = district_id if district_id.present?
    "#{AUTHORIZE_URL}?#{URI.encode_www_form(query)}"
  end

  def self.exchange_code(request, code, state_config = nil)
    raise Error, 'missing_code' if code.to_s.strip.blank?

    uri = URI(TOKEN_URL)
    req = Net::HTTP::Post.new(uri)
    req.basic_auth(client_id, client_secret)
    req['Content-Type'] = 'application/json'
    req['Accept'] = 'application/json'
    req.body = {
      code: code.to_s,
      grant_type: 'authorization_code',
      redirect_uri: callback_url(request, state_config)
    }.to_json
    res = http_request(uri, req)
    body = JSON.parse(res.body) rescue {}
    token = body['access_token'].to_s
    unless res.is_a?(Net::HTTPSuccess) && token.present?
      raise Error, body['error_description'] || body['error'] || 'token_exchange_failed'
    end
    token
  end

  def self.identify_user(access_token)
    me = api_get(ME_URL, access_token)
    me_data = unwrap_data(me)
    user_id = me_data['id'].to_s
    district_id = me_data['district'].to_s
    raise Error, 'identify_failed' if user_id.blank? || district_id.blank?

    user_body = api_get("#{API_BASE}/v3.0/users/#{CGI.escape(user_id)}", access_token)
    user_data = unwrap_data(user_body)
    profile_from_user(user_data, district_id)
  end

  def self.profile_from_user(user_data, district_id = nil)
    user_data = unwrap_data(user_data) if user_data.is_a?(Hash) && user_data['data'].is_a?(Hash)
    name = user_data['name'] || {}
    first = name['first'].to_s
    last = name['last'].to_s
    full_name = [first, last].reject(&:blank?).join(' ')
    roles = user_data['roles']
    roles = {} unless roles.is_a?(Hash)
    {
      id: user_data['id'].to_s,
      district_id: (district_id.presence || user_data['district']).to_s,
      email: user_data['email'].to_s.strip.presence,
      first_name: first,
      last_name: last,
      name: full_name.presence || user_data['id'].to_s,
      roles: roles.keys.map(&:to_s) & USER_TYPES,
      schools: Array(user_data['schools']).map(&:to_s)
    }
  end

  def self.store_state(code, config)
    Permissions.setex(RedisInit.default, "clever_oauth_#{code}", STATE_TTL.to_i, config.to_json, true)
  end

  def self.fetch_state(code)
    return nil if code.blank?
    json = RedisInit.default.get("clever_oauth_#{code}")
    JSON.parse(json) rescue nil
  end

  def self.clear_state(code)
    RedisInit.default.del("clever_oauth_#{code}") if code.present?
  end

  def self.http_request(uri, req)
    Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == 'https') { |http| http.request(req) }
  end

  def self.api_get(url, access_token)
    uri = URI(url)
    req = Net::HTTP::Get.new(uri)
    req['Authorization'] = "Bearer #{access_token}"
    req['Accept'] = 'application/json'
    res = http_request(uri, req)
    body = JSON.parse(res.body) rescue {}
    unless res.is_a?(Net::HTTPSuccess)
      raise Error, body['error'] || 'api_request_failed'
    end
    body
  end

  def self.unwrap_data(body)
    return {} unless body.is_a?(Hash)
    data = body['data']
    return data if data.is_a?(Hash)
    body
  end
end

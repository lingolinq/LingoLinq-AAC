require 'net/http'
require 'json'
require 'cgi'

class CleverApi
  class Error < StandardError; end

  TOKENS_URL = 'https://clever.com/oauth/tokens'.freeze
  API_BASE = 'https://api.clever.com'.freeze

  def self.district_app_token(district_id)
    raise Error, 'missing_district' if district_id.to_s.strip.blank?
    raise Error, 'not_configured' unless CleverOAuth.enabled?

    uri = URI(TOKENS_URL)
    uri.query = URI.encode_www_form(district: district_id.to_s)
    req = Net::HTTP::Get.new(uri)
    req.basic_auth(CleverOAuth.client_id, CleverOAuth.client_secret)
    req['Accept'] = 'application/json'
    res = CleverOAuth.http_request(uri, req)
    body = JSON.parse(res.body) rescue {}
    unless res.is_a?(Net::HTTPSuccess)
      raise Error, body['error'] || 'district_token_failed'
    end
    token = extract_token(body)
    raise Error, 'district_token_missing' if token.blank?
    token
  end

  def self.get_json(path, access_token)
    url = path.to_s.start_with?('http') ? path.to_s : "#{API_BASE}#{path}"
    CleverOAuth.api_get(url, access_token)
  end

  def self.each_page(path, access_token)
    next_path = path
    while next_path.present?
      body = get_json(next_path, access_token)
      items = body['data']
      items = [] unless items.is_a?(Array)
      items.each { |item| yield unwrap_item(item) }
      next_link = Array(body['links']).detect { |link| link.is_a?(Hash) && link['rel'] == 'next' }
      next_path = next_link && next_link['uri']
    end
  end

  def self.district(district_id, access_token)
    body = get_json("/v3.0/districts/#{CGI.escape(district_id.to_s)}", access_token)
    unwrap_item(body)
  end

  def self.schools(access_token)
    list = []
    each_page('/v3.0/schools', access_token) { |school| list << school }
    list
  end

  def self.users(access_token, role: nil)
    path = '/v3.0/users'
    path += "?role=#{CGI.escape(role.to_s)}" if role.present?
    list = []
    each_page(path, access_token) { |user| list << user }
    list
  end

  def self.user(user_id, access_token)
    body = get_json("/v3.0/users/#{CGI.escape(user_id.to_s)}", access_token)
    unwrap_item(body)
  end

  def self.extract_token(body)
    if body.is_a?(Array)
      row = body.first
      return row['access_token'] || row['token'] if row.is_a?(Hash)
    elsif body.is_a?(Hash)
      return body['access_token'] if body['access_token'].present?
      data = body['data']
      if data.is_a?(Array)
        row = data.first
        return row['access_token'] || row['token'] if row.is_a?(Hash)
      elsif data.is_a?(Hash)
        return data['access_token'] || data['token']
      end
    end
    nil
  end

  def self.unwrap_item(item)
    return {} unless item.is_a?(Hash)
    item['data'].is_a?(Hash) ? item['data'] : item
  end
end

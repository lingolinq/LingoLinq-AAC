require 'base64'
require 'obf'

# Every fetch the obf gem makes goes through OBF::Utils.get_url. This replaces it, and the media helpers
# built on it, so each fetch goes through SafeHttp, which checks each resolved address and each redirect
# hop. image_base64 and sound_base64 accept only a data: uri or an http(s) url.
module OBFGetUrlHardening
  FETCH_TIMEOUT = 10
  FETCH_CONNECT_TIMEOUT = 5

  def get_url(url, hydra_wait = false)
    return nil unless url
    res = { 'content_type' => nil, 'data' => nil }
    str = url.to_s
    # Decoded here, never passed to super: the gem's own data: test (/^data:/) matches any line.
    if str.match?(/\Adata:/)
      res['content_type'] = str.split(/;/)[0].split(/:/)[1]
      res['data'] = Base64.strict_decode64(str.split(/,/, 2)[1].to_s) rescue nil
      res['extension'] = extension_for(res['content_type']) if res['content_type']
      return res
    end
    if hydra_wait
      req = SafeHttp.build_typhoeus_request(str, timeout: FETCH_TIMEOUT, connecttimeout: FETCH_CONNECT_TIMEOUT)
      return res unless req
      req.on_complete do |response|
        # build_typhoeus_request does not follow redirects; SafeHttp.get follows and checks each hop.
        response = safe_fetch(str) if response.code.to_i >= 300 && response.code.to_i < 400
        fill_fetch_result(res, response, str)
      end
      res['request'] = req
    else
      fill_fetch_result(res, safe_fetch(str), str)
    end
    res
  end

  def image_base64(url)
    media_base64(url)
  end

  def sound_base64(url)
    media_base64(url)
  end

  def sound_raw(url)
    sound = get_url(url)
    sound && sound['data'] ? sound : nil
  end

  private

  # A data: uri or an http(s) url, through get_url; anything else (a server path) is refused.
  # nil when nothing usable came back, where the gem raised on a missing content type.
  def media_base64(url)
    return nil unless url.to_s.match?(/\A(data:|https?:\/\/)/i)
    media = get_url(url)
    return nil unless media && media['data'] && media['content_type']
    "data:#{media['content_type']};base64,#{Base64.strict_encode64(media['data'])}"
  end

  def safe_fetch(url)
    SafeHttp.get(url, timeout: FETCH_TIMEOUT, connecttimeout: FETCH_CONNECT_TIMEOUT)
  end

  def fill_fetch_result(res, response, url)
    if response.success?
      res['content_type'] = (response.headers || {})['Content-Type']
      res['data'] = response.body
      res['extension'] = extension_for(res['content_type']) if res['content_type']
    else
      log("  FAILED TO RETRIEVE #{url} #{response.code}")
    end
  end
end

OBF::Utils.singleton_class.prepend(OBFGetUrlHardening)

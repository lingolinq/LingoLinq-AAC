# The ten default avatars (avatar-0.png to avatar-9.png) are served by the app itself from
# public/avatars/ on every deployed host. Addresses are built on JsonApi::Json.absolute_host, so
# the iOS and Android apps, which need a full address, can load them and the sync can save them
# (through /api/v1/search/proxy, like any picture not on its trusted list).
#
# Earlier code built them on the STATIC_S3_BUCKET bucket instead, and those addresses are still
# stored: a person's saved avatar_url and prior_avatar_urls, contacts, and contact copies inside
# messages. Writers now save the host-free `path` (`stored` / `stored_contact`). Readers pass stored
# values through `on_app_host` / `contact`, which map only the exact default-avatar shapes and
# return everything else unchanged.
# docs/task-management/2026-11-23_default-avatars-same-host.md
#
# Lives in app/models/concerns (always loaded) rather than lib/, whose autoload is skipped for
# Resque workers (config/application.rb:88), where messages are also built.
module DefaultAvatar
  COUNT = 10
  BUCKET_URL = %r{\Ahttps://[a-z0-9][a-z0-9.\-]*\.s3\.amazonaws\.com/avatars/avatar-(\d)\.png\z}
  APP_URL = %r{\A(?:https?://([^/?#]+))?/avatars/avatar-(\d)\.png\z}
  SCHEME = %r{\A[a-z][a-z0-9+.\-]*://}i

  def self.url(index)
    "#{JsonApi::Json.absolute_host}#{path(index)}"
  end

  # The form a default avatar is SAVED in: no host, so a host the app stops serving (an
  # organization's custom domain that is removed) cannot break it. Readers put the current host on
  # it through `on_app_host` / `contact`.
  def self.path(index)
    "/avatars/avatar-#{index.to_i % COUNT}.png"
  end

  def self.stored(url)
    n = index(url)
    n ? path(n) : url
  end

  def self.stored_contact(hash)
    return hash unless hash.is_a?(Hash) && hash['image_url']
    hash.merge('image_url' => stored(hash['image_url']))
  end

  # The number of a default avatar address (a bucket one, or the app's own on a host the app
  # serves), or nil for any other address.
  def self.index(url)
    return nil unless url.is_a?(String)
    bucket = url.match(BUCKET_URL)
    return bucket[1].to_i if bucket
    app = url.match(APP_URL)
    return nil unless app
    return app[2].to_i if app[1].nil? || app_host?(app[1])
    nil
  end

  def self.on_app_host(url)
    n = index(url)
    n ? self.url(n) : url
  end

  # A contact hash ('image_url' plus anything else) with a default avatar served from the app.
  # Anything that is not a hash (a client-sent note can hold any value) is returned unchanged.
  def self.contact(hash)
    return hash unless hash.is_a?(Hash) && hash['image_url']
    hash.merge('image_url' => on_app_host(hash['image_url']))
  end

  # The host this request is on, DEFAULT_HOST, or another host of this app
  # (JsonApi::Json.known_link_host?: production, the non-production pair, custom domains).
  def self.app_host?(host_with_port)
    host_with_port = host_with_port.to_s.downcase
    own = [JsonApi::Json.absolute_host, ENV['DEFAULT_HOST']].map { |h| h.to_s.strip.downcase.sub(SCHEME, '').sub(%r{/+\z}, '') }
    return true if own.include?(host_with_port)
    default_bare = own.last.sub(/:\d+\z/, '')
    JsonApi::Json.known_link_host?(host_with_port.sub(/:\d+\z/, ''), default_bare)
  end
end

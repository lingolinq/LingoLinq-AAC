require_relative '../../lib/pii_scrubber'
require 'bugsnag'

Bugsnag.configure do |config|
  config.meta_data_filters += PiiScrubber::IDENTITY_STRING_KEYS + ['User-Agent', 'X-Device-Id', 'X-Forwarded-For', 'clientIp', 'client_ip', 'params', 'request.clientIp', 'request.params']
end
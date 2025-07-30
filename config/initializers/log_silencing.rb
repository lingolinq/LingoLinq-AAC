# require 'silencer/logger'

module LogSilencing
  class LingoLinq::Application < Rails::Application
    # config.middleware.swap Rails::Rack::Logger, Silencer::Logger, config.log_tags
  end
end

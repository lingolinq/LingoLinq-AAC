# Temporarily disable rack timeout completely due to i18n loading issues
# TODO: Re-enable after i18n performance issues are resolved
# unless Rails.env.development?
#   timeout_value = 16
#   Rails.application.config.middleware.insert_before Rack::Runtime, Rack::Timeout, service_timeout: timeout_value
# end
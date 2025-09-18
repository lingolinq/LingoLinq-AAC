# Disable rack timeout in development to prevent file watching issues
# Only enable in production/staging environments
unless Rails.env.development?
  timeout_value = 16
  Rails.application.config.middleware.insert_before Rack::Runtime, Rack::Timeout, service_timeout: timeout_value
end
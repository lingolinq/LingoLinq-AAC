# Increase timeout for development mode to handle slow file system operations  
timeout_value = Rails.env.development? ? 120 : 16
Rails.application.config.middleware.insert_before Rack::Runtime, Rack::Timeout, service_timeout: timeout_value
require File.expand_path('../boot', __FILE__)

require 'rails/all'

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(:default, Rails.env)

if !ENV['SECURE_ENCRYPTION_KEY'] || !Rails.env.production?
  require 'dotenv'
  Dotenv.load if defined?(Dotenv)
end

module Coughdrop
  class Application < Rails::Application
    # Settings in config/environments/* take precedence over those specified here.
    # Application configuration should go into files in config/initializers
    # -- all .rb files in that directory are automatically loaded.

    # Set Time.zone default to the specified zone and make Active Record auto-convert to this zone.
    # Run "rake -D time" for a list of tasks for finding time zone names. Default is UTC.
    # config.time_zone = 'Central Time (US & Canada)'

    # The default locale is :en and all translations from config/locales/*.rb,yml are auto loaded.
    # config.i18n.load_path += Dir[Rails.root.join('my', 'locales', '*.{rb,yml}').to_s]
    # config.i18n.default_locale = :de

    config.eager_load_paths += %W(#{config.root}/lib)
#    config.autoload_paths += %W(#{config.root}/app/mailers/concerns)

    # Fix for asset serving 500 errors: Use Rack::Deflater for dynamic gzip compression
    # with proper Content-Encoding headers instead of relying on ActionDispatch::Static
    # to serve pre-gzipped .gz files (which has a bug where it doesn't set the header)
    config.middleware.insert_before ActionDispatch::Static, Rack::Deflater
    
    # Disable Sprockets middleware in production to avoid Ruby 3.2 chomp! error
    # Assets are precompiled during Docker build and served as static files
    if Rails.env.production?
      config.assets.configure do |env|
        env.export_concurrent = false
      end
    end
  end
end

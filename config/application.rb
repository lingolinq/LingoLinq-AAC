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

    # Add a simple static file serving middleware at the beginning of the stack
    # This serves files from public/assets for asset requests before Rails routes are evaluated
    if ENV['RAILS_SERVE_STATIC_FILES'] == 'true'
      config.middleware.insert_before 0, Rack::Static,
        urls: ['/assets'],
        root: File.join(config.root, 'public'),
        header_rules: [
          [['html'], { 'Content-Type' => 'text/html; charset=utf-8' }],
          [['js'], { 'Content-Type' => 'application/javascript' }],
          [['css'], { 'Content-Type' => 'text/css' }],
          [['png'], { 'Content-Type' => 'image/png' }],
          [['svg'], { 'Content-Type' => 'image/svg+xml' }],
          [['gif'], { 'Content-Type' => 'image/gif' }],
          [['jpg', 'jpeg'], { 'Content-Type' => 'image/jpeg' }]
        ]
    end
  end
end

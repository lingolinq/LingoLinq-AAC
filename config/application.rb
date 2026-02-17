require File.expand_path('../boot', __FILE__)

require 'rails/all'

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(:default, Rails.env)

# Load environment variables from .env file in development/test
# (dotenv gem is available in all envs for build compatibility)
unless Rails.env.production?
  require 'dotenv'
  Dotenv.load if defined?(Dotenv)
end

module LingoLinq
  class Application < Rails::Application
    # Initialize configuration defaults for Rails 7.2
    config.load_defaults 7.2

    # Settings in config/environments/* take precedence over those specified here.
    # Application configuration should go into files in config/initializers
    # -- all .rb files in that directory are automatically loaded.

    # Set Time.zone default to the specified zone and make Active Record auto-convert to this zone.
    # Run "rake -D time" for a list of tasks for finding time zone names. Default is UTC.
    # config.time_zone = 'Central Time (US & Canada)'

    # The default locale is :en and all translations from config/locales/*.rb,yml are auto loaded.
    # config.i18n.load_path += Dir[Rails.root.join('my', 'locales', '*.{rb,yml}').to_s]
    # config.i18n.default_locale = :de
    config.api_only = false
    
    # Zeitwerk is the default autoloader in Rails 7.0
    # config.autoloader = :zeitwerk  # This is the default, no need to set explicitly
    
    # Eager load paths for lib directory (Zeitwerk will handle autoloading)
    config.eager_load_paths += %W(#{config.root}/lib)
    
    # Ignore files/directories that don't conform to Zeitwerk naming conventions
    # (files with hyphens in names, or files that don't define expected constants)
    Rails.autoloaders.main.ignore(
      "#{config.root}/app/frontend",
      "#{config.root}/lib/converters",
      "#{config.root}/lib/templates",
      "#{config.root}/lib/seed_organization.rb",   # script defines top-level method, not constant
      "#{config.root}/lib/seed_reporting_logs.rb"  # script defines top-level method, not constant
    )
#    config.autoload_paths += %W(#{config.root}/app/mailers/concerns)
  end
end

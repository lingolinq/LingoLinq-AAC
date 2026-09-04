require File.expand_path('../boot', __FILE__)

require 'rails/all'

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(:default, Rails.env)

# Load environment variables in development/test (dotenv is in Gemfile for all envs for build compatibility).
#
# ORDER IS FIRST-WINS, and the list below is deliberately MOST-SPECIFIC FIRST.
# `Dotenv.load` does NOT overwrite a key that is already set — the first file to define a
# key wins, and a real shell variable beats all of them. (`Dotenv.overload` is the one that
# overrides, and it would also clobber vars the operator passed in deliberately, so it is
# not used here.)
#
# This comment previously said "later files override earlier" and listed
# `.env.op.template` FIRST, which produced the exact opposite of the documented intent:
# the COMMITTED template silently beat the developer's own `.env` / `.env.local`, and those
# two files — the ones documented as the place to keep your own values — could never
# override it. Concretely, `.env.op.template` pins DEFAULT_HOST=localhost:3000 while a
# local `.env` setting it to the real port was ignored, so every URL built without a
# request context (`JsonApi::Json.current_host`, i.e. anything generated in a Resque
# worker) pointed at a dead port.
#
# Keep ops/1Password-style vars in .env.op.template (committed) + .env.op.local
# (gitignored); keep your own values and secrets in .env / .env.local, which now win.
unless Rails.env.production?
  require 'dotenv'
  if defined?(Dotenv)
    root = Pathname.new(__FILE__).join('..', '..').expand_path
    paths = %w[.env.local .env .env.op.local .env.op.template].map do |name|
      path = root.join(name).to_s
      path if File.exist?(path)
    end.compact
    Dotenv.load(*paths) unless paths.empty?
  end
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
    
    # Autoload lib/ via Zeitwerk (also adds to eager_load_paths). Skip for Resque
    # workers to reduce memory footprint.
    unless ENV['RESQUE_WORKER'] == 'true'
      config.autoload_lib(
        ignore: %w[
          audit
          converters
          templates
          obf_lingolinq_patch.rb
          seed_organization.rb
          seed_reporting_logs.rb
        ]
      )
    end

    # Ignore files/directories that don't conform to Zeitwerk naming conventions
    Rails.autoloaders.main.ignore(
      "#{config.root}/app/frontend"
    )
#    config.autoload_paths += %W(#{config.root}/app/mailers/concerns)
  end
end

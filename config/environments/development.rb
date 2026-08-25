Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # In the development environment your application's code is reloaded on
  # every request. This slows down response time but is perfect for development
  # since you don't have to restart the web server when you make code changes.
  config.cache_classes = false

  # Do not eager load code on boot.
  config.eager_load = true

  # Show full error reports and disable caching.
  config.consider_all_requests_local       = true
  config.action_controller.perform_caching = false
  config.public_file_server.enabled = true

  # Don't care if the mailer can't send.
  config.action_mailer.raise_delivery_errors = false
  config.force_ssl = false

  # Print deprecation notices to the Rails logger.
  config.active_support.deprecation = :log

  config.log_tags = [ :request_id ]

  # Raise an error on page load if there are pending migrations
  config.active_record.migration_error = :page_load

  # Debug mode disables concatenation and preprocessing of assets.
  # This option may cause significant delays in view rendering with a large
  # number of complex assets.
  config.assets.debug = true

  # Match production, test, and docs/CSS_SCSS_GUIDELINES.md: never run built CSS
  # back through SassC, which cannot parse the modern CSS the Ember build emits.
  #
  # Belt-and-braces, not load-bearing: sassc-rails only forces `:sass` on
  # environments where `Rails.env.development?` is FALSE
  # (sassc-rails-2.1.2 lib/sassc/rails/railtie.rb:72-77 — the development branch
  # sets `config.sass.style` instead and leaves css_compressor alone), and
  # Rails' own default for it is nil. So development never had the
  # "Incompatible units: 'vw' and 'px'" failure that made this necessary in
  # config/environments/test.rb. Stated explicitly because an earlier version of
  # this comment claimed the opposite and would have sent the next reader
  # looking for a bug that is not here. Kept so all three environments declare
  # the same intent in the same place.
  config.assets.css_compressor = nil

  config.action_mailer.delivery_method = :ses
end

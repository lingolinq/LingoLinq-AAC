Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # The test environment is used exclusively to run your application's
  # test suite. You never need to work with it otherwise. Remember that
  # your test database is "scratch space" for the test suite and is wiped
  # and recreated between test runs. Don't rely on the data there!
  config.cache_classes = true

  # Do not eager load code on boot. This avoids loading your whole application
  # just for the purpose of running a single test. If you are using a tool that
  # preloads Rails for running tests, you may have to set it to true.
  config.eager_load = false

  # Configure static asset server for tests with Cache-Control for performance.
  config.public_file_server.enabled = true
  config.public_file_server.headers = { 'Cache-Control' => 'public, max-age=3600' }

  # Match production (config/environments/production.rb) and the rule in
  # docs/CSS_SCSS_GUIDELINES.md: never run built CSS back through SassC.
  # sassc-rails forces `:sass` on every environment except development
  # (sassc-rails-2.1.2 lib/sassc/rails/railtie.rb:72-77), and SassC cannot parse
  # the modern CSS the Ember build emits -- e.g. `clamp(20px, 20px + 1vw, 40px)`
  # in app/frontend/dist/assets/frontend.css, which is valid browser CSS and
  # comes from correctly-written source: _eval_quick.scss:68 writes
  # `clamp(20px, calc(20px + 1vw), 40px)` and Dart Sass simplifies away the
  # now-redundant calc() on the way out. (NOT the Ember minifier, as an earlier
  # version of this comment said -- app/frontend/ember-cli-build.js:23-25 sets
  # `minifyCSS: { enabled: false }`, so no minification pass runs at all.)
  # Without this, ANY spec that renders a page 500s with
  # "Incompatible units: 'vw' and 'px'" -- but only on a machine where the
  # frontend has actually been built, so CI never sees it.
  config.assets.css_compressor = nil

  # Show full error reports and disable caching.
  config.consider_all_requests_local       = true
  config.action_controller.perform_caching = false

  # Raise exceptions instead of rendering exception templates.
  config.action_dispatch.show_exceptions = false

  # Disable request forgery protection in test environment.
  config.action_controller.allow_forgery_protection = false

  # Tell Action Mailer not to deliver emails to the real world.
  # The :test delivery method accumulates sent emails in the
  # ActionMailer::Base.deliveries array.
  config.action_mailer.delivery_method = :test

  # Print deprecation notices to the stderr.
  config.active_support.deprecation = :stderr
end

source 'https://rubygems.org'

# TODO: https://rails-assets.org/ for bower support

gem 'dotenv'

group :development, :test do
  gem 'rack-cors'
  gem 'guard'
  gem 'guard-rspec'
  gem 'rspec-rails'
  gem 'simplecov', :require => false
  gem 'rack-test'
  gem 'rails-controller-testing'
  gem 'drb'
  gem 'irb'
  gem 'ruby-lsp', require: false
  gem 'ruby-lsp-rails', require: false
  gem 'rubocop', require: false
  gem 'rubocop-rails', require: false
  gem 'brakeman', require: false
  gem 'bundler-audit', require: false
end

gem 'benchmark'

# Required for Ruby 3.4+ compatibility with Rails 7.0+
gem 'mutex_m'
gem 'matrix'

gem 'concurrent-ruby', '~> 1.3'

# Rails 7.2 with Ruby 3.4 support (Phase 3: final upgrade)
gem 'rails', '~> 7.2.0'
gem 'pg', '~> 1.5'
gem 'sass-rails', '~> 6.0'
gem 'sprockets-rails', '~> 3.5'
# uglifier is deprecated, use terser via ember-cli-terser (already in frontend)
# mimemagic is deprecated, Rails 7 uses marcel/mini_mime internally

gem 'typhoeus'
gem 'aws-sdk-rails'
gem 'aws-sdk-sns', '~> 1'
gem 'aws-sdk-ses', '~> 1'
gem 'aws-sdk-elastictranscoder', '~> 1'
gem 'aws-sdk-cloudfront', '~> 1'
gem 'http-2'
gem 'resque'
gem 'puma'
gem 'paper_trail', '~> 15.0'
gem 'geokit'
gem 'obf'
# OBF uses Zip::File::CREATE, which was removed in rubyzip 3.x
gem 'rubyzip', '~> 2.3'
gem 'accessible-books'
gem 'bugsnag'
gem 'stripe'
gem 'rack', '~> 2.2.22' # Pin to 2.2.x to avoid Rack 3.x incompatibilities
gem 'rack-attack'
gem 'newrelic_rpm'
gem 'rack-timeout'
gem 'pg_search'
gem 'silencer'
gem 'go_secure'
gem 'permissable-coughdrop' # TODO: Republish as permissable-lingolinq
gem 'boy_band'
gem 'ttfunk', '1.7'
gem 'ruby-saml'
gem 'rotp'

gem 'sinatra'
gem 'sanitize'
gem 'anthropic', '~> 1.23'

group :doc do
  # bundle exec rake doc:rails generates the API under doc/api.
  gem 'sdoc', require: false
end



# See https://github.com/sstephenson/execjs#readme for more supported runtimes
# gem 'therubyracer', platforms: :ruby

# Turbolinks makes following links in your web application faster. Read more: https://github.com/rails/turbolinks
# gem 'turbolinks'

# Use ActiveModel has_secure_password
# gem 'bcrypt-ruby', '~> 3.1.2'

# Use Capistrano for deployment
# gem 'capistrano', group: :development

ruby "~> 3.4.3"

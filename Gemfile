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
# 7.2.3.1+ addresses Active Storage proxy DoS (GHSA-p9fm-f462-ggrg / CVE-2026-33658)
gem 'rails', '>= 7.2.3.1', '< 7.3'
# CVE-2026-33210 (format string); bundler-audit advisory minimum
gem 'json', '>= 2.19.2'
# GHSA-46fp-8f5p-pf2m (allowed_uri?); rails-html-sanitizer 1.7.0 depends on loofah ~> 2.25; ensure >= 2.25.1
gem 'loofah', '>= 2.25.1'
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
# TODO: Replace with aws-sdk-s3 (s3 gem is unmaintained); lib/uploader.rb uses S3::Service
gem 's3'
gem 'http-2'
gem 'resque', '~> 3.0'
gem 'puma'
gem 'paper_trail', '~> 15.0'
gem 'geokit'
gem 'obf'
# OBF uses Zip::File::CREATE, which was removed in rubyzip 3.x
gem 'rubyzip', '~> 2.3'
gem 'accessible-books'
gem 'bugsnag'
gem 'stripe'
# Rack 3.x for Sinatra 4 CVE fixes (CVE-2024-21510, CVE-2025-61921)
gem 'rack', '>= 3.0'
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

gem 'sinatra', '~> 4.2'
gem 'sanitize'
gem 'mini_magick'
gem 'anthropic', '~> 1.23'
gem 'ruby-openai', '~> 7.0'  # Used for Gemini fallback (OpenAI-compatible endpoint)

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

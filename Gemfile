source 'https://rubygems.org'

# TODO: https://rails-assets.org/ for bower support

group :development, :test do
  gem 'solargraph'
  gem 'rubocop', require: false
  gem 'rubocop-rails', require: false
  gem 'brakeman', require: false
  gem 'bundler-audit', '>= 0.9.1'
  gem 'guard'
  gem 'guard-rspec'
  gem 'rspec-rails'
  gem 'simplecov', :require => false
  gem 'rack-test'
  gem 'rails-controller-testing'
  # sqlite3 removed - production uses PostgreSQL only
  # Install locally if needed: gem install sqlite3
  gem 'mutex_m'
  gem 'benchmark'
  gem 'drb'
  gem 'irb'
  gem 'tzinfo-data' # Required for Windows
  gem 'ruby-lsp', require: false
end

# Matrix gem removed - was only needed for obf gem which is now disabled

gem 'concurrent-ruby', '1.3.4'
gem 'dotenv' # Moved from dev/test - required by config/application.rb

# Rails 5.2 doesn't seem to work on heroku with octopus :-/
gem 'rails', '~> 6.1.7' # Allow security patches - TODO: upgrade to 8.0+
gem 'marcel', '~> 1.0' # Better alternative to mimemagic for Rails apps


gem 'pg' #, '0.19.0' #, '>=1.1.3'
gem 'sass-rails'
gem 'uglifier', '>= 1.3.0'

gem 'typhoeus'
gem 'coffee-rails'
gem 'aws-sdk-rails'
gem 'aws-sdk-sns', '~> 1'
gem 'aws-sdk-ses', '~> 1'
gem 'aws-sdk-elastictranscoder', '~> 1'
gem 'aws-sdk-cloudfront', '~> 1'
gem 'http-2'
gem 'resque'
gem 'rails_12factor', group: :production
gem 'heroku-deflater', :group => :production
gem 'puma'
gem 'rack-offline'
gem 'paper_trail'
gem 'geokit'
# gem 'obf' # Disabled for production deployment due to Ruby 3.2+ matrix dependency issues
gem 'accessible-books'
gem 's3'
gem 'bugsnag'
gem 'stripe'
gem 'rack-attack'
# gem 'newrelic_rpm' # Removed - not needed for LingoLinq
gem 'rack-timeout'
gem 'pg_search'
gem 'silencer'
gem 'go_secure'
gem 'permissable-coughdrop'
gem 'boy_band'
gem 'ttfunk', '1.7'
gem 'ruby-saml'
gem 'rotp'

gem 'sinatra'
gem 'sanitize'



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

ruby "3.2.8"




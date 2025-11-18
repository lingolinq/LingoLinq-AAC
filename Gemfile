source 'https://rubygems.org'

# TODO: https://rails-assets.org/ for bower support

group :development, :test do
  gem 'dotenv'
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
end

gem 'benchmark'

# Required for Ruby 3.4+ compatibility with Rails 6.1.7+
gem 'mutex_m'
gem 'matrix'

gem 'concurrent-ruby', '1.3.4'

# Rails 6.1.7+ has Rack 3 and Ruby 3.4 support
gem 'rails', '~> 6.1.7'
gem 'pg' #, '0.19.0' #, '>=1.1.3'
gem 'sass-rails'
gem 'sprockets-rails', '~> 3.4.2'
gem 'uglifier', '>= 1.3.0'
gem 'mimemagic', '0.4.3'

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
# gem 'heroku-deflater', :group => :production # Removed - incompatible with Rails 6.1+ (causes NoMethodError: undefined method 'match?')
gem 'puma'
gem 'rack-offline'
gem 'paper_trail'
gem 'geokit'
gem 'obf'
gem 'accessible-books'
gem 's3'
gem 'bugsnag'
gem 'stripe'
gem 'rack-attack'
gem 'newrelic_rpm'
gem 'rack-timeout'
gem 'pg_search'
gem 'silencer'
gem 'go_secure'
gem 'permissable-lingolinq'
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

ruby "~> 3.4.3"
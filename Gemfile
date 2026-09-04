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
  # CVE-2026-34060 (GHSA-c4r5-fxqw-vh93); bundler-audit minimum
  gem 'ruby-lsp', '>= 0.26.9', require: false
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

# CVE-2026-54904/54905/54906; bundler-audit minimum
gem 'concurrent-ruby', '>= 1.3.7'
# CVE-2026-54463/54464/54465, GHSA-2x63-gw47-w4mm; bundler-audit minimum (transitive via actioncable)
gem 'websocket-driver', '>= 0.8.2'

# Rails 7.2 with Ruby 3.4 support (Phase 3: final upgrade)
# 7.2.3.1+ addresses Active Storage proxy DoS (GHSA-p9fm-f462-ggrg / CVE-2026-33658)
# 7.2.3.2+ addresses Active Storage variant RCE (GHSA-xr9x-r78c-5hrm / CVE-2026-66066)
gem 'rails', '>= 7.2.3.2', '< 7.3'
# CVE-2026-33210 (format string); bundler-audit advisory minimum
gem 'json', '>= 2.19.2'
# oj is a faster JSON parser/generator (5-10x faster than stdlib json).
# Used via Oj.mimic_JSON in config/initializers/oj.rb to transparently
# replace the JSON module across the app, including Rails internals.
# CVE-2026-54500/54502/54592; bundler-audit minimum
gem 'oj', '>= 3.17.3'
# GHSA-46fp-8f5p-pf2m + GHSA-5qhf-9phg-95m2 + GHSA-8whx-365g-h9vv + GHSA-9wjq-cp2p-hrgf
# (allowed_uri? javascript: bypasses via char refs; SVG href local-reference bypass); ensure >= 2.25.2
gem 'loofah', '>= 2.25.2'
# GHSA-cj75-f6xr-r4g7 (possible XSS with certain configs); transitive via actionview/actiontext, pin patched
gem 'rails-html-sanitizer', '>= 1.7.1'
# GHSA-6jxj-px6v-747w et al.; bundler-audit minimum (transitive via loofah, rails-dom-testing)
gem 'crass', '>= 1.0.7'
# ERB @_init deserialization guard bypass (def_module/def_method/def_class); pulled transitively, pin patched 6.x
gem 'erb', '>= 6.0.4'
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
gem 'aws-sdk-s3', '~> 1'
# Required by Anthropic::BedrockClient (classic Bedrock plane, see lib/ai_client.rb).
# The gem hard-`require`s this at construction as a guard; the actual signing uses
# Aws::Sigv4::Signer from aws-sdk-core, already present via aws-sdk-s3.
gem 'aws-sdk-bedrockruntime', '~> 1'
gem 'http-2'
gem 'resque', '~> 3.0'
gem 'puma', '~> 7.2', '>= 7.2.1' # >= 7.2.1 clears CVE-2026-47736 / CVE-2026-47737 (PROXY protocol v1 parser)
gem 'paper_trail', '~> 15.0'
gem 'geokit'
gem 'obf'
# OBF uses Zip::File::CREATE (rubyzip) for reading ZIPs.
# zip_kit handles all ZIP writing (streaming, flat memory).
gem 'rubyzip', '~> 2.3'
gem 'zip_kit', '~> 6.3'
gem 'accessible-books'
gem 'sentry-ruby'
gem 'sentry-rails'
gem 'stripe'
# Rack 3.x for Sinatra 4 CVE fixes (CVE-2024-21510, CVE-2025-61921)
gem 'rack', '>= 3.0'
gem 'rack-attack'
gem 'rack-timeout'
gem 'pg_search'
gem 'silencer'
gem 'go_secure'
gem 'permissable-coughdrop' # TODO: Republish as permissable-lingolinq
gem 'boy_band'
gem 'ttfunk', '1.7'
gem 'ruby-saml', '>= 1.18.0' # CVE-2025-25291/25292 SAML auth-bypass floor; lockfile already resolves 1.18.1 (LL-6f1977944f)
gem 'rotp'
gem 'googleauth', '~> 1.11'
# CVE-2026-54297; bundler-audit minimum (transitive via googleauth, stripe, etc.)
gem 'faraday', '>= 2.14.3'

gem 'clowne', '~> 1.4' # Declarative model cloning DSL for board copy optimization

gem 'sinatra', '~> 4.2'
gem 'sanitize'
gem 'anthropic', '~> 1.36'
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

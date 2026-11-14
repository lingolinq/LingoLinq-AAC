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
  # Specs never reach the real network (spec/spec_helper.rb disables it)
  gem 'webmock', require: false
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
# GHSA-4w5q-wg7v-w6gp, GHSA-9f42-57jx-vpp3, GHSA-j82w-28jv-3pmj, GHSA-qq38-m9mg-xjj5,
# GHSA-8gmh-2hhj-2hv9, GHSA-539f-xcgw-2gjg, GHSA-9crm-g4mf-wc5j; bundler-audit minimum (transitive via signet)
gem 'addressable', '>= 2.9.1', require: false

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
# (allowed_uri? javascript: bypasses via char refs; SVG href local-reference bypass); ensure >= 2.25.2.
# GHSA-345x-3rq2-jfrm, GHSA-h6v6-rg66-fqj4, GHSA-jcff-cj73-4w4f, GHSA-m3x9-938q-5767, GHSA-mf2j-8f84-cc9q,
# GHSA-p9wj-w8xq-vjx6 (scrubber mutation XSS, CSS url() and allowed_uri? bypasses, SVG ReDoS) need >= 2.25.3
gem 'loofah', '>= 2.25.3'
# GHSA-cj75-f6xr-r4g7 (possible XSS with certain configs); transitive via actionview/actiontext, pin patched.
# GHSA-cpgf-5mjf-73p7 + GHSA-h7wh-q2qr-458c (shared scrubber state XSS, ReDoS) need >= 1.7.2
gem 'rails-html-sanitizer', '>= 1.7.2'
# GHSA-3w22-6jfg-527w + GHSA-4p39-36wj-23h4 + GHSA-v995-44v6-5fqm (attribute use-after-free, HTML5
# noscript mutation XSS); transitive via loofah and rails-html-sanitizer; bundler-audit minimum
gem 'nokogiri', '>= 1.19.5'
# GHSA-6jxj-px6v-747w et al.; GHSA-pq4g-8rxf-4g29 (bad-URL tokenization, CSS sanitizer bypass) needs >= 1.0.8.
# bundler-audit minimum. crass is required by loofah and sanitize, both direct dependencies
# (rails-html-sanitizer also pulls in loofah).
gem 'crass', '>= 1.0.8'
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
gem 'aws-sdk-mediaconvert', '~> 1'
gem 'aws-sdk-cloudfront', '~> 1'
gem 'aws-sdk-s3', '~> 1'
# Required by Anthropic::BedrockClient (classic Bedrock plane, see lib/ai_client.rb).
# The gem hard-`require`s this at construction as a guard; the actual signing uses
# Aws::Sigv4::Signer from aws-sdk-core, already present via aws-sdk-s3.
gem 'aws-sdk-bedrockruntime', '~> 1'
gem 'http-2'
# GHSA-5r7x-x5pm-94xj, GHSA-m39q-9jm7-xp4q, GHSA-r23w-h6cg-h95q, GHSA-r5h4-xh93-f339 (resque-web XSS and
# CSRF; the dashboard is mounted at /jobby in config/routes.rb); the CSRF fix needs >= 3.2.0
gem 'resque', '~> 3.2'
gem 'puma', '~> 7.2', '>= 7.2.1' # >= 7.2.1 clears CVE-2026-47736 / CVE-2026-47737 (PROXY protocol v1 parser)
gem 'paper_trail', '~> 15.0'
gem 'geokit'
gem 'obf'
# rubyzip is READ-ONLY here: OBF::Utils.build_zip -- the only caller of the 2.x-only
# Zip::File::CREATE -- is monkey-patched onto zip_kit in
# config/initializers/zip_kit_patch.rb, and its retained build_zip_rubyzip alias has no
# callers. What still runs through rubyzip is OBF::Utils.load_zip (Zip::File.open(path))
# and Zipper's glob/entries/get_input_stream, all unchanged in 3.x.
# 2.x is unpatchable for CVE-2026-85396 (path traversal, High); the fix is 3.4.0+ only.
gem 'rubyzip', '>= 3.4'
gem 'zip_kit', '~> 6.3'
gem 'accessible-books'
gem 'sentry-ruby'
gem 'sentry-rails'
gem 'stripe'
# Rack 3.x for Sinatra 4 CVE fixes (CVE-2024-21510, CVE-2025-61921)
# GHSA-5v64-555j-wjxm, GHSA-2j8w-xcrc-x985, GHSA-wvg4-6p58-3gh3, GHSA-p8x9-v4hv-2w4g; bundler-audit minimum
gem 'rack', '>= 3.2.8'
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
# GHSA-wgw9-qhqg-8hv5 (CSS nesting bypasses the property and protocol allowlists in <style>,
# which Processable#process_html allows through Sanitize::Config::RELAXED); ensure >= 7.0.1.
# GHSA-599p-54q3-ff89 and GHSA-mg79-gw37-jxx7 (both custom-config only; DEFAULT and RELAXED,
# the configs Processable uses, are not affected) are fixed in 7.0.2, the bundler-audit minimum.
gem 'sanitize', '>= 7.0.2'
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

require 'oj'
# Be sure to restart your server when you modify this file.

# Your secret key is used for verifying the integrity of signed cookies.
# If you change this key, all old signed cookies will become invalid!

# Make sure the secret is at least 30 characters and all random,
# no regular words or you'll be exposed to dictionary attacks.
# You can use `rake secret` to generate a secure secret key.

# Make sure your secret_key_base is kept private
# if you're sharing your code publicly.
# Authoritative source: SECRET_KEY_BASE. The legacy COOKIE_KEY fallback is
# preserved for non-production environments only, until CI is updated to
# set SECRET_KEY_BASE directly. Prod must fail loud rather than silently
# fall back to a different encryption domain.
fetch_nonblank_env = lambda do |key|
  value = ENV[key]
  value unless value.nil? || value.strip.empty?
end

LingoLinq::Application.config.secret_key_base = fetch_nonblank_env.call('SECRET_KEY_BASE') || begin
  if Rails.env.production?
    raise 'SECRET_KEY_BASE env var must be set in production'
  end

  fetch_nonblank_env.call('COOKIE_KEY') || SecureRandom.hex(64)
end

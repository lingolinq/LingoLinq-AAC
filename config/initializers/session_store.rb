# Be sure to restart your server when you modify this file.

#LingoLinq::Application.config.session_store :disabled

# Use cookies for session storage with security options
LingoLinq::Application.config.session_store :cookie_store, 
  key: '_lingolinq_session',
  secure: Rails.env.production?,  # Only send cookie over HTTPS in production
  httponly: true,                  # Prevent JavaScript access to session cookie
  same_site: :lax                  # Prevent CSRF attacks while allowing normal navigation

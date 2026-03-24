# frozen_string_literal: true

# Single source of truth for system-device (developer_key_id 0) app vs browser flags:
# stale key cleanup and classification writes. Pure logic — no request object.
module DeviceClassification
  module_function

  # Mutates +settings+ (same shape as Device#settings). +native_app_device+ is the
  # flow-level native signal (password/registration: installed_app?; SAML: config['app']).
  # +browser_client+ is the request-derived browser signal (ApplicationController#browser_client?).
  # When +force+ is true, clear app/browser first so SAML (or similar) reclassification
  # does not inherit stale flags when neither branch applies.
  def apply_to_settings!(settings, native_app_device:, browser_client:, force: false)
    settings ||= {}
    if force
      settings.delete('browser')
      settings.delete('app')
    end
    if native_app_device
      settings.delete('browser')
      settings['app'] = true
    elsif browser_client
      settings['browser'] = true
      settings.delete('app')
    end
    settings
  end
end

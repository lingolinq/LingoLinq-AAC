# The offline app shell's three endpoints (lib/offline_shell.rb): the service worker at /sw.js, the
# generic page it caches at /offline-shell, and the web app manifest. All three read the
# OFFLINE_APP_SHELL setting on every request.
class OfflineShellController < ApplicationController
  # /sw.js is a script fetched by the browser's service worker machinery, not by XHR. Rails' forgery
  # protection marks every GET for its cross-origin JavaScript check and raises on a non-XHR
  # JavaScript response, so the check is skipped for this one public, user-independent script.
  skip_forgery_protection only: [:service_worker]

  def service_worker
    # Browsers compare this script byte for byte on every navigation; no-cache keeps any HTTP cache in
    # between from hiding a new version or the kill switch.
    response.headers['Cache-Control'] = 'no-cache'
    if OfflineShell.enabled?
      @precache_urls = OfflineShell.precache_urls(helpers)
      @cache_name = OfflineShell.cache_name(@precache_urls, (@domain_overrides || {})['settings'])
      render template: 'offline_shell/service_worker', formats: [:js], layout: false, content_type: 'application/javascript'
    else
      render template: 'offline_shell/kill_switch', formats: [:js], layout: false, content_type: 'application/javascript'
    end
  end

  # The one page the worker caches and serves for any app page it cannot load. Rendered with no user
  # and no page-specific record. The worker keeps its own copy, so no browser cache should.
  def shell
    return head(:not_found) unless OfflineShell.enabled?
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Robots-Tag'] = 'noindex'
    @offline_shell = true
    render template: 'boards/index', formats: [:html]
  end

  def manifest
    return head(:not_found) unless OfflineShell.enabled?
    response.headers['Cache-Control'] = 'no-cache'
    render json: OfflineShell.manifest(helpers.app_name), content_type: 'application/manifest+json'
  end
end

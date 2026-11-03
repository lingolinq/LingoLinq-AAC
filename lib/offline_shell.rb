require 'digest'
require 'json'

# Offline app shell: lets the web app open with no network once it has been added to a Home Screen
# and has synced. A service worker served by Rails at /sw.js precaches one generic page
# (/offline-shell) plus the files it loads, and answers an app-page navigation with that page when the
# network fails. Board data already lives on the device (IndexedDB); this covers the page itself.
#
# This module is the single list the worker, the shell route, the layout and the specs share.
#
# Gate: OFFLINE_APP_SHELL, one value per Cloud Run service, read on every request. It is an environment
# setting, not a feature flag on a user, because the worker registers before anyone signs in, and not a
# database setting, because dev and staging share one database. When it is off, /sw.js serves a worker
# that deletes these caches and unregisters itself (app/views/offline_shell/kill_switch.js.erb).
module OfflineShell
  ENV_KEY = 'OFFLINE_APP_SHELL'
  CACHE_PREFIX = 'll-offline-shell-'
  SHELL_PATH = '/offline-shell'
  MANIFEST_PATH = '/manifest.webmanifest'
  WORKER_PATH = '/sw.js'

  # Bump when app/views/offline_shell/service_worker.js.erb changes in a way the precache list would
  # not show, so installed workers pick up the new code.
  WORKER_VERSION = 1

  # How long a page navigation waits for the network before answering with the cached shell.
  NAVIGATION_TIMEOUT_MS = 4000

  # Fingerprinted by rake assets:precompile; listed through asset_path, as the page itself loads them.
  DIGESTED_ASSETS = %w[application.js application.css globals.js].freeze

  # Unfingerprinted files under public/. Their contents feed the cache name, so editing one makes
  # devices fetch it again. A file missing here still works online and is simply absent offline.
  STATIC_FILES = [
    # Scripts the shell loads (layouts/application.html.erb) and meSpeak's runtime files: its worker,
    # started from its own directory, and the voice speecher.js falls back to ('en/en-us').
    '/weblinger/weblinger.js',
    '/mespeak/mespeak.js',
    '/mespeak/mespeak-core.js',
    '/mespeak/voices/en/en-us.json',
    # Fonts. Glyphicons (bootstrap, in vendor.css) draw the UI icons; browsers take the woff2, older
    # ones the woff. The other two are board fonts a user can choose (app.scss @font-face).
    '/fonts/glyphicons-halflings-regular.woff2',
    '/fonts/glyphicons-halflings-regular.woff',
    '/fonts/OpenDyslexicAlta-Regular.otf',
    '/fonts/ArchitectsDaughter.ttf',
    # Tab and Home Screen icons (layouts/application.html.erb, the manifest).
    '/images/LL_Logo_Light_Muted_favicon.png',
    '/icons/logo-60.png',
    '/icons/logo-76.png',
    '/icons/logo-120.png',
    '/icons/logo-152.png',
    '/icons/logo-180.png',
    # The loading skeleton's logo and the images boards/index.html.erb preloads.
    '/images/LL_Logo_Line_Bright.png',
    '/images/speak-circle-simple-dark.webp',
    '/images/caseload-files.webp',
    '/images/organizations-focused.webp',
    '/images/caseload-light.png',
    '/images/tour-map-dark.png',
    '/images/tour-map-light.png',
    # App images the stylesheets and templates use (app.scss, _focused-view.scss, board-detail-grid.hbs).
    # The landing page's photos are left out: they are large and not part of the signed-in app.
    '/images/badge-in-progress.svg',
    '/images/classroom.png',
    '/images/communicators.png',
    '/images/cursor.png',
    '/images/door.png',
    '/images/extras-wave.png',
    '/images/eye.svg',
    '/images/faces.png',
    '/images/organization.png',
    '/images/organizations-focused.png',
    '/images/organizations.png',
    '/images/speak-circle-light.png',
    '/images/square.svg'
  ].freeze

  # Manifest icons: the existing Home Screen icons, largest first.
  MANIFEST_ICONS = [180, 152, 120, 76, 60].map do |size|
    {'src' => "/icons/logo-#{size}.png", 'sizes' => "#{size}x#{size}", 'type' => 'image/png'}
  end.freeze

  # Navigations the worker never answers with the shell: paths Rails answers itself (config/routes.rb),
  # matched on the first path segment. spec/lib/offline_shell_spec.rb walks the route table so a new
  # server route cannot be missed. The worker mirrors navigation_excluded? in JavaScript. The consent
  # pages are server-rendered and opened from email links; they must never get the app page.
  EXCLUDED_FIRST_SEGMENTS = %w[
    api oauth2 auth saml jobby videos goal_status u lessons wait rails cable assets privacy_practices
    jobs parental_consent eu_ai_parental_consent ai_consent sms_consent
    offline-shell sw.js manifest.webmanifest
  ].freeze

  GLOBAL_ID = /\A\d+_\d+(-\d+_\d+)?\z/

  def self.enabled?
    !!(ENV[ENV_KEY].to_s =~ /\A(on|true|yes|1)\z/i)
  end

  # Every URL the worker precaches. `helpers` is a view-helper object (a controller's `helpers`, or
  # ActionController::Base.helpers).
  def self.precache_urls(helpers)
    ([SHELL_PATH, MANIFEST_PATH] + digested_asset_urls(helpers) + STATIC_FILES).uniq
  end

  # The digested files, taken from the same tag helpers the page uses (layouts/application.html.erb,
  # boards/index.html.erb), so the list matches what the page loads in every environment. With debug
  # assets on (development) the tags use the debug pipeline's file names, which asset_path does not.
  # In production the two agree (debug is off), and boards/index.html.erb uses asset_path there.
  def self.digested_asset_urls(helpers)
    DIGESTED_ASSETS.flat_map do |asset|
      name, ext = asset.split('.')
      html = ext == 'css' ? helpers.stylesheet_link_tag(name) : helpers.javascript_include_tag(name)
      html.to_s.scan(/(?:src|href)="([^"]+)"/).flatten
    end
  end

  # Versioned cache name. Any change to the worker, the precached paths (so any new asset digest), a
  # static file's contents or the domain's settings changes /sw.js, so browsers install the new worker.
  def self.cache_name(urls, domain_settings)
    source = [WORKER_VERSION, urls, static_files_digest, domain_settings || {}].to_json
    "#{CACHE_PREFIX}#{Digest::SHA256.hexdigest(source)[0, 16]}"
  end

  # Contents of the static files, read once per process (they do not change while it runs).
  def self.static_files_digest
    @static_files_digest ||= begin
      digest = Digest::SHA256.new
      STATIC_FILES.each do |path|
        file = Rails.root.join('public', path.delete_prefix('/'))
        digest.update(path)
        digest.update(File.file?(file) ? Digest::SHA256.file(file).hexdigest : 'missing')
      end
      digest.hexdigest
    end
  end

  # True when a navigation to `path` must go to the network and never get the cached shell.
  def self.navigation_excluded?(path)
    segments = path.to_s.split('/').reject(&:empty?)
    return false if segments.empty?
    return true if EXCLUDED_FIRST_SEGMENTS.include?(segments.first)
    # A dot in the last segment is a file (robots.txt, simple.obf, exports), never an app page.
    return true if segments.last.include?('.')
    # Board icons (/:board_key/icon, or /:global_id/icon). Two segments with a user name first is a
    # board whose key ends in 'icon', which is an app page.
    return true if segments.last == 'icon' && (segments.length >= 3 || segments.first.match?(GLOBAL_ID))
    false
  end

  def self.manifest(app_name)
    {
      'name' => app_name,
      'short_name' => app_name,
      'id' => '/',
      'start_url' => '/',
      'scope' => '/',
      'display' => 'standalone',
      'icons' => MANIFEST_ICONS
    }
  end
end

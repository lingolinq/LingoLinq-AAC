require 'spec_helper'
require 'tmpdir'

# The offline app shell's shared lists (lib/offline_shell.rb): what the service worker at /sw.js
# precaches, which navigations it may answer with the cached shell, and the environment gate.
describe OfflineShell do
  def with_gate(value)
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('OFFLINE_APP_SHELL').and_return(value)
  end

  let(:helpers) { ActionController::Base.helpers }

  describe "enabled?" do
    it "is off when the variable is unset" do
      with_gate(nil)
      expect(OfflineShell.enabled?).to eq(false)
    end

    it "is on for on, true, yes and 1, in any case" do
      ['on', 'ON', 'true', 'Yes', '1'].each do |value|
        with_gate(value)
        expect(OfflineShell.enabled?).to eq(true), "expected #{value.inspect} to enable it"
      end
    end

    it "is off for any other value" do
      ['off', 'false', '0', '', ' on', 'enabled'].each do |value|
        with_gate(value)
        expect(OfflineShell.enabled?).to eq(false), "expected #{value.inspect} to leave it off"
      end
    end
  end

  describe "static files" do
    it "names only files that exist under public/" do
      OfflineShell::STATIC_FILES.each do |path|
        expect(path).to start_with('/')
        expect(File.file?(Rails.root.join('public', path.delete_prefix('/')))).to eq(true), "missing public#{path}"
      end
    end

    # The shell links these itself, so a launch with no network asks for them by these paths.
    it "covers every same-origin static file the shell's head and body link" do
      sources = [
        File.read(Rails.root.join('app/views/layouts/application.html.erb')),
        File.read(Rails.root.join('app/views/boards/index.html.erb'))
      ].join("\n")
      linked = sources.scan(/(?:href|src)=["'](\/(?:images|icons|fonts|weblinger|mespeak)\/[^"'?<]+)/).flatten.uniq
      expect(linked).not_to be_empty
      linked.each do |path|
        expect(OfflineShell::STATIC_FILES).to include(path)
      end
    end

    it "includes meSpeak's worker and the voice the app falls back to" do
      # mespeak.js starts its worker from its own directory (public/mespeak/mespeak.js, coreName),
      # and speecher.js uses 'en/en-us' when no other meSpeak voice matches.
      expect(OfflineShell::STATIC_FILES).to include('/mespeak/mespeak-core.js')
      expect(OfflineShell::STATIC_FILES).to include('/mespeak/voices/en/en-us.json')
    end
  end

  # The interface language file (initializers/attempt_lang.js fetches /locales/<lang>.json) is cached
  # the first time it loads online, so a non-English device keeps its language offline. Only these
  # static files, never anything else.
  describe "runtime_cached?" do
    it "matches every locale file the app ships" do
      files = Dir[Rails.root.join('public/locales/*.json')].map { |f| "/locales/#{File.basename(f)}" }
      expect(files.length).to be >= 10
      files.each do |path|
        expect(OfflineShell.runtime_cached?(path)).to eq(true), "expected #{path} to be cached on first use"
      end
    end

    it "matches the regional names the app also asks for" do
      expect(OfflineShell.runtime_cached?('/locales/es-MX.json')).to eq(true)
      expect(OfflineShell.runtime_cached?('/locales/zh_Hant.json')).to eq(true)
    end

    it "matches nothing else" do
      ['/locales/', '/locales/es', '/locales/es.json/x', '/locales/../sw.json', '/locales/es.json.bak',
       '/x/locales/es.json', '/api/v1/locales/es.json', '/locales/very-long-name.json', "/locales/es.json\n"].each do |path|
        expect(OfflineShell.runtime_cached?(path)).to eq(false), "expected #{path.inspect} not to be cached"
      end
    end

    it "is never in the precache list, so it costs nothing until it is used" do
      expect(OfflineShell.precache_urls(helpers).grep(/\A\/locales\//)).to eq([])
    end
  end

  describe "precache_urls" do
    it "lists the shell, the manifest, the digested assets and the static files once each" do
      urls = OfflineShell.precache_urls(helpers)
      expect(urls).to include(OfflineShell::SHELL_PATH)
      expect(urls).to include(OfflineShell::MANIFEST_PATH)
      OfflineShell::DIGESTED_ASSETS.each do |asset|
        expect(urls).to include(helpers.asset_path(asset))
      end
      expect(urls).to include(*OfflineShell::STATIC_FILES)
      expect(urls.uniq).to eq(urls)
    end

    it "uses digested asset paths" do
      urls = OfflineShell.precache_urls(helpers)
      OfflineShell::DIGESTED_ASSETS.each do |asset|
        name, ext = asset.split('.')
        expect(urls.grep(/\A\/assets\/#{name}-[0-9a-f]{64}\.#{ext}\z/).length).to eq(1), "no digested #{asset} in #{urls.inspect}"
      end
    end

    # rake assets:precompile writes its files through Sprockets::Manifest#compile. Compiling the same
    # assets the same way must give the paths the worker precaches, or a deployed worker would ask for
    # files that are not there. (A production precompile is checked separately in the PR.)
    it "matches the digested names a precompile writes" do
      Dir.mktmpdir do |dir|
        manifest = Sprockets::Manifest.new(Rails.application.assets, dir)
        manifest.compile(OfflineShell::DIGESTED_ASSETS)
        expected = OfflineShell::DIGESTED_ASSETS.map { |asset| "/assets/#{manifest.assets.fetch(asset)}" }
        actual = OfflineShell.precache_urls(helpers).select { |u| u.start_with?('/assets/') }
        expect(actual).to eq(expected)
      end
    end
  end

  describe "cache_name" do
    let(:urls) { OfflineShell.precache_urls(helpers) }
    let(:settings) { {'app_name' => 'LingoLinq'} }

    it "starts with the shared prefix" do
      expect(OfflineShell.cache_name(urls, settings)).to match(/\A#{OfflineShell::CACHE_PREFIX}[0-9a-f]{16}\z/)
    end

    it "is the same for the same inputs" do
      expect(OfflineShell.cache_name(urls, settings)).to eq(OfflineShell.cache_name(urls.dup, settings.dup))
    end

    it "changes when an asset digest changes" do
      changed = urls.map { |u| u.start_with?('/assets/application-') ? u.sub(/-[0-9a-f]+\./, '-0000.') : u }
      expect(OfflineShell.cache_name(changed, settings)).not_to eq(OfflineShell.cache_name(urls, settings))
    end

    it "changes when the domain settings change" do
      expect(OfflineShell.cache_name(urls, {'app_name' => 'Other'})).not_to eq(OfflineShell.cache_name(urls, settings))
    end

    it "changes when a static file's contents change" do
      before = OfflineShell.cache_name(urls, settings)
      allow(OfflineShell).to receive(:static_files_digest).and_return('changed')
      expect(OfflineShell.cache_name(urls, settings)).not_to eq(before)
    end
  end

  describe "navigation_excluded?" do
    it "leaves app pages to the shell" do
      ['/', '/scotw', '/scotw/home', '/scotw/core-40-eat', '/scotw/board/core-40-eat',
       '/scotw/board-detail/core-40-eat', '/login', '/offline-boards', '/1_2', '/scotw/icon'].each do |path|
        expect(OfflineShell.navigation_excluded?(path)).to eq(false), "expected #{path} to use the shell"
      end
    end

    it "sends server pages straight to the network" do
      ['/api/v1/users/self', '/oauth2/token', '/auth/saml', '/saml/consume', '/jobby', '/jobby/queues',
       '/videos/youtube/abc', '/goal_status/1_2/abc', '/u/abc', '/lessons/1_2/abc/def', '/sw.js',
       '/manifest.webmanifest', '/offline-shell', '/robots.txt', '/scotw/core-40-eat/icon', '/1_2/icon',
       '/rails/active_storage/blobs/x'].each do |path|
        expect(OfflineShell.navigation_excluded?(path)).to eq(true), "expected #{path} to go to the network"
      end
    end

    # The worker serves the cached shell for any app-page navigation it cannot load. A GET route Rails
    # answers itself (not with the Ember shell) must never get that shell, so every one of them has to be
    # excluded. This walks the real route table so a new server route cannot slip past the list.
    it "excludes every GET route that Rails does not answer with the Ember shell", :aggregate_failures do
      ember_shell = {'boards' => %w[index about terms privacy board user utterance]}
      samples = lambda do |spec|
        base = spec.sub('(.:format)', '')
        with_optional = base.gsub(/[()]/, '')
        without_optional = base.gsub(/\([^()]*\)/, '')
        [with_optional, without_optional].uniq.flat_map do |shape|
          ['a1', 'a1/b1', '1_2'].map do |value|
            shape.gsub(/\*[a-z_]+/, 'a1/b1').gsub(/:[a-z_]+/, value)
          end
        end.uniq
      end
      checked = 0
      Rails.application.routes.routes.each do |route|
        verb = route.verb.to_s
        next unless verb.empty? || verb.match?(/GET/)
        spec = route.path.spec.to_s
        controller = route.defaults[:controller]
        if controller.nil?
          # A mounted app (Resque at /jobby, Sprockets at /assets) or a redirect route: check its
          # literal path.
          literal = spec.split(/[(:*]/).first.chomp('/')
          next if literal.empty?
          expect(OfflineShell.navigation_excluded?(literal)).to eq(true), "mounted or redirect route #{spec} is not excluded"
          checked += 1
          next
        end
        next if (ember_shell[controller] || []).include?(route.defaults[:action])
        samples.call(spec).each do |path|
          recognized = begin
            Rails.application.routes.recognize_path(path, method: :get)
          rescue ActionController::RoutingError
            nil
          end
          next unless recognized
          next unless recognized[:controller] == controller && recognized[:action] == route.defaults[:action]
          expect(OfflineShell.navigation_excluded?(path)).to eq(true), "#{path} (#{controller}##{route.defaults[:action]}) is not excluded"
          checked += 1
        end
      end
      expect(checked).to be > 50
    end

    # Added 2026-11-05 (review follow-up): the walk above checks a route only through the sample paths
    # that happen to reach it, so a route none of them reached was never checked at all. Every GET route
    # Rails answers itself must be reached by a generated sample or by one named in EXTRA_SAMPLES.
    extra_samples = {}
    it "reaches every GET route that Rails does not answer with the Ember shell", :aggregate_failures do
      ember_shell = {'boards' => %w[index about terms privacy board user utterance]}
      generated = lambda do |spec|
        base = spec.sub('(.:format)', '')
        [base.gsub(/[()]/, ''), base.gsub(/\([^()]*\)/, '')].uniq.flat_map do |shape|
          ['a1', 'a1/b1', '1_2'].map { |value| shape.gsub(/\*[a-z_]+/, 'a1/b1').gsub(/:[a-z_]+/, value) }
        end.uniq
      end
      unreached = []
      Rails.application.routes.routes.each do |route|
        verb = route.verb.to_s
        next unless verb.empty? || verb.match?(/GET/)
        controller = route.defaults[:controller]
        action = route.defaults[:action]
        next if controller.nil?
        next if (ember_shell[controller] || []).include?(action)
        spec = route.path.spec.to_s
        paths = generated.call(spec) + extra_samples.fetch("#{controller}##{action}", [])
        reached = paths.select do |path|
          recognized = begin
            Rails.application.routes.recognize_path(path, method: :get)
          rescue ActionController::RoutingError
            nil
          end
          recognized && recognized[:controller] == controller && recognized[:action] == action
        end
        unreached << "#{controller}##{action} #{spec}" if reached.empty?
        reached.each do |path|
          expect(OfflineShell.navigation_excluded?(path)).to eq(true), "#{path} (#{controller}##{action}) is not excluded"
        end
      end
      expect(unreached).to eq([]), "no sample reaches these routes; add one to extra_samples:\n#{unreached.join("\n")}"
    end
  end

  # The app deletes the worker's caches itself when the setting is off (app/utils/offline_shell.js
  # delete_worker_caches), so its prefix must name the same caches the worker makes.
  describe "the app's cache prefix" do
    it "matches CACHE_PREFIX" do
      source = File.read(Rails.root.join('app/frontend/app/utils/offline_shell.js'))
      match = source.match(/^export const CACHE_PREFIX = '([^']*)';$/)
      expect(match).not_to be_nil, 'app/utils/offline_shell.js no longer exports CACHE_PREFIX'
      expect(match[1]).to eq(OfflineShell::CACHE_PREFIX)
    end
  end
end

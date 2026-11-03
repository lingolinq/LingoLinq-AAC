require 'spec_helper'

# The service worker, the generic page it caches, and the web app manifest (lib/offline_shell.rb).
# Every endpoint is checked with the environment setting off and on.
describe OfflineShellController, :type => :controller do
  render_views

  def javascript?(response)
    response.media_type.match?(/\A(?:text|application)\/javascript\z/)
  end

  env_wrap('OFFLINE_APP_SHELL' => nil) do
    describe "with the setting off" do
      it "serves a worker that removes its caches and unregisters itself" do
        get :service_worker
        expect(response.status).to eq(200)
        expect(javascript?(response)).to eq(true)
        expect(response.headers['Cache-Control']).to include('no-cache')
        expect(response.body).to include('registration.unregister()')
        expect(response.body).to include('caches.delete')
        expect(response.body).to include(OfflineShell::CACHE_PREFIX.to_json)
        expect(response.body).to include('skipWaiting')
        expect(response.body).not_to include("addEventListener('fetch'")
        expect(response.body).not_to include(OfflineShell::SHELL_PATH)
      end

      it "does not reload pages it leaves" do
        get :service_worker
        expect(response.body).not_to include('navigate(')
        expect(response.body).not_to include('location.reload')
      end

      it "does not serve the cached page" do
        get :shell
        expect(response.status).to eq(404)
      end

      it "does not serve the manifest" do
        get :manifest
        expect(response.status).to eq(404)
      end
    end
  end

  env_wrap('OFFLINE_APP_SHELL' => 'on') do
    describe "with the setting on" do
      describe "service_worker" do
        it "serves the worker as uncached JavaScript" do
          get :service_worker
          expect(response.status).to eq(200)
          expect(javascript?(response)).to eq(true)
          expect(response.headers['Cache-Control']).to include('no-cache')
        end

        it "precaches exactly the shared list under a versioned cache name" do
          get :service_worker
          urls = OfflineShell.precache_urls(controller.helpers)
          expect(response.body).to include("var PRECACHE = #{urls.to_json};")
          name = OfflineShell.cache_name(urls, controller.instance_variable_get(:@domain_overrides)['settings'])
          expect(response.body).to include("var CACHE_NAME = #{name.to_json};")
        end

        it "puts the same application.js in the precache list as the page loads" do
          get :service_worker
          expect(response.body).to include(controller.helpers.asset_path('application.js').to_json)
        end

        it "answers only GET requests and only same-origin ones" do
          get :service_worker
          expect(response.body).to include("request.method !== 'GET'")
          expect(response.body).to include('url.origin !== self.location.origin')
        end

        it "does not take over open pages on install" do
          get :service_worker
          expect(response.body).not_to include('skipWaiting')
          expect(response.body).not_to include('clients.claim')
        end

        it "never answers from the cache with a redirected or failed response" do
          get :service_worker
          expect(response.body).to include("redirect: 'error'")
          expect(response.body).to include('response.redirected')
          expect(response.body).to include('!response.ok')
        end

        it "names the navigations it leaves to the network" do
          get :service_worker
          expect(response.body).to include("var EXCLUDED_FIRST_SEGMENTS = #{OfflineShell::EXCLUDED_FIRST_SEGMENTS.to_json};")
          expect(response.body).to include("var NAVIGATION_TIMEOUT_MS = #{OfflineShell::NAVIGATION_TIMEOUT_MS};")
        end
      end

      describe "shell" do
        it "renders the app shell as a plain 200 that is never stored by the browser cache" do
          get :shell
          expect(response.status).to eq(200)
          expect(response.media_type).to eq('text/html')
          expect(response.headers['Cache-Control']).to include('no-store')
          expect(response.headers['X-Robots-Tag']).to eq('noindex')
          expect(response.body).to include('id="ember-application-root"')
        end

        it "loads the same digested application.js the worker precaches" do
          get :shell
          expect(response.body).to include(controller.helpers.asset_path('application.js'))
        end

        # The page and the worker must agree in every environment, including when the asset tags use
        # the debug pipeline (development), or an offline launch asks for files that were never cached.
        it "loads nothing from /assets/ that the worker does not precache" do
          get :shell
          loaded = response.body.scan(/(?:src|href)=["'](\/assets\/[^"']+)["']/).flatten.uniq
          expect(loaded.length).to be >= 3
          precached = OfflineShell.precache_urls(controller.helpers)
          expect(precached).to include(*loaded)
        end

        it "still agrees when the asset tags use the debug pipeline" do
          allow(controller.helpers).to receive(:request_debug_assets?).and_return(true)
          allow_any_instance_of(ActionView::Base).to receive(:request_debug_assets?).and_return(true)
          get :shell
          loaded = response.body.scan(/(?:src|href)=["'](\/assets\/[^"']+)["']/).flatten.uniq
          expect(loaded.any? { |path| path.include?('.debug-') }).to eq(true), "debug pipeline not in use: #{loaded.inspect}"
          precached = OfflineShell.precache_urls(controller.helpers)
          expect(precached).to include(*loaded)
        end

        # config/environments/test.rb turns forgery protection off, which would drop the tag anyway.
        it "carries no session token and no page-specific record" do
          allow(controller).to receive(:protect_against_forgery?).and_return(true)
          get :shell
          expect(response.body).not_to include('csrf-token')
          expect(response.body).not_to include('authenticity_token')
          expect(response.body).not_to include('og:title')
          expect(response.body).not_to include('lesson_share_token_valid')
        end

        it "leaves out the chart scripts from the outside host" do
          get :shell
          expect(response.body).not_to include('cdn.jsdelivr.net')
        end
      end

      describe "manifest" do
        it "describes a standalone app that starts at the root" do
          get :manifest
          expect(response.status).to eq(200)
          expect(response.media_type).to eq('application/manifest+json')
          expect(response.headers['Cache-Control']).to include('no-cache')
          json = JSON.parse(response.body)
          expect(json['start_url']).to eq('/')
          expect(json['scope']).to eq('/')
          expect(json['id']).to eq('/')
          expect(json['display']).to eq('standalone')
          expect(json['name']).to eq('LingoLinq')
          expect(json['short_name']).to eq('LingoLinq')
        end

        it "uses the existing icons, each a real file of the stated size" do
          get :manifest
          icons = JSON.parse(response.body)['icons']
          expect(icons.length).to eq(5)
          icons.each do |icon|
            path = Rails.root.join('public', icon['src'].delete_prefix('/'))
            expect(File.file?(path)).to eq(true), "missing #{icon['src']}"
            width, height = File.open(path, 'rb') { |f| f.read(16); f.read(8).unpack('NN') }
            expect(icon['sizes']).to eq("#{width}x#{height}")
            expect(icon['type']).to eq('image/png')
          end
        end

        it "takes the name from the domain's settings" do
          get :manifest
          name = controller.instance_variable_get(:@domain_overrides)['settings']['app_name']
          expect(JSON.parse(response.body)['name']).to eq(name || 'LingoLinq')
        end
      end
    end
  end
end

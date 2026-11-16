require 'spec_helper'

# The offline app shell's three URLs (lib/offline_shell.rb) must reach their own controller. Each sits
# in config/routes.rb above the ':id' catch-alls, which would otherwise read 'sw' or 'offline-shell'
# as a user name and render the app page instead.
describe "Offline app shell routes" do
  it "routes the service worker script" do
    expect(get: '/sw.js').to route_to(controller: 'offline_shell', action: 'service_worker')
  end

  it "routes the cached shell page" do
    expect(get: '/offline-shell').to route_to(controller: 'offline_shell', action: 'shell')
  end

  it "routes the web app manifest" do
    expect(get: '/manifest.webmanifest').to route_to(controller: 'offline_shell', action: 'manifest')
  end
end

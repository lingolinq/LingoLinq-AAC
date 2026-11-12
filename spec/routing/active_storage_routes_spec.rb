require 'spec_helper'

# Active Storage is loaded by `require 'rails/all'` but unused: no model attaches a file and no
# storage service is configured. Its engine routes stay undrawn (config/application.rb,
# `config.active_storage.draw_routes = false`), so the Rails 7.2.3.2 Active Storage advisories
# ignored in .bundler-audit.yml have no endpoint to reach.
describe "Active Storage routes" do
  it "does not draw the direct upload route" do
    expect(post: '/rails/active_storage/direct_uploads').not_to route_to(
      controller: 'active_storage/direct_uploads', action: 'create'
    )
  end

  it "does not draw the blob redirect route" do
    expect(get: '/rails/active_storage/blobs/redirect/signed/file.png').not_to route_to(
      controller: 'active_storage/blobs/redirect', action: 'show',
      signed_id: 'signed', filename: 'file', format: 'png'
    )
  end

  it "does not draw the representation proxy route" do
    expect(get: '/rails/active_storage/representations/proxy/signed/variant/file.png').not_to route_to(
      controller: 'active_storage/representations/proxy', action: 'show',
      signed_blob_id: 'signed', variation_key: 'variant', filename: 'file', format: 'png'
    )
  end

  it "does not draw the disk service upload route" do
    expect(put: '/rails/active_storage/disk/token').not_to route_to(
      controller: 'active_storage/disk', action: 'update', encoded_token: 'token'
    )
  end

  it "leaves no route under /rails/active_storage" do
    paths = Rails.application.routes.routes.map { |r| r.path.spec.to_s }
    expect(paths.grep(%r{\A/rails/active_storage})).to eq([])
  end
end

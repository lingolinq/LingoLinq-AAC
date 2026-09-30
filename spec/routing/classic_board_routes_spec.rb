require 'spec_helper'

# Classic view renders a board at /<user>/board/<boardname> (Ember route `user.board-alt`,
# app/frontend/app/router.js:150). On a hard load, bookmark or shared link that URL reaches
# Rails first, so it needs the same SPA fallback the board-detail URLs have
# (config/routes.rb:109-110), or it 404s (#1037).
describe "Classic board routes" do
  it "hands a Classic board URL to the Ember app" do
    expect(get: '/example/board/vocal-flair-84').to route_to(
      controller: 'boards', action: 'index', id: 'example', boardname: 'vocal-flair-84'
    )
  end

  # A board whose key is literally <user>/board already owns these two URLs through
  # board_id_regex. The Classic fallback must not take them over.
  it "leaves the icon of a board named 'board' alone" do
    expect(get: '/example/board/icon').to route_to(
      controller: 'boards', action: 'icon', id: 'example/board'
    )
  end

  it "leaves the history of a board named 'board' alone" do
    expect(get: '/example/board/history').to route_to(
      controller: 'boards', action: 'board', id: 'example/board'
    )
  end

  # Defined earlier in config/routes.rb than the Classic fallback, and three segments deep,
  # so it would be shadowed if the fallback were placed above it.
  it "leaves organization sub-pages alone" do
    expect(get: '/organizations/board/stats').to route_to(
      controller: 'boards', action: 'index', org_id: 'board', path: 'stats'
    )
  end
end

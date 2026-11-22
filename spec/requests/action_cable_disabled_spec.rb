require 'spec_helper'

# The app has no channels, and sync.js connects to LLWEBSOCKET_URL, so it serves no socket of its own.
describe "Action Cable", type: :request do
  it "is not mounted" do
    expect(Rails.application.config.action_cable.mount_path).to eq(nil)
    expect(Rails.application.routes.routes.map { |r| r.app.app }).not_to include(ActionCable.server)
  end
end

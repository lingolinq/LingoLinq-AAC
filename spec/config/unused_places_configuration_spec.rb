require 'spec_helper'

# The Places lookup is retired (lib/geolocation.rb). Keep its configuration
# from coming back: no application code may read GOOGLE_PLACES_TOKEN.
describe "unused Places configuration" do
  it "should not be read by application code" do
    files = `git -C #{Rails.root} ls-files -- app lib config`.split("\n").reject { |f| f.start_with?('app/frontend/node_modules') }
    # A broken scan must not read as a clean tree.
    expect(files).to include('config/application.rb', 'config/routes.rb', 'app/controllers/application_controller.rb')
    readers = files.select { |f| File.file?(Rails.root.join(f)) && File.read(Rails.root.join(f), mode: 'rb').include?('GOOGLE_PLACES_TOKEN') }
    expect(readers).to eq([])
  end
end

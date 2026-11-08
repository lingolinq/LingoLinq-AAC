require 'spec_helper'

# Rails 8 draws routes lazily in development and test when eager_load is false (the test env,
# and dev rake tasks since rake_eager_load defaults to false), so anything defined in
# config/routes.rb does not exist until the first request or URL-helper call.
# Processable#generate_unique_key reads this list when generating user names, so it must be
# defined at boot.
describe "LingoLinq::RESERVED_ROUTES" do
  it "is defined by an initializer, not by a file loaded with the routes" do
    file, _line = LingoLinq.const_source_location(:RESERVED_ROUTES)
    expect(file).to eq(Rails.root.join('config', 'initializers', 'reserved_routes.rb').to_s)
  end

  # The initializer runs first, so a `||=` or `<<` left in routes.rb would not move the source
  # location above; catch any reference instead.
  it "is not referenced in config/routes.rb" do
    routes = File.read(Rails.root.join('config', 'routes.rb'))
    expect(routes).not_to include('RESERVED_ROUTES')
  end

  it "is frozen" do
    expect(LingoLinq::RESERVED_ROUTES).to be_frozen
  end
end

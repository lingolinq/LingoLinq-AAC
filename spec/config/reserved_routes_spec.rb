require 'spec_helper'

# Rails 8 draws routes lazily when eager_load is false (the test env, and every rake task,
# since rake_eager_load defaults to false), so anything defined in config/routes.rb does not
# exist until the first request or URL-helper call. Processable#generate_unique_key reads this
# list when creating users and boards, so it must be defined at boot.
describe "LingoLinq::RESERVED_ROUTES" do
  it "is defined by an initializer, not by a file loaded with the routes" do
    file, _line = LingoLinq.const_source_location(:RESERVED_ROUTES)
    expect(file).to eq(Rails.root.join('config', 'initializers', 'reserved_routes.rb').to_s)
  end

  it "is not assigned in config/routes.rb" do
    routes = File.read(Rails.root.join('config', 'routes.rb'))
    expect(routes).not_to match(/RESERVED_ROUTES\s*(\|\|)?=/)
  end
end

# This file is copied to spec/ when you run 'rails generate rspec:install'
ENV["RAILS_ENV"] ||= 'test'
require 'dotenv'
Dotenv.load
require File.expand_path("../../config/environment", __FILE__)
require 'rspec/rails'
require 'simplecov'

# Requires supporting ruby files with custom matchers and macros, etc,
# in spec/support/ and its subdirectories.
Dir[Rails.root.join("spec/support/**/*.rb")].each { |f| require f }

# Checks for pending migrations before tests are run.
# If you are not using ActiveRecord, you can remove this line.
# Rails 7: check_pending! was removed; use check_all_pending! (supports multi-DB).
if defined?(ActiveRecord::Migration)
  ActiveRecord::Migration.check_all_pending!
end

SimpleCov.start 'rails'

RSpec.configure do |config|
  # ## Mock Framework
  #
  # If you prefer to use mocha, flexmock or RR, uncomment the appropriate line:
  #
  # config.mock_with :mocha
  # config.mock_with :flexmock
  # config.mock_with :rr

  # Remove this line if you're not using ActiveRecord or ActiveRecord fixtures
  # Rails 7.1+: use fixture_paths (array) instead of fixture_path (singular)
  config.fixture_paths = ["#{::Rails.root}/spec/fixtures"]

  # If you're not using ActiveRecord, or you'd prefer not to run each of your
  # examples within a transaction, remove the following line or assign false
  # instead of true.
  config.use_transactional_fixtures = true

  # If true, the base class of anonymous controllers will be inferred
  # automatically. This will be the default behavior in future versions of
  # rspec-rails.
  config.infer_base_class_for_anonymous_controllers = false
  
  config.infer_spec_type_from_file_location!

  # Use defined order for consistent CI results and fewer order-dependent failures.
  # To run with random order (e.g. to surface order dependencies): bundle exec rspec --order random
  config.order = "defined"
  
  config.before(:each) do
    ENV['DEFAULT_HOST'] ||= 'http://test.host'  # ensure URL generation is consistent in specs
    Time.zone = nil
    Worker.flush_queues
    # When S3 credentials aren't configured (e.g. CI/GitHub Actions), stub remote_upload_params
    # so tests that exercise upload JSON paths don't fail. In development with .env loaded,
    # real credentials are used when available.
    if ENV['AWS_SECRET'].to_s.blank?
      allow(Uploader).to receive(:remote_upload_params).and_return(
        upload_url: 'https://example.com/',
        upload_params: {}
      )
    end
    RemoteAction.delete_all
    RedisInit.reset_queue_pressure_cache!
    PaperTrail.request.whodunnit = nil
    RedisInit.cache_token = "#{rand(999)}.#{Time.now.to_f}"
    ENV['REMOTE_EXTRA_DATA'] = nil
    ENV['APP_NAME'] = "MyCoolApp"
    Permissable.set_redis(RedisInit.permissions, RedisInit.cache_token)
    RedisInit.default.del('domain_org_ids')
    Board.last_scheduled_stamp = nil
    BoardDownstreamButtonSet.last_scheduled_stamp = nil
    WordData.clear_lists
  end
end

def env_wrap(overrides, &block)
  fallbacks = {}
  overrides.each{|k, v| fallbacks[k] = ENV[k] }
  before(:each) do
    overrides.each{|k, v| ENV[k] = v }
  end
  after(:each) do
    fallbacks.each{|k, v| ENV[k] = v }
  end
  block.call
end

def write_this_test
  expect("test").to eq("needs written")
end

def assert_broken
  expect('broken').to eq(true)
end

def assert_missing_token
  assert_error("Access token required for this endpoint: missing token", 400)
end

def assert_not_found(id=nil)
  assert_error("Record not found", 404)
  json = JSON.parse(response.body)
  expect(json['id']).to eq(id)
end

def assert_error(str, code=nil)
  expect(response).not_to be_successful
  json = JSON.parse(response.body)
  expect(json['error']).to eq(str)
  if code
    expect(json['status']).to eq(code)
  end
  @error_json = json
end

def assert_unauthorized
  assert_error("Not authorized", 400)
end

def assert_success_json
  if !response.successful?
    expect(response.body).to eq("success")
  end
  expect(response).to be_successful
  json = JSON.parse(response.body)
end

def assert_timestamp(ts, ts2)
  expect(ts).to be > ts2 - 3
  expect(ts).to be < ts2 + 3
end

def token_user(scopes=nil)
  @user = User.create
  if scopes
    @device = Device.create(:user => @user, :developer_key_id => 1, :device_key => 'bacon')
    @device.settings['permission_scopes'] = scopes
    @device.save
  else
    @device = Device.create(:user => @user, :developer_key_id => 0, :device_key => 'hippo')
  end
  request.headers['Authorization'] = "Bearer #{@device.tokens[0]}"
  request.headers['Check-Token'] = "true"
end

def valet_token_user
  token_user
  @device.settings['valet'] = true
  @device.save
end

def with_versioning
  was_enabled = PaperTrail.enabled?
  was_enabled_for_controller = true #PaperTrail.enabled_for_controller?
  PaperTrail.enabled = true
  # PaperTrail.enabled_for_controller = true
  begin
    yield
  ensure
    PaperTrail.enabled = was_enabled
    #PaperTrail.enabled_for_controller = was_enabled_for_controller
  end
end

def message_body(message, type)
  res = nil
  message.body.parts.each do |part|
    if !type
      res ||= part.to_s
    elsif type == :text && part.content_type.match(/text\/plain/)
      res ||= part.to_s
    elsif type == :html && part.content_type.match(/text\/html/)
      res ||= part.to_s
    end
  end
  res
end
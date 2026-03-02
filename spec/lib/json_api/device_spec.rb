require 'spec_helper'

describe JsonApi::Device do
  it "should have defined pagination defaults" do
    expect(JsonApi::Device::TYPE_KEY).to eq('device')
    expect(JsonApi::Device::DEFAULT_PAGE).to eq(25)
    expect(JsonApi::Device::MAX_PAGE).to eq(50)
  end

  describe "build_json" do
    it "should not include unlisted settings" do
      u = User.create
      d = Device.create(:user => u)
      d.settings['hat'] = 'black'
      expect(JsonApi::Device.build_json(d).keys).not_to be_include('hat')
    end
    
    it "should return appropriate attributes" do
      u = User.create
      d = Device.create(:user => u, :settings => {'name' => 'cool device', 'app_version' => 'asdf'})
      expect(JsonApi::Device.build_json(d)).to eq({
        'id' => d.global_id,
        'name' => 'cool device',
        'ip_address' => nil,
        'last_used' => d.created_at.iso8601,
        'app_version' => 'asdf',
        "inactivity_timeout" => "12.0 hours",
        "token_timeout" => "5.0 years",
        "token_type" => :unknown,
        'user_agent' => nil
      })
    end
  end
end

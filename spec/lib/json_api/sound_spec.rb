require 'spec_helper'

describe JsonApi::Sound do
  it "should have defined pagination defaults" do
    expect(JsonApi::Sound::TYPE_KEY).to eq('sound')
    expect(JsonApi::Sound::DEFAULT_PAGE).to eq(25)
    expect(JsonApi::Sound::MAX_PAGE).to eq(50)
  end

  describe "build_json" do
    it "should not included unlisted settings" do
      s = ButtonSound.new(settings: {'hat' => 'black'})
      expect(JsonApi::Sound.build_json(s).keys).not_to be_include('hat')
    end
    
    it "should include appropriate values" do
      s = ButtonSound.new(settings: {})
      ['id', 'url', 'license'].each do |key|
        expect(JsonApi::Sound.build_json(s).keys).to be_include(key)
      end
    end
    
    it "should include permissions" do
      u = User.new
      i = ButtonSound.new(settings: {})
      json = JsonApi::Sound.build_json(i, :permissions => u)
      expect(json['permissions']['view']).to eq(true)
    end

    it "should return metadata for pending uploads" do
      u = User.create
      i = ButtonSound.new(user: u, settings: {'hat' => 'black', 'content_type' => 'image/png', 'pending' => true, 'pending_url' => 'http://www.pic.com'})
      i.instance_variable_set('@remote_upload_possible', true)
      i.save
      expect(i.pending_upload?).to eq(true)
      json = JsonApi::Sound.as_json(i, :wrapper => true)
      expect(json['meta']).not_to eq(nil)
      expect(json['meta']['remote_upload']).not_to eq(nil)
    end
  end
end

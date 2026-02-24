require 'spec_helper'

describe JsonApi::Video do
  it "should have defined pagination defaults" do
    expect(JsonApi::Video::TYPE_KEY).to eq('video')
    expect(JsonApi::Video::DEFAULT_PAGE).to eq(25)
    expect(JsonApi::Video::MAX_PAGE).to eq(50)
  end

  describe "build_json" do
    it "should not included unlisted settings" do
      s = UserVideo.new(settings: {'hat' => 'black'})
      expect(JsonApi::Video.build_json(s).keys).not_to be_include('hat')
    end
    
    it "should include appropriate values" do
      s = UserVideo.new(settings: {})
      ['id', 'url', 'license', 'pending', 'content_type', 'duration'].each do |key|
        expect(JsonApi::Video.build_json(s).keys).to be_include(key)
      end
    end
    
    it "should include permissions" do
      u = User.new
      i = UserVideo.new(settings: {})
      json = JsonApi::Video.build_json(i, :permissions => u)
      expect(json['permissions']['view']).to eq(true)
    end

    it "should return metadata for pending uploads" do
      u = User.create
      i = UserVideo.new(user: u, settings: {'hat' => 'black', 'content_type' => 'image/png', 'pending' => true, 'pending_url' => 'http://www.pic.com'})
      i.instance_variable_set('@remote_upload_possible', true)
      i.save
      expect(i.pending_upload?).to eq(true)
      json = JsonApi::Video.as_json(i, :wrapper => true)
      expect(json['meta']).not_to eq(nil)
      expect(json['meta']['remote_upload']).not_to eq(nil)
    end
  end
end

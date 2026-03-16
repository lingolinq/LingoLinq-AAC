require 'spec_helper'

describe UserVideo, type: :model do
  it "should show correct permissions" do
    v = UserVideo.new
    User.count
    expect(v.permissions_for(nil)).to eq({'user_id' => nil, 'view' => true})
    u = User.create
    expect(v.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true})
    v.user = u
    expect(v.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true})
  end
  
  describe "summary_hash" do
    it "should return a valid summary" do
      v = UserVideo.new
      expect(v.summary_hash).to eq({
        'id' => nil,
        'duration' => nil,
        'url' => nil
      })
      v.save
      v.settings ||= {}
      v.settings['duration'] = 12
      v.url = 'http://www.example.com/video.mp4'
      expect(v.summary_hash).to eq({
        'id' => v.global_id,
        'duration' => 12,
        'url' => 'http://www.example.com/video.mp4'
      })
    end
  end
  
  describe "generate_defaults" do
    it "should generate defaults" do
      v = UserVideo.new
      v.generate_defaults
      expect(v.settings['license']).to eq({'type' => 'private'})
      expect(v.public).to eq(false)
    end
  end
  
  describe "process_params" do
    it "should error if no author defined" do
      expect{ UserVideo.process_new({}, {}) }.to raise_error('user required as video author')
    end
    
    it "should update parameters" do
      u = User.create
      v = UserVideo.new
      expect(v).to receive(:process_url).with('http://www.example.com/video.wmv', {'user' => u})
      expect(v).to receive(:process_license).with('asdf')
      v.process({
        'url' => 'http://www.example.com/video.wmv', 
        'license' => 'asdf', 
        'content_type' => 'video/mp4', 
        'public' => true, 
        'duration' => '14'
      }, {
        'user' => u
      })
      expect(v.url).to eq(nil)
      expect(v.public).to eq(true)
      expect(v.settings['content_type']).to eq('video/mp4')
      expect(v.settings['duration']).to eq(14)
    end
  end
end

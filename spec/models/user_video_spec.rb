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

    # A video url is an http(s) url or a data:video/* URI (the frontend sends recorded and picked
    # videos as data:video/...;base64, app/frontend/app/models/video.js:77-79). Anything else is
    # dropped, as ButtonImage#process_params drops a data: URI whose MIME is not image/*.
    describe "url scheme" do
      let(:user) { User.create }
      let(:non_user_params) { {:user => user, :remote_upload_possible => true} }

      it "drops a data: URI that is not a video" do
        v = UserVideo.process_new({'url' => 'data:text/html,<p>x</p>', 'content_type' => 'video/mp4'}, non_user_params)
        expect(v.errored?).to eq(false)
        expect(v.url).to eq(nil)
        expect(v.settings['pending_url']).to eq(nil)
      end

      it "drops a javascript: url" do
        v = UserVideo.process_new({'url' => 'javascript:void(0)', 'content_type' => 'video/mp4'}, non_user_params)
        expect(v.errored?).to eq(false)
        expect(v.url).to eq(nil)
        expect(v.settings['pending_url']).to eq(nil)
      end

      it "drops a url that only contains an allowed scheme after another one" do
        v = UserVideo.process_new({'url' => 'javascript:void(0)//https://www.example.com/video.mp4', 'content_type' => 'video/mp4'}, non_user_params)
        expect(v.url).to eq(nil)
        expect(v.settings['pending_url']).to eq(nil)
      end

      it "drops a url that is not a string, without raising" do
        [{'a' => 1}, ['https://www.example.com/video.mp4']].each do |url|
          v = UserVideo.process_new({'url' => url, 'content_type' => 'video/mp4'}, non_user_params)
          expect(v.url).to eq(nil)
          expect(v.settings['pending_url']).to eq(nil)
        end
      end

      it "keeps an upper-case https url" do
        v = UserVideo.process_new({'url' => 'HTTPS://www.example.com/video.mp4', 'content_type' => 'video/mp4'}, non_user_params)
        expect(v.settings['pending_url']).to eq('HTTPS://www.example.com/video.mp4')
      end

      it "keeps a data:video URI pending for the client upload" do
        data = 'data:video/webm;base64,' + Base64.strict_encode64('not really a video')
        v = UserVideo.process_new({'url' => data, 'content_type' => 'video/webm'}, non_user_params)
        expect(v.url).to eq(nil)
        expect(v.settings['pending_url']).to eq(data)
        expect(v.settings['pending']).to eq(true)
      end

      it "keeps an https url pending for the client upload" do
        v = UserVideo.process_new({'url' => 'https://www.example.com/video.mp4', 'content_type' => 'video/mp4'}, non_user_params)
        expect(v.url).to eq(nil)
        expect(v.settings['pending_url']).to eq('https://www.example.com/video.mp4')
        expect(v.settings['pending']).to eq(true)
      end

      it "drops a non-video url sent on update" do
        v = UserVideo.create(:user => user, :url => 'https://www.example.com/video.mp4', :settings => {'content_type' => 'video/mp4'})
        expect(v.process({'url' => 'data:text/html,<p>x</p>'}, {:user => user})).to eq(true)
        v.reload
        expect(v.url).to eq('https://www.example.com/video.mp4')
        expect(v.settings['pending_url']).to eq(nil)
      end
    end
  end
end

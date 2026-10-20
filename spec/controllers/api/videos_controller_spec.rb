require 'spec_helper'

describe Api::VideosController, type: :controller do
  describe "create" do
    it "should require api token" do
      post :create
      assert_missing_token
    end
    
    it "should create the record" do
      token_user
      post :create, params: {:video => {'url' => 'http://www.example.com/video.mp4', 'content_type' => 'video/mp4'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['video']['id']).not_to eq(nil)
      expect(json['video']['pending']).to eq(true)
    end
  end
  
  describe "show" do
    it "should require api token" do
      get :show, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require valid record" do
      token_user
      get :show, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end

    it "should return result" do
      token_user
      v = UserVideo.create(:user => @user, :url => 'http://www.example.com/video.mp4')
      get :show, params: {:id => v.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['video']['id']).to eq(v.global_id)
      expect(json['video']['url']).to eq('http://www.example.com/video.mp4')
    end
  end
  
  describe "update" do
    it "should require api token" do
      put :update, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid record" do
      token_user
      put :update, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require permission" do
      token_user
      v = UserVideo.create(:user => User.create)
      put :update, params: {:id => v.global_id}
      assert_unauthorized
    end
    
    it "should update the record" do
      token_user
      v = UserVideo.create(:user => @user, :settings => {'content_type' => 'video/mp4'})

      put :update, params: {:id => v.global_id, :video => {:license => {'type' => 'CC-By'}}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['video']['id']).to eq(v.global_id)
      expect(json['video']['license']).to eq({'type' => 'CC-By'})
    end
  end
  
  describe "upload_success" do
    it "should not require api token" do
      get :upload_success, params: {:video_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for bad confirmation key" do
      get :upload_success, params: {:video_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for valid confirmation key but missing from server" do
      token_user
      v = UserVideo.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      expect(Uploader).to receive(:remote_upload_exists?).with(config[:upload_url] + v.full_filename).and_return(false)
      get :upload_success, params: {:video_id => v.global_id, :confirmation => v.confirmation_key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'File not found'})
    end
    
    it "should succeed for valid confirmation key that is found on server" do
      token_user
      v = UserVideo.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      expect(Uploader).to receive(:remote_upload_exists?).with(config[:upload_url] + v.full_filename).and_return(true)
      get :upload_success, params: {:video_id => v.global_id, :confirmation => v.confirmation_key}
      json = JSON.parse(response.body)
      expect(response).to be_successful
      expect(v.reload.url).not_to eq(nil)
      expect(v.settings['pending']).to eq(false)
      expect(json).to eq({'confirmed' => true, 'url' => v.url})
    end
  end

  # No upload form can be issued: a create that needs a client upload must not leave a pending
  # record behind, and reading a pending record must still work, just without the form.
  describe "without S3 configured" do
    before(:each) { allow(Uploader).to receive(:client_uploads_configured?).and_return(false) }

    it "should answer 503 and keep no record when the create needs a client upload" do
      token_user
      expect {
        post :create, params: {:video => {'url' => 'https://www.example.com/file.mp4', 'content_type' => 'video/mp4'}}
      }.to_not change(UserVideo, :count)
      assert_error('File uploads are not available right now', 503)
    end

    it "should still create a record that needs no client upload" do
      token_user
      allow(Uploader).to receive(:valid_remote_url?).and_return(true)
      post :create, params: {:video => {'url' => 'https://www.example.com/file.mp4', 'content_type' => 'video/mp4'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['video']['pending']).to eq(false)
      expect(json['meta']).to eq(nil)
    end

    it "should show a pending record without upload params" do
      token_user
      record = UserVideo.create!(user: @user, settings: {'pending' => true, 'content_type' => 'video/mp4'})
      get :show, params: {:id => record.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['video']['id']).to eq(record.global_id)
      expect(json['video']['pending']).to eq(true)
      expect(json['meta']).to eq(nil)
    end
  end
end

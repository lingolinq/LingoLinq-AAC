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
      res = OpenStruct.new(:success? => false)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + v.full_filename).and_return(res)
      get :upload_success, params: {:video_id => v.global_id, :confirmation => v.confirmation_key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'File not found'})
    end
    
    it "should succeed for valid confirmation key that is found on server" do
      token_user
      v = UserVideo.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + v.full_filename).and_return(res)
      get :upload_success, params: {:video_id => v.global_id, :confirmation => v.confirmation_key}
      json = JSON.parse(response.body)
      expect(response).to be_successful
      expect(v.reload.url).not_to eq(nil)
      expect(v.settings['pending']).to eq(false)
      expect(json).to eq({'confirmed' => true, 'url' => v.url})
    end
  end
end

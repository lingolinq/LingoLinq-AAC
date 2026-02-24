 require 'spec_helper'

describe Api::SoundsController, :type => :controller do
  describe "create" do
    it "should require api token" do
      post :create, params: {}
      assert_missing_token
    end
    
    it "should create a sound based on the passer parameters" do
      token_user
      url = "https://#{ENV['UPLOADS_S3_BUCKET'] || 'lingolinq-dev-uploads'}.s3.amazonaws.com/bacon.mp3"
      post :create, params: {:sound => {'url' => url, 'content_type' => 'audio/mp3'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sound']['id']).not_to eq(nil)
      expect(json['sound']['url']).to match(/bacon\.mp3$/)
      expect(json['meta']).to eq(nil)
    end
    
    it "should return meta (upload information) for pending sounds" do
      token_user
      url = "https://www.example.com/pic.mp3"
      post :create, params: {:sound => {'url' => url, 'content_type' => 'audio/mp3'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sound']['id']).not_to eq(nil)
      expect(json['sound']['pending']).to eq(true)
      expect(json['sound']['url']).to eq(nil)
      expect(json['meta']).not_to eq(nil)
    end
    
    it "should error gracefully on sound create fail" do
      token_user
      url = "https://www.example.com/pic.mp3"
      expect_any_instance_of(ButtonSound).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      post :create, params: {:sound => {'url' => url, 'content_type' => 'audio/mp3'}}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq("sound creation failed")
      expect(json['errors']).to eq(["bacon"])
    end

    it "should allow creating sounds on behalf of a supervisee" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      url = "https://#{ENV['UPLOADS_S3_BUCKET'] || 'lingolinq-dev-uploads'}.s3.amazonaws.com/bacon.mp3"
      post :create, params: {:sound => {'user_id' => u.global_id, 'url' => url, 'content_type' => 'audio/mp3'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sound']['id']).not_to eq(nil)
      expect(json['sound']['url']).to match(/bacon\.mp3$/)
      expect(json['meta']).to eq(nil)
      bs = ButtonSound.find_by_global_id(json['sound']['id'])
      expect(bs).to_not eq(nil)
      expect(bs.user).to eq(u)
    end
    
    it "should not allow creating sounds for someone who is not a supervisee" do
      token_user
      u = User.create
      url = "https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/bacon.mp3"
      post :create, params: {:sound => {'user_id' => u.global_id, 'url' => url, 'content_type' => 'audio/mp3'}}
      assert_unauthorized
    end
  end
  
  describe "upload_success" do
    it "should not require api token" do
      get :upload_success, params: {:sound_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for bad confirmation key" do
      get :upload_success, params: {:sound_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for valid confirmation key but missing from server" do
      token_user
      s = ButtonSound.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      res = OpenStruct.new(:success? => false)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + s.full_filename).and_return(res)
      get :upload_success, params: {:sound_id => s.global_id, :confirmation => s.confirmation_key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'File not found'})
    end
    
    it "should succeed for valid confirmation key that is found on server" do
      token_user
      s = ButtonSound.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + s.full_filename).and_return(res)
      get :upload_success, params: {:sound_id => s.global_id, :confirmation => s.confirmation_key}
      json = JSON.parse(response.body)
      expect(response).to be_successful
      expect(s.reload.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(json).to eq({'confirmed' => true, 'url' => s.url})
    end
  end
  
  describe "show" do
    it "should require api token" do
      get :show, params: {:id => 1}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      get :show, params: {:id => '1234'}
      assert_not_found('1234')
    end
    
    it "should return a found object" do
      token_user
      s = ButtonSound.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      get :show, params: {:id => s.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sound']['id']).to eq(s.global_id)
      expect(json['sound']['content_type']).to eq('audio/mp3')
    end
  end
  
  describe "update" do
    it "should require api token" do
      put :update, params: {:id => "1234"}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      put :update, params: {:id => "1234"}
      assert_not_found('1234')
    end
    
    it "should update an object" do
      token_user
      s = ButtonSound.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      put :update, params: {:id => s.global_id, :sound => {:license => {'type' => 'CC-By'}}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sound']['id']).to eq(s.global_id)
      expect(json['sound']['license']).to eq({'type' => 'CC-By'})
    end
    
    it "should error gracefully on sound update fail" do
      expect_any_instance_of(ButtonSound).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      s = ButtonSound.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      put :update, params: {:id => s.global_id, :sound => {:license => {'type' => 'CC-By'}}}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq("sound update failed")
      expect(json['errors']).to eq(["bacon"])
    end
  end
  
  describe "index" do
    it "should require api token" do
      get 'index'
      assert_missing_token
    end
    
    it "should return a valid user" do
      token_user
      get 'index', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      get 'index', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
    
    it "should return a list of sounds" do
      token_user
      bs = ButtonSound.create(:user => @user)
      get 'index', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sound'].length).to eq(1)
      expect(json['sound'][0]['id']).to eq(bs.global_id)
    end
  end
  
  describe "destroy" do
    it "should require api token" do
      delete :destroy, params: {id: 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid sound" do
      token_user
      delete :destroy, params: {id: 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should return an error" do
      token_user
      s = ButtonSound.create(user: @user)
      delete :destroy, params: {id: s.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sound']['id']).to eq(s.global_id)
    end
  end
  
  describe "import" do
    it "should require api token" do
      post :import, params: {:url => 'http://www.example.com/sound.zip'}
      assert_missing_token
    end
    
    it "should schedule processing for url" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(ButtonSound, :import_for, @user.global_id, 'http://www.example.com/sound.zip').and_return(p)
      post :import, params: {:url => 'http://www.example.com/sound.zip'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).to eq(p.global_id)
    end
    
    it "should return import upload parameters for no url" do
      token_user
      post :import, params: {:type => 'zip'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['remote_upload']).to_not eq(nil)
      expect(json['remote_upload']['upload_url']).to_not eq(nil)
    end
  end
end

require 'spec_helper'

describe Api::ImagesController, :type => :controller do
  describe "create" do
    it "should require api token" do
      post :create, params: {}
      assert_missing_token
    end
    
    env_wrap('UPLOADS_S3_BUCKET' => 'lingolinq-dev-uploads') do
      it "should create an image based on the passer parameters" do
        token_user
        url = "https://lingolinq-dev-uploads.s3.amazonaws.com/bacon.png"
        post :create, params: {:image => {'url' => url, 'content_type' => 'image/png'}}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['image']['id']).not_to eq(nil)
        expect(json['image']['url']).to match(/bacon\.png$/)
        expect(json['meta']).to eq(nil)
      end
    end
    
    it "should return meta (upload information) for pending images" do
      token_user
      url = "https://www.example.com/pic.png"
      post :create, params: {:image => {'url' => url, 'content_type' => 'image/png'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).not_to eq(nil)
      expect(json['image']['pending']).to eq(true)
      expect(json['image']['url']).to eq(nil)
      expect(json['meta']).not_to eq(nil)
    end
    
    it "should error gracefully on image create fail" do
      expect_any_instance_of(ButtonImage).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      url = "https://www.example.com/pic.png"
      post :create, params: {:image => {'url' => url, 'content_type' => 'image/png'}}
      json = JSON.parse(response.body)
      expect(json['error']).to eq("image creation failed")
      expect(json['errors']).to eq(["bacon"])
    end
  end
  
  describe "upload_success" do
    it "should not require api token" do
      get :upload_success, params: {:image_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for bad confirmation key" do
      get :upload_success, params: {:image_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for valid confirmation key but missing from server" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      res = OpenStruct.new(:success? => false)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + s.full_filename).and_return(res)
      get :upload_success, params: {:image_id => s.global_id, :confirmation => s.confirmation_key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'File not found'})
    end
    
    it "should succeed for valid confirmation key that is found on server" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + s.full_filename).and_return(res)
      get :upload_success, params: {:image_id => s.global_id, :confirmation => s.confirmation_key}
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
      assert_not_found
    end
    
    it "should return a found object" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      get :show, params: {:id => s.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).to eq(s.global_id)
      expect(json['image']['content_type']).to eq('audio/mp3')
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
      assert_not_found
    end
    
    it "should update an object" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      put :update, params: {:id => s.global_id, :image => {:license => {'type' => 'CC-By'}}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).to eq(s.global_id)
      expect(json['image']['license']).to eq({'type' => 'CC-By'})
    end
    
    it "should error gracefully on image update fail" do
      expect_any_instance_of(ButtonImage).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      put :update, params: {:id => s.global_id, :image => {:license => {'type' => 'CC-By'}}}
      json = JSON.parse(response.body)
      expect(json['error']).to eq("image update failed")
      expect(json['errors']).to eq(["bacon"])
    end
  end
end

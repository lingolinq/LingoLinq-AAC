require 'spec_helper'

describe RemoteUploader, :type => :controller do
  controller do
    include RemoteUploader
    def index; upload_success; end
  end
  describe "upload_success" do
    it "should not require api token" do
      get :index, params: {:image_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for bad confirmation key" do
      get :index, params: {:image_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for valid confirmation key but missing from server" do
      u = User.create
      s = ButtonImage.create(:user => u, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      res = OpenStruct.new(:success? => false)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + s.full_filename).and_return(res)
      get :index, params: {:image_id => s.global_id, :confirmation => s.confirmation_key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'File not found'})
    end
    
    it "should succeed for valid confirmation key that is found on server" do
      u = User.create
      s = ButtonImage.create(:user => u, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:head).with(config[:upload_url] + s.full_filename).and_return(res)
      get :index, params: {:image_id => s.global_id, :confirmation => s.confirmation_key}
      json = JSON.parse(response.body)
      expect(response).to be_successful
      expect(s.reload.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(json).to eq({'confirmed' => true, 'url' => s.url})
    end
  end
end

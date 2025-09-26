require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "import" do
    it "should require api token" do
      post :import, params: {:url => 'http://www.example.com/file.obf'}
      assert_missing_token
    end
    
    it "should schedule processing for url" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(Board, :import, @user.global_id, 'http://www.example.com/file.obf').and_return(p)
      post :import, params: {:url => 'http://www.example.com/file.obf'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).to eq(p.global_id)
    end
    
    it "should return import upload parameters for no url" do
      token_user
      post :import, params: {:type => 'obf'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['remote_upload']).to_not eq(nil)
      expect(json['remote_upload']['upload_url']).to_not eq(nil)
    end
  end
end
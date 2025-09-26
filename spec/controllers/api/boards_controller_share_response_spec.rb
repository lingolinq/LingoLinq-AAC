require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "share_response" do
    it "should require api token" do
      post :share_response, params: {:board_id => "asdf/asdf"}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post :share_response, params: {:board_id => "asdf/asdf"}
      assert_not_found
    end
    
    it "should require view permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post :share_response, params: {:board_id => b.key}
      assert_unauthorized
    end
    
    it "should approve if specified" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.share_with(@user, true, true)
      Worker.process_queues
      Worker.process_queues
      post :share_response, params: {:board_id => b.key, :approve => 'true'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['approved']).to eq(true)
      expect(json['updated']).to eq(true)
    end
    
    it "should reject if specified" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.share_with(@user, true, true)
      Worker.process_queues
      Worker.process_queues
      post :share_response, params: {:board_id => b.key, :approve => 'false'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['approved']).to eq(false)
      expect(json['updated']).to eq(true)
    end
    
    it "should error if unexpected response" do
      token_user
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :share_response, params: {:board_id => b.key, :approve => 'true'}
      assert_error('board share update failed', 400)
    end
  end
end
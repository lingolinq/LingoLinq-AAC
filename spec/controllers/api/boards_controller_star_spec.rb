require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "star" do
    it "should require api token" do
      post :star, params: {:board_id => "1_1"}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      post :star, params: {:board_id => "1_1"}
      assert_not_found('1_1')
    end
    
    it "should star the board and return a json response" do
      token_user
      b = Board.create(:user => @user)
      post :star, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})
    end
  end
end
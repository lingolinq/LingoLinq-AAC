require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "unstar" do
    it "should require api token" do
      delete :star, params: {:board_id => "1_1"}
      assert_missing_token
    end

    it "should error on not found" do
      token_user
      delete :star, params: {:board_id => "1_1"}
      assert_not_found('1_1')
    end

    it "should unstar the board and return a json response" do
      token_user
      b = Board.create(:user => @user, :settings => {'starred_user_ids' => [@user.global_id]})
      delete :unstar, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq([])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => false, 'stars' => 0, 'user_id' => @user.global_id})
    end

    it "should unstar a starred shallow clone" do
      token_user
      u = User.create
      b = Board.create(:user => u, public: true)
      delete :destroy, params: {:id => "#{b.global_id}-#{@user.global_id}"}

      post :star, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(@user.reload.settings['starred_board_ids']).to eq(nil)
      Worker.process_queues
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      expect(@user.reload.settings['starred_board_ids']).to eq(["#{b.global_id}-#{@user.global_id}"])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})

      delete :unstar, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq([])
      expect(@user.reload.settings['starred_board_ids']).to eq(["#{b.global_id}-#{@user.global_id}"])
      Worker.process_queues
      expect(@user.reload.settings['starred_board_ids']).to eq([])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => false, 'stars' => 0, 'user_id' => @user.global_id})
    end

  end
end
require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "rename" do
    it "should require api token" do
      post :rename, params: {:board_id => "1_1"}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      post :rename, params: {:board_id => "1_19999"}
      assert_not_found
    end

    it "should require edit permissions" do
      u = User.create
      b = Board.create(:user => u)
      token_user
      post :rename, params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should rename the board" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key, :new_key => "#{@user.user_name}/bacon"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'rename' => true, 'key' => "#{@user.user_name}/bacon"})
    end

    it "should require the correct old_key" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key + "asdf", :new_key => "#{@user.user_name}/bacon"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
    end
    
    it "should require a valid new_key" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
    end
    
    it "should report if there was a new_key name collision" do
      token_user
      b = Board.create(:user => @user)
      b2 = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key, :new_key => b2.key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
      expect(json['collision']).to eq(true)
    end
    
    it "should not allow changing the username prefix for the new_key" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key, :new_key => "#{@user.user_name}x/bacon"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
    end
  end
end
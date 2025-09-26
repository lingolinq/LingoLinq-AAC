require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "copies" do
    it "should require api token" do
      get :copies, params: {:board_id => "asdf/asdf"}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      get :copies, params: {:board_id => "asdf/asdf"}
      assert_not_found
    end
    
    it "should require view permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      get :copies, params: {:board_id => b.key}
      assert_unauthorized
    end
    
    it "should return a list of copies for the user" do
      token_user
      b = Board.create(:user => @user)
      b2 = b.copy_for(@user)
      get :copies, params: {:board_id => b.key}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
    end
  end
end
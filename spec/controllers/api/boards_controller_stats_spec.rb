require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "stats" do
    it "should require api token" do
      get :stats, params: {:board_id => '1_1'}
      assert_missing_token
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      get :stats, params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should return basic stats" do
      token_user
      b = Board.new(:user => @user)
      b.settings = {}
      b.settings['stars'] = 4
      b.settings['uses'] = 3
      b.settings['home_uses'] = 4
      b.settings['forks'] = 1
      b.save
      
      get :stats, params: {:board_id => b.global_id}
      expect(response).to be_successful
      hash = JSON.parse(response.body)
      expect(hash['uses']).to eq(4)
    end
  end
end
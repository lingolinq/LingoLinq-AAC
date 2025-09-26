require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "update_privacy" do
    it "should require api token" do
      post 'update_privacy', params: {:board_id => '1_1234'}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post 'update_privacy', params: {:board_id => '1_1234'}
      assert_not_found('1_1234')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post 'update_privacy', params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should schedule an update" do
      token_user
      b = Board.create(:user => @user)
      post 'update_privacy', params: {:board_id => b.global_id, 'privacy' => 'public', 'board_ids_to_update' => []}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(Worker.scheduled_for?('priority', Progress, :perform_action, progress.id)).to eq(true)
      expect(progress.settings['method']).to eq('update_privacy')
    end
  end
end
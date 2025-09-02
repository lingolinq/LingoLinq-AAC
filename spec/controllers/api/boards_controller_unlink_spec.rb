require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "unlink" do
    it "should require api token" do
      post :unlink
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post :unlink, params: {:board_id => 'asdf'}
      assert_not_found
    end
    
    it "should require user edit permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should require delete permission to delete a board" do
      token_user
      u = User.create
      u2 = User.create
      b = Board.create(:user => u2)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'delete'}
      assert_unauthorized
    end
    
    it "should delete a board if allowed" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'delete'}
      expect(response).to be_successful
    end
    
    it "should unstar a board for the specified user" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.star!(u, true)
      expect(b.starred_by?(u)).to eq(true)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'unstar'}
      expect(response).to be_successful
      expect(b.reload.starred_by?(u)).to eq(false)
    end
    
    it "should error on an unrecognized action" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.star!(u, true)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'bacon'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('unrecognized type')
    end
    
    it "should unlink a shared board for the specified user" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.share_with(@user)
      expect(b.shared_with?(@user)).to eq(true)
      post :unlink, params: {:board_id => b.global_id, :user_id => @user.global_id, :type => 'unlink'}
      expect(response).to be_successful
      expect(b.reload.shared_with?(@user.reload)).to eq(false)
    end

    it "should untag a tagged board for the specified user" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      e = UserExtra.create(user: @user)
      e.settings['board_tags'] = {
        'bacon' => [b.global_id],
        'cheddar' => ['a', 'b', b.global_id, 'c']
      }
      e.save
      post :unlink, params: {:board_id => b.global_id, :user_id => @user.global_id, :type => 'untag', :tag => 'bacon'}
      expect(response).to be_successful
      expect(e.reload.settings['board_tags']).to eq({
        'cheddar' => ['a', 'b', b.global_id, 'c']
      })

      post :unlink, params: {:board_id => b.global_id, :user_id => @user.global_id, :type => 'untag', :tag => 'cheddar'}
      expect(response).to be_successful
      expect(e.reload.settings['board_tags']).to eq({
        'cheddar' => ['a', 'b', 'c']
      })

    end
  end
end
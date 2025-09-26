require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "destroy" do
    it "should require api token" do
      delete :destroy, params: {:id => "1_1"}
      assert_missing_token
    end

    it "should error on not found" do
      token_user
      delete :destroy, params: {:id => "1_1"}
      assert_not_found
    end
    
    it "should require permission" do
      u = User.create
      b = Board.create(:user => u)
      token_user
      delete :destroy, params: {:id => b.global_id}
      assert_unauthorized
    end
    
    it "should delete the board and return a json response" do
      token_user
      b = Board.create(:user => @user)
      delete :destroy, params: {:id => b.global_id}
      expect(response).to be_successful
      expect(Board.find_by(:id => b.id)).to eq(nil)
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq(b.global_id)
    end

    it "should not error when deleting a shallow clone" do
      token_user
      user = User.create
      b = Board.create(:user => user, public: true)
      delete :destroy, params: {:id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(Board.find_by(:id => b.id)).to_not eq(nil)
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
    end

    it "should revert to the originals when deleting an edited shallow clone" do
      token_user
      user = User.create
      b = Board.create(:user => user, public: true)
      bb = Board.find_by_global_id("#{b.global_id}-#{@user.global_id}")
      b2 = bb.copy_for(@user)
      b2.settings['name'] = "better board"
      b2.save
      expect(b2.id).to_not eq(b.id)
      delete :destroy, params: {:id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(Board.find_by(:id => b2.id)).to eq(nil)
      expect(Board.find_by(:id => b.id)).to_not eq(nil)
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq(bb.global_id)
      expect(json['board']['name']).to eq("better board")
      expect(json['board']['shallow_clone']).to eq(nil)

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = JSON.parse(response.body)
      expect(json['board']['shallow_clone']).to eq(true)
      expect(json['board']['name']).to eq("Unnamed Board")
      expect(json['board']['id']).to eq(bb.global_id)
    end

    it "should remove a replaced root for a root that was added when a shallow clone was created" do
      u = User.create
      token_user
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      b2.process({'copy_key' => b1.global_id}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(b1.global_id)
      expect(b2.root_board).to eq(b1)
      Worker.process_queues
      bb2 = Board.find_by_global_id("#{b2.global_id}-#{@user.global_id}")
      bb2 = bb2.copy_for(@user, {copy_id: b1.global_id})
      expect(bb2.settings['copy_id']).to eq(b1.global_id)
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue).to_not eq(nil)
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq({'id' => "#{b1.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}\/my:#{b1.key.sub(/\//, ':')}"})
      delete :destroy, params: {id: "#{b1.global_id}-#{@user.global_id}"}
      json = assert_success_json
      ue.reload
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq(nil)
    end
    
    it "should remove replaced_roots reference for an edited shallow clone when deleting" do
      u = User.create
      token_user
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      b2.process({'copy_key' => b1.global_id}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(b1.global_id)
      expect(b2.root_board).to eq(b1)
      Worker.process_queues
      bb1 = Board.find_by_global_id("#{b2.global_id}-#{@user.global_id}")
      bb1 = bb1.copy_for(@user, {copy_id: b1.global_id})
      expect(bb1.settings['copy_id']).to eq(b1.global_id)
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue).to_not eq(nil)
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq({'id' => "#{b1.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}\/my:#{b1.key.sub(/\//, ':')}"})
      delete :destroy, params: {id: "#{b1.global_id}-#{@user.global_id}"}
      json = assert_success_json
      ue.reload
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq(nil)
    end
  end
end
require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "history" do
    it "should require an access token" do
      get :history, params: {:board_id => "asdf/asdf"}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      get :history, params: {:board_id => "asdf/asdf"}
      assert_not_found
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      get :history, params: {:board_id => b.key}
      assert_unauthorized
    end
    
    with_versioning do
      it "should return a list of versions" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => []})
        get :history, params: {:board_id => b.key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to eq(1)
        expect(json['boardversion'][0]['action']).to eq('created')
        expect(json['boardversion'][0]['modifier']['user_name']).to eq(@user.user_name)
      end
    
      it "should return a list of versions for a deleted board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => []})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(1)
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.destroy

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(2)
        
        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to eq(2)
        expect(json['boardversion'][0]['action']).to eq('deleted')
        expect(json['boardversion'][1]['action']).to eq('created')
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
      end
      
      it "should include board copy as a version" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        u = User.create
        b = Board.create(:user => u, :public => true)
        b2 = Board.create(:user => u, :public => true)
        b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
        b.instance_variable_set('@buttons_changed', true)
        b.save
        Worker.process_queues
        new_b = b.reload.copy_for(@user)
        Worker.process_queues
        
        @user.copy_board_links(old_board_id: b.global_id, new_board_id: new_b.global_id, ids_to_copy: [], user_for_paper_trail: "user:#{@user.global_id}")
        Worker.process_queues
        
        new_b.reload
        expect(new_b.settings['downstream_board_ids'].length).to eq(1)
        expect(new_b.settings['downstream_board_ids'][0]).to_not eq(b2.global_id)
        new_b2 = Board.find_by_global_id(new_b.settings['downstream_board_ids'][0])
        expect(new_b2).to_not eq(nil)
        expect(new_b2.parent_board_id).to eq(b2.id)
        
        vs = Board.user_versions(new_b.global_id)
        expect(vs.length).to eq(2)
        vs2 = Board.user_versions(new_b2.global_id)
        expect(vs2.length).to eq(1)
        
        get :history, params: {:board_id => new_b2.key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to eq(1)
        expect(json['boardversion'][0]['action']).to eq('created')
        expect(json['boardversion'][0]['modifier']).not_to eq(nil)
        expect(json['boardversion'][0]['modifier']['user_name']).to eq(@user.user_name)
        
        new_b2.save!
        vs2 = Board.user_versions(new_b2.global_id)
        expect(vs2.length).to eq(2)
        get :history, params: {:board_id => new_b2.key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to eq(2)
        expect(json['boardversion'][0]['action']).to eq('updated')
        expect(json['boardversion'][0]['modifier']).not_to eq(nil)
        expect(json['boardversion'][0]['modifier']['user_name']).to eq(@user.user_name)
        expect(json['boardversion'][1]['action']).to eq('copied')
        expect(json['boardversion'][1]['modifier']).not_to eq(nil)
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
      end
    
      it "should not return a list of versions for a deleted board if not allowed" do
        token_user
        u = User.create
        b = Board.create(:user => u, :settings => {'buttons' => []}, :public => true)
        key = b.key
        b.destroy
        get :history, params: {:board_id => key}
        assert_unauthorized
      end
    end
  end
end
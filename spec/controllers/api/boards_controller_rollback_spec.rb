require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "rollback" do
    it "should require a valid token" do
      post 'rollback', params: {:board_id => '1_123'}
      assert_missing_token
    end

    it "should require a valid board" do
      token_user
      post 'rollback', params: {board_id: '1_123'}
      assert_not_found('1_123')
    end

    it "should allow a valid deleted board" do
      token_user
      b = Board.create(user: @user)
      id = b.global_id
      db = DeletedBoard.create(board: b, user: @user)
      b.destroy
      post 'rollback', params: {board_id: id}
      assert_error('invalid date')
    end

    it "should require a valid date" do
      token_user
      b = Board.create(user: @user)
      post 'rollback', params: {board_id: b.global_id, date: 'abcdefg'}
      assert_error('invalid date')
    end

    it "should require a valid date" do
      token_user
      b = Board.create(user: @user)
      post 'rollback', params: {board_id: b.global_id, date: '2000-01-01'}
      assert_error('only 6 months history allowed')
    end

    it "should require permission to restore a deleted board" do
      token_user
      u = User.create
      b = Board.create(user: u)
      id = b.global_id
      db = DeletedBoard.create(board: b, user: u)
      b.destroy
      post 'rollback', params: {board_id: id, date: Date.today.iso8601}
      assert_unauthorized
    end

    it "should require permission to rollback a board" do
      token_user
      u = User.create
      b = Board.create(user: u)
      id = b.global_id
      post 'rollback', params: {board_id: id, date: Date.today.iso8601}
      assert_unauthorized
    end

    with_versioning do
      it "should roll back for an active board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => [{'id' => 1}, {'id' => 2}]})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(1)
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.settings['buttons'] = [{'id' => 3}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(2)

        b.settings['buttons'] = [{'id' => 5}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(3)

        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to eq(3)
        expect(json['boardversion'][0]['action']).to eq('updated')
        expect(json['boardversion'][1]['action']).to eq('updated')
        expect(json['boardversion'][2]['action']).to eq('created')
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(3)
        dt = 6.weeks.ago
        PaperTrail::Version.where(id: vs[0].id).update_all(created_at: 8.weeks.ago)
        PaperTrail::Version.where(id: vs[1].id).update_all(created_at: dt)
        post 'rollback', params: {board_id: b.global_id, date: 2.weeks.ago.to_date.iso8601}
        json = assert_success_json
        expect(json).to eq({'board_id' => b.global_id, 'key' => b.key, 'restored' => false, 'reverted' => dt.iso8601})
        expect(b.reload.settings['buttons']).to eq([{'id' => 3}])
      end

      it "should roll back for an active board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => [{'id' => 1}, {'id' => 2}]})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(1)
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.settings['buttons'] = [{'id' => 3}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(2)

        b.settings['buttons'] = [{'id' => 5}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(3)

        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to eq(3)
        expect(json['boardversion'][0]['action']).to eq('updated')
        expect(json['boardversion'][1]['action']).to eq('updated')
        expect(json['boardversion'][2]['action']).to eq('created')
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(3)
        dt = 6.weeks.ago
        PaperTrail::Version.where(id: vs[0].id).update_all(created_at: 8.weeks.ago)
        PaperTrail::Version.where(id: vs[1].id).update_all(created_at: dt)
        post 'rollback', params: {board_id: b.global_id, date: 2.weeks.ago.to_date.iso8601}
        json = assert_success_json
        expect(json).to eq({'board_id' => b.global_id, 'key' => b.key, 'restored' => false, 'reverted' => dt.iso8601})
        expect(b.reload.settings['buttons']).to eq([{'id' => 3}])
      end

      it "should roll back for a deleted board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => [{'id' => 1}, {'id' => 2}]})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(1)
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.settings['buttons'] = [{'id' => 3}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(2)

        b.destroy

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(3)

        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to eq(3)
        expect(json['boardversion'][0]['action']).to eq('deleted')
        expect(json['boardversion'][1]['action']).to eq('updated')
        expect(json['boardversion'][2]['action']).to eq('created')
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to eq(3)
        dt = 6.weeks.ago
        PaperTrail::Version.where(id: vs[0].id).update_all(created_at: 8.weeks.ago)
        PaperTrail::Version.where(id: vs[1].id).update_all(created_at: dt)
        post 'rollback', params: {board_id: b.global_id, date: 2.weeks.ago.to_date.iso8601}
        json = assert_success_json
        expect(json).to eq({'board_id' => b.global_id, 'key' => b.key, 'restored' => true, 'reverted' => dt.iso8601})
        expect(b.reload.settings['buttons']).to eq([{'id' => 3}])
      end

    end
  end
end
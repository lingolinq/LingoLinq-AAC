require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "tag" do
    it "should require an api token" do
      post :tag, params: {board_id: 'asdf/asdf'}
      assert_missing_token
    end

    it "should require a valid board" do
      token_user
      post :tag, params: {board_id: 'asdf/asdf'}
      assert_not_found('asdf/asdf')
    end

    it "should require board authorization" do
      token_user
      u = User.create
      b = Board.create(user: u)
      post :tag, params: {board_id: b.global_id}
      assert_unauthorized
    end
    
    it "should not generate a blank tag" do
      token_user
      b = Board.create(user: @user)
      post :tag, params: {board_id: b.global_id, tag: ''}
      json = assert_success_json
      expect(json['tagged']).to eq(false)
      expect(json['board_tags']).to eq(nil)
    end

    it "should generate a tag" do
      token_user
      b = Board.create(user: @user)
      post :tag, params: {board_id: b.global_id, tag: 'bacon'}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['bacon'])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq([b.global_id])
    end

    it "should tag downstream boards as well if specified" do
      token_user
      b = Board.create(user: @user)
      b2 = Board.create(user: @user)
      b3 = Board.create(user: @user)
      b4 = Board.create(user: @user)
      b5 = Board.create(user: @user)
      b6 = Board.create(user: @user)
      b.settings['downstream_board_ids'] = [b2.global_id, b3.global_id, b5.global_id, b6.global_id]
      b.save
      post :tag, params: {board_id: b.global_id, tag: 'bacon', downstream: true}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['bacon'])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq([b.global_id, b2.global_id, b3.global_id, b5.global_id, b6.global_id])
    end

    it "should remove a tag" do
      token_user
      b = Board.create(user: @user)
      post :tag, params: {board_id: b.global_id, tag: 'bacon', remove: true}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq([])

      post :tag, params: {board_id: b.global_id, tag: 'bacon'}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['bacon'])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq([b.global_id])

      post :tag, params: {board_id: b.global_id, tag: 'bacon', remove: true}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq([])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq(nil)
    end

    it "should return a list of tags on success" do
      token_user
      b = Board.create(user: @user)
      e = UserExtra.create(user: @user)
      e.settings['board_tags'] = {'chocolate' => ['a', 'b'], 'alt' => ['cc']}
      e.save
      post :tag, params: {board_id: b.global_id, tag: 'bacon'}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['alt', 'bacon', 'chocolate'])
    end
  end
end
require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "slice_locales" do
    it "should require an api token" do
      post 'slice_locales', params: {board_id: '1_1234'}
      assert_missing_token
    end

    it "should require a valid board" do
      token_user
      post 'slice_locales', params: {board_id: '1_1234'}
      assert_not_found('1_1234')
    end

    it "should require authorization" do
      token_user
      u = User.create
      b = Board.create(user: u)
      post 'slice_locales', params: {board_id: b.global_id}
      assert_unauthorized
    end

    it "should schedule a slice with the correct parameters" do
      token_user
      b = Board.create(user: @user)
      post 'slice_locales', params: {board_id: b.global_id, 'ids_to_update' => ['a', 'b']}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
      p = Progress.find_by_path(json['progress']['id'])
      expect(p.settings['class']).to eq('Board')
      expect(p.settings['method']).to eq('slice_locales')
      expect(p.settings['id']).to eq(b.id)
      expect(p.settings['arguments']).to eq([nil, ['a', 'b'], @user.global_id])
    end

    it "should return a progress record" do
      token_user
      b = Board.create(user: @user)
      post 'slice_locales', params: {board_id: b.global_id, 'ids_to_update' => ['a', 'b']}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
      p = Progress.find_by_path(json['progress']['id'])
      expect(p.settings['class']).to eq('Board')
      expect(p.settings['method']).to eq('slice_locales')
      expect(p.settings['id']).to eq(b.id)
      expect(p.settings['arguments']).to eq([nil, ['a', 'b'], @user.global_id])
    end
  end
end
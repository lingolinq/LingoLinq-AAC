require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "download" do
    it "should not error on not found" do
      post :download, params: {:board_id => "1_19999"}
      assert_not_found
    end

    it "should not require api token" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :download, params: {:board_id => b.global_id}
      expect(response).to be_successful
    end
    
    it "should require permission" do
      u = User.create
      b = Board.create(:user => u)
      post :download, params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should allow unauthenticated user to download if public"
    
    it "should return a progress record" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :download, params: {:board_id => b.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
    end

    it "should schedule the correct parameters" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :download, params: {:board_id => b.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('Board')
      expect(progress.settings['id']).to eq(b.id)
      expect(progress.settings['method']).to eq('generate_download')
      expect(progress.settings['arguments']).to eq([nil, nil, {
        'include' => nil, 
        'headerless' => false, 
        'text_on_top' => false, 
        'transparent_background' => false,
        'symbol_background' => nil,
        'text_only' => false,
        'text_case' => nil,
        'font' => nil
      }])

      token_user
      post :download, params: {:board_id => b.global_id, 'type' => 'bacon', 'include' => 'something', 'headerless' => '1', 'text_on_top' => '0', 'transparent_background' => '1', 'text_only' => '1', 'text_case' => 'lower', 'font' => 'cheddar'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('Board')
      expect(progress.settings['id']).to eq(b.id)
      expect(progress.settings['method']).to eq('generate_download')
      expect(progress.settings['arguments']).to eq([@user.global_id, 'bacon', {
        'include' => 'something', 
        'headerless' => true, 
        'text_on_top' => false, 
        'transparent_background' => true,
        'symbol_background' => nil,
        'text_only' => true,
        'text_case' => 'lower',
        'font' => 'cheddar'
      }])
    end
  end
end
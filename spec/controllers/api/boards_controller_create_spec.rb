require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "create" do
    it "should require api token" do
      post :create
      assert_missing_token
    end
    
    it "should create a new board" do
      token_user
      post :create, params: {:board => {:name => "my board"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('my board')
    end
    
    it "should error gracefully on board creation fail" do
      expect_any_instance_of(Board).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      post :create, params: {:board => {:name => "my board"}}
      json = JSON.parse(response.body)
      expect(json['error']).to eq("board creation failed")
      expect(json['errors']).to eq(["bacon"])
    end
    
    it "should allow creating a board for a supervisee" do
      token_user
      com = User.create
      User.link_supervisor_to_user(@user, com, nil, true)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('my board')
      expect(json['board']['user_name']).to eq(com.user_name)
    end
    
    it "should not allow creating a board from a protected board" do
      token_user
      com = User.create
      bb = Board.create(user: @user)
      bb.settings['protected'] = {'vocabulary' => true}
      bb.save
      b = Board.create(user: @user, parent_board: bb)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      User.link_supervisor_to_user(@user, com, nil, true)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id, :parent_board_id => b.global_id}}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['errors']).to eq(["cannot copy protected boards"])
    end

    it "should allow creating a board for a supervisee from a protected board" do
      token_user
      b = Board.create(user: @user)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      com = User.create
      User.link_supervisor_to_user(@user, com, nil, true)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id, :parent_board_id => b.global_id}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('my board')
      expect(json['board']['user_name']).to eq(com.user_name)
    end

    it "should allow links if the author can access the links but not the supervisee" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      b = Board.create(:user => @user)
      post :create, params: {:board => {:name => "copy", :for_user_id => u.global_id, :buttons => [{'id' => '1', 'load_board' => {'id' => b.global_id}, 'label' => 'farce'}]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to_not eq(nil)
      Worker.process_queues
      b2 = Board.find_by_path(json['board']['id'])
      expect(b2).to_not eq(b)
      expect(b2.settings['downstream_board_ids']).to eq([b.global_id])
    end

    it "should allow links if the supervisee can access the links but not the author" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      b = Board.create(:user => u)
      post :create, params: {:board => {:name => "copy", :for_user_id => u.global_id, :buttons => [{'id' => '1', 'load_board' => {'id' => b.global_id}, 'label' => 'farce'}]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to_not eq(nil)
      Worker.process_queues
      b2 = Board.find_by_path(json['board']['id'])
      expect(b2).to_not eq(b)
      expect(b2.settings['downstream_board_ids']).to eq([b.global_id])
    end
    
    it "should not allow links if the supervisee can access the links but not the author" do
      token_user
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      b = Board.create(:user => u2)
      post :create, params: {:board => {:name => "copy", :for_user_id => u.global_id, :buttons => [{'id' => '1', 'load_board' => {'id' => b.global_id}, 'label' => 'farce'}]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to_not eq(nil)
      Worker.process_queues
      b2 = Board.find_by_path(json['board']['id'])
      expect(b2).to_not eq(b)
      expect(b2.downstream_board_ids).to eq([])
    end
    
    it "should not allow creating a board for a random someone else" do
      token_user
      com = User.create
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id}}
      assert_unauthorized
    end
    
    it "should not allow creating a board for a supervisee if you don't have edit privileges" do
      token_user
      com = User.create
      User.link_supervisor_to_user(@user, com, nil, false)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id}}
      assert_unauthorized
    end

    it "should preserve grid order" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, params: {}, body: 
      {
        :board => {
          :name => "cool board 2",
          :buttons => [{'id' => '1', 'label' => 'can'}, {'id' => '2', 'label' => 'span'}],
          :grid => {
            'rows' => 1, 'columns' => 3,
            'order' => [[1, nil, 2]]
          }
        }
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq("cool board 2")
      expect(json['board']['grid']['order']).to eq([[1, nil, 2]])
    end
  end
end

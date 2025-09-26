require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "show" do
    it "should not require api token" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      get :show, params: {:id => b.global_id}
      expect(response).to be_successful
    end
    
    it "should require existing object" do
      u = User.create
      b = Board.create(:user => u)
      get :show, params: {:id => '1_19999'}
      assert_not_found
    end

    it "should require authorization" do
      u = User.create
      b = Board.create(:user => u)
      get :show, params: {:id => b.global_id}
      assert_unauthorized
    end
    
    it "should return a json response" do
      token_user
      b = Board.create(:user => @user)
      get :show, params: {:id => b.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq(b.global_id)
    end
    
    it "should return deleted status if the information is allowed" do
      token_user
      b = Board.create(:user => @user)
      key = b.key
      b.destroy
      Worker.process_queues
      get :show, params: {:id => key}
      assert_not_found(key)
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(true)
    end
    
    it "should not return deleted status for non-existent boards" do
      token_user
      Worker.process_queues
      get :show, params: {:id => "#{@user.user_name}/not-a-board"}
      assert_not_found("#{@user.user_name}/not-a-board")
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
    end

    it "should return deleted status if the information is allowed when searching by id" do
      token_user
      b = Board.create(:user => @user)
      key = b.global_id
      b.destroy
      Worker.process_queues
      get :show, params: {:id => key}
      assert_not_found(key)
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(true)
    end
    
    it "should not return deleted status if not allowed" do
      token_user
      u = User.create
      b = Board.create(:user => u, :public => true)
      key = b.key
      b.destroy
      Worker.process_queues
      get :show, params: {:id => key}
      assert_not_found
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
    end
    
    it "should return never_existed status if allowed" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get :show, params: {:id => "#{u.user_name}/bacon"}
      assert_not_found("#{u.user_name}/bacon")
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
      expect(json['never_existed']).to eq(true)
    end
    
    it "should not return never_existed status if not allowed" do
      token_user
      u = User.create
      get :show, params: {:id => "#{u.user_name}/bacon"}
      assert_not_found
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
      expect(json['never_existed']).to eq(nil)
    end

    it "should return a shallow clone if specified" do
      u = User.create
      b = Board.create(user: u, public: true)
      b.settings['name'] = 'a'
      b.save
      token_user
      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")
    end

    it "should not allow access to an unauthorized shallow clone" do
      u = User.create
      b = Board.create(user: u)
      token_user
      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      assert_unauthorized
      
      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      assert_unauthorized
    end

    it "should retrieve an updated shallow clone if edited" do
      u = User.create
      b = Board.create(user: u)
      b.settings['name'] = 'a'
      b.save
      token_user
      bb = Board.find_by_path("#{b.global_id}-#{@user.global_id}")
      b2 = bb.copy_for(@user)
      b2.settings['name'] = 'b'
      b2.save

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")
    end

    it "should retrieve the original shallow clone if the updated clone is deleted" do
      u = User.create
      b = Board.create(user: u, public: true)
      b.settings['name'] = 'a'
      b.save
      token_user
      bb = Board.find_by_path("#{b.global_id}-#{@user.global_id}")
      b2 = bb.copy_for(@user)
      b2.settings['name'] = 'b'
      b2.save

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")

      b2.destroy
      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")
    end
  end
end

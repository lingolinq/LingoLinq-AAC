require 'spec_helper'

describe Api::SnapshotsController, :type => :controller do
  describe "index" do
    it "should require an api token" do
      get :index
      assert_missing_token
    end
    
    it "should require an existing user" do
      token_user
      get :index, params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      get :index, params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list" do
      token_user
      s1 = LogSnapshot.create(:user => @user)
      s2 = LogSnapshot.create(:user => @user)
      get :index, params: {:user_id => @user.global_id}
      expect(response).to be_successful
      res = JSON.parse(response.body)
      expect(res['snapshot']).to_not eq(nil)
      expect(res['snapshot'].length).to eq(2)
      expect(res['meta']['more']).to eq(false)
    end
  end

  describe "create" do
    it "should require an api token" do
      post :create
      assert_missing_token
    end
    
    it "should require an existing org" do
      token_user
      post :create, params: {:snapshot => {'user_id' => 'asdf'}}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      post :create, params: {:snapshot => {'user_id' => u.global_id}}
      assert_unauthorized
    end
    
    it "should create the unit and return the result" do
      token_user
      post :create, params: {:snapshot => {'user_id' => @user.global_id, 'name' => 'Cool Snapshot', 'device_id' => 'asdf', 'bacon' => 'none'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['snapshot']['name']).to eq('Cool Snapshot')
      expect(json['snapshot']['device_id']).to eq('asdf')
      expect(json['snapshot']['bacon']).to eq(nil)
    end
  end

  describe "show" do
    it "should require an api token" do
      get :show, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require an existing record" do
      token_user
      get :show, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      s = LogSnapshot.create(:user => u)
      get :show, params: {:id => s.global_id}
      assert_unauthorized
    end
    
    it "should return the result" do
      token_user
      s = LogSnapshot.create(:user => @user)
      get :show, params: {:id => s.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['snapshot']['id']).to eq(s.global_id)
    end
  end
  
  describe "update" do
    it "should require an api token" do
      put :update, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require an existing record" do
      token_user
      put :update, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      s = LogSnapshot.create(:user => u)
      put :update, params: {:id => s.global_id}
      assert_unauthorized
    end
    
    it "should update the record and return the result" do
      token_user
      s = LogSnapshot.create(:user => @user)
      put :update, params: {:id => s.global_id, :snapshot => {'name' => 'Better Snapshot'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['snapshot']['id']).to eq(s.global_id)
      expect(json['snapshot']['name']).to eq('Better Snapshot')
    end
  end

  describe "destroy" do
    it "should require an api token" do
      delete :destroy, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require an existing record" do
      token_user
      delete :destroy, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      s = LogSnapshot.create(:user => u)
      delete :destroy, params: {:id => s.global_id}
      assert_unauthorized
    end
    
    it "should delete the record and return the result" do
      token_user
      s = LogSnapshot.create(:user => @user)
      delete :destroy, params: {:id => s.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['snapshot']['id']).to eq(s.global_id)
      expect(LogSnapshot.find_by_global_id(s.global_id)).to eq(nil)
    end
  end
end

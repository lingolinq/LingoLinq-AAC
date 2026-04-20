require 'spec_helper'

describe Api::OrganizationsController, :type => :controller do
  describe "index" do
    it "should require api token" do
      get :index
      assert_missing_token
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      token_user
      get :index
      assert_unauthorized
    end
    
    it "should return unauthorized for a non-admin manager" do
      o = Organization.create
      token_user
      o.add_manager(@user.user_name, true)
      
      get :index
      assert_unauthorized
    end
    
    it "should return a list of organizations for an admin manager" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      
      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization'].length).to eq(1)
      expect(json['organization'][0]['id']).to eq(o.global_id)
    end
    
    
    it "should return a list of organizations for an admin assistant" do
      o = Organization.create(:admin => true)
      o2 = Organization.create
      token_user
      o.add_manager(@user.user_name, false)
      
      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization'].length).to eq(2)
      expect(json['organization'][0]['id']).to eq(o2.global_id)
      expect(json['organization'][1]['id']).to eq(o.global_id)
    end
    
    it "should return a paginated list of results" do
      o = Organization.create(:admin => true)
      30.times do
        Organization.create
      end
      token_user
      o.add_manager(@user.user_name, true)
      
      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization'].length).to eq(15)
      expect(json['meta']['offset']).to eq(0)
      expect(json['meta']['more']).to eq(true)
    end
  end
  
  describe "update" do
    it "should require api token" do
      put :update, params: {:id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      put :update, params: {:id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      put :update, params: {:id => o.global_id}
      assert_unauthorized
    end
    
    it "should correctly update an organization" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      put :update, params: {:id => o.global_id, :organization => {:name => "my cool org"}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization']['id']).to eq(o.global_id)
      expect(json['organization']['name']).to eq('my cool org')
    end

    it "should update name when parent_org is a partial hash without id (must not clear parent)" do
      token_user
      admin_o = Organization.create(:admin => true)
      admin_o.add_manager(@user.user_name, true)
      parent = Organization.create
      child = Organization.create
      child.parent_organization_id = parent.id
      child.save!
      child.add_manager(@user.user_name)
      expect(child.parent_organization_id).to eq(parent.id)
      put :update, params: {:id => child.global_id, :organization => {:name => "renamed child", :parent_org => {"name" => "Loading...", "pending" => true}}}
      expect(response.successful?).to eq(true)
      child.reload
      expect(child.parent_organization_id).to eq(parent.id)
      expect(child.settings['name']).to eq("renamed child")
    end

    it "should clear parent when parent_org id is explicitly blank" do
      token_user
      admin_o = Organization.create(:admin => true)
      admin_o.add_manager(@user.user_name, true)
      parent = Organization.create
      child = Organization.create
      child.parent_organization_id = parent.id
      child.save!
      child.add_manager(@user.user_name)
      put :update, params: {:id => child.global_id, :organization => {:parent_org => {"id" => ""}}}
      expect(response.successful?).to eq(true)
      child.reload
      expect(child.parent_organization_id).to eq(nil)
    end
    
    it "should not allow updating license count unless authorized" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      put :update, params: {:id => o.global_id, :organization => {:allotted_licenses => "7"}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization']['id']).to eq(o.global_id)
      expect(json['organization']['allotted_licenses']).to eq(0)
    end
    
    it "should not allow updating license expiration unless authorized" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      put :update, params: {:id => o.global_id, :organization => {:licenses_expire => '2020-01-01'}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization']['id']).to eq(o.global_id)
      expect(json['organization']['licenses_expire']).to eq(nil)
    end
    
    it "should allow updating license count if authorized" do
      token_user
      o = Organization.create(:admin => true)
      Organization.admin.add_manager(@user.user_name, true)
      put :update, params: {:id => o.global_id, :organization => {:allotted_licenses => "7"}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization']['id']).to eq(o.global_id)
      expect(json['organization']['allotted_licenses']).to eq(7)
    end
    
    it "should allow updating license count if authorized" do
      token_user
      o = Organization.create(:admin => true)
      Organization.admin.add_manager(@user.user_name, true)
      put :update, params: {:id => o.global_id, :organization => {:licenses_expire => "2020-01-01"}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization']['id']).to eq(o.global_id)
      expect(json['organization']['licenses_expire']).to eq(Time.parse("2020-01-01").iso8601)
    end
    
    describe "managing managers" do
      it "should allow adding a new manager" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        u = User.create
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_manager-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        expect(o.managed_user?(u.reload)).to eq(false)
        expect(o.manager?(u.reload)).to eq(true)
        expect(o.assistant?(u.reload)).to eq(true)
      end
      
      it "should allow adding a new assistant" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        u = User.create
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_assistant-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        expect(o.managed_user?(u.reload)).to eq(false)
        expect(o.assistant?(u.reload)).to eq(true)
        expect(o.manager?(u.reload)).to eq(false)
      end
      
      it "should fail gracefully when failing to add a manager" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_manager-bob"}}
        expect(response.successful?).to eq(false)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('organization update failed')
        expect(json['errors']).to eq(['user management action failed: invalid user, bob'])
      end

      it "should allow removing a manager" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        u = User.create
        o.add_manager(u.user_name, true)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "remove_manager-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        expect(o.managed_user?(u.reload)).to eq(false)
        expect(o.assistant?(u.reload)).to eq(false)
        expect(o.manager?(u.reload)).to eq(false)
      end
      
      it "should allow removing an assistant" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        u = User.create
        o.add_manager(u.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "remove_assistant-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        expect(o.managed_user?(u.reload)).to eq(false)
        expect(o.assistant?(u.reload)).to eq(false)
        expect(o.manager?(u.reload)).to eq(false)
      end
      
      it "should fail gracefully when removing an assistant" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "remove_manager-bob"}}
        expect(response.successful?).to eq(false)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('organization update failed')
        expect(json['errors']).to eq(['user management action failed: invalid user, bob'])
      end
    end
    
    describe "managing supervisors" do
      it "should allow adding a new supervisor" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        u = User.create
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_supervisor-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        expect(o.managed_user?(u.reload)).to eq(false)
        expect(o.supervisor?(u.reload)).to eq(true)
      end
      
      it "should fail gracefully when failing to add a supervisor" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_supervisor-bob"}}
        expect(response.successful?).to eq(false)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('organization update failed')
        expect(json['errors']).to eq(['user management action failed: invalid user, bob'])
      end

      it "should allow removing a supervisor" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        u = User.create
        o.add_supervisor(u.user_name, true)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "remove_supervisor-#{u.user_name}"}}
        o.reload
        expect(response.successful?).to eq(true)
        expect(o.managed_user?(u.reload)).to eq(false)
        expect(o.manager?(u.reload)).to eq(false)
        expect(o.supervisor?(u.reload)).to eq(false)
      end
      
      it "should fail gracefully when removing a supervisor" do
        token_user
        o = Organization.create
        o.add_manager(@user.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "remove_supervisor-bob"}}
        expect(response.successful?).to eq(false)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('organization update failed')
        expect(json['errors']).to eq(['user management action failed: invalid user, bob'])
      end
    end

    describe "managing users" do
      it "should allow adding a new user" do
        token_user
        o = Organization.create(:settings => {'total_licenses' => 1})
        o.add_manager(@user.user_name)
        u = User.create
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_user-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        json = JSON.parse(response.body)
        expect(o.managed_user?(u.reload)).to eq(true)
        expect(o.sponsored_user?(u.reload)).to eq(true)
        expect(o.pending_user?(u.reload)).to eq(true)
        expect(o.assistant?(u.reload)).to eq(false)
        expect(o.manager?(u.reload)).to eq(false)
      end
      
      it "should allow adding a new unsponsored user" do
        token_user
        o = Organization.create(:settings => {'total_licenses' => 1})
        o.add_manager(@user.user_name)
        u = User.create
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_unsponsored_user-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        json = JSON.parse(response.body)
        expect(o.managed_user?(u.reload)).to eq(true)
        expect(o.sponsored_user?(u.reload)).to eq(false)
        expect(o.assistant?(u.reload)).to eq(false)
        expect(o.manager?(u.reload)).to eq(false)
      end
      
      it "should fail gracefully when failing to add a user" do
        token_user
        o = Organization.create(:settings => {'total_licenses' => 1})
        o.add_manager(@user.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_user-bob"}}
        expect(response.successful?).to eq(false)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('organization update failed')
        expect(json['errors']).to eq(['user management action failed: invalid user, bob'])
      end
      
      it "should fail gracefully when no available license for new user" do
        token_user
        u = User.create
        o = Organization.create(:settings => {'total_licenses' => 0})
        o.add_manager(@user.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "add_user-#{u.user_name}"}}
        expect(response.successful?).to eq(false)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('organization update failed')
        expect(json['errors']).to eq(['user management action failed: no licenses available'])
      end
      
      it "should allow removing a user" do
        token_user
        o = Organization.create(:settings => {'total_licenses' => 1})
        o.add_manager(@user.user_name)
        u = User.create
        o.add_user(u.user_name, false)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "remove_user-#{u.user_name}"}}
        expect(response.successful?).to eq(true)
        json = JSON.parse(response.body)
        expect(o.managed_user?(u.reload)).to eq(false)
        expect(o.assistant?(u.reload)).to eq(false)
        expect(o.manager?(u.reload)).to eq(false)
      end
      
      it "should fail greacfully when railing to remove a user" do
        token_user
        o = Organization.create(:settings => {'total_licenses' => 1})
        o.add_manager(@user.user_name)
        put :update, params: {:id => o.global_id, :organization => {:management_action => "remove_user-bob"}}
        expect(response.successful?).to eq(false)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('organization update failed')
        expect(json['errors']).to eq(['user management action failed: invalid user, bob'])
      end
    end
  end
  
  describe "create" do
    it "should require api token" do
      post :create, params: {:organization => {:name => "bob"}}
      assert_missing_token
    end
    
    it "should require authorization" do
      token_user
      post :create, params: {:organization => {:name => "bob"}}
      assert_unauthorized
    end
    
    it "should properly create an org" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      post :create, params: {:organization => {:name => "bob"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['organization']).not_to eq(nil)
      expect(json['organization']['name']).to eq("bob")
    end
  end
  
  describe "destroy" do
    it "should require api token" do
      delete :destroy, params: {:id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      delete :destroy, params: {:id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized without permissions allowed" do
      o = Organization.create
      token_user
      delete :destroy, params: {:id => o.global_id}
      assert_unauthorized
      
      o.add_manager(@user.user_name, true)
      delete :destroy, params: {:id => o.global_id}
      assert_unauthorized
    end
    
    it "should properly delete an org" do
      o = Organization.create(:admin => true)
      o2 = Organization.create
      token_user
      o.add_manager(@user.user_name, true)
      
      delete :destroy, params: {:id => o2.global_id}
      expect(response).to be_successful
    end

    it "should not let anyone delete the admin org" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      
      delete :destroy, params: {:id => o.global_id}
      assert_unauthorized
    end
  end
  
  describe "show" do
    it "should require api token" do
      get :show, params: {:id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      get :show, params: {:id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      get :show, params: {:id => o.global_id}
      assert_unauthorized
    end
    
    it "should return organization details" do
      o = Organization.create
      token_user
      o.add_manager(@user.user_name, false)
      get :show, params: {:id => o.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['organization']['id']).to eq(o.global_id)
    end
  end
  
  describe "users" do
    it "should require api token" do
      get :users, params: {:organization_id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      get :users, params: {:organization_id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      get :users, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list of users if authorized" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      30.times do |i|
        u = User.create
        o.add_user(u.user_name, false)
      end
      
      get :users, params: {:organization_id => o.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['meta']).not_to eq(nil)
      expect(json['user'].length).to eq(25)
      expect(json['meta']['next_url']).to eq("#{JsonApi::Json.current_host}/api/v1/organizations/#{o.global_id}/users?offset=#{JsonApi::User::DEFAULT_PAGE}&per_page=#{JsonApi::User::DEFAULT_PAGE}")
    end

    it "should filter users by filter param (user_name ILIKE)" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      u1 = User.create(user_name: 'alice_smith')
      u2 = User.create(user_name: 'bob_jones')
      u3 = User.create(user_name: 'alice_brown')
      [u1, u2, u3].each { |u| o.add_user(u.user_name, false) }

      get :users, params: {:organization_id => o.global_id, :filter => 'alice'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user'].length).to eq(2)
      expect(json['user'].map { |u| u['user_name'] }.sort).to eq(['alice_brown', 'alice_smith'])
    end

    it "should filter users by q param (alias for filter)" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      u1 = User.create(user_name: 'xavier_user')
      u2 = User.create(user_name: 'other_user')
      [u1, u2].each { |u| o.add_user(u.user_name, false) }

      get :users, params: {:organization_id => o.global_id, :q => 'xavier'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user'].length).to eq(1)
      expect(json['user'][0]['user_name']).to eq('xavier_user')
    end

    it "should sort users by user_name with sort_order asc" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      u1 = User.create(user_name: 'zebra_user')
      u2 = User.create(user_name: 'alpha_user')
      u3 = User.create(user_name: 'middle_user')
      [u1, u2, u3].each { |u| o.add_user(u.user_name, false) }

      get :users, params: {:organization_id => o.global_id, :sort_by => 'user_name', :sort_order => 'asc'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      names = json['user'].map { |u| u['user_name'] }
      expect(names).to eq(names.sort)
      expect(names.first).to eq('alpha_user')
    end

    it "should sort users by user_name with sort_order desc" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      u1 = User.create(user_name: 'alpha_user')
      u2 = User.create(user_name: 'zebra_user')
      [u1, u2].each { |u| o.add_user(u.user_name, false) }

      get :users, params: {:organization_id => o.global_id, :sort_by => 'user_name', :sort_order => 'desc'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      names = json['user'].map { |u| u['user_name'] }
      expect(names).to eq(names.sort.reverse)
      expect(names.first).to eq('zebra_user')
    end

    it "should sort users by joined (created_at) with sort_order asc" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      u1 = User.create(user_name: 'first_joined')
      u2 = User.create(user_name: 'second_joined')
      u3 = User.create(user_name: 'third_joined')
      [u1, u2, u3].each { |u| o.add_user(u.user_name, false) }

      get :users, params: {:organization_id => o.global_id, :sort_by => 'joined', :sort_order => 'asc'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      ids = json['user'].map { |u| u['id'] }
      expect(ids).to eq([u1.global_id, u2.global_id, u3.global_id])
    end

    it "should sort users by joined (created_at) with sort_order desc" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      u1 = User.create(user_name: 'first_joined')
      u2 = User.create(user_name: 'second_joined')
      u3 = User.create(user_name: 'third_joined')
      [u1, u2, u3].each { |u| o.add_user(u.user_name, false) }

      get :users, params: {:organization_id => o.global_id, :sort_by => 'joined', :sort_order => 'desc'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      ids = json['user'].map { |u| u['id'] }
      expect(ids).to eq([u3.global_id, u2.global_id, u1.global_id])
    end

    it "should order by id desc when recent param is present" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      u1 = User.create(user_name: 'oldest_user')
      u2 = User.create(user_name: 'newest_user')
      [u1, u2].each { |u| o.add_user(u.user_name, false) }

      get :users, params: {:organization_id => o.global_id, :recent => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      ids = json['user'].map { |u| u['id'] }
      expect(ids.first).to eq(u2.global_id)
    end

    it "should respect offset and per_page for paging" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      10.times do |i|
        u = User.create
        o.add_user(u.user_name, false)
      end

      get :users, params: {:organization_id => o.global_id, :offset => 2, :per_page => 3}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user'].length).to eq(3)
      expect(json['meta']['offset']).to eq(2)
      expect(json['meta']['per_page']).to eq(3)
      expect(json['meta']['next_offset']).to eq(5)
    end
  end
  
  describe "managers" do
    it "should require api token" do
      get :managers, params: {:organization_id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      get :managers, params: {:organization_id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      get :managers, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list of managers if authorized" do
      o = Organization.create
      token_user
      u = User.create
      o.add_manager(@user.user_name, true)
      o.add_manager(u.user_name, false)
      
      get :managers, params: {:organization_id => o.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['meta']).not_to eq(nil)
      expect(json['user'].length).to eq(2)
      expect(json['user'][1]['id']).to eq(u.global_id)
      expect(json['user'][1]['org_manager']).to eq(false)
      expect(json['user'][1]['org_assistant']).to eq(true)
      expect(json['user'][0]['id']).to eq(@user.global_id)
      expect(json['user'][0]['org_manager']).to eq(true)
      expect(json['user'][0]['org_assistant']).to eq(true)
    end
  end

  describe "supervisors" do
    it "should require api token" do
      get :supervisors, params: {:organization_id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      get :supervisors, params: {:organization_id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      get :supervisors, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list of supervisors if authorized" do
      o = Organization.create
      token_user
      u = User.create
      u2 = User.create
      o.add_manager(@user.user_name, true)
      o.add_supervisor(u.user_name, false)
      o.add_supervisor(u2.user_name, true)
      
      get :supervisors, params: {:organization_id => o.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['meta']).not_to eq(nil)
      expect(json['user'].length).to eq(2)
      expect(json['user'][0]['id']).to eq(u.global_id)
      expect(json['user'][0]['org_manager']).to eq(nil)
      expect(json['user'][0]['org_assistant']).to eq(nil)
      expect(json['user'][0]['org_supervision_pending']).to eq(false)      
      expect(json['user'][1]['id']).to eq(u2.global_id)
      expect(json['user'][1]['org_manager']).to eq(nil)
      expect(json['user'][1]['org_assistant']).to eq(nil)
      expect(json['user'][1]['org_supervision_pending']).to eq(true)      
    end
  end
  
  describe "logs" do
    it "should require api token" do
      get :logs, params: {:organization_id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      get :logs, params: {:organization_id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      get :logs, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return unauthorized for assistants" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      token_user
      u = User.create
      o.add_manager(@user.user_name)
      o.add_user(u.user_name, false)
      
      get :logs, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list of logs if authorized" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      token_user
      o.add_manager(@user.user_name, true)
      15.times do |i|
        u = User.create
        o.add_user(u.user_name, false)
        d = Device.create(:user => u)
        LogSession.process_new({
          :events => [
            {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
            {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
          ]
        }, {:user => u, :device => d, :author => u})
      end
      
      get :logs, params: {:organization_id => o.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['meta']).not_to eq(nil)
      expect(json['log'].length).to eq(10)
      expect(json['meta']['next_url']).to eq("#{JsonApi::Json.current_host}/api/v1/organizations/#{o.global_id}/logs?offset=#{JsonApi::Log::DEFAULT_PAGE}&per_page=#{JsonApi::Log::DEFAULT_PAGE}")
    end
  end
  
  describe "stats" do
    it "should require api token" do
      get :stats, params: {:organization_id => '1_1234'}
      assert_missing_token
    end
    
    it "should return not found unless org exists" do
      token_user
      get :stats, params: {:organization_id => '1_1234'}
      assert_not_found("1_1234")
    end
    
    it "should return unauthorized unless permissions allowed" do
      token_user
      o = Organization.create
      get :stats, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return expected stats" do
      token_user
      user = User.create
      d = Device.create(:user => user)
      o = Organization.create
      o.add_manager(@user.user_name, false)
      o.add_user(user.user_name, true, false)
      expect(o.reload.approved_users.length).to eq(0)
      get :stats, params: {:organization_id => o.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => user, :device => d, :author => user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 4.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => user, :device => d, :author => user})
      Worker.process_queues
      get :stats, params: {:organization_id => o.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      o.add_user(user.user_name, false, false)
      expect(o.reload.approved_users.length).to eq(1)
      get :stats, params: {:organization_id => o.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)['weeks']
      expect(json.length).to eq(2)
      expect(json[0]['sessions']).to eq(1)
      expect(json[0]['timestamp']).to be > 0
      expect(json[1]['sessions']).to eq(1)
      expect(json[1]['timestamp']).to be > 0
    end
    
    it "should include goal stats" do
      token_user
      user = User.create
      user.settings['primary_goal'] = {
        'id' => 'asdf',
        'last_tracked' => Time.now.iso8601
      }
      user.save
      d = Device.create(:user => user)
      o = Organization.create
      o.add_manager(@user.user_name, false)
      o.add_user(user.user_name, true, false)
      expect(o.reload.approved_users.length).to eq(0)
      get :stats, params: {:organization_id => o.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      get :stats, params: {:organization_id => o.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_counts']).to eq({
        'goal_set' => 0,
        'goal_recently_logged' => 0, 
        'recent_session_count' => 0, 
        'recent_session_user_count' => 0, 
        'recent_session_seconds' => 0.0,
        "modeled_word_counts" => [],
        "total_models" => 0,
        "total_seconds" => 0,
        "total_sessions" => 0,
        "total_user_weeks" => 0,
        "total_words" => 0,
        "word_counts" => [],
        'recent_session_hours' => 0.0,
        'total_users' => 0
      })
      
      o.add_user(user.user_name, false, false)
      expect(o.reload.approved_users.length).to eq(1)
      get :stats, params: {:organization_id => o.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_counts']).to eq({
        'goal_set' => 1,
        'goal_recently_logged' => 1, 
        'recent_session_count' => 0, 
        'recent_session_user_count' => 0,
        'recent_session_seconds' => 0.0,
        "modeled_word_counts" => [],
        "total_models" => 0,
        "total_seconds" => 0,
        "total_sessions" => 0,
        "total_user_weeks" => 0,
        "total_words" => 0,
        "word_counts" => [],
        'recent_session_hours' => 0.0,
        'total_users' => 1
      })
    end
  end
  
  describe "admin_reports" do
    it "should require api token" do
      get :admin_reports, params: {:organization_id => '1_1234'}
      assert_missing_token
    end
    
    it "should return not found unless org exists" do
      token_user
      get :admin_reports, params: {:organization_id => '1_1234'}
      assert_not_found("1_1234")
    end
    
    it "should return unauthorized unless permissions allowed" do
      token_user
      o = Organization.create
      get :admin_reports, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should require a report parameter" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('report parameter required')
    end
    
    it "should error on an unrecognized report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "good bacon"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('unrecognized report: good bacon')
    end
    
    it "should generate a report for premium_voices" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      ae1 = AuditEvent.create(:event_type => 'voice_added', :data => {'voice_id' => 'asd', 'system' => 'Android'})
      ae2 = AuditEvent.create(:data => {'voice_id' => 'asd'})
      ae3 = AuditEvent.create(:event_type => 'voice_added', :data => {'voice_id' => 'asd'})
      ae4 = AuditEvent.create(:event_type => 'voice_added', :data => {'voice_id' => 'asdf'})
      get :admin_reports, params: {:organization_id => o.global_id, :report => "premium_voices"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      ts = Time.now.strftime('%m-%Y')
      expect(json['stats']).to eq({
        "#{ts} asd iOS" => 1,
        "#{ts} asd Android" => 1,
        "#{ts} asdf iOS" => 1
      })
    end
    
    it "should not work on non-admin orgs" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name, false)
      
      get :admin_reports, params: {:organization_id => o.global_id, :report => 'premium_voices'}
      assert_unauthorized
    end
    
    it "should work on non-admin orgs for approved reports" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name, false)
      
      get :admin_reports, params: {:organization_id => o.global_id, :report => 'logged_2'}
      expect(response).to be_successful
    end
    
    it "should generate unused_ report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "unused_3"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    it "should generate setup_but_expired report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "setup_but_expired"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    it "should generate current_but_expired report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "current_but_expired"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    it "should generate free_supervisor_without_supervisees report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "free_supervisor_without_supervisees"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    # it "should generate free_supervisor_with_supervisors report" do
    #   token_user
    #   o = Organization.create(:admin => true)
    #   o.add_manager(@user.user_name, false)
    #   get :admin_reports, params: {:organization_id => o.global_id, :report => "free_supervisor_with_supervisors"}
    #   expect(response).to be_successful
    #   json = JSON.parse(response.body)
    #   expect(json).to eq({'user' => []})
    # end
    
    it "should generate active_free_supervisor_without_supervisees_or_org report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "active_free_supervisor_without_supervisees_or_org"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    it "should generate eval_accounts report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "eval_accounts"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    # it "should generate recent_ report" do
    #   token_user
    #   o = Organization.create(:admin => true)
    #   o.add_manager(@user.user_name, false)
    #   get :admin_reports, params: {:organization_id => o.global_id, :report => "recent_"}
    #   expect(response).to be_successful
    #   json = JSON.parse(response.body)
    #   expect(json).to eq({'user' => []})
    # end

    it "should generate extras report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      ae1 = AuditEvent.create(:event_type => 'extras_added', :data => {'source' => 'asd'})
      ae2 = AuditEvent.create(:data => {'source' => 'asd'})
      ae3 = AuditEvent.create(:event_type => 'extras_added', :data => {'source' => 'asd'})
      ae4 = AuditEvent.create(:event_type => 'extras_added', :data => {'source' => 'asdf'})
      get :admin_reports, params: {:organization_id => o.global_id, :report => "extras"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      ts = Time.now.strftime('%m-%Y')
      expect(json['stats']).to eq({
        "#{ts} asd" => 2,
        "#{ts} asdf" => 1
      })
    end
    
    it "should generate new_users report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "new_users"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user'].map { |u| u['id'] }).to include(@user.global_id)
    end
    
    it "should generate logged_ report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "logged_3"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    it "should generate not_logged_ report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "not_logged_3"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']).to eq([])
      expect(json['meta']).to be_present
    end
    
    it "should generate missing_words report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "missing_words"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
    
    it "should generate missing_symbols report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "missing_symbols"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
    
    it "should generate home_boards report" do
      token_user
      b = Board.create(user: @user)
      @user.process({'preferences' => {'home_board' => {'key' => b.key, 'id' => b.global_id}}})
      Worker.process_queues
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "home_boards"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
    
    it "should generate recent home boards report" do
      token_user
      b = Board.create(user: @user)
      @user.process({'preferences' => {'home_board' => {'key' => b.key, 'id' => b.global_id}}})
      Worker.process_queues
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "recent_home_boards"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
    
    it "should generate subscriptions report" do
      token_user
      u = User.create
      u.subscription_override('never_expires')
      Worker.process_queues
      expect(u.reload.full_premium?).to eq(true)
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "subscriptions"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
    
    it "should generate overridden_parts_of_speech report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "overridden_parts_of_speech"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
    
    # it "should generate multiple_emails report" do
    #   token_user
    #   o = Organization.create(:admin => true)
    #   o.add_manager(@user.user_name, false)
    #   get :admin_reports, params: {:organization_id => o.global_id, :report => "multiple_emails"}
    #   expect(response).to be_successful
    #   json = JSON.parse(response.body)
    #   expect(json).to eq({'user' => [], 'stats' => {}})
    # end
    
    it "should generate premium_voices report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "premium_voices"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'stats' => {}})
    end
    
    it "should generate feature_flags report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "feature_flags"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
    
    it "should generate totals report" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, false)
      get :admin_reports, params: {:organization_id => o.global_id, :report => "totals"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['stats']).to_not eq(nil)
    end
  end
  
  describe "blocked_emails" do
    it 'should require api token' do
      get 'blocked_emails', :params => {'organization_id' => 'asdf'}
      assert_missing_token
    end
    
    it 'should require a valid org' do
      token_user
      get 'blocked_emails', :params => {'organization_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it 'should require an admin org' do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name, true)
      get 'blocked_emails', :params => {'organization_id' => o.global_id}
      assert_unauthorized
    end
    
    it 'should require admin permission' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name)
      get 'blocked_emails', :params => {'organization_id' => o.global_id}
      assert_unauthorized
    end
    
    it 'should return a list of blocked emails' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      Setting.block_email!('fred@example.com')
      Setting.block_email!('alice@example.com')
      get 'blocked_emails', :params => {'organization_id' => o.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'emails' => ['alice@example.com', 'fred@example.com']})
    end
  end
  
  describe "extra_action" do
    it 'should require api token' do
      post 'extra_action', :params => {'organization_id' => 'asdf'}
      assert_missing_token
    end

    it 'should require a valid org' do
      token_user
      post 'extra_action', :params => {'organization_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it 'should require an admin org' do
      token_user
      o = Organization.create()
      o.add_manager(@user.user_name, true)
      post 'extra_action', :params => {'organization_id' => o.global_id, 'extra_action' => 'block_email', 'email' => 'susan@example.com'}
    end
    
    it 'should require admin permission' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name)
      post 'extra_action', :params => {'organization_id' => o.global_id}
      assert_unauthorized
    end
    
    it 'should return success when succeeded' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      post 'extra_action', :params => {'organization_id' => o.global_id, 'extra_action' => 'block_email', 'email' => 'susan@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['success']).to eq(true)
    end
    
    it 'should block an email address' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      post 'extra_action', :params => {'organization_id' => o.global_id, 'extra_action' => 'block_email', 'email' => 'susan@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['success']).to eq(true)
      expect(Setting.blocked_email?('SUSAN@example.com')).to eq(true)
    end
    
    it 'should return false when not succeeded' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      post 'extra_action', :params => {'organization_id' => o.global_id, 'extra_action' => 'something_else', 'email' => 'susan@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['success']).to eq(false)
    end
    
    it 'should add a sentence suggestions' do
      token_user
      WordData.create!(word: 'bacon', locale: 'en', data: {}) unless WordData.find_by(word: 'bacon', locale: 'en')
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      post 'extra_action', :params => {'organization_id' => o.global_id, 'extra_action' => 'add_sentence_suggestion', 'word' => 'bacon', 'sentence' => 'I like me some bacon'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['success']).to eq(true)
      w = WordData.find_word('bacon')
      expect(w).to_not eq(nil)
      expect(w['sentences']).to eq([{'sentence' => 'I like me some bacon', 'approved' => true}])
    end
    
    it 'should not succeeed without correct sentence suggestion parameters' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      post 'extra_action', :params => {'organization_id' => o.global_id, 'extra_action' => 'add_sentence_suggestion', 'word' => 'bacon'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['success']).to eq(false)
      
      post 'extra_action', :params => {'organization_id' => o.global_id, 'extra_action' => 'add_sentence_suggestion', 'sentence' => 'bacon'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['success']).to eq(false)
    end
  end
  
  describe "evals" do
    it "should require api token" do
      get :evals, params: {:organization_id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      get :evals, params: {:organization_id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      get :evals, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list of eval users if authorized" do
      o = Organization.create(:settings => {'total_eval_licenses' => 100})
      token_user
      o.add_manager(@user.user_name)
      30.times do |i|
        u = User.create
        o.add_user(u.user_name, false, true, true)
      end
      
      get :evals, params: {:organization_id => o.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['meta']).not_to eq(nil)
      expect(json['user'].length).to eq(25)
      expect(json['meta']['next_url']).to eq("#{JsonApi::Json.current_host}/api/v1/organizations/#{o.global_id}/evals?offset=#{JsonApi::User::DEFAULT_PAGE}&per_page=#{JsonApi::User::DEFAULT_PAGE}")
    end
  end

  describe "extras" do
    it "should require api token" do
      get :extras, params: {:organization_id => 1}
      assert_missing_token
    end
    
    it "should return not found unless organization exists" do
      token_user
      get :extras, params: {:organization_id => "1"}
      assert_not_found("1")
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      o = Organization.create
      token_user
      get :extras, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated (above default max) list of extras users if authorized" do
      o = Organization.create(:settings => {'total_licenses' => 200, 'total_extras' => 100})
      token_user
      o.add_manager(@user.user_name)
      100.times do |i|
        u = User.create
        o.add_user(u.user_name, false)
        o.reload
        o.add_extras_to_user(u.user_name)
      end
      
      get :extras, params: {:organization_id => o.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['meta']).not_to eq(nil)
      expect(json['user'].length).to eq(100)
      expect(json['meta']['next_url']).to eq(nil)
    end
  end

  describe "alias" do
    it "should require a valid token" do
      post 'alias', params: {organization_id: '1_1'}
      assert_missing_token
    end

    it "should require authorization" do
      token_user
      o = Organization.create
      post 'alias', params: {organization_id: o.global_id}
      assert_unauthorized
    end

    it "should require a valid user on the org" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      u = User.create
      post 'alias', params: {organization_id: o.global_id, user_id: u.global_id}
      assert_not_found(u.global_id)
    end

    it "should require a valid user on the org" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      u = User.create
      post 'alias', params: {organization_id: o.global_id, user_id: u.global_id}
      assert_not_found(u.global_id)
    end

    it "should require an alias" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      post 'alias', params: {organization_id: o.global_id, user_id: @user.global_id}
      assert_error('invalid alias')
    end

    it "should require a minimum-length alias" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      post 'alias', params: {organization_id: o.global_id, user_id: @user.global_id, alias: 'a'}
      assert_error('invalid alias')
    end

    it "should link the alias for an admin" do
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)
      post 'alias', params: {organization_id: o.global_id, user_id: @user.global_id, alias: 'clementine'}
      assert_error('org not configured for external auth')
    end

    it "should link the alias for an admin" do
      o = Organization.create(:admin => true)
      o.settings['saml_metadata_url'] = 'whatever'
      o.save
      token_user
      o.add_manager(@user.user_name, true)
      post 'alias', params: {organization_id: o.global_id, user_id: @user.global_id, alias: 'clementine'}
      json = assert_success_json
      expect(json).to eq({'linked' => true, 'alias' => 'clementine', 'user_id' => @user.global_id})
      link = UserLink.links_for(@user.reload).detect{|l| l['type'] == 'saml_alias'}
      expect(link).to_not eq(nil)
      expect(link['state']['alias']).to eq('clementine')
      expect(link['state']['org_id']).to eq(o.global_id)
    end
  end
  
  describe "set_status" do
    it "should require an api token" do
      post 'set_status', params: {organization_id: 'asdf', user_id: 'qwer'}
      assert_missing_token
    end

    it "should require a valid org" do
      token_user
      post 'set_status', params: {organization_id: 'asdf', user_id: 'qwer'}
      assert_not_found('asdf')
    end

    it "should require supervisor or manager access" do
      token_user
      o = Organization.create(:settings => {'total_licenses' => 1})
      post 'set_status', params: {organization_id: o.global_id, user_id: 'qwer'}
      assert_unauthorized
    end

    it "should require a valid org user" do
      token_user
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_supervisor(@user.user_name, false)
      post 'set_status', params: {organization_id: o.global_id, user_id: 'qwer'}
      assert_not_found('qwer')
    end

    it "should require supervision permission on the specific user" do
      token_user
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_supervisor(@user.user_name, false)
      o.add_user(u.user_name, false)
      post 'set_status', params: {organization_id: o.global_id, user_id: u.global_id}
      assert_unauthorized
    end

    it "should update user state" do
      token_user
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_supervisor(@user.user_name, false)
      o.add_user(u.user_name, false)
      User.link_supervisor_to_user(@user.reload, u.reload)
      post 'set_status', params: {organization_id: o.global_id, user_id: u.global_id, status: {'state' => 'bacon', 'note' => 'no way'}}
      json = assert_success_json
      expect(json['status']['state']).to eq('bacon')
      expect(json['status']['note']).to eq('no way')
      expect(json['status']['date']).to be_within(15).of(Time.now.to_i)
    end

    it "should record a log message on update" do
      token_user
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_supervisor(@user.user_name, false)
      o.add_user(u.user_name, false)
      User.link_supervisor_to_user(@user.reload, u.reload)
      post 'set_status', params: {organization_id: o.global_id, user_id: u.global_id, status: {'state' => 'bacon', 'note' => 'no way'}}
      json = assert_success_json
      expect(json['status']['state']).to eq('bacon')
      expect(json['status']['note']).to eq('no way')
      expect(json['status']['date']).to be_within(15).of(Time.now.to_i)
      l = LogSession.last
      expect(l).to_not eq(nil)
      expect(l.user).to eq(u)
      expect(l.author).to eq(@user)
      expect(l.data['note']['text']).to eq("Status set to bacon - no way")
    end
  end

  describe "start_code_lookup" do
    it "should not require a token" do
      org = Organization.create
      code = Organization.activation_code(org, {})
      codes = Organization.start_codes(org.reload)
      get 'start_code_lookup', params: {code: code, v: codes[0][:v]}
      json = assert_success_json
    end

    it "should require a verifier" do
      org = Organization.create
      code = Organization.activation_code(org, {})
      codes = Organization.start_codes(org.reload)
      get 'start_code_lookup', params: {code: code}
      assert_error('invalid code')
    end

    it "should not require a verifier for an admin" do
      org = Organization.create
      token_user
      org.add_manager(@user.user_name)
      code = Organization.activation_code(org, {})
      codes = Organization.start_codes(org.reload)
      get 'start_code_lookup', params: {code: code}
      json = assert_success_json
    end

    it "should not require a verifier for supervisor" do
      token_user
      code = Organization.activation_code(@user, {})
      codes = Organization.start_codes(@user.reload)
      get 'start_code_lookup', params: {code: code}
      json = assert_success_json
    end

    it "should return token details" do
      token_user
      code = Organization.activation_code(@user, {})
      codes = Organization.start_codes(@user.reload)
      get 'start_code_lookup', params: {code: code}
      json = assert_success_json
      expect(json['code']).to eq(code)
      expect(json['image_url']).to_not eq(nil)
      expect(json['supervisor']).to eq(true)
      expect(json['valid']).to eq(true)
      expect(json['name']).to eq(@user.settings['name'])
    end
  end

  describe "generate_start_code" do
    it "should require a token" do
      post 'start_code', params: {organization_id: 'whatever'}
      assert_missing_token
    end

    it "should require a valid org" do
      token_user
      post 'start_code', params: {organization_id: 'none'}
      assert_not_found('none')
    end

    it "should require edit permission" do
      token_user
      o = Organization.create
      post 'start_code', params: {organization_id: o.global_id}
      assert_unauthorized
    end

    it "should return an activation code" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      post 'start_code', params: {organization_id: o.global_id}
      json = assert_success_json
      expect(json['code']).to_not eq(nil)
      pre, rnd, verifier = json['code'].split(/\s/)
      type = pre[0]
      id = pre[1..-1]
      expect(type).to eq('1')
      expect(id).to eq(o.global_id.sub(/_/, '0'))
      o.reload
      expect(o.settings['activation_settings']["#{type}#{rnd}"]).to_not eq(nil)
      expect(o.settings['activation_settings']["#{type}#{rnd}"]).to eq({
      })
    end

    it "should record settings" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      ts = 4.weeks.from_now.to_i
      post 'start_code', params: {organization_id: o.global_id, overrides: {
        'supervisors' => ['a', 'b'],
        'limit' => 5,
        'locale' => 'fr',
        'symbol_library' => 'symbolstix',
        'premium' => true,
        'expires' => ts
      }}
      json = assert_success_json
      expect(json['code']).to_not eq(nil)
      pre, rnd, verifier = json['code'].split(/\s/)
      type = pre[0]
      id = pre[1..-1]
      expect(type).to eq('1')
      expect(id).to eq(o.global_id.sub(/_/, '0'))
      o.reload
      expect(o.settings['activation_settings']["#{type}#{rnd}"]).to_not eq(nil)
      expect(o.settings['activation_settings']["#{type}#{rnd}"]).to eq({
        'limit' => 5,
        'expires' => ts,
        'locale' => 'fr',
        'supervisors' => ['a', 'b'],
        'premium' => true,
        'symbol_library' => 'symbolstix'
      })
      res = Organization.parse_activation_code(json['code'])
      expect(res).to_not eq(false)
      expect(res[:target]).to eq(o)
      expect(res[:disabled]).to eq(false)
      expect(res[:key]).to eq("1#{rnd}")
      expect(res[:overrides]).to eq({"locale"=>"fr", "premium"=>true, "supervisors"=>["a", "b"], "symbol_library"=>"symbolstix"})

      list = Organization.start_codes(o)
      expect(list).to_not eq(nil)
      expect(list.length).to eq(1)
      expect(list[0][:code]).to eq(json['code'])
    end

    it "should allow a custom start code" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      post 'start_code', params: {organization_id: o.global_id, overrides: {
        'proposed_code' => 'asdfasdf'
      }}
      json = assert_success_json
      expect(json['code']).to eq('asdfasdf')
    end

    it "should error on taken custom code" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      Organization.activation_code(o, {'proposed_code' => 'asdfasdf'})
      post 'start_code', params: {organization_id: o.global_id, overrides: {
        'proposed_code' => 'asdfasdf'
      }}
      assert_error('code is taken')
    end

    it "should error on too-short code" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      post 'start_code', params: {organization_id: o.global_id, overrides: {
        'proposed_code' => 'asdf'
      }}
      assert_error('code is too short')
    end

    it "should allow deleting a custom code" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      Organization.activation_code(o, {'proposed_code' => 'asdfasdf'})
      post 'start_code', params: {organization_id: o.global_id,
        'delete' => true,
        'code' => 'asdfasdf'
      }
      json = assert_success_json
      expect(json).to eq({'code' => 'asdfasdf', 'deleted' => true})
    end 

    it "should allow deleting a default code" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      code = Organization.activation_code(o, {})
      post 'start_code', params: {organization_id: o.global_id, 
        'delete' => true,
        'code' => code
      }
      json = assert_success_json
      expect(json).to eq({'code' => code, 'deleted' => true})
    end 

    it "should error on missing code deletion" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      code = Organization.activation_code(@user, {})
      post 'start_code', params: {organization_id: o.global_id, 
        'delete' => true,
        'code' => "whatever"
      }
      assert_error('code not found')
    end
  end
end

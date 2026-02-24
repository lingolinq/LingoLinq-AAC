require 'spec_helper'

describe Api::UsersController, :type => :controller do
  describe "show" do
    it "should not require api token" do
      u = User.create
      get :show, params: {:id => u.global_id}
      expect(response).to be_successful
    end
    
    it "should require a valid record" do
      get :show, params: {:id => "asdf"}
      assert_not_found('asdf');
    end

    it "should not allow looking up supervisees in valet mode" do
      valet_token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get :show, params: {:id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(@user.global_id)
      expect(json['user']['permissions']['model']).to eq(true)
      expect(json['user']['permissions']['supervise']).to eq(nil)
      expect(json['user']['user_token']).to_not eq(nil)

      get :show, params: {:id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['permissions']['model']).to eq(nil)
      expect(json['user']['permissions']['supervise']).to eq(nil)
      expect(json['user']['user_token']).to eq(nil)
    end

    it "should allow org managers to look up basic info on pending users" do
      token_user
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      o.add_user(u.user_name, true, false)
      u.reload
      @user.reload
      expect(Organization.manager_for?(@user, u, true)).to eq(false)

      perms = u.reload.permissions_for(@user.reload)
      expect(perms['edit']).to eq(nil)
      expect(perms['supervise']).to eq(nil)
      expect(perms['model']).to eq(nil)
      get :show,  params: {:id => u.user_name}
      json = assert_success_json
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['user_name']).to eq(u.user_name)
    end

    it "should return a valid object" do
      u = User.create
      get :show, params: {:id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['subscription']).to eq(nil)
      expect(json['user']['user_token']).to eq(nil)
    end
    
    it "should allow access with a confirmation code" do
      u = User.create
      get :show, params: {:id => u.global_id, :confirmation => u.registration_code}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['subscription']).to_not eq(nil)
      expect(json['user']['user_token']).to eq(nil)
    end
    
    it "should return restricted information with only a confirmation code" do
      u = User.create
      get :show, params: {:id => u.global_id, :confirmation => u.registration_code}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['subscription']).to_not eq(nil)
      expect(json['user']['user_token']).to eq(nil)
    end
    
    it "should return full information if authorized, while also having a confirmation code" do
      token_user
      get :show, params: {:id => @user.global_id, :confirmation => @user.registration_code}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(@user.global_id)
      expect(json['user']['subscription']).to_not eq(nil)
      expect(json['user']['permissions']['edit']).to eq(true)
      expect(json['user']['user_token']).to_not eq(nil)
    end
    
    it "should return self information with a limited api scope" do
      token_user
      @device.developer_key_id = 1
      @device.settings['permission_scopes'] = ['read_profile']
      @device.save
      expect(@device.permission_scopes).to eq(['read_profile'])
      get :show, params: {:id => 'self'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(@user.global_id)
      expect(json['user']['preferences']).to eq(nil)
      expect(json['user']['permissions']['edit']).to eq(false)
    end
    
    it "should not return supervisee information with a limited api scope" do
      token_user
      @device.developer_key_id = 1
      @device.settings['permission_scopes'] = ['read_profile']
      @device.save
      u = User.create
      u.permission_scopes = @device.permission_scopes
      
      User.link_supervisor_to_user(@user, u)
      expect(u.permission_scopes).to eq(['read_profile'])
      expect(u.permissions_for(u, u.permission_scopes)).to eq({
        "user_id"=>u.global_id, 
        "view_existence"=>true, 
        "view_detailed"=>true,
        "view_deleted_boards"=>true, 
        'link_auth' => false,
        'view_word_map' => true,
        "supervise"=>false, 
        "model"=>false,
        "edit"=>false, 
        'edit_boards' => false,
        "manage_supervision"=>false, 
        'set_goals' => false,
        "delete"=>false
      })

      get :show, params: {:id => 'self'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(@user.global_id)
      expect(json['user']['supervisees']).to eq(nil)
    end
    
    it "should not return any information with a 2fa-missing api scope" do
      token_user
      @device.developer_key_id = 1
      @device.settings['permission_scopes'] = ['none']
      @device.save
      u = User.create
      u.permission_scopes = @device.permission_scopes
      
      User.link_supervisor_to_user(@user, u)
      expect(u.permission_scopes).to eq(['none'])
      expect(u.permissions_for(u, [])).to eq({
        "user_id"=>u.global_id, 
        "view_existence"=>true, 
        "view_detailed"=>true,
        "view_deleted_boards"=>true, 
        'link_auth' => false,
        'view_word_map' => true,
        "supervise"=>false, 
        "model"=>false,
        "edit"=>false, 
        'edit_boards' => false,
        "manage_supervision"=>false, 
        'set_goals' => false,
        "delete"=>false
      })
      expect(u.permissions_for(u, ['full'])).to eq({
        "user_id"=>u.global_id, 
        "view_existence"=>true, 
        "view_detailed"=>true,
        "view_deleted_boards"=>true, 
        'link_auth' => true,
        'view_word_map' => true,
        "supervise"=>true, 
        "model"=>true,
        "edit"=>true, 
        'edit_boards' => true,
        "manage_supervision"=>true, 
        'set_goals' => true,
        "delete"=>true
      })
      expect(u.permissions_for(u, u.permission_scopes)).to eq({
        "user_id"=>u.global_id, 
        "view_existence"=>true, 
        "view_detailed"=>false,
        "view_deleted_boards"=>false, 
        'link_auth' => false,
        'view_word_map' => false,
        "supervise"=>false, 
        "model"=>false,
        "edit"=>false, 
        'edit_boards' => false,
        "manage_supervision"=>false, 
        'set_goals' => false,
        "delete"=>false
      })

      get :show, params: {:id => 'self'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(@user.global_id)
      expect(json['user']['supervisees']).to eq(nil)
    end

    it "should not allow looking up supervisees with a limited api scope" do
      token_user
      @device.developer_key_id = 1
      @device.settings['permission_scopes'] = ['read_profile']
      @device.save
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get :show, params: {:id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['supervisees']).to eq(nil)
      expect(json['user']['preferences']).to eq(nil)
    end

    it "should allow looking up supervisees with a full api scope" do
      token_user
      @device.developer_key_id = 1
      @device.settings['permission_scopes'] = ['full']
      @device.save
      u = User.create
      u.permission_scopes = @device.permission_scopes
      expect(u.permission_scopes).to eq(['full'])

      User.link_supervisor_to_user(@user, u)
      expect(u.permissions_for(@user)).to eq({
        'user_id' => @user.global_id,
        "view_existence"=>true, 
        "edit"=>true, 
        'edit_boards' => true,
        "manage_supervision"=>true, 
        "model"=>true,
        "view_deleted_boards"=>true, 
        "view_detailed"=>true, 
        'view_word_map' => true,
        'set_goals' => true,
        "supervise"=>true
      })
      
      get :show, params: {:id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['permissions']).to eq({
        'user_id' => @user.global_id,
        "view_existence"=>true, 
        "edit"=>true, 
        "model"=>true,
        'edit_boards' => true, 
        "manage_supervision"=>true, 
        "view_deleted_boards"=>true, 
        "view_detailed"=>true, 
        'view_word_map' => true,
        'set_goals' => true,
        "supervise"=>true
      })
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['preferences']).to_not eq(nil)
    end
  end
  
  describe "index" do
    it "should require api token" do
      get :index
      assert_missing_token
    end
    
    it "should require admin manager position" do
      token_user
      get :index
      assert_error 'admins only'
    end
    
    it "should require a query parameter" do
      token_user
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      get :index
      assert_error ('q parameter required')
    end
    
    it "should return results" do
      u = User.create(:user_name => 'bob')
      u2 = User.create(:user_name => 'bobby')

      token_user
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      get :index, params: {:q => 'bo'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['user'].length).to eq(2)
      expect(json['user'][0]['id']).to eq(u.global_id)
      expect(json['user'][1]['id']).to eq(u2.global_id)
    end
    
    it "should return email results for an email query" do
      u = User.create(:user_name => 'bob@example.com')
      u2 = User.create(:user_name => 'boby', :settings => {'email' => 'bob@example.com'})
      u3 = User.create(:user_name => 'bobby', :settings => {'email' => 'bob@example.com'})

      token_user
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      get :index, params: {:q => 'bob@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['user'].length).to eq(2)
      expect(json['user'][0]['id']).to eq(u3.global_id)
      expect(json['user'][1]['id']).to eq(u2.global_id)

      get :index, params: {:q => 'bob@'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['user'].length).to eq(0)
    end
    
    it "should return a single result if perfect match on user_name" do
      u = User.create(:user_name => 'bob')
      u2 = User.create(:user_name => 'bobby')

      token_user
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      get :index, params: {:q => 'bob'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['user'].length).to eq(1)
      expect(json['user'][0]['id']).to eq(u.global_id)
    end
    
    it "should paginate results" do
      us = []
      30.times do |i|
        us << User.create(:user_name => "betsy#{i}")
      end
      
      token_user
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      get :index, params: {:q => 'betsy'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['user'].length).to eq(25)
      expect(json['user'][0]['id']).to eq(us[0].global_id)
      expect(json['user'][1]['id']).to eq(us[1].global_id)
      expect(json['user'][2]['id']).to eq(us[10].global_id)
      expect(json['user'][3]['id']).to eq(us[11].global_id)
      expect(json['user'][4]['id']).to eq(us[12].global_id)
    end

    it "should allow org admins to search their own orgs" do
      u1 = User.create(:user_name => 'bob@example.com')
      u2 = User.create(:user_name => 'franny', :settings => {'email' => 'fran@example.com'})
      token_user
      o = Organization.create
      o.add_manager(@user.user_name, false)
      o.add_user(u1.user_name, false, false)
      o.add_supervisor(u2.user_name, false, false)
      get :index, params: {org_id: o.global_id, q: 'bob'}
      json = assert_success_json
      expect(json['user'].length).to eq(1)
      expect(json['user'][0]['id']).to eq(u1.global_id)

      get :index, params: {org_id: o.global_id, q: 'fran@example.com'}
      json = assert_success_json
      expect(json['user'].length).to eq(1)
      expect(json['user'][0]['id']).to eq(u2.global_id)
    end

    it "should not allow org admins to search outisde their orgs" do
      u1 = User.create(:user_name => 'bob@example.com')
      u2 = User.create(:user_name => 'franny', :settings => {'email' => 'fran@example.com'})
      token_user
      o = Organization.create
      o.add_manager(@user.user_name, false)
      get :index, params: {org_id: o.global_id, q: 'bob'}
      json = assert_success_json
      expect(json['user'].length).to eq(0)

      get :index, params: {org_id: o.global_id, q: 'fran@example.com'}
      json = assert_success_json
      expect(json['user'].length).to eq(0)
    end

    it "should not allow non-org-admins to search an org" do
      u1 = User.create(:user_name => 'bob@example.com')
      u2 = User.create(:user_name => 'franny', :settings => {'email' => 'fran@example.com'})
      token_user
      o = Organization.create
      o.add_user(u1.user_name, false, false)
      o.add_supervisor(u2.user_name, false, false)
      get :index, params: {org_id: o.global_id, q: 'bob'}
      assert_unauthorized

      get :index, params: {org_id: o.global_id, q: 'fran@example.com'}
      assert_unauthorized
    end

    it "should allow searching an org by email" do
      u1 = User.create(:user_name => 'bob@example.com')
      u2 = User.create(:user_name => 'franny', :settings => {'email' => 'fran@example.com'})
      token_user
      o = Organization.create
      o.add_manager(@user.user_name, false)
      get :index, params: {org_id: o.global_id, q: 'fran@example.com'}
      json = assert_success_json
      expect(json['user'].length).to eq(0)
    end

    it "should allow searching an org by saml alias" do
      u1 = User.create(:user_name => 'bob@example.com')
      u2 = User.create(:user_name => 'franny', :settings => {'email' => 'fran@example.com'})
      token_user
      o = Organization.create
      o.settings['saml_metadata_url'] = 'whatever'
      o.save
      o.add_manager(@user.user_name, false)
      o.reload
      @user.reload
      o.link_saml_alias(@user, 'broadly')
      get :index, params: {org_id: o.global_id, q: 'broadly'}
      json = assert_success_json
      expect(json['user'].length).to eq(1)
      expect(json['user'][0]['id']).to eq(@user.global_id)
    end
  end
  
  describe "update" do
    it "should not require api token" do
      post :update, params: {:id => 123}
      expect(response).not_to be_successful
      expect(response.body).not_to match(/Access token required/)
    end
    
    it "should error if neither reset token nor authorized api token" do
      u = User.create
      token_user
      post :update, params: {:id => u.global_id, :user => {'name' => 'bob'}}
      assert_unauthorized
    end
    
    it "should only allow for resetting passwords if there's an active reset token" do
      u = User.create
      u.generate_password_reset
      code = u.password_reset_code
      token = u.reset_token_for_code(code)
      expect(u.reload.valid_reset_token?(token)).to eq(true)
      post :update, params: {:id => u.global_id, :reset_token => token, :user => {'password' => '12345678'}}
      expect(response).to be_successful
      expect(u.reload.valid_password?('12345678')).to eq(true)

      post :update, params: {:id => u.global_id, :reset_token => "abcdefg", :user => {'password' => '98765432'}}
      assert_unauthorized

      post :update, params: {:id => u.global_id, :reset_token => token, :user => {'password' => '98765432'}}
      assert_unauthorized
    end
    
    it "should let admins reset passwords for users" do
      token_user
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      o.add_user(u.user_name, false)
      
      post :update, params: {:id => u.global_id, :reset_token => 'admin', :user => {'name' => 'fred', 'password' => '2345654'}}
      expect(response).to be_successful
      expect(u.reload.valid_password?('2345654')).to eq(true)
      expect(u.settings['name']).to eq('No name')
    end
    
    it "should not let non-admins reset passwords for users" do
      token_user
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, false)
      o.add_user(u.user_name, false)
      
      post :update, params: {:id => u.global_id, :reset_token => 'admin', :user => {'name' => 'fred', 'password' => '2345654'}}
      assert_unauthorized
    end
    
    it "should not let admins that aren't over a user reset that user's password" do
      token_user
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o2 = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      o2.add_user(u.user_name, false)
      
      post :update, params: {:id => u.global_id, :reset_token => 'admin', :user => {'name' => 'fred', 'password' => '2345654'}}
      assert_unauthorized
    end
    
    it "should update parameters if allowed" do
      token_user
      post :update, params: {:id => @user.global_id, :user => {:name => 'bob'}}
      expect(response).to be_successful
      expect(@user.reload.settings['name']).to eq('bob')
    end
    
    it "should not be allowed in valet mode" do
      valet_token_user
      post :update, params: {:id => @user.global_id, :user => {:name => 'bob'}}
      assert_unauthorized
    end

    it "should update device-specific settings if for the current user" do
      token_user
      post :update, params: {:id => @user.global_id, :user => {:name => 'bob', :preferences => {:device => {:a => 1}}}}
      expect(response).to be_successful
      @user.reload
      expect(@user.settings['name']).to eq('bob')
      expect(@user.settings['preferences']['devices']).not_to eq(nil)
      expect(@user.settings['preferences']['devices'][@device.unique_device_key]['a']).to eq('1')
    end
    
    it "should not update device-specific settings if not for the current user" do
      token_user
      @user2 = User.create
      User.link_supervisor_to_user(@user, @user2, nil, true)
      expect(@user.supervisor_for?(@user2)).to eq(true)
      post :update, params: {:id => @user2.global_id, :user => {:name => 'bob', :preferences => {:device => {:a => 1}}}}
      expect(response).to be_successful
      @user2.reload
      expect(@user2.settings['name']).to eq('bob')
      expect(@user2.settings['preferences']['devices']).not_to eq(nil)
      expect(@user2.settings['preferences']['devices'][@device.unique_device_key]).to eq(nil)
      expect(@user2.settings['preferences']['devices']['default']['a']).to eq('1')
    end
    
    it "should fail gracefully on user update fail" do
      token_user
      expect_any_instance_of(User).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      post :update, params: {:id => @user.global_id, :user => {:name => 'bob', :preferences => {:device => {:a => 1}}}}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq("update failed")
      expect(json['errors']).to eq(["bacon"])
    end
    
    it "should allow an edit supervisor to change the home board for the current user" do
      token_user
      u2 = User.create
      b = Board.create(:user => u2)
      User.link_supervisor_to_user(@user, u2, nil, true)
      put :update, params: {:id => u2.global_id, :user => {:preferences => {:home_board => {:id => b.global_id, :key => b.key}}}}
      expect(response).to be_successful
      expect(u2.reload.settings['preferences']['home_board']['id']).to eq(b.global_id)
    end
    
    it "should allow an edit supervisor to set the home board to one of the supervisor's private boards" do
      token_user
      u2 = User.create
      b = Board.create(:user => @user)
      User.link_supervisor_to_user(@user, u2, nil, true)
      put :update, params: {:id => u2.global_id, :user => {:preferences => {:home_board => {:id => b.global_id, :key => b.key}}}}
      expect(response).to be_successful
      expect(u2.reload.settings['preferences']['home_board']['id']).to eq(b.global_id)
      expect(b.reload.shared_with?(u2)).to eq(true)
    end
    
    it "should now allow an edit supervisor to set the home board to one they don't have sharing permissions for" do
      token_user
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u3)
      expect(b.allows?(@user, 'view')).to eq(false)
      expect(b.allows?(u2, 'view')).to eq(false)
      expect(b.allows?(u3, 'view')).to eq(true)
      
      User.link_supervisor_to_user(@user, u2, nil, true)
      put :update, params: {:id => u2.global_id, :user => {:preferences => {:home_board => {:id => b.global_id, :key => b.key}}}}
      expect(response).to be_successful
      expect(u2.reload.settings['preferences']['home_board']).to eq(nil)
      expect(b.reload.shared_with?(u2)).to eq(false)
    end

    it "should allow updating token timeouts for the current device" do
      token_user
      expect(@device.settings['long_token']).to eq(nil)
      expect(@device.inactivity_timeout).to eq(12.hours.to_i)
      
      put :update, params: {:id => @user.global_id, :user => {:preferences => {:device => {:long_token => true}}}}
      expect(response).to be_successful
      expect(@device.reload.settings['long_token']).to eq(true)
      expect(@device.inactivity_timeout).to eq(14.days.to_i)
    end
  end
  
  describe "create" do
    it "should not require api token" do
      post :create, params: {:user => {'name' => 'fred'}}
      expect(response).to be_successful
    end
    
    it "should schedule delivery of a welcome message" do
      expect(UserMailer).to receive(:schedule_delivery).exactly(2).times
      post :create, params: {:user => {'name' => 'fred'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['name']).to eq('fred')
    end
    
    it "should not allow  blank user name" do
      post :create, params: {:user => {'user_name' => ''}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user']['name'].length).to be > 5
    end

    it "should include access token information" do
      post :create, params: {:user => {'name' => 'fred'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['meta']['access_token']).not_to be_nil
    end
    
    it "should have correct defaults" do
      post :create, params: {:user => {'name' => 'fred'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      user = json['user']
      expect(user).not_to eq(nil)
      expect(user['preferences']).not_to eq(nil)
      expect(user['preferences']['auto_home_return']).to eq(true)
      expect(user['preferences']['clear_on_vocalize']).to eq(true)
      expect(user['preferences']['logging']).to eq(false)
    end
    
    it "should error gracefully on user create fail" do
      expect_any_instance_of(User).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      post :create, params: {:user => {'name' => 'fred'}}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq("user creation failed")
      expect(json['errors']).to eq(["bacon"])
    end
    
    it "should track the new user externally" do
      expect(ExternalTracker).to receive(:track_new_user)
      post :create, params: {:user => {'name' => 'fred'}}
      expect(response).to be_successful
    end

    it "should error on invalid start code" do
      post :create, params: {:user => {'name' => 'fred', 'start_code' => 'asdf'}}
      assert_error('invalid start code')
    end

    it "should allow adding a start code" do
      o = Organization.create
      code = Organization.activation_code(o, {'user_type' => 'communicator'})
      post :create, params: {:user => {'name' => 'fred', 'start_code' => code}}
      json = assert_success_json
      u = User.find_by_path(json['user']['id'])
      expect(u).to_not eq(nil)
      o.reload
      expect(o.user?(u)).to eq(true)
    end

    it "should error on disabled start code" do
      o = Organization.create
      code = Organization.activation_code(o, {'user_type' => 'communicator'})
      Organization.remove_start_code(o, code)
      post :create, params: {:user => {'name' => 'fred', 'start_code' => code}}
      assert_error('invalid start code')
    end

    it "should update user settings when start code is provided" do
      o = Organization.create
      s = User.create
      b = Board.create(user: s, public: true)
      o.process({:home_board_key => b.key}, {updater: s})
      expect(o.home_board_keys).to eq([b.key])
      
      code = Organization.activation_code(o, {'user_type' => 'communicator', 'locale' => 'fr', 'symbol_library' => 'symbolstix', 'supervisors' => [s.global_id], 'home_board_key' => b.key})
      post :create, params: {:user => {
        'name' => 'fred', 
        'preferences' => {
          'locale' => 'es', 
          'preferred_symbols' => 'pcs', 
        },
        'start_code' => code
      }}
      json = assert_success_json
      u = User.find_by_path(json['user']['id'])
      expect(u).to_not eq(nil)
      o.reload
      expect(o.user?(u)).to eq(true)
      expect(u.settings['preferences']['locale']).to eq('fr')
      expect(u.settings['preferences']['preferred_symbols' => 'symbolstix'])
      Worker.process_queues
      u.reload
      
      expect(u.settings['preferences']['home_board']).to_not eq(nil)
      expect(u.settings['preferences']['home_board']['key']).to_not eq(nil)
      b2 = Board.find_by_path(u.settings['preferences']['home_board']['key'])
      expect(b2).to_not eq(nil)
      expect(b2).to eq(b)
      expect(u.settings['preferences']['home_board']['key']).to_not eq(b.key)
      expect(b2.instance_variable_get('@sub_id')).to eq(u.global_id)
    end
    
    it "should throttle or captcha or something to prevent abuse"
  end
  
  describe "replace_board" do
    it "should require api token" do
      post :replace_board, params: {:user_id => 1, :old_board_id => 1, :new_board_id => 2}
      assert_missing_token
    end
    
    it "should return a progress object" do
      token_user
      b1 = Board.create(:user => @user)
      b2 = Board.create(:user => @user)
      post :replace_board, params: {:user_id => @user.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
    end
    
    it "should require permissions for the user, old and new boards" do
      u = User.create
      token_user
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      post :replace_board, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized
      
      b1.user = @user
      b1.save
      post :replace_board, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized

      b2.user = @user
      b2.save
      post :replace_board, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized
      
      post :replace_board, params: {:user_id => @user.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      expect(response).to be_successful
      
      User.link_supervisor_to_user(@user, u, nil, true)
      post :replace_board, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized

      b1.user = u
      b1.save
      post :replace_board, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized

      b2.user = u
      b2.save
      post :replace_board, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      expect(response).to be_successful
    end
  end
  
  describe "copy_board_links" do
    it "should require api token" do
      post :copy_board_links, params: {:user_id => 1, :old_board_id => 1, :new_board_id => 2}
      assert_missing_token
    end
    
    it "should return a progress object" do
      token_user
      b1 = Board.create(:user => @user)
      b2 = Board.create(:user => @user)
      post :copy_board_links, params: {:user_id => @user.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
    end
    
    it "should require permissions for the user, old and new boards" do
      u = User.create
      token_user
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized
      
      b1.user = @user
      b1.save
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized

      b2.user = @user
      b2.save
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized
      
      post :copy_board_links, params: {:user_id => @user.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      expect(response).to be_successful
      
      User.link_supervisor_to_user(@user, u, nil, true)
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized

      b1.user = u
      b1.save
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      assert_unauthorized

      b2.user = u
      b2.save
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1.global_id, :new_board_id => b2.global_id, :access_token => @device.tokens[0], :check_token => true}
      expect(response).to be_successful
    end
    
    it "should set vocabulary_owner_id for protected boards" do
      u = User.create
      token_user
      User.link_supervisor_to_user(@user, u, nil, true)

      b1a = Board.create(:user => @user.reload)
      b1a.settings['protected'] = {'vocabulary' => true}

      b1a.save
      b1b = Board.create(user: @user)
      b1b.settings['protected'] = {'vocabulary' => true}
      b1b.save

      
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b1a.instance_variable_set('@buttons_changed', true)
      b1a.save
      Worker.process_queues
      Worker.process_queues
      expect(b1a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])
      b2a = Board.create(:user => u)
      b2a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b2a.instance_variable_set('@buttons_changed', true)
      b2a.save
      Worker.process_queues
      Worker.process_queues
      expect(b2a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])

      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1a.global_id, :new_board_id => b2a.global_id, :ids_to_copy => []}
      expect(response).to be_successful      
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      Progress.perform_action(progress.id)
      Worker.process_queues
      Worker.process_queues
      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      b2a.reload
      expect(b2a.reload.settings['downstream_board_ids'].length).to eq(1)
      b2b = Board.find_by_path(b2a.settings['downstream_board_ids'][0])
      expect(b2b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2b.parent_board).to eq(b1b)
    end

    it "should assign new protected vocabulary owner if specified" do
      u = User.create
      token_user
      User.link_supervisor_to_user(@user, u, nil, true)

      b1a = Board.create(:user => @user.reload)
      b1a.settings['protected'] = {'vocabulary' => true}

      b1a.save
      b1b = Board.create(user: @user)
      b1b.settings['protected'] = {'vocabulary' => true}
      b1b.save

      
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b1a.instance_variable_set('@buttons_changed', true)
      b1a.save
      Worker.process_queues
      Worker.process_queues
      expect(b1a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])
      b2a = Board.create(:user => u)
      b2a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b2a.instance_variable_set('@buttons_changed', true)
      b2a.save
      Worker.process_queues
      Worker.process_queues
      expect(b2a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])

      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1a.global_id, :new_board_id => b2a.global_id, :ids_to_copy => [], :new_owner => true}
      expect(response).to be_successful      
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      Progress.perform_action(progress.id)
      Worker.process_queues
      Worker.process_queues
      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      b2a.reload
      expect(b2a.reload.settings['downstream_board_ids'].length).to eq(1)
      b2b = Board.find_by_path(b2a.settings['downstream_board_ids'][0])
      expect(b2b.reload.settings['protected']['vocabulary_owner_id']).to eq(u.global_id)
      expect(b2b.reload.settings['protected']['sub_owner']).to eq(true)
    end

    it "should not allow new_owner if already a sub_owner" do
      u = User.create
      token_user
      User.link_supervisor_to_user(@user, u, nil, true)

      b1a = Board.create(:user => @user.reload)
      b1a.settings['protected'] = {'vocabulary' => true}

      b1a.save
      b1b = Board.create(user: @user)
      b1b.settings['protected'] = {'vocabulary' => true, 'sub_owner' => true}
      b1b.save

      
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b1a.instance_variable_set('@buttons_changed', true)
      b1a.save
      Worker.process_queues
      Worker.process_queues
      b1a.reload.track_downstream_boards!
      expect(b1a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])
      b2a = Board.create(:user => u)
      b2a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b2a.instance_variable_set('@buttons_changed', true)
      b2a.save
      Worker.process_queues
      Worker.process_queues
      b2a.reload.track_downstream_boards!
      expect(b2a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])

      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      
      post :copy_board_links, params: {:user_id => u.global_id, :old_board_id => b1a.global_id, :new_board_id => b2a.global_id, :ids_to_copy => [], :new_owner => true}
      expect(response).to be_successful      
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      Progress.perform_action(progress.id)
      Worker.process_queues
      Worker.process_queues
      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      b2a.reload
      expect(b2a.reload.settings['downstream_board_ids'].length).to eq(1)
      b2b = Board.find_by_path(b2a.settings['downstream_board_ids'][0])
      expect(b2b.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b2b.reload.settings['protected']['sub_owner']).to eq(true)
    end

    # TODO: when a board is copied with a new_owner, it should be marked
    # so that even though it can be copied to other people, those copies
    # can't be copies with new_owner

    it "should not assign new protected vocabulary owner if specified but not authorized" do
      u = User.create
      u2 = User.create
      token_user

      b1a = Board.create(:user => @user.reload, public: true)
      b1a.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => @user.global_id}
      b1a.save

      b1b = Board.create(user: u, public: true)
      b1b.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u.global_id}
      b1b.save
      
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b1a.instance_variable_set('@buttons_changed', true)
      b1a.save
      Worker.process_queues
      Worker.process_queues
      expect(b1a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])
      b2a = Board.create(:user => @user)
      b2a.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b1b.global_id}}]
      b2a.instance_variable_set('@buttons_changed', true)
      b2a.save
      Worker.process_queues
      Worker.process_queues
      b2a.reload.track_downstream_boards!
      expect(b2a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])

      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(u.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      
      post :copy_board_links, params: {:user_id => @user.global_id, :old_board_id => b1a.global_id, :new_board_id => b2a.global_id, :ids_to_copy => [], :new_owner => true}
      expect(response).to be_successful      
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      Progress.perform_action(progress.id)
      Worker.process_queues
      Worker.process_queues
      b2a.reload.track_downstream_boards!
      expect(b1a.reload.settings['protected']['vocabulary_owner_id']).to eq(@user.global_id)
      expect(b1b.reload.settings['protected']['vocabulary_owner_id']).to eq(u.global_id)
      expect(b2a.reload.settings['protected']).to eq(nil)
      expect(b2a.reload.settings['downstream_board_ids'].length).to eq(1)
      expect(b2a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])
    end
  end
  
  describe "hide_device" do
    it "should require api token" do
      delete :hide_device, params: {:user_id => 1, :device_id => 1}
      assert_missing_token
    end
    
    it "should require permission for the user" do
      token_user
      u = User.create
      delete :hide_device, params: {:user_id => u.user_name, :device_id => 1}
      assert_unauthorized
    end
    
    it "should only allow hiding devices for the specified user" do
      token_user
      u2 = User.create
      d = Device.create(:user => u2)
      delete :hide_device, params: {:user_id => @user.user_name, :device_id => d.global_id}
      expect(response.successful?).to eq(false)
      expect(JSON.parse(response.body)['error']).to eq('matching device not found')
    end
    
    it "should successfully hide the device" do
      token_user
      d = Device.create(:user => @user)
      delete :hide_device, params: {:user_id => @user.user_name, :device_id => d.global_id}
      expect(response.successful?).to eq(true)
      expect(JSON.parse(response.body)['hidden']).to eq(true)
    end
  end
  
  describe "rename_device" do
    it "should require api token" do
      put :rename_device, params: {:user_id => 1, :device_id => 1, :device => {:name => 'fred'}}
      assert_missing_token
    end
    
    it "should require permission for the user" do
      token_user
      u = User.create
      put :rename_device, params: {:user_id => u.user_name, :device_id => 1, :device => {:name => 'fred'}}
      assert_unauthorized
    end
    
    it "should only allow hiding devices for the specified user" do
      token_user
      u2 = User.create
      d = Device.create(:user => u2)
      put :rename_device, params: {:user_id => @user.user_name, :device_id => d.global_id, :device => {:name => 'fred'}}
      expect(response.successful?).to eq(false)
      expect(JSON.parse(response.body)['error']).to eq('matching device not found')
    end
    
    it "should successfully hide the device" do
      token_user
      d = Device.create(:user => @user)
      put :rename_device, params: {:user_id => @user.user_name, :device_id => d.global_id, :device => {:name => 'fred'}}
      expect(response.successful?).to eq(true)
      expect(JSON.parse(response.body)['name']).to eq('fred')
    end
  end
  
  describe "confirm_registration" do
    it "should not require api token" do
      post :confirm_registration, params: {:user_id => 1, :code => 'asdf'}
      expect(response).to be_successful
    end
    
    it "should not error on invalid parameters" do
      post :confirm_registration, params: {:user_id => 1, :code => 'asdf'}
      expect(response).to be_successful
      expect(response.body).to eq({confirmed: false}.to_json)
    end
    
    it "should return whether registration was ever confirmed or not" do
      u = User.create
      post :confirm_registration, params: {:user_id => u.global_id, :code => u.registration_code}
      expect(response).to be_successful
      expect(response.body).to eq({confirmed: true}.to_json)

      post :confirm_registration, params: {:user_id => u.global_id, :code => u.registration_code}
      expect(response).to be_successful
      expect(response.body).to eq({confirmed: true}.to_json)

      post :confirm_registration, params: {:user_id => u.global_id, :code => "abc"}
      expect(response).to be_successful
      expect(response.body).to eq({confirmed: true}.to_json)
    end
  end

  describe "forgot_password" do
    it "should not require api token" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      post :forgot_password, params: {:key => u.user_name}
      expect(response).to be_successful
    end
    
    it "should throttle token creation and emailing" do
      u = User.create
      10.times{|i| u.generate_password_reset }
      u.save
      expect(UserMailer).not_to receive(:schedule_delivery)
      post :forgot_password, params: {:key => u.user_name}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['email_sent']).to eq(false)
      expect(json['users']).to eq(0)
      expect(json['message']).to eq('The user matching that name or email has had too many password resets. Please wait at least three hours and try again.')
    end
    
    it "should return message when no users found" do
      post :forgot_password, params: {:key => 'shoelace'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['email_sent']).to eq(false)
      expect(json['users']).to eq(0)
      expect(json['message']).to eq('No users found with that name or email.')
    end
    
    
    it "should schedule a message delivery when non-throttled user is found" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      expect(UserMailer).to receive(:schedule_delivery)
      post :forgot_password, params: {:key => u.user_name}
      expect(response).to be_successful
    end
    
    it "should return a success message when no users found but an email address provided" do
      post :forgot_password, params: {:key => 'shoelace@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['email_sent']).to eq(true)
    end
    
    it "should schedule a message delivery when no user found by an email address provided" do
      expect(UserMailer).to receive(:schedule_delivery).with(:login_no_user, 'shoelace@example.com')
      post :forgot_password, params: {:key => 'shoelace@example.com'}
      expect(response).to be_successful
    end

    it "should not include disabled emails" do
      u = User.create(:settings => {'email' => 'bob@example.com', 'email_disabled' => true})
      expect(UserMailer).not_to receive(:schedule_delivery)
      post :forgot_password, params: {:key => u.user_name}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['email_sent']).to eq(false)
      expect(json['users']).to eq(0)
      expect(json['message']).to eq('The email address for that account has been manually disabled.')
    end
    
    it "should include possibly-multiple users for the given email address" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      post :forgot_password, params: {:key => u.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['email_sent']).to eq(true)
      expect(json['users']).to eq(1)
      
      u2 = User.create(:settings => {'email' => 'bob@example.com'})
      post :forgot_password, params: {:key => 'bob@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['email_sent']).to eq(true)
      expect(json['users']).to eq(2)
    end
    it "should provide helpful message if some user accounts but not others were throttled" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      u2 = User.create(:settings => {'email' => 'bob@example.com'})
      10.times{|i| u.generate_password_reset }
      u.save
      expect(UserMailer).to receive(:schedule_delivery)
      post :forgot_password, params: {:key => 'bob@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['email_sent']).to eq(true)
      expect(json['users']).to eq(2)
      expect(json['message']).to eq("One or more of the users matching that name or email have had too many password resets, so those links weren't emailed to you. Please wait at least three hours and try again.")
    end
  end  

  describe "password_reset" do
    it "should not require api token" do
      post :password_reset, params: {:user_id => 1, :code => 'abc'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['valid']).to eq(false)
    end
    
    it "should throttle to prevent brute force attacks"
    
    it "should return whether the code is valid" do
      post :password_reset, params: {:user_id => 1, :code => 'abc'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['valid']).to eq(false)
    end
    
    it "should return a reset token on valid code exchange" do
      u = User.create
      u.generate_password_reset
      post :password_reset, params: {:user_id => u.global_id, :code => u.password_reset_code}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['valid']).to eq(true)
      expect(json['reset_token']).not_to eq(nil)
      expect(u.reload.valid_reset_token?(json['reset_token'])).to eq(true)
    end
  end
  
  describe "flush_logs" do
    it "should require api token" do
      post :flush_logs, params: {:user_id => 1}
      assert_missing_token
    end
    
    it "should require delete permission" do
      token_user
      @user2 = User.create
      User.link_supervisor_to_user(@user, @user2, nil, true)
      expect(@user.supervisor_for?(@user2)).to eq(true)
      post :flush_logs, params: {:user_id => @user2.global_id}
      assert_unauthorized
    end
    
    it "should error if user_name is not provided correctly" do
      token_user
      post :flush_logs, params: {:user_id => @user.global_id, :confirm_user_id => @user.global_id}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['flushed']).to eq("false")
    end
    
    it "should error if confirm_user_id is not provided correctly" do
      token_user
      post :flush_logs, params: {:user_id => @user.global_id, :user_name => @user.user_name, :confirm_user_id => 'asdf'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['flushed']).to eq("false")
    end
    
    it "should return a progress object" do
      token_user
      post :flush_logs, params: {:user_id => @user.global_id, :confirm_user_id => @user.global_id, :user_name => @user.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('Flusher')
      expect(progress.settings['method']).to eq('flush_user_logs')
      expect(progress.settings['arguments']).to eq([@user.global_id, @user.user_name])
    end
  end
  
  describe "flush_user" do
    it "should require api token" do
      post :flush_user, params: {:user_id => 1}
      assert_missing_token
    end
    
    it "should require delete permission" do
      token_user
      @user2 = User.create
      User.link_supervisor_to_user(@user, @user2, nil, true)
      expect(@user.supervisor_for?(@user2)).to eq(true)
      post :flush_user, params: {:user_id => @user2.global_id}
      assert_unauthorized
    end
    
    it "should error if user_name is not provided correctly" do
      token_user
      post :flush_user, params: {:user_id => @user.global_id}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['flushed']).to eq("false")
    end
    
    it "should return a result object" do
      token_user
      post :flush_user, params: {:user_id => @user.global_id, :confirm_user_id => @user.global_id, :user_name => @user.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'flushed' => 'pending'})
    end

    it "should cancel all subscriptions" do
      token_user
      expect(Purchasing).to receive(:cancel_other_subscriptions).with(@user, 'all')
      post :flush_user, params: {:user_id => @user.global_id, :confirm_user_id => @user.global_id, :user_name => @user.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'flushed' => 'pending'})
    end
  end

  describe "daily_stats" do
    it "should require an api token" do
      get 'daily_stats', params: {:user_id => 'asdf'}
      assert_missing_token
    end
    
    it "should not be allowed in valet mode" do
      valet_token_user
      get 'daily_stats', params: {:user_id => @user.global_id}
      assert_unauthorized
    end

    it "should error on expected errors" do
      token_user
      expect(Stats).to receive(:daily_use).with(@user.global_id, {}).and_raise(Stats::StatsError, 'bacon')
      get 'daily_stats', params: {:user_id => @user.global_id}
      expect(response.code).to eq("400")
      json = JSON.parse(response.body)
      expect(json['error']).to eq('bacon')
    end
    
    it "should return a stats result" do
      token_user
      get 'daily_stats', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['start_at']).not_to eq(nil)
      expect(json['end_at']).not_to eq(nil)
      expect(json['total_utterances']).to eq(0)
    end
    
    it "should use the provided date range" do
      token_user
      get 'daily_stats', params: {:user_id => @user.global_id, :start => '2014-01-01', :end => '2014-03-01'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['start_at']).to match('2014-01-01')
      expect(json['end_at']).to match('2014-03-01')
      expect(json['total_utterances']).to eq(0)
    end
    
    it "should error on too large a date range" do
      token_user
      get 'daily_stats', params: {:user_id => @user.global_id, :start => '2014-01-01', :end => '2014-10-01'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('time window cannot be greater than 6 months')
    end
    
    it "should not allow eval accounts to see too far back in history" do
      token_user
      @user.settings['subscription'] ||= {}
      @user.settings['subscription']['eval_account'] = true
      @user.save
      expect(@user.reload.eval_account?).to eq(true)
      get 'daily_stats', params: {:user_id => @user.global_id, :start => '2014-01-01', :end => '2014-03-01'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['start_at'][0, 10]).to be > 3.months.ago.to_date.iso8601
      expect(json['end_at'][0, 10]).to be > 3.months.ago.to_date.iso8601
      expect(json['total_utterances']).to eq(0)
    end
  end  

  describe "hourly_stats" do
    it "should require an api token" do
      get 'hourly_stats', params: {:user_id => 'asdf'}
      assert_missing_token
    end
    
    it "should error on expected errors" do
      token_user
      expect(Stats).to receive(:hourly_use).with(@user.global_id, {}).and_raise(Stats::StatsError, 'bacon')
      get 'hourly_stats', params: {:user_id => @user.global_id}
      expect(response.code).to eq("400")
      json = JSON.parse(response.body)
      expect(json['error']).to eq('bacon')
    end
    
    it "should return a stats result" do
      token_user
      get 'hourly_stats', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['start_at']).not_to eq(nil)
      expect(json['end_at']).not_to eq(nil)
      expect(json['total_utterances']).to eq(0)
    end
  end
  
  describe "subscribe" do
    it "should require an api token" do
      post :subscribe, params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require edit permissions" do
      token_user
      u = User.create
      post :subscribe, params: {:user_id => u.global_id}
      assert_unauthorized
    end

    it "should schedule token processing" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(@user, :process_subscription_token, {'code' => 'abc'}, 'monthly_6', nil).and_return(p)
      post :subscribe, params: {:user_id => @user.global_id, :token => {'code' => 'abc'}, :type => 'monthly_6'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end
    
    it "should allow redeeming a gift purchase" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(@user, :redeem_gift_token, 'abc').and_return(p)
      post :subscribe, params: {:user_id => @user.global_id, :token => {'code' => 'abc'}, :type => 'gift_code'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end

    it "should process the redemption" do
      g = GiftPurchase.process_new({}, {
        'email' => 'bob@example.com',
        'seconds' => 3.years.to_i
      })
      token_user
      exp = @user.expires_at
      
      post :subscribe, params: {:user_id => @user.global_id, :token => {'code' => g.code}, :type => 'gift_code'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
      id = json['progress']['id']
      
      Worker.process_queues
      progress = Progress.find_by_global_id(id)
      expect(progress.settings['state']).to eq('finished')

      @user.reload
      expect(@user.expires_at).to eq(exp + 3.years.to_i)
    end
    
    it "should let admins set a subscription to never_expires" do
      token_user
      u = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      
      post :subscribe, params: {:user_id => u.global_id, :type => 'never_expires'}
      expect(response).to be_successful
      
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
      Worker.process_queues
      expect(u.reload.never_expires?).to eq(true)
    end
    
    it "should let admins set a subscription to eval" do
      token_user
      u = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      
      post :subscribe, params: {:user_id => u.global_id, :type => 'eval'}
      expect(response).to be_successful
      
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
      Worker.process_queues
      expect(u.reload.settings['subscription']['plan_id']).to eq('eval_monthly_granted')
    end
    
    it "should let admins set a subscription to gift_code" do
      token_user
      u = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      
      post :subscribe, params: {:user_id => u.global_id, :type => 'gift_code', token: {'code' => 'asdf'}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end

    it "should not let non-admins set a subscription to never_expires" do
      token_user
      post :subscribe, params: {:user_id => @user.global_id, :type => 'never_expires'}
      assert_unauthorized
    end
    
    it "should not let non-admins set a subscription to eval" do
      token_user
      post :subscribe, params: {:user_id => @user.global_id, :type => 'eval'}
      assert_unauthorized
    end
    
    it "should cancel any active subscription when admins set to free supporter" do
      token_user
      @user.update_subscription({
        'subscribe' => true,
        'plan_id' => 'monthly_6',
        'subscription_id' => 'asdf',
        'token_summary' => 'good_one'
      })
      expect(@user.full_premium?).to eq(true)

      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      
      post :subscribe, params: {:user_id => @user.global_id, :type => 'manual_supporter'}
      expect(response).to be_successful
      
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
      Worker.process_queues
      expect(@user.reload.settings['subscription']['plan_id']).to eq('slp_monthly_granted')
      expect(@user.full_premium?).to eq(false)
      expect(@user.grace_period?).to eq(false)
    end
   
    it "should let admins add a premium voice" do
      token_user
      u = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      
      post :subscribe, params: {:user_id => u.global_id, :type => 'add_voice'}
      expect(response).to be_successful
      
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
      Worker.process_queues
      expect(u.reload.settings['premium_voices']).to eq({'claimed' => [], 'allowed' => 1, 'extra' => 1})
    end
    
    it "should let admins add premium extras" do
      token_user
      u = User.create
      u.settings['extras_disabled'] = true
      u.save
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)

      expect(u.subscription_hash['extras_enabled']).to eq(nil)
      
      post :subscribe, params: {:user_id => u.global_id, :type => 'enable_extras'}
      expect(response).to be_successful
      
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
      Worker.process_queues
      expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
    end

    it "should not let non-admins add a premium voice" do
      token_user
      u = User.create
      
      post :subscribe, params: {:user_id => u.global_id, :type => 'add_voice'}
      assert_unauthorized
      
      expect(u.reload.settings['premium_voices']).to eq(nil)
    end
    
    it "should require api token for gift_code requests" do
      g = GiftPurchase.process_new({}, {
        'email' => 'bob@example.com',
        'seconds' => 3.years.to_i
      })
      @user = User.create
      exp = @user.expires_at
      
      post :subscribe, params: {:user_id => @user.global_id, :token => {'code' => g.code}, :type => 'gift_code'}
      assert_missing_token
    end
    
    it "should require api token for override requests" do
      @user = User.create
      u = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      
      post :subscribe, params: {:user_id => u.global_id, :type => 'never_expires'}
      assert_missing_token
    end
    
    it "should allow updating a subscription with no api token, but a confirmation code" do
      @user = User.create
      p = Progress.create
      expect(Progress).to receive(:schedule).with(@user, :process_subscription_token, {'code' => 'abc'}, 'monthly_6', nil).and_return(p)
      post :subscribe, params: {:user_id => @user.global_id, :confirmation => @user.registration_code, :token => {'code' => 'abc'}, :type => 'monthly_6'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end
    
    it "should not allow updating a subscription with no api token and no confirmation code" do
      @user = User.create
      post :subscribe, params: {:user_id => @user.global_id, :confirmation => 'abc', :token => {'code' => 'abc'}, :type => 'monthly_6'}
      assert_missing_token
    end
  end
  
  describe "unsubscribe" do
    it "should require an api token" do
      delete :unsubscribe, params: {:user_id => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid user" do
      token_user
      delete :unsubscribe, params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require edit permissions" do
      token_user
      u = User.create
      delete :unsubscribe, params: {:user_id => u.global_id}
      assert_unauthorized
    end

    it "should schedule token processing" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(@user, :process_subscription_token, 'token', 'unsubscribe').and_return(p)
      delete :unsubscribe, params: {:user_id => @user.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end
  end

  describe "verify_receipt" do
    it "should require an api token" do
      post :verify_receipt, params: {user_id: 'asdf'}
      assert_missing_token
    end

    it "should require a valid user" do
      token_user 
      post :verify_receipt, params: {user_id: 'asdf'}
      assert_not_found('asdf')
    end

    it "should require edit permissions" do
      token_user 
      u = User.create
      post :verify_receipt, params: {user_id: u.global_id}
      assert_unauthorized
    end

    it "should return a progress object" do
      token_user
      post :verify_receipt, params: {user_id: @user.global_id, receipt_data: {a: 1, b: 'asdf', c: true}}
      json = assert_success_json
      expect(json['progress']['id']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('User')
      expect(progress.settings['method']).to eq('verify_receipt')
      expect(progress.settings['id']).to eq(@user.id)
      expect(progress.settings['arguments']).to eq([{'a' => '1', 'b' => 'asdf', 'c' => 'true'}])
    end
  end

  describe "claim_voice" do
    it "should require api token" do
      post :claim_voice, params: {:user_id => '1_99999'}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      post :claim_voice, params: {:user_id => 'abcdef'}
      assert_not_found('abcdef')
    end
    
    it "should require edit permissions" do
      token_user
      u = User.create
      post :claim_voice, params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should return an error if add_voice fails" do
      token_user

      @user.settings['premium_voices'] = {'allowed' => 0}
      @user.expires_at = 6.years.ago
      @user.save
      post :claim_voice, params: {:user_id => @user.global_id, :voice_id => 'acbdef'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('no more voices available')
    end
    
    it "should return success and add the voice if correct" do
      token_user
      @user.subscription_override('never_expires')
      post :claim_voice, params: {:user_id => @user.global_id, :voice_id => 'asdf'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'voice_added' => true, 'voice_id' => 'asdf'})
      @user.reload
      expect(@user.settings['premium_voices']['claimed']).to eq(['asdf'])
    end
    
    it "should generate a signed download url on success" do
      token_user
      @user.subscription_override('never_expires')
      expect(Uploader).to receive(:signed_download_url).with('asdf').and_return("asdfjkl")
      post :claim_voice, params: {:user_id => @user.global_id, :voice_id => 'asdf', :voice_url => 'asdf'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'voice_added' => true, 'voice_id' => 'asdf', 'download_url' => 'asdfjkl'})
    end
  end
  
  describe "rename" do
    it "should require api token" do
      post :rename, params: {:user_id => "1_1"}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      post :rename, params: {:user_id => "1_19999"}
      assert_not_found
    end

    it "should require admin permissions" do
      u = User.create
      token_user
      post :rename, params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should rename the user" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)

      post :rename, params: {:user_id => @user.global_id, :old_key => @user.user_name, :new_key => "wilford"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'rename' => true, 'key' => "wilford"})
    end

    it "should require the correct old_key" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)

      post :rename, params: {:user_id => @user.global_id, :old_key => @user.user_name + "asdf", :new_key => "wilford"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('user rename failed')
    end

    it "should not fail on miscapitalization" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)

      expect(@user.reload.user_name).to_not eq('wilford')
      post :rename, params: {:user_id => @user.global_id, :old_key => @user.user_name.upcase, :new_key => "wilford"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'rename' => true, 'key' => "wilford"})
      expect(@user.reload.user_name).to eq('wilford')
    end


    it "should require a valid new_key" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)

      post :rename, params: {:user_id => @user.global_id, :old_key => @user.user_name}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      assert_unauthorized
    end

    it "should require a non-empty new_key" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)

      post :rename, params: {:user_id => @user.global_id, :old_key => @user.user_name, :new_key => ""}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      assert_unauthorized
    end

    it "should report if there was a new_key name collision" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)

      u2 = User.create
      post :rename, params: {:user_id => @user.global_id, :old_key => @user.user_name, :new_key => u2.user_name}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('user rename failed')
      expect(json['collision']).to eq(true)
    end
  end

  describe "activate_button" do
    it "should not require an api token" do
      post :activate_button, params: {:user_id => 'asdf', :board_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require a valid user" do
      token_user
      post :activate_button, params: {:user_id => 'asdf', :board_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require an authorized user" do
      token_user
      u = User.create
      post :activate_button, params: {:user_id => u.global_id, :board_id => 'asdf'}
      assert_unauthorized
    end
    
    it "should require a valid board" do
      token_user
      post :activate_button, params: {:user_id => @user.global_id, :board_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require an authorized board" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post :activate_button, params: {:user_id => @user.global_id, :board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should require a valid button" do
      token_user
      b = Board.create(:user => @user)
      post :activate_button, params: {:user_id => @user.global_id, :board_id => b.global_id}
      assert_error('button not found')
    end
    
    it "should require an integration button" do
      token_user
      b = Board.create(:user => @user)
      b.settings['buttons'] = [{
        'id' => '1'
      }]
      b.save
      post :activate_button, params: {:user_id => @user.global_id, :board_id => b.global_id, :button_id => '1'}
      assert_error('button integration not configured')
    end
    
    it "should return a progress record" do
      token_user
      ui = UserIntegration.create(:user => @user)
      b = Board.create(:user => @user)
      b.settings['buttons'] = [{
        'id' => '1',
        'integration' => {'user_integration_id' => ui.global_id}
      }]
      b.save
      post :activate_button, params: {:user_id => @user.global_id, :board_id => b.global_id, :button_id => '1'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).to_not eq(nil)
      id = json['progress']['id']
      progress = Progress.find_by_path(id)
      expect(progress.settings['arguments']).to eq(['button_action', {'user_id' => @user.global_id, 'immediate' => true, 'associated_user_id' => nil, 'button_id' => '1'}])
      expect(progress.settings['class']).to eq('Board')
      expect(progress.settings['method']).to eq('notify')
    end
    
    it "should attach an associated user if specified and authorized" do
      token_user
      ui = UserIntegration.create(:user => @user)
      b = Board.create(:user => @user)
      b.settings['buttons'] = [{
        'id' => '1',
        'integration' => {'user_integration_id' => ui.global_id}
      }]
      b.save
      post :activate_button, params: {:user_id => @user.global_id, :board_id => b.global_id, :button_id => '1', :associated_user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).to_not eq(nil)
      id = json['progress']['id']
      progress = Progress.find_by_path(id)
      expect(progress.settings['arguments']).to eq(['button_action', {'user_id' => @user.global_id, 'immediate' => true, 'associated_user_id' => @user.global_id, 'button_id' => '1'}])
      expect(progress.settings['class']).to eq('Board')
      expect(progress.settings['method']).to eq('notify')
    end
    
    it "should not attach an associated user if specified but not authorized" do
      token_user
      u = User.create
      ui = UserIntegration.create(:user => @user)
      b = Board.create(:user => @user)
      b.settings['buttons'] = [{
        'id' => '1',
        'integration' => {'user_integration_id' => ui.global_id}
      }]
      b.save
      post :activate_button, params: {:user_id => @user.global_id, :board_id => b.global_id, :button_id => '1', :associated_user_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).to_not eq(nil)
      id = json['progress']['id']
      progress = Progress.find_by_path(id)
      expect(progress.settings['arguments']).to eq(['button_action', {'user_id' => @user.global_id, 'immediate' => true, 'associated_user_id' => nil, 'button_id' => '1'}])
      expect(progress.settings['class']).to eq('Board')
      expect(progress.settings['method']).to eq('notify')
    end
  end
  
  describe 'GET supervisors' do
    it "should require a valid token" do
      get 'supervisors', params: {'user_id' => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid record" do
      token_user
      get 'supervisors', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      get 'supervisors', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated result" do
      token_user
      u = User.create
      User.link_supervisor_to_user(u, @user)
      get 'supervisors', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['meta']['more']).to eq(false)
      expect(json['user'].length).to eq(1)
      expect(json['user'][0]['id']).to eq(u.global_id)
    end
  end
  
  describe 'GET supervisees' do
    it "should require a valid token" do
      get 'supervisees', params: {'user_id' => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid record" do
      token_user
      get 'supervisees', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      get 'supervisees', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated result" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get 'supervisees', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['meta']['more']).to eq(false)
      expect(json['user'].length).to eq(1)
      expect(json['user'][0]['id']).to eq(u.global_id)
    end
  end
  
  describe "GET 'sync_stamp'" do
    it "should require an access token" do
      get 'sync_stamp', params: {'user_id' => 'asdf'}
        assert_missing_token
    end
    
    it "should require a valid user" do
      token_user
      get 'sync_stamp', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      get 'sync_stamp', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
    
    it "should return the user's sync stamp" do
      token_user
      get 'sync_stamp', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['sync_stamp']).to eq(@user.updated_at.utc.iso8601)
    end
  end
  
  describe "translate" do
    it "should require an access token" do
      post 'translate', params: {:user_id => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid user" do
      token_user
      post 'translate', params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      post 'translate', params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should call translate action and return the result" do
      token_user
      words = ['a', 'b', 'c']
      expect(WordData).to receive(:translate_batch).with(words.map{|w| {:text => w} }, 'en', 'es').and_return({a: 'a'})
      post 'translate', params: {:user_id => @user.global_id, :words => words, :source_lang => 'en', :destination_lang => 'es'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'a' => 'a'})
    end
  end
  
  describe "board_revisions" do
    it "should require an access token" do
      get 'board_revisions', params: {:user_id => '1_000'}
      assert_missing_token
    end
    
    it "should require a valid user" do
      token_user
      get 'board_revisions', params: {:user_id => '1_000'}
      assert_not_found('1_000')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      get 'board_revisions', params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should return revisions for all home board links and sidebar board links" do
      token_user
      b1 = Board.create(:user => @user)
      b2 = Board.create(:user => @user)
      b3 = Board.create(:user => @user)
      b4 = Board.create(:user => @user)
      b5 = Board.create(:user => @user)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b1.instance_variable_set('@buttons_changed', true)
      b1.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.instance_variable_set('@buttons_changed', true)
      b2.save
      @user.settings['preferences']['home_board'] = {'id' => b1.global_id, 'key' => b1.key}

      @user.settings['preferences']['sidebar_boards'] = [{'key' => b4.key}]
      @user.save
      Worker.process_queues
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids'].sort).to eq([b2.global_id, b3.global_id].sort)
      get 'board_revisions', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      hash = {}
      hash[b1.global_id] = b1.reload.current_revision
      hash[b1.key] = b1.current_revision
      hash[b2.global_id] = b2.reload.current_revision
      hash[b2.key] = b2.current_revision
      hash[b3.global_id] = b3.reload.current_revision
      hash[b3.key] = b3.current_revision
      hash[b4.global_id] = b4.reload.current_revision
      hash[b4.key] = b4.current_revision
      expect(json).to eq(hash)
    end

    it "should include starred boards only if in the user preferences" do
      token_user
      b1 = Board.create(:user => @user)
      b2 = Board.create(:user => @user)
      b3 = Board.create(:user => @user)
      b4 = Board.create(:user => @user)
      b5 = Board.create(:user => @user)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b1.instance_variable_set('@buttons_changed', true)
      b1.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.instance_variable_set('@buttons_changed', true)
      b2.save
      @user.settings['preferences']['home_board'] = {'id' => b1.global_id, 'key' => b1.key}

      @user.settings['preferences']['sidebar_boards'] = [{'key' => b4.key}]
      @user.settings['preferences']['sync_starred_boards'] = true
      @user.settings['starred_board_ids'] = [b5.global_id]
      @user.save
      Worker.process_queues
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids'].sort).to eq([b2.global_id, b3.global_id].sort)
      get 'board_revisions', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      hash = {}
      hash[b1.global_id] = b1.reload.current_revision
      hash[b1.key] = b1.current_revision
      hash[b2.global_id] = b2.reload.current_revision
      hash[b2.key] = b2.current_revision
      hash[b3.global_id] = b3.reload.current_revision
      hash[b3.key] = b3.current_revision
      hash[b4.global_id] = b4.reload.current_revision
      hash[b4.key] = b4.current_revision
      hash[b5.global_id] = b5.reload.current_revision
      hash[b5.key] = b5.current_revision
      expect(json).to eq(hash)
    end
  end
  
  describe "places" do
    it "should require an access token" do
      get 'places', params: {:user_id => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid user" do
      token_user
      get 'places', params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      get 'places', params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should return a list of places" do
      token_user
      expect(Geolocation).to receive(:find_places).with(nil, nil).and_return([])
      get 'places', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
    end
  end
  
  describe "daily_use" do
    it 'should require an access token' do
      get 'daily_use', params: {:user_id => 'asdf'}
      assert_missing_token
    end
    
    it 'should require a valid user' do
      token_user
      get 'daily_use', params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should allow a user to check their own daily use when a log exists" do
      token_user
      d = Device.create(:user => @user)
      LogSession.process_as_follow_on({
        'type' => 'daily_use',
        'events' => [{'date' => Date.today.iso8601, 'active' => true}]
      }, {:device => d, :user => @user, :author => @user})
      get :daily_use, params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log']).to_not eq(nil)
    end

    it "should return error when user has no daily_use log" do
      token_user
      get :daily_use, params: {:user_id => @user.global_id}
      expect(response).to have_http_status(:bad_request)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('No daily_use log found for this user')
    end

    it "should not allow a supervisor without admin_support_actions to check another user's daily use" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get :daily_use, params: {:user_id => u.global_id}
      assert_unauthorized
    end

    it "should allow an org admin to check a user's daily use" do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      u = User.create
      d = Device.create(:user => u)
      LogSession.process_as_follow_on({
        'type' => 'daily_use',
        'events' => [{'date' => Date.today.iso8601, 'active' => true}]
      }, {:device => d, :user => u, :author => u})
      get :daily_use, params: {:user_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log']).to_not eq(nil)
    end

    it 'should return data if available' do
      token_user
      d = Device.create(:user => @user)
      log = LogSession.process_as_follow_on({
        'type' => 'daily_use',
        'events' => [
          {'date' => '2016-01-01', 'active' => true},
          {'date' => Date.today.iso8601, 'active' => true}
        ]
      }, {:device => d, :user => @user, :author => @user})
      expect(log).to_not eq(nil)
      get 'daily_use', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log']).to_not eq(nil)
      expect(json['log']['id']).to eq(log.global_id)
      expect(json['log']['daily_use']).to eq([{
        'date' => Date.today.iso8601, 'active' => true, 'activity_level' => nil
      }])
    end
  end
  
  describe "history" do
    it 'should require api token' do
      get 'history', :params => {'user_id' => 'asdf'}
      assert_missing_token
    end
    
    it 'should require a valid user' do
      token_user
      get 'history', :params => {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it 'should require admin authorization' do
      token_user
      get 'history', :params => {'user_id' => @user.global_id}
      assert_unauthorized
    end
    
    it 'should return a list of versions' do
      token_user
      o = Organization.create(:admin => true)
      o.add_manager(@user.user_name, true)
      u = User.create
      get 'history', :params => {'user_id' => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['userversion']).to eq([])
    end
  end
  
  describe "core_lists" do
    it "should require api token" do
      get 'core_lists', params: {'user_id' => 'asdf'}
      assert_missing_token
    end
     
    it "should require a valid user" do
      token_user
      get 'core_lists', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
     
    it "should require supervise authorization for a valid user" do
      token_user
      u = User.create
      get 'core_lists', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
     
    it "should return core lists" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, false)
      @user.reload
      u.reload
      expect(u.allows?(@user, 'edit')).to eq(false)
      expect(u.allows?(@user, 'supervise')).to eq(true)
      get 'core_lists', params: {'user_id' => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to_not eq(nil)
      expect(json['for_user']).to_not eq(nil)
      expect(json['defaults'].length).to be > 0
    end
     
    it "should return successfully for the 'none' user" do
      token_user
      get 'core_lists', params: {'user_id' => 'none'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to_not eq(nil)
      expect(json['for_user']).to eq(nil)
      expect(json['defaults'].length).to be > 0
    end
     
    it "should return a user's core lists" do
      token_user
      ui = UserIntegration.create(:template => true, :integration_key => 'core_word_list')
      ui2 = UserIntegration.create(:template_integration_id => ui.id, :user => @user)
      ui2.settings['core_word_list'] = {
        id: 'bacon',
        words: ['a', 'b', 'c', 'd']
      }
      ui2.save
      get 'core_lists', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to_not eq(nil)
      expect(json['for_user']).to eq(['a', 'b', 'c', 'd'])
      expect(json['defaults'].length).to be > 0
    end
    
    it "should include fringe lists" do
      token_user
      ui = UserIntegration.create(:template => true, :integration_key => 'core_word_list')
      ui2 = UserIntegration.create(:template_integration_id => ui.id, :user => @user)
      ui2.settings['core_word_list'] = {
        id: 'bacon',
        words: ['a', 'b', 'c', 'd']
      }
      ui2.save
      get 'core_lists', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['reachable_fringe_for_user']).to eq([])
    end
  end
  
  describe "message_bank_suggestions" do
    it "should require api token" do
      get 'message_bank_suggestions', params: {'user_id' => 'asdf'}
      assert_missing_token
    end
    
    it "should return a list" do
      token_user
      get 'message_bank_suggestions', params: {'user_id' => 'asdf'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json.length).to be > 0
      expect(json[0]['id']).to eq('boston_childrens')
    end
  end
  
  describe "update_core_list" do
    it "should require api token" do
      put 'update_core_list', params: {'user_id' => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid user" do
      token_user
      put 'update_core_list', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, false)
      u.reload
      @user.reload
      expect(u.allows?(@user, 'edit')).to eq(false)
      expect(u.allows?(@user, 'supervise')).to eq(true)
      put 'update_core_list', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
    
    it "should error if no template is defined" do
      token_user
      put 'update_core_list', params: {'user_id' => @user.global_id, 'id' => 'bacon', 'words' => ['a', 'b', 'c']}
      assert_error('no core word list integration defined')
    end
    
    it "should set the user's core list" do
      token_user
      ui = UserIntegration.create(:template => true, :integration_key => 'core_word_list')
      put 'update_core_list', params: {'user_id' => @user.global_id, 'id' => 'bacon', 'words' => ['a', 'b', 'c']}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'updated' => true, 'words' => {'id' => 'bacon', 'words' => ['a', 'b', 'c']}})
      ui = UserIntegration.find_by(:user_id => @user.id, :template_integration_id => ui.id)
      expect(ui).to_not eq(nil)
      expect(ui.settings).to_not eq(nil)
      expect(ui.settings['core_word_list']).to eq({'id' => 'bacon', 'words' => ['a', 'b', 'c']})
    end
  end
  
  describe "protected_image" do
    it 'should not require an access token' do
      get 'protected_image', params: {'user_id' => 'asdf', 'library' => 'whatever', 'image_id' => '123'}
      expect(response).to be_redirect
    end
    
    it 'should redirect without a valid user' do
      get 'protected_image', params: {'user_id' => 'asdf', 'library' => 'whatever', 'image_id' => '123'}
      expect(response).to be_redirect
      expect(response.location).to eq('http://test.host/images/square.svg')
    end

    it 'should stream to a fallback url if defined' do
      res = OpenStruct.new(headers: {'Content-Type' => 'image/png', body: 'asdf'})
      expect(Typhoeus).to receive(:get).with('https://lessonpix.com/drawings/123/100x100/123.png', {timeout: 3}).and_return(res)
      get 'protected_image', params: {'user_id' => 'asdf', 'library' => 'lessonpix', 'image_id' => '123'}
      expect(response).to be_successful
      expect(response.headers['Content-Type']).to eq('image/png')
      expect(response.headers['Content-Disposition']).to eq('inline')
    end
    
    it 'should redirect if no match found' do
      u = User.create
      expect(Uploader).to receive(:found_image_url).with('123', 'good_library', u).and_return(nil).at_least(1).times
      get 'protected_image', params: {'user_id' => u.global_id, 'user_token' => u.user_token, 'library' => 'good_library', 'image_id' => '123'}
      expect(response).to be_redirect
      expect(response.location).to eq('http://test.host/images/error.png')
    end

    it 'should stream a fallback url if defined if no match found' do
      u = User.create
      expect(Uploader).to receive(:found_image_url).with('123', 'lessonpix', u).and_return(nil).at_least(1).times
      res = OpenStruct.new(headers: {'Content-Type' => 'image/png', body: 'asdf'})
      expect(Typhoeus).to receive(:get).with('https://lessonpix.com/drawings/123/100x100/123.png', {timeout: 3}).and_return(res)
      get 'protected_image', params: {'user_id' => u.global_id, 'user_token' => u.user_token, 'library' => 'lessonpix', 'image_id' => '123'}
      expect(response).to be_successful
      expect(response.headers['Content-Type']).to eq('image/png')
      expect(response.headers['Content-Disposition']).to eq('inline')
    end
    
    it 'should return the correct search result' do
      u = User.create
      expect(Uploader).to receive(:found_image_url).with('123', 'good_library', u).and_return('http://www.example.com/pic.png')
      res = OpenStruct.new(headers: {'Content-Type' => 'image/png', body: 'asdf'})
      expect(Typhoeus).to receive(:get).with('http://www.example.com/pic.png', {timeout: 3}).and_return(res)
      get 'protected_image', params: {'user_id' => u.global_id, 'user_token' => u.user_token, 'library' => 'good_library', 'image_id' => '123'}
      expect(response).to be_successful
      expect(response.headers['Content-Type']).to eq('image/png')
      expect(response.headers['Content-Disposition']).to eq('inline')
    end
    
    it "should handle a single redirect if defined" do
      u = User.create
      expect(Uploader).to receive(:found_image_url).with('123', 'good_library', u).and_return('http://www.example.com/pic.png')
      res1 = OpenStruct.new(headers: {'Location' => 'http://www.example.com/redirect/pic.png'})
      res2 = OpenStruct.new(headers: {'Content-Type' => 'image/png', body: 'asdf'})
      expect(Typhoeus).to receive(:get).with('http://www.example.com/pic.png', {timeout: 3}).and_return(res1)
      expect(Typhoeus).to receive(:get).with('http://www.example.com/redirect/pic.png', {timeout: 3}).and_return(res2)
      get 'protected_image', params: {'user_id' => u.global_id, 'user_token' => u.user_token, 'library' => 'good_library', 'image_id' => '123'}
      expect(response).to be_successful
      expect(response.headers['Content-Type']).to eq('image/png')
      expect(response.headers['Content-Disposition']).to eq('inline')
    end
    
    it 'should redirect to the cached copy if found' do
      u = User.create
      bi = ButtonImage.create(user: u, url: 'lingolinq://protected_image/lessonpix/12345', settings: {'cached_copy_url' => 'http://www.example.com/pic.png'})
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({})
      get 'protected_image', params: {'user_id' => u.global_id, 'user_token' => u.user_token, 'library' => 'lessonpix', 'image_id' => '12345'}
      expect(response).to be_redirect
      expect(response.location).to eq('http://www.example.com/pic.png')
    end
  end
  
  describe "word_map" do
    it "should require an api token" do
      get 'word_map', params: {'user_id' => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid user" do
      token_user
      get 'word_map', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      get 'word_map', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
    
    it "should return the word map" do
      token_user
      expect(BoardDownstreamButtonSet).to receive(:word_map_for){|user|
        expect(user).to eq(@user)
      }.and_return({a: 1})
      get 'word_map', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'a' => 1})
    end
  end

  describe "alerts" do
    it "should require an api token" do
      get 'alerts', params: {'user_id' => 'asdf'}
      assert_missing_token
    end

    it "should require an existing user" do
      token_user
      get 'alerts', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require authorization" do
      token_user
      u = User.create
      get 'alerts', params: {'user_id' => u.global_id}
      assert_unauthorized
    end

    it "should return a list of alerts" do
      token_user
      l1 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'note', data: {'notify_user' => true, 'note' => {'text' => 'asdf'}})
      l2 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'note', data: {'notify_user' => true, 'author_contact' => {'id' => 'a3a4t42', 'name' => 'Bob'}, 'note' => {'text' => 'asdf'}})
      LogSession.where(id: l1.id).update_all(created_at: 1.hour.ago)
      get 'alerts', params: {'user_id' => @user.global_id}
      json = assert_success_json
      expect(json['alert']).to_not eq(nil)
      expect(json['alert'].length).to eq(2)
      expect(json['alert'][0]['id']).to eq(Webhook.get_record_code(l2))
      expect(json['alert'][1]['id']).to eq(Webhook.get_record_code(l1))
      expect(json['alert'][0]['author']['name']).to eq("Bob")
    end

    it "should not include invalid sessions" do
      token_user
      l1 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'note', data: {'notify_user' => false})
      l2 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'session')
      l3 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'note', data: {'notify_user' => true, 'note' => {'text' => 'bacon rocks'}})
      get 'alerts', params: {'user_id' => @user.global_id}
      json = assert_success_json
      expect(json['alert']).to_not eq(nil)
      expect(json['alert'].length).to eq(1)
      expect(json['alert'][0]['id']).to eq(Webhook.get_record_code(l3))
      expect(json['alert'][0]['text']).to eq('bacon rocks')
      expect(json['alert'][0]['author']['name']).to eq(@user.user_name)
    end

    it "should not include cleared sessions" do
      token_user
      l1 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'note', data: {'notify_user' => false})
      l2 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'session')
      l3 = LogSession.create(user: @user, author: @user, :device => @user.devices[0], log_type: 'note', data: {'notify_user' => true, 'cleared' => true, 'note' => {'text' => 'bacon rocks'}})
      get 'alerts', params: {'user_id' => @user.global_id}
      json = assert_success_json
      expect(json['alert']).to_not eq(nil)
      expect(json['alert'].length).to eq(0)
    end
  end

  describe "GET ws_settings" do
    it 'should require authentication' do
      get 'ws_settings', params: {user_id: ''}
      assert_missing_token
    end

    it 'should require a user_id' do
      token_user
      get 'ws_settings', params: {user_id: 'some'}
      assert_not_found('some')
    end

    it 'should require authorization' do
      token_user
      u = User.create
      get 'ws_settings', params: {user_id: u.global_id}
      assert_unauthorized
    end

    it 'should return room info for self' do
      token_user
      get 'ws_settings', params: {user_id: 'self'}
      json = assert_success_json
      expect(json['user_id']).to eq(@user.global_id)
      expect(json['ws_user_id']).to_not eq(nil)
      expect(json['my_device_id']).to match(/me\$.+\$.+/)
      code, ts = json['verifier'].split(/:/, 2)
      expect(ts.to_i).to be > 5.seconds.ago.to_i
      expect(ts.to_i).to be < 5.seconds.from_now.to_i
      expect(code).to eq(GoSecure.sha512("#{json['ws_user_id']}:#{json['my_device_id']}:#{ts}", "room_join_verifier", ENV['CDWEBSOCKET_SHARED_VERIFIER'])[0, 30])
      expect(json['supervisees']).to eq(nil)
    end

    it "should include room info for supervisees on self" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get 'ws_settings', params: {user_id: 'self'}
      json = assert_success_json
      expect(json['user_id']).to eq(@user.global_id)
      expect(json['ws_user_id']).to_not eq(nil)
      expect(json['my_device_id']).to match(/me\$.+\$.+/)
      code, ts = json['verifier'].split(/:/, 2)
      expect(ts.to_i).to be > 5.seconds.ago.to_i
      expect(ts.to_i).to be < 5.seconds.from_now.to_i
      expect(code).to eq(GoSecure.sha512("#{json['ws_user_id']}:#{json['my_device_id']}:#{ts}", "room_join_verifier", ENV['CDWEBSOCKET_SHARED_VERIFIER'])[0, 30])
      expect(json['supervisees'].length).to eq(1)
      expect(json['supervisees'][0]['user_id']).to eq(u.global_id)
      expect(json['supervisees'][0]['ws_user_id']).to_not eq(nil)
      expect(json['supervisees'][0]['my_device_id']).to match(/.+\$.+/)
      expect(json['supervisees'][0]['my_device_id']).to_not match(/^me/)
      expect(json['supervisees'][0]['verifier']).to_not eq(json['verifier'])
    end

    it 'should return room info for a supervisee' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get 'ws_settings', params: {user_id: u.global_id}
      json = assert_success_json
      expect(json['user_id']).to eq(u.global_id)
      expect(json['ws_user_id']).to_not eq(nil)
      expect(json['my_device_id']).to match(/.+\$.+/)
      expect(json['my_device_id']).to_not match(/^me/)
      code, ts = json['verifier'].split(/:/, 2)
      expect(ts.to_i).to be > 5.seconds.ago.to_i
      expect(ts.to_i).to be < 5.seconds.from_now.to_i
      expect(code).to eq(GoSecure.sha512("#{json['ws_user_id']}:#{json['my_device_id']}:#{ts}", "room_join_verifier", ENV['CDWEBSOCKET_SHARED_VERIFIER'])[0, 30])
      expect(json['supervisees']).to eq(nil)
    end

    it 'should return room info for a communicator I am an admin for' do
      token_user
      u = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      o.add_user(u.user_name, false)
      get 'ws_settings', params: {user_id: u.global_id}
      json = assert_success_json
      expect(json['user_id']).to eq(u.global_id)
      expect(json['ws_user_id']).to_not eq(nil)
      expect(json['my_device_id']).to match(/.+\$.+/)
      expect(json['my_device_id']).to_not match(/^me/)
      code, ts = json['verifier'].split(/:/, 2)
      expect(ts.to_i).to be > 5.seconds.ago.to_i
      expect(ts.to_i).to be < 5.seconds.from_now.to_i
      expect(code).to eq(GoSecure.sha512("#{json['ws_user_id']}:#{json['my_device_id']}:#{ts}", "room_join_verifier", ENV['CDWEBSOCKET_SHARED_VERIFIER'])[0, 30])
      expect(json['supervisees']).to eq(nil)
    end

    it "should not include room info for supervisees on a different supervisor" do
      token_user
      u1 = User.create
      u2 = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      o.add_supervisor(u1.user_name, false)
      User.link_supervisor_to_user(u1, u2)
      get 'ws_settings', params: {user_id: u1.global_id}
      json = assert_success_json
      expect(json['user_id']).to eq(u1.global_id)
      expect(json['ws_user_id']).to_not eq(nil)
      expect(json['my_device_id']).to match(/.+\$.+/)
      expect(json['my_device_id']).to_not match(/^me/)
      code, ts = json['verifier'].split(/:/, 2)
      expect(ts.to_i).to be > 5.seconds.ago.to_i
      expect(ts.to_i).to be < 5.seconds.from_now.to_i
      expect(code).to eq(GoSecure.sha512("#{json['ws_user_id']}:#{json['my_device_id']}:#{ts}", "room_join_verifier", ENV['CDWEBSOCKET_SHARED_VERIFIER'])[0, 30])
      expect(json['supervisees'].length).to eq(1)
      expect(json['supervisees'][0]['user_id']).to eq(u2.global_id)
      expect(json['supervisees'][0]['ws_user_id']).to_not eq(nil)
      expect(json['supervisees'][0]['my_device_id']).to eq(nil)
      expect(json['supervisees'][0]['verifier']).to eq(nil)
    end

    it 'should have a consistent iv for multiple requests in the same session' do
      token_user
      get 'ws_settings', params: {user_id: 'self'}
      json = assert_success_json
      expect(json['my_device_id']).to match(/me\$.+\$.+/)
      code, ts = json['verifier'].split(/:/, 2)
      expect(ts.to_i).to be > 5.seconds.ago.to_i
      expect(ts.to_i).to be < 5.seconds.from_now.to_i
      expect(code).to eq(GoSecure.sha512("#{json['ws_user_id']}:#{json['my_device_id']}:#{ts}", "room_join_verifier", ENV['CDWEBSOCKET_SHARED_VERIFIER'])[0, 30])

      get 'ws_settings', params: {user_id: 'self'}
      json2 = assert_success_json
      expect(json2['my_device_id']).to match(/me\$.+\$.+/)
      code, ts = json2['verifier'].split(/:/, 2)
      expect(json2['my_device_id']).to eq(json['my_device_id'])
    end
  end

  describe "GET ws_lookup" do
    it 'should require authentication' do
      get 'ws_lookup', params: {user_id: ''}
      assert_missing_token
    end

    it 'should require a user_id' do
      token_user
      get 'ws_lookup', params: {user_id: ''}
      assert_error('user_id required')
    end

    it 'should error gracefully on bad decrypt' do
      token_user
      get 'ws_lookup', params: {user_id: 'asdf'}
      assert_error('invalid decryption')
    end

    it 'should error on invalid user_id' do
      token_user
      str = GoSecure.encrypt("bad_user.bacon", 'ws_device_id_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      get 'ws_lookup', params: {user_id: str}
      assert_not_found('bad_user')
    end

    it 'should require authorization' do
      token_user
      u = User.create
      str = GoSecure.encrypt("#{u.global_id}.bacon", 'ws_device_id_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      get 'ws_lookup', params: {user_id: str}
      assert_unauthorized
    end

    it 'should allow supervisee to look up supervisors' do
      token_user
      u = User.create
      User.link_supervisor_to_user(u, @user)
      str = GoSecure.encrypt("#{u.global_id}.bacon", 'ws_device_id_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      get 'ws_lookup', params: {user_id: str}
      json = assert_success_json
      expect(json['user_id']).to eq(u.global_id)
      expect(json['user_name']).to eq(u.user_name)
      expect(json['device_id']).to eq('bacon')
    end

    it 'should allow supervisee to look up following admins' do
      token_user
      u = User.create
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(u.user_name, true)
      str = GoSecure.encrypt("#{u.global_id}.bacon", 'ws_device_id_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      get 'ws_lookup', params: {user_id: str}
      json = assert_success_json
      expect(json['user_id']).to eq(u.global_id)
      expect(json['user_name']).to eq(u.user_name)
      expect(json['device_id']).to eq('bacon')
    end

    it 'should return user data' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      str = GoSecure.encrypt("#{u.global_id}.bacon", 'ws_device_id_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      get 'ws_lookup', params: {user_id: str}
      json = assert_success_json
      expect(json['user_id']).to eq(u.global_id)
      expect(json['user_name']).to eq(u.user_name)
      expect(json['device_id']).to eq('bacon')
    end

    it 'should filter "me" prefix' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      str = GoSecure.encrypt("#{u.global_id}.bacon", 'ws_device_id_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      get 'ws_lookup', params: {user_id: "me$#{str}"}
      json = assert_success_json
      expect(json['user_id']).to eq(u.global_id)
      expect(json['user_name']).to eq(u.user_name)
      expect(json['device_id']).to eq('bacon')
    end
  end

  describe "POST ws_encrypt" do
    it 'should require authentication' do
      post 'ws_encrypt', params: {user_id: 'whatever'}
      assert_missing_token
    end

    it 'should require a valid user' do
      token_user
      post 'ws_encrypt', params: {user_id: 'whatever'}
      assert_not_found('whatever')
    end

    it 'should require authorization' do
      token_user
      u = User.create
      post 'ws_encrypt', params: {user_id: u.global_id}
      assert_unauthorized
    end

    it 'should require matching user_id' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      post 'ws_encrypt', params: {user_id: u.global_id, text: "something cool"}
      json = assert_success_json
      expect(json['user_id']).to eq(u.global_id)
      str, iv = json['encoded'].split(/\$/)
      user_id, text = GoSecure.decrypt(str, iv, 'ws_content_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).split(/\./, 2)
      expect(user_id).to eq(u.global_id)
      expect(text).to eq("something cool")
    end
  end

  describe "POST ws_decrypt" do
    it 'should require authentication' do
      post 'ws_decrypt', params: {user_id: 'whatever'}
      assert_missing_token
    end

    it 'should require a valid user' do
      token_user
      post 'ws_decrypt', params: {user_id: 'whatever'}
      assert_not_found('whatever')
    end

    it 'should require authorization' do
      token_user
      u = User.create
      post 'ws_decrypt', params: {user_id: u.global_id}
      assert_unauthorized
    end

    it 'should require matching user_id' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      str = GoSecure.encrypt("bad_user.bacon", 'ws_content_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      post 'ws_decrypt', params: {user_id: u.global_id, text: str}
      assert_error('user_id mismatch')
    end

    it 'should decrypt correctly' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      str = GoSecure.encrypt("#{u.global_id}.bacon", 'ws_content_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      post 'ws_decrypt', params: {user_id: u.global_id, text: str}
      json = assert_success_json
      expect(json['decoded']).to eq('bacon')
    end

    it 'should error gracefully on bad decrypt' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      str = GoSecure.encrypt("#{u.global_id}.bacon", 'ws_content_encrypted', ENV['CDWEBSOCKET_ENCRYPTION_KEY']).map(&:strip).join('$')
      post 'ws_decrypt', params: {user_id: u.global_id, text: "aasdsf"}
      assert_error('invalid decryption')
    end
  end

  describe "valet_credentials" do
    it "should require an api token" do
      get :valet_credentials, :params => {user_id: 'asdf'}
      assert_missing_token
    end

    it "should require a valid user" do
      token_user
      get :valet_credentials, :params => {user_id: 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      get :valet_credentials, :params => {user_id: u.global_id}
      assert_unauthorized
    end

    it "should generate a valid credential" do
      token_user
      @user.set_valet_password('bacon')
      @user.save
      get :valet_credentials, :params => {user_id: @user.global_id}
      json = assert_success_json
      expect(json['user_name']).to eq("model@#{@user.global_id.sub(/_/, '.')}")
      expect(json['password']).to_not eq(nil)
      expect(json['url']).to_not eq(nil)
      @user.assert_valet_mode!
      expect(@user.valid_password?(json['password'])).to eq(true)
    end

    it "should not generate if no valet password set" do
      token_user
      get :valet_credentials, :params => {user_id: @user.global_id}
      assert_unauthorized
    end

    it "should not allow supervisors to generate" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      u.set_valet_password('bacon')
      u.save
      get :valet_credentials, :params => {user_id: u.global_id}
      assert_unauthorized
    end

    it "should not allow a modeling session to generate" do
      valet_token_user
      @user.set_valet_password('bacon')
      @user.save
      get :valet_credentials, :params => {user_id: @user.global_id}
      assert_unauthorized
    end
  end

  describe "update_2fa" do
    it "should require an access token" do
      post :update_2fa, params: {'user_id' => 'asdf'}
      assert_missing_token
    end

    it "should require a valid user" do
      token_user
      post :update_2fa, params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end


    # def update_2fa
    #   user = User.find_by_path(params['user_id'])
    #   return unless exists?(user, params['user_id'])
    #   return unless allowed?(user, 'edit')
    #   if params['action_2fa'] == 'enable' || (params['action_2fa'] == 'reset' && (user.settings['2fa'] || user.settings['tmp_2fa']))
    #     user.assert_2fa!(user.global_id == @api_user.global_id)
    #   elsif params['action_2fa'] == 'disable'
    #     user.settings.delete('2fa')
    #     user.settings.delete('tmp_2fa')
    #     user.save
    #   elsif params['action_2fa'] == 'confirm'
    #     ts = user.valid_2fa?(params['code_2fa'])
    #     return api_error 400, {error: "invalid code: #{params['code_2fa']}"} unless ts
    #   else
    #     return api_error 400, {error: "unregognized action: #{params['action_2fa']}"}
    #   end
    #   res = {updated: true, state: user.state_2fa}
    #   res[:uri] = user.uri_2fa if (user.settings || {})['tmp_2fa']
    #   render json: res
    # end
    it "should require edit permission on the user" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, false)
      post :update_2fa, params: {'user_id' => u.global_id}
      assert_unauthorized
    end

    it "should allow enabling" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      post :update_2fa, params: {'user_id' => u.global_id, 'action_2fa' => 'enable'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => true, 'verified' => false})
      expect(json['uri']).to eq(nil)
    end
    
    it "should allow resetting" do
      token_user
      @user.assert_2fa!
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'reset'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => true, 'verified' => false})
      expect(json['uri']).to_not eq(nil)
    end

    it "should not allow resetting if not already set" do
      token_user
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'reset'}
      assert_error('unregognized action: reset')
    end

    it "should send a config URI if there is a temp config" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      post :update_2fa, params: {'user_id' => u.global_id, 'action_2fa' => 'enable'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => true, 'verified' => false})
      expect(json['uri']).to eq(nil)
    end

    it "should not set enablement as required without code confirmation" do
      token_user
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'enable'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => false})
      expect(json['uri']).to_not eq(nil)
    end

    it "should allow disabling" do
      token_user
      @user.assert_2fa!
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'disable'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => false})
      expect(json['uri']).to eq(nil)
    end

    it "should allow confirming a temp config" do
      token_user
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'enable'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => false})
      expect(json['uri']).to_not eq(nil)

      @user.reload
      expect(@user.settings['tmp_2fa']).to_not eq(nil)
      expect(@user.settings['2fa']).to eq(nil)
      totp = ROTP::TOTP.new(@user.settings['tmp_2fa']['secret'], issuer: 'LingoLinq')
      code = totp.at(Time.now)
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'confirm', 'code_2fa' => code}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      @user.reload
      expect(@user.settings['2fa']).to_not eq(nil)
      expect(@user.settings['tmp_2fa']).to eq(nil)
    end

    it "should error in incorrect temp config confirmation" do
      token_user
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'enable'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => false})
      expect(json['uri']).to_not eq(nil)

      @user.reload
      expect(@user.settings['tmp_2fa']).to_not eq(nil)
      expect(@user.settings['2fa']).to eq(nil)
      totp = ROTP::TOTP.new(@user.settings['tmp_2fa']['secret'], issuer: 'LingoLinq')
      code = totp.at(Time.now)
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'confirm', 'code_2fa' => '0000009'}
      assert_error("invalid code: 0000009")
      @user.reload
      expect(@user.settings['tmp_2fa']).to_not eq(nil)
      expect(@user.settings['2fa']).to eq(nil)
    end

    it "should persist the temp config as permanent if confirmed" do
      token_user
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'enable'}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      expect(json['state']).to eq({'required' => false})
      expect(json['uri']).to_not eq(nil)

      @user.reload
      expect(@user.settings['tmp_2fa']).to_not eq(nil)
      expect(@user.settings['2fa']).to eq(nil)
      secret = @user.settings['tmp_2fa']['secret']
      totp = ROTP::TOTP.new(secret, issuer: 'LingoLinq')
      code = totp.at(Time.now)
      post :update_2fa, params: {'user_id' => @user.global_id, 'action_2fa' => 'confirm', 'code_2fa' => code}
      json = assert_success_json
      expect(json['updated']).to eq(true)
      @user.reload
      expect(@user.settings['2fa']).to_not eq(nil)
      expect(@user.settings['tmp_2fa']).to eq(nil)
      expect(@user.settings['2fa']['secret']).to eq(secret)
      expect(@user.settings['2fa']['last_otp']).to_not eq(nil)
    end
  end

  describe "reset_eval" do
    it "should require a valid api token" do
      post 'reset_eval', params: {user_id: 'asdf'}
      assert_missing_token
    end

    it "should require a valid user" do
      token_user
      post 'reset_eval', params: {user_id: 'asdf'}
      assert_not_found('asdf')
    end

    it "should not allow a supervised user to reset their own eval" do
      sup = User.create
      token_user
      User.link_supervisor_to_user(sup, @user)
      post 'reset_eval', params: {user_id: @user.global_id}
      assert_unauthorized
    end

    it "should not allow an org-managed user to reset their own eval" do
      o = Organization.create
      token_user
      o.add_user(@user.user_name, false, false)
      @user.reload
      post 'reset_eval', params: {user_id: @user.global_id}
      assert_unauthorized
    end

    it "should error if not an eval account" do
      token_user
      post 'reset_eval', params: {user_id: @user.global_id}
      assert_error("not an eval account", 400)
    end

    it "should allow a standalone eval to reset itself" do
      token_user
      @user.settings['subscription'] = {'eval_account' => true}
      @user.save
      expect(@user.eval_account?).to eq(true)
      post 'reset_eval', params: {user_id: @user.global_id}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
    end

    it "should return a progress object" do
      token_user
      @user.settings['subscription'] = {'eval_account' => true}
      @user.save
      expect(@user.eval_account?).to eq(true)
      post 'reset_eval', params: {user_id: @user.global_id}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
      p = Progress.find_by_path(json['progress']['id'])
      expect(p.settings).to eq({'class' => 'User', 'id' => @user.id, 'method' => 'reset_eval', 'state' => 'pending', 'arguments' => [@user.devices[0].global_id, {'email' => nil, 'home_board_key' => nil, 'password' => nil, 'symbol_library' => nil}]})
    end
  end

  describe "generate_start_code" do
    it "should require a token" do
      post 'start_code', params: {user_id: 'whatever'}
      assert_missing_token
    end

    it "should require a valid user" do
      token_user
      post 'start_code', params: {user_id: 'none'}
      assert_not_found('none')
    end

    it "should require edit permission" do
      token_user
      u = User.create
      post 'start_code', params: {user_id: u.global_id}
      assert_unauthorized
    end

    it "should require a supervisor role" do
      token_user
      post 'start_code', params: {user_id: @user.global_id}
      assert_unauthorized
    end

    it "should return an activation code" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      post 'start_code', params: {user_id: @user.global_id}
      json = assert_success_json
      expect(json['code']).to_not eq(nil)
      pre, rnd, verifier = json['code'].split(/\s/)
      type = pre[0]
      id = pre[1..-1]
      expect(type).to eq('9')
      expect(id).to eq(@user.global_id.sub(/_/, '0'))
      @user.reload
      expect(@user.settings['activation_settings']["#{type}#{rnd}"]).to_not eq(nil)
      expect(@user.settings['activation_settings']["#{type}#{rnd}"]).to eq({
      })
    end

    it "should record settings" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      ts = 4.weeks.from_now.to_i
      post 'start_code', params: {user_id: @user.global_id, overrides: {
        'supervisors' => ['a', 'b'],
        'limit' => 5,
        'locale' => 'fr',
        'symbol_library' => 'symbolstix',
        'expires' => ts
      }}
      json = assert_success_json
      expect(json['code']).to_not eq(nil)
      pre, rnd, verifier = json['code'].split(/\s/)
      type = pre[0]
      id = pre[1..-1]
      expect(type).to eq('9')
      expect(id).to eq(@user.global_id.sub(/_/, '0'))
      @user.reload
      expect(@user.settings['activation_settings']["#{type}#{rnd}"]).to_not eq(nil)
      expect(@user.settings['activation_settings']["#{type}#{rnd}"]).to eq({
        'limit' => 5,
        'expires' => ts,
        'locale' => 'fr',
        'symbol_library' => 'symbolstix'
      })
      res = Organization.parse_activation_code(json['code'])
      expect(res).to_not eq(false)
      expect(res[:target]).to eq(@user)
      expect(res[:disabled]).to eq(false)
      expect(res[:key]).to eq("9#{rnd}")
      expect(res[:overrides]).to eq({"locale"=>"fr", "symbol_library"=>"symbolstix"})
    end

    it "should allow a custom start code" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      post 'start_code', params: {user_id: @user.global_id, overrides: {
        'proposed_code' => 'asdfasdf'
      }}
      json = assert_success_json
      expect(json['code']).to eq('asdfasdf')
    end

    it "should error on taken custom code" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      Organization.activation_code(@user, {'proposed_code' => 'asdfasdf'})
      post 'start_code', params: {user_id: @user.global_id, overrides: {
        'proposed_code' => 'asdfasdf'
      }}
      assert_error('code is taken')
    end

    it "should error on too-short code" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      post 'start_code', params: {user_id: @user.global_id, overrides: {
        'proposed_code' => 'asdf'
      }}
      assert_error('code is too short')
    end

    it "should allow deleting a custom code" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      Organization.activation_code(@user, {'proposed_code' => 'asdfasdf'})
      post 'start_code', params: {user_id: @user.global_id,
        'delete' => true,
        'code' => 'asdfasdf'
      }
      json = assert_success_json
      expect(json).to eq({'code' => 'asdfasdf', 'deleted' => true})
    end 

    it "should allow deleting a default code" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      code = Organization.activation_code(@user, {})
      post 'start_code', params: {user_id: @user.global_id, 
        'delete' => true,
        'code' => code
      }
      json = assert_success_json
      expect(json).to eq({'code' => code, 'deleted' => true})
    end 

    it "should error on missing code deletion" do
      token_user
      @user.settings['preferences']['role'] = 'supporter'
      @user.save
      code = Organization.activation_code(@user, {})
      post 'start_code', params: {user_id: @user.global_id, 
        'delete' => true,
        'code' => "whatever"
      }
      assert_error('code not found')
    end
  end

  describe "boards" do
    it "should require an api token" do
      get 'boards', params: {user_id: 'asdf'}
      assert_missing_token
    end

    it "should require a valid user" do
      token_user
      get 'boards', params: {user_id: 'asdf'}
      assert_not_found('asdf')
    end

    it "should require modeling permission" do
      token_user
      u = User.create
      get 'boards', params: {user_id: u.global_id}
      assert_unauthorized
    end

    it "should error for more than 25 ids" do
      token_user
      get 'boards', params: {user_id: @user.global_id, ids: (['1'] * 26).join(',')}
      assert_error('too many ids')
    end

    it "should return a list of matching boards" do
      token_user
      b1 = Board.create(user: @user)
      b2 = Board.create(user: @user)
      get 'boards', params: {user_id: @user.global_id, ids: [b1.global_id, b2.global_id].join(',')}
      json = assert_success_json
      expect(json.length).to eq(2)
      expect(json.sort_by{|b| b['id'] }[0]['id']).to eq(b1.global_id)
      expect(json.sort_by{|b| b['id'] }[1]['id']).to eq(b2.global_id)
    end

    it "should not return data on unauthorized boards" do
      token_user
      u = User.create
      b = Board.create(user: u)
      get 'boards', params: {user_id: @user.global_id, ids: b.global_id}
      json = assert_success_json
      expect(json).to eq([])
    end

    it "should return shallow clones if specified" do
      token_user
      u = User.create
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: @user)
      get 'boards', params: {user_id: @user.global_id, ids: ["#{b1.global_id}-#{@user.global_id}", b2.global_id].join(',')}
      json = assert_success_json
      expect(json.length).to eq(2)
      ids = json.map { |b| b['id'] }.sort
      expect(ids).to eq([b2.global_id, "#{b1.global_id}-#{@user.global_id}"].sort)
    end
  end


end

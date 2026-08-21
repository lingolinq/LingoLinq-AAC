require 'spec_helper'

describe Api::GoalsController, type: :controller do
  describe "index" do
    it "should not require api token" do
      get :index, params: {:template_header => 1}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']).to eq([])
    end
    
    it "should list template_header goals" do
      g = UserGoal.create(:template_header => true)
      get :index, params: {:template_header => 1}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal'].length).to eq(1)
      expect(json['goal'][0]['id']).to eq(g.global_id)
    end
    
    it "should require permission for user goals" do
      u = User.create
      token_user
      get :index, params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should list user goals if authorized" do
      token_user
      g = UserGoal.create(:user => @user)
      get :index, params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal'].length).to eq(1)
      expect(json['goal'][0]['id']).to eq(g.global_id)
    end
    
    it "should paginate results" do
      token_user
      50.times do |i|
        UserGoal.create(:user => @user)
      end
      get :index, params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal'].length).to eq(30)
      expect(json['meta']['more']).to eq(true)
    end
    
    it "should list goals for a specific template when authorized" do
      token_user
      g = UserGoal.create(:user => @user, :settings => {'template_header_id' => 'self'}, :template_header => true)
      Worker.process_queues
      expect(g.reload.settings['template_header_id']).to eq(g.global_id)
      get :index, params: {:template_header_id => g.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal'].length).to eq(1)
    end
    
    it "should list a user's template if authorized" do
      token_user
      g = UserGoal.create(:user => @user, :template => true)
      get :index, params: {:user_id => @user.global_id, :template => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal'].length).to eq(1)
      expect(json['goal'][0]['id']).to eq(g.global_id)
    end

    it "should not list a user's template unless specified" do
      token_user
      g1 = UserGoal.create(:user => @user, :template => true)
      g2 = UserGoal.create(:user => @user)
      get :index, params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal'].length).to eq(1)
      expect(json['goal'][0]['id']).to eq(g2.global_id)
    end
    
    it "should allow filtering to global goals" do
      token_user
      g = UserGoal.create(:user => @user, :global => true)
      g2 = UserGoal.create(:user => @user)
      get :index, params: {:global => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal'].length).to eq(1)
      expect(json['goal'][0]['id']).to eq(g.global_id)
    end
  end
  
  describe "show" do
    it "should require api token" do
      get :show, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require valid record" do
      token_user
      get :show, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      g = UserGoal.create(:user => u)
      get :show, params: {:id => g.global_id}
      assert_unauthorized
    end
    
    it "should return goal" do
      token_user
      g = UserGoal.create(:user => @user)
      get :show, params: {:id => g.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to eq(g.global_id)
    end
  end

  describe "create" do
    it "should require api token" do
      post :create
      assert_missing_token
    end
    
    it "should require valid user_id" do
      token_user
      post :create, params: {:goal => {'user_id' => 'asdf'}}
      assert_not_found('asdf')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      post :create, params: {:goal => {'user_id' => u.global_id}}
      assert_unauthorized
    end
    
    it "should create goal" do
      token_user
      post :create, params: {:goal => {'user_id' => @user.global_id, 'summary' => 'cool goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      expect(json['goal']['summary']).to eq('cool goal')
    end
    
    it "should ignore template_header for non-admins and still create the goal" do
      token_user
      post :create, params: {:goal => {'template_header' => true, 'summary' => 'not a template'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      g = UserGoal.find_by_global_id(json['goal']['id'])
      expect(g.template_header).to eq(false)
    end

    it "should allow an org manager to create a template header goal" do
      token_user
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      o.add_manager(@user.user_name, true)
      post :create, params: {:goal => {'template_header' => true, 'summary' => 'template goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      g = UserGoal.find_by_global_id(json['goal']['id'])
      expect(g.template_header).to eq(true)
    end
    
    it "should default to the api_user when creating a goal" do
      token_user
      post :create, params: {:goal => {'summary' => 'cool goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      expect(json['goal']['author']['id']).to eq(@user.global_id)
    end
    
    it "should allow a read_profile api token to create a goal for self" do
      token_user(['read_profile'])
      post :create, params: {:goal => {'summary' => 'cool goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
    end

    it "should not allow a read_profile api token to create a goal for another user" do
      token_user(['read_profile'])
      u = User.create
      post :create, params: {:goal => {'user_id' => u.global_id, 'summary' => 'cool goal'}}
      assert_unauthorized
    end

    it "should include device_scopes_none when the device is pending 2FA" do
      u = User.create
      u.assert_2fa!
      d = Device.create(:user => u, :developer_key_id => 0, :device_key => 'pending2fa')
      d.settings['2fa'] ||= {}
      d.settings['2fa']['pending'] = true
      d.save
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      request.headers['Check-Token'] = 'true'
      post :create, params: {:goal => {'summary' => 'goal while locked'}}
      assert_unauthorized
      json = JSON.parse(response.body)
      expect(json['device_scopes_none']).to eq(true)
      expect(json['permission']).to eq('set_goals')
      expect(json['effective_scopes']).to eq(['none'])
    end

    it "should allow a supervising token to create a goal" do
      token_user(['basic_supervision'])
      post :create, params: {:goal => {'summary' => 'cool goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
    end

    it "should allow a supervisor to create a goal for a supervisee when device scopes are unset" do
      sup = User.create
      comm = User.create
      dev = Device.create(:user => sup, :developer_key_id => 1, :device_key => 'bacon')
      expect(dev.permission_scopes).to eq([])
      request.headers['Authorization'] = "Bearer #{dev.tokens[0]}"
      request.headers['Check-Token'] = 'true'
      User.link_supervisor_to_user(sup, comm, nil, false)
      post :create, params: {:goal => {'user_id' => comm.global_id, 'summary' => 'supervised goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      expect(json['goal']['summary']).to eq('supervised goal')
    end

    it "should allow a billing modeling-only supporter to create a goal for their supervisee" do
      sup = User.create
      comm = User.create
      sup.settings['preferences'] ||= {}
      sup.settings['preferences']['role'] = 'supporter'
      sup.save
      sup.reload
      sup.expires_at = 2.days.ago
      sup.save
      sup.reload
      expect(sup.modeling_only?).to eq(true)
      dev = Device.create(:user => sup, :developer_key_id => 0, :device_key => 'hippo')
      request.headers['Authorization'] = "Bearer #{dev.tokens[0]}"
      request.headers['Check-Token'] = 'true'
      User.link_supervisor_to_user(sup, comm, nil, false)
      post :create, params: {:goal => {'user_id' => comm.global_id, 'summary' => 'goal from modeling-only billing sup'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['summary']).to eq('goal from modeling-only billing sup')
    end

    it "should allow a supervisor to create a goal when redis token cache stores a lone star scope" do
      sup = User.create
      comm = User.create
      dev = Device.create(:user => sup, :developer_key_id => 0, :device_key => 'hippo')
      token = dev.tokens[0]
      cache_line = "#{sup.global_id}::#{dev.global_id}::*::false"
      RedisInit.permissions.setex("user_token/#{token}", 12.hours.to_i, cache_line)
      request.headers['Authorization'] = "Bearer #{token}"
      request.headers['Check-Token'] = 'true'
      User.link_supervisor_to_user(sup, comm, nil, false)
      post :create, params: {:goal => {'user_id' => comm.global_id, 'summary' => 'from star cache'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['summary']).to eq('from star cache')
    end
    
    it "should auto-expire a token with the same external_id" do
      token_user
      eid = 'some:bucket'
      goal = UserGoal.create(user: @user, active: true)
      goal.settings['external_id'] = eid
      goal.save!
      expect(goal.active).to eq(true)
      post :create, params: {:goal => {'user_id' => @user.global_id, 'summary' => 'cool goal', 'external_id' => eid}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      expect(json['goal']['summary']).to eq('cool goal')
      expect(goal.reload.active).to eq(true)
      Worker.process_queues
      expect(goal.reload.active).to eq(false)
    end
    
    it "should only allow admins to create global goals" do
      token_user
      post :create, params: {:goal => {'summary' => 'cool goal', 'global' => true}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      goal = UserGoal.find_by_path(json['goal']['id'])
      expect(goal.global).to eq(nil)
      expect(json['goal']['author']['id']).to eq(@user.global_id)

      o = Organization.create(admin: true)
      o.add_manager(@user.user_name, true)
      post :create, params: {:goal => {'summary' => 'cool goal', 'global' => true}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to_not be_nil
      goal = UserGoal.find_by_path(json['goal']['id'])
      expect(goal.global).to eq(true)
    end
  end

  describe "update" do
    it "should require api token" do
      put :update, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require existing record" do
      token_user
      put :update, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      g = UserGoal.create(:user => u)
      put :update, params: {:id => g.global_id}
      assert_unauthorized
    end
    
    it "should update the record" do
      token_user
      g = UserGoal.create(:user => @user)
      put :update, params: {:id => g.global_id, :goal => {'summary' => 'better goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to eq(g.global_id)
      expect(json['goal']['summary']).to eq('better goal')
    end
    
    it "should allow those with non-edit permissions to comment but nothing else" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, false)
      g = UserGoal.create(:user => u)
      put :update, params: {:id => g.global_id, :goal => {'summary' => 'dumb name', 'comment' => {'text' => 'hey yo'}}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['summary']).to eq('user goal')
      expect(json['goal']['comments'].length).to eq(1)
      expect(json['goal']['comments'][0]['text']).to eq('hey yo')
      expect(json['goal']['comments'][0]['user']['user_name']).to eq(@user.user_name)
    end
    
    it "should not allow a supervision api token to update a goal" do
      token_user(['read_profile', 'basic_supervision'])
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, false)
      g = UserGoal.create(:user => u)
      put :update, params: {:id => g.global_id, :goal => {'summary' => 'dumb name', 'comment' => {'text' => 'hey yo'}}}
      assert_unauthorized
    end

    it "should only allow admins to update a global goal" do
      token_user
      u = User.create
      g = UserGoal.create(:user => u, :global => true)
      put :update, params: {:id => g.global_id, :goal => {'summary' => 'better goal'}}
      assert_unauthorized

      o = Organization.create(admin: true)
      o.add_manager(@user.user_name, true)
      put :update, params: {:id => g.global_id, :goal => {'summary' => 'better goal'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to eq(g.global_id)
      expect(g.global).to eq(true)
      expect(json['goal']['summary']).to eq('better goal')
    end
  end

  describe "destroy" do
    it "should require api token" do
      delete :destroy, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require existing record" do
      token_user
      delete :destroy, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, false)
      g = UserGoal.create(:user => u)
      delete :destroy, params: {:id => g.global_id}
      assert_unauthorized
    end
    
    it "should delete the record" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      g = UserGoal.create(:user => u)
      delete :destroy, params: {:id => g.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['goal']['id']).to eq(g.global_id)
      expect(UserGoal.find_by_global_id(g.global_id)).to eq(nil)
    end
  end

  # Rails' controller-test harness stringifies `params:` scalars, so every other
  # spec in this file asserts against the OLD form-encoded wire shape. The Ember
  # adapter posts a real JSON body (adapters/application.js:45-47), and
  # UserGoal#process_params:384 reads `active` through `!!params[:active]` with
  # no string coercion — so `"false"` becomes TRUE and `false` stays false. Only
  # a raw `body:` can tell those two apart.
  describe "update with a raw JSON body" do
    it "should keep active false rather than coercing the string \"false\" to true" do
      token_user
      g = UserGoal.create(:user => @user, :active => true)
      request.headers['Content-Type'] = 'application/json'
      put :update, params: {:id => g.global_id}, body: {
        :goal => {:active => false}
      }.to_json
      expect(response).to be_successful
      expect(g.reload.active).to eq(false)
      expect(g.active).to be_a(FalseClass)
    end

    it "should keep active true when sent as a real boolean" do
      token_user
      g = UserGoal.create(:user => @user, :active => false)
      request.headers['Content-Type'] = 'application/json'
      put :update, params: {:id => g.global_id}, body: {
        :goal => {:active => true}
      }.to_json
      expect(response).to be_successful
      expect(g.reload.active).to eq(true)
      expect(g.active).to be_a(TrueClass)
    end

    it "should not touch active when the client omits it" do
      # An attribute the client never set serializes to null, and the `!= nil`
      # guard then skips it. Under the form-encoded shape it arrived as "",
      # which passed the guard and forced active to true on every save.
      token_user
      g = UserGoal.create(:user => @user, :active => false)
      request.headers['Content-Type'] = 'application/json'
      put :update, params: {:id => g.global_id}, body: {
        :goal => {:summary => 'still inactive', :active => nil}
      }.to_json
      expect(response).to be_successful
      expect(g.reload.active).to eq(false)
      expect(g.settings['summary']).to eq('still inactive')
    end
  end
end

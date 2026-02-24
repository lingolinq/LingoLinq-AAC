require 'spec_helper'

describe ApplicationController, :type => :controller do
  controller do
    def index; render :plain => "ok"; end
  end
  
  describe "set_host" do
    it "should set the host for API responses" do
      get :index
      expect(JsonApi::Json.current_host).to eq("http://test.host")
    end
  end
  
  describe "check_api_token" do
    it "should find by user and device for the specified token" do
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:access_token => d.tokens[0], :check_token => true}
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u)
      expect(response).to be_successful
    end
    
    it "should set correct whodunnit" do
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:access_token => d.tokens[0], :check_token => true}
      expect(PaperTrail.request.whodunnit).to eq("user:#{u.global_id}.anonymous.index")
    end
    
    it "should check for the token as a query parameter" do
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:access_token => d.tokens[0], :check_token => true}
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u)
      expect(response).to be_successful
    end
    
    it "should check for the token as an http header" do
      u = User.create
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true}
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u)
      expect(response).to be_successful
    end
    
    it "should return an error if a token is provided but invalid" do
      get :index, params: {:access_token => "abcdef", :check_token => true}
      expect(assigns[:api_device_id]).to eq(nil)
      expect(assigns[:api_user]).to eq(nil)
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Invalid token')
      expect(json['token']).to be_nil
    end
    
    it "should not error if no token parameter is sent" do
      get :index, params: {:check_token => true}
      expect(assigns[:api_device_id]).to eq(nil)
      expect(assigns[:api_user]).to eq(nil)
      expect(response).to be_successful
    end
    
    it "should set user from as_user_id if org admin" do
      o = Organization.create(:admin => true)
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true, :as_user_id => u2.global_id}
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u2)
      expect(assigns[:true_user]).to eq(u)
      expect(response).to be_successful
    end

    it "should allow masquerading as a user if a global manager" do
      o = Organization.create(:admin => true)
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true, :as_user_id => u2.global_id}
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u2)
      expect(assigns[:true_user]).to eq(u)
      expect(response).to be_successful
    end

    it "should allow an org manager to masquerade as users in their org" do
      o = Organization.create()
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      o.add_user(u2.user_name, false, false)
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true, :as_user_id => u2.global_id}
      expect(response).to be_successful
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u2)
      expect(assigns[:true_user]).to eq(u)
    end

    it "should not allow an org manager to masquerade as users not in their org" do
      o = Organization.create()
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true, :as_user_id => u2.global_id}
      assert_error("Invalid masquerade attempt")
    end

    it "should not allow an org manager to masquerade as pending users in their org" do
      o = Organization.create()
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      o.add_user(u2.user_name, true, false)
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true, :as_user_id => u2.global_id}
      assert_error("Invalid masquerade attempt")
    end

    it "should not allow an org manager to masquerade as users not in their org via cache lookup" do
      u = User.create
      u2 = User.create
      RedisInit.default.setex("masq/#{u.global_id}/#{u.updated_at.to_i}/#{u2.global_id}/#{u2.updated_at.to_i}", 5.minutes.to_i, "true")
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true, :as_user_id => u2.global_id}
      expect(response).to be_successful
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u2)
      expect(assigns[:true_user]).to eq(u)
    end

    it "should allow tmp_token for specific routes" do
      u = User.create
      d = Device.create(:user => u)
      token = RedisInit.default.setex("token_tmp_qwerty", 1.hour.to_i, d.tokens[0])
      get :index, params: {:tmp_token => "qwerty", :check_token => true}
      expect(assigns[:tmp_token]).to eq(true)
      expect(assigns[:token]).to eq(d.tokens[0])
      expect(assigns[:api_user]).to eq(u)
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(response).to be_successful
    end
    
    it "should set user from X-As-User-Id if org admin" do
      o = Organization.create(:admin => true)
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      request.headers['X-As-User-Id'] = u2.global_id
      get :index, params: {:check_token => true}
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u2)
      expect(assigns[:true_user]).to eq(u)
      expect(response).to be_successful
    end
    
    it "should not allow disabled tokens" do
      u = User.create
      d = Device.create(:user => u, :settings => {'disabled' => true})
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
      get :index, params: {:check_token => true}
      expect(assigns[:api_device_id]).to eq(nil)
      expect(assigns[:api_user]).to eq(nil)
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Disabled token')
    end

    it "should not allow invalid tokens" do
      u = User.create
      d = Device.create(:user => u)
      request.headers['Authorization'] = "Bearer #{d.tokens[0]}9"
      get :index, params: {:check_token => true}
      expect(assigns[:api_device_id]).to eq(nil)
      expect(assigns[:api_user]).to eq(nil)
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Invalid token')
    end

    it "should not allow expired tokens" do
      u = User.create
      d = Device.create(:user => u)
      d.generate_token!
      key = d.settings['keys'][0]
      key['timestamp'] = 200.months.ago.to_i
      key['last_timestamp'] = 200.months.ago.to_i
      d.settings['keys'] = [key]
      d.save!
      request.headers['Authorization'] = "Bearer #{d.settings['keys'][0]['value']}"
      get :index, params: {:check_token => true}
      expect(assigns[:api_device_id]).to eq(nil)
      expect(assigns[:api_user]).to eq(nil)
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Expired token')
    end
  end
  
  describe "log_api_call" do
    it "should log the event" do
      expect(ApiCall).to receive(:log) do |token, user, request, response, time|
        expect(token).to eq(nil)
        expect(user).to eq(nil)
        expect(request.path).not_to eq(nil)
        expect(response.code).to eq('200')
        expect(time).to eq(nil)
      end
      get :index
      
      token_user
      expect(ApiCall).to receive(:log) do |token, user, request, response, time|
        expect(token).to eq(@device.tokens[0])
        expect(user).to eq(@user)
        expect(request.path).not_to eq(nil)
        expect(response.code).to eq('200')
        expect(time).not_to eq(nil)
        expect(time).to be < 1000
      end
      get :index
    end
  end
  
  describe "user_for_paper_trail" do
    it "should return user information if there is a user" do
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:access_token => d.tokens[0], :check_token => true}
      expect(controller.user_for_paper_trail).to eq("user:#{u.global_id}.anonymous.index")
    end
    
    it "should return ip address if no user" do
      get :index
      expect(controller.user_for_paper_trail).to eq("unauthenticated:0.0.0.0.anonymous.index")
    end
  end
  
  describe "replace_helper_params" do
    it "should replace self with user id only if there's a user" do
      get :index, params: {:id => 'self', :user_id => 'self', :author_id => 'self'}
      expect(controller.params['id']).to eq('self')
      expect(controller.params['user_id']).to eq('self')
      expect(controller.params['author_id']).to eq('self')
      
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:id => 'self', :user_id => 'self', :author_id => 'self', :access_token => d.tokens[0], :check_token => true}
      expect(assigns[:api_user]).to eq(u)
      expect(controller.params['id']).to eq(u.global_id)
      expect(controller.params['user_id']).to eq(u.global_id)
      expect(controller.params['author_id']).to eq(u.global_id)
    end

    it "should replace my_org with user's managed org id only if there's a user" do
      o = Organization.create
      get :index, params: {:id => 'my_org', :user_id => 'my_org', :author_id => 'my_org'}
      expect(controller.params['id']).to eq('my_org')
      expect(controller.params['user_id']).to eq('my_org')
      expect(controller.params['author_id']).to eq('my_org')
      
      u = User.create
      d = Device.create(:user => u.reload)
      u.settings['manager_for'] = {'9' => {'full_manager' => true}}
      get :index, params: {:id => 'my_org', :user_id => 'my_org', :author_id => 'my_org', :access_token => d.tokens[0], :check_token => true}
      expect(assigns[:api_user]).to eq(u)
      expect(controller.params['id']).to eq('my_org')
      expect(controller.params['user_id']).to eq('my_org')
      expect(controller.params['author_id']).to eq('my_org')

      u = User.create
      o.add_manager(u.user_name, true)
      d = Device.create(:user => u.reload)
      get :index, params: {:id => 'my_org', :user_id => 'my_org', :author_id => 'my_org', :access_token => d.tokens[0], :check_token => true}
      expect(assigns[:api_user]).to eq(u)
      expect(controller.params['id']).to eq(o.global_id)
      expect(controller.params['user_id']).to eq(o.global_id)
      expect(controller.params['author_id']).to eq(o.global_id)
    end
  end
  
  describe "require_api_token" do
    controller do
      before_action :require_api_token, :only => [:index]
      def index; render :plain => "ok"; end
    end
    it "should error if no token parameter is sent" do
      get :index, params: {:check_token => true}
      expect(assigns[:api_device_id]).to eq(nil)
      expect(assigns[:api_user]).to eq(nil)
      assert_missing_token
    end
    
    it "should not error if token is sent" do
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:access_token => d.tokens[0], :check_token => true}
      expect(assigns[:api_device_id]).to eq(d.global_id)
      expect(assigns[:api_user]).to eq(u)
      expect(response).to be_successful
    end
  end
  
  describe "api_error" do
    controller do
      before_action :require_api_token, :only => [:index]
      def index; render :text => "ok"; end
    end
    it "should return a correct status code by default" do
      get :index, params: {:check_token => true}
      expect(response).not_to be_successful
      expect(response.code).to eq("400")
      json = JSON.parse(response.body)
      expect(json['status']).to eq(400)
    end
    
    it "should return a success code if X-Has-AppCache header is set" do
      request.headers['X-Has-AppCache'] = "true"
      get :index, params: {:check_token => true}
      expect(response).to be_successful
      expect(response.code).to eq("200")
      json = JSON.parse(response.body)
      expect(json['status']).to eq(400)
    end
    
    it "should return a success code if nocache=1 is set" do
      get :index, params: {:check_token => true, :nocache => 1}
      expect(response).to be_successful
      expect(response.code).to eq("200")
      json = JSON.parse(response.body)
      expect(json['status']).to eq(400)
    end
    
  end

  describe "allowed?" do
    controller do
      def index; 
        @user = User.find_by(:id => params[:id])
        return unless allowed?(@user, 'edit')
        render :plain => "ok"; 
      end
    end
    
    it "should not intercept if permission succeeds" do
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:id => u.id, :access_token => d.tokens[0], :check_token => true}
      expect(response).to be_successful
    end
    
    it "should error gracefully if permission fails" do
      u = User.create
      u2 = User.create
      d = Device.create(:user => u)
      get :index, params: {:id => u2.id, :access_token => d.tokens[0], :check_token => true}
      assert_unauthorized
    end
    
    it "should error gracefully with nil object" do
      u = User.create
      d = Device.create(:user => u)
      get :index, params: {:id => u.id + 1, :access_token => d.tokens[0], :check_token => true}
      assert_unauthorized
    end
    
    it "should honor scope permissions" do
      u = User.create
      d = Device.create(:user => u, :user_integration_id => 1, :settings => {'permission_scopes' => ['read_profile']})
      get :index, params: {:id => u.id, :access_token => d.tokens[0], :check_token => true}
      assert_unauthorized
    end
    
    it "should notify the user if permission rejected due to api token scope" do
      u = User.create
      d = Device.create(:user => u, :user_integration_id => 1, :settings => {'permission_scopes' => ['read_profile']})
      get :index, params: {:id => u.id, :access_token => d.tokens[0], :check_token => true}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Not authorized')
      expect(json['scope_limited']).to eq(true)
    end
  end

  describe "exists?" do
    controller do
      def index; 
        @user = User.find_by(:id => params[:id])
        return unless exists?(@user, params[:ref_id])
        render :plain => "ok"; 
      end
    end
    
    it "should not intercept if permission succeeds" do
      u = User.create
      get :index, params: {:id => u.id}
      expect(response).to be_successful
    end
    
    it "should error gracefully if not found" do
      u = User.create
      get :index, params: {:id => u.id + 1}
      assert_not_found
    end
    
    it "should error include ref id if provided" do
      u = User.create
      get :index, params: {:id => u.id + 1, :ref_id => "bacon"}
      assert_not_found("bacon")
    end
  end
  
  describe "set_browser_token_header" do
    controller do
      def index 
        set_browser_token_header
        render :plain => "ok"
      end
    end
    
    it "should set a valid token header" do
      get :index
      expect(response.headers['BROWSER_TOKEN']).not_to eq(nil)
      expect(GoSecure.valid_browser_token?(response.headers['BROWSER_TOKEN'])).to eq(true)
    end
  end

  describe "load_domains" do
    it "should load the domain-override settings" do
      get :index
      expect(assigns[:domain_overrides]).to_not eq(nil)
      expect(assigns[:domain_overrides]['host']).to eq('test.host')
      expect(assigns[:domain_overrides]['settings']['app_name']).to eq('MyCoolApp')
      expect(assigns[:domain_overrides]['settings']['company_name']).to eq('Someone')
    end

    it "should load org-set settings" do
      o = Organization.create(custom_domain: true)
      o.settings['hosts'] = ['bacon.com']
      o.settings['host_settings'] = {
        'css_url' => 'asdf',
        'app_name' => 'bacon'
      }
      o.save
      request.host = "bacon.com"
      get :index
      expect(assigns[:domain_overrides]).to_not eq(nil)
      expect(assigns[:domain_overrides]['host']).to eq('bacon.com')
      expect(assigns[:domain_overrides]['css']).to eq('asdf')
      expect(assigns[:domain_overrides]['settings']['app_name']).to eq('bacon')
      expect(assigns[:domain_overrides]['settings']['company_name']).to eq('Someone')
    end
  end
end

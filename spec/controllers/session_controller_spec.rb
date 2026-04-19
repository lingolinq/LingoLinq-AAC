require 'spec_helper'

describe SessionController, :type => :controller do
  # The oauth flow here is 
  # 1. A user comes to :oauth, we render the login page
  # 2. A user puts in their credentials, this gets POSTed to :oauth_login
  # 3. If the login succeeds, we redirect to the success page
  #    (either on their server, or :oauth_local)
  # 3.1 If the user rejects, we redirect the same way
  # 4. The server makes a call to :oauth_token to exchange the code for a real token
  
  describe "oauth" do
    it "should not require api token" do
      k = DeveloperKey.create(:redirect_uri => DeveloperKey.oob_uri)
      post :oauth, params: {:client_id => k.key, :redirect_uri => DeveloperKey.oob_uri}
      expect(response).to be_successful
    end
    
    it "should error if the redirect_uri isn't valid" do
      k = DeveloperKey.create(:redirect_uri => DeveloperKey.oob_uri)
      post :oauth, params: {:client_id => k.key, :redirect_uri => "http://www.example.com"}
      expect(response).to be_successful
      expect(assigns[:error]).to eq("bad_redirect_uri")
    end
    
    it "should error if the developer key is invalid" do
      post :oauth, params: {:client_id => "abcdef"}
      expect(response).to be_successful
      expect(assigns[:error]).to eq("invalid_key")
    end
    
    it "should stash to redis and render the login page if correct" do
      k = DeveloperKey.create(:redirect_uri => DeveloperKey.oob_uri)
      post :oauth, params: {:client_id => k.key, :redirect_uri => DeveloperKey.oob_uri, :scope => 'bacon'}
      expect(assigns[:app_name]).to eq("the application")
      expect(assigns[:app_icon]).not_to eq(nil)
      expect(assigns[:code]).not_to eq(nil)
      expect(response).to be_successful
      str = RedisInit.default.get("oauth_#{assigns[:code]}")
      expect(str).not_to eq(nil)
      json = JSON.parse(str)
      expect(json['app_name']).to eq('the application')
      expect(json['scope']).to eq('bacon')
      expect(json['user_id']).to eq(nil)
    end

    it "should not allow setting the scope to full" do
      k = DeveloperKey.create(:redirect_uri => DeveloperKey.oob_uri)
      post :oauth, params: {:client_id => k.key, :redirect_uri => DeveloperKey.oob_uri, :scope => 'full'}
      expect(assigns[:app_name]).to eq("the application")
      expect(assigns[:app_icon]).not_to eq(nil)
      expect(assigns[:code]).not_to eq(nil)
      expect(response).to be_successful
      str = RedisInit.default.get("oauth_#{assigns[:code]}")
      expect(str).not_to eq(nil)
      json = JSON.parse(str)
      expect(json['app_name']).to eq('the application')
      expect(json['scope']).to eq('')
      expect(json['user_id']).to eq(nil)
    end
    
    it "should allow requesting multiple valid scopes" do
      k = DeveloperKey.create(:redirect_uri => DeveloperKey.oob_uri)
      post :oauth, params: {:client_id => k.key, :redirect_uri => DeveloperKey.oob_uri, :scope => 'read_profile:basic_supervision'}
      expect(assigns[:app_name]).to eq("the application")
      expect(assigns[:app_icon]).not_to eq(nil)
      expect(assigns[:code]).not_to eq(nil)
      expect(response).to be_successful
      str = RedisInit.default.get("oauth_#{assigns[:code]}")
      expect(str).not_to eq(nil)
      json = JSON.parse(str)
      expect(json['app_name']).to eq('the application')
      expect(json['scope']).to eq('read_profile:basic_supervision')
      expect(json['user_id']).to eq(nil)
    end

    it "should restore params from a SAML redirect" do
      k = DeveloperKey.create(:redirect_uri => DeveloperKey.oob_uri)
      RedisInit.default.setex("token_tmp_abcdef", 1.hour.to_i, '229yaot8t24ty9')
      RedisInit.default.setex("oauth_qwerty", 1.hour.to_i, {
        'client_id' => k.key,
        'scope' => 'read_profile',
        'redirect_uri' => DeveloperKey.oob_uri,
        'device_key' => 'a',
        'device_name' => 'b',
        'app_name' => "good app",
        'app_icon' => "http://www.example.com/icon.png"
      }.to_json) rescue nil
      get :oauth, params: {tmp_token: 'abcdef', oauth_code: 'qwerty'}
      expect(assigns[:error]).to eq(nil)
      expect(assigns[:code]).to_not eq(nil)
      expect(assigns[:code]).to_not eq('qwerty')
      expect(assigns[:config]).to eq({
        'client_id' => k.key,
        'scope' => 'read_profile',
        'redirect_uri' => DeveloperKey.oob_uri,
        'device_key' => 'a',
        "authorized_user_id" => nil,
        'device_name' => 'b',
        'app_name' => "the application",
        'app_icon' => "https://opensymbols.s3.amazonaws.com/libraries/arasaac/friends_3.png"        
      })
    end
  end
  
  def key_with_stash(user=nil, redirect_uri=nil)
    @key = DeveloperKey.create(:redirect_uri => (redirect_uri || DeveloperKey.oob_uri))
    @config = {
      'scope' => 'something',
      'redirect_uri' => @key.redirect_uri
    }
    if user
      @config['user_id'] = user.id.to_s
    end
    @code = "abcdefg"
    RedisInit.default.set("oauth_#{@code}", @config.to_json)
  end
  
  describe "oauth_login" do
    it "should not require api token" do
      key_with_stash
      post :oauth_login, params: {:code => @code, :reject => true}
      expect(response).to be_redirect
    end
    
    it "should error when nothing found in redis" do
      post :oauth_login, params: {:code => "abc"}
      expect(response).not_to be_successful
      expect(assigns[:error]).to eq('code_not_found')
    end
    
    it "should error when password is invalid" do
      key_with_stash
      post :oauth_login, params: {:code => @code, :username => "bob", :password => "bob"}
      expect(response).not_to be_successful
      expect(assigns[:error]).to eq('invalid_login')
    end

    it "errors when COPPA parental consent is still pending" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({
        'user_name' => 'coppa_oauth_kid',
        'name' => 'COPPA OAuth Kid',
        'email' => 'child_coppa_oauth@example.com',
        'password' => 'bacon',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_coppa_oauth@example.com'
      }, {:pending => true})
      expect(u).to be_persisted
      expect(u.coppa_parental_consent_pending?).to eq(true)

      key_with_stash
      post :oauth_login, params: {:code => @code, :username => 'coppa_oauth_kid', :password => 'bacon'}
      expect(response).not_to be_successful
      expect(assigns[:error]).to eq('awaiting_parental_consent')
      str = RedisInit.default.get("oauth_#{@code}")
      json = JSON.parse(str)
      expect(json['user_id']).to eq(nil)
    end
    
    it "should redirect to redirect_uri for the developer on reject" do
      key_with_stash
      post :oauth_login, params: {:code => @code, :reject => true}
      expect(response).to be_redirect
      expect(response.location).to match(/\/oauth2\/token\/status\?error=access_denied/)

      key_with_stash(nil, "http://www.example.com/oauth")
      post :oauth_login, params: {:code => @code, :reject => true}
      expect(response).to be_redirect
      expect(response.location).to match(/http:\/\/www\.example\.com\/oauth\?error=access_denied/)

      key_with_stash(nil, "http://www.example.com/oauth?a=bcd")
      post :oauth_login, params: {:code => @code, :reject => true}
      expect(response).to be_redirect
      expect(response.location).to match(/http:\/\/www\.example\.com\/oauth\?a=bcd&error=access_denied/)
    end
    
    it "should update redis stash to include the user on success" do
      key_with_stash
      u = User.new
      u.generate_password("bacon")
      u.save
      post :oauth_login, params: {:code => @code, :username => u.user_name, :password => "bacon"}
      expect(response).to be_redirect
      
      str = RedisInit.default.get("oauth_#{@code}")
      expect(str).not_to eq(nil)
      json = JSON.parse(str)
      expect(json['user_id']).to eq(u.id.to_s)
    end
    
    it "should redirect to redirect_uri for the developer on success" do
      u = User.new
      u.generate_password("bacon")
      u.save

      key_with_stash
      post :oauth_login, params: {:code => @code, :username => u.user_name, :password => "bacon"}
      expect(response).to be_redirect
      expect(response.location).to match(/\/oauth2\/token\/status\?code=\w+/)

      key_with_stash(nil, "http://www.example.com/oauth")
      post :oauth_login, params: {:code => @code, :username => u.user_name, :password => "bacon"}
      expect(response).to be_redirect
      expect(response.location).to match(/http:\/\/www\.example\.com\/oauth\?code=\w+/)

      key_with_stash(nil, "http://www.example.com/oauth?a=bcde")
      post :oauth_login, params: {:code => @code, :username => u.user_name, :password => "bacon"}
      expect(response).to be_redirect
      expect(response.location).to match(/http:\/\/www\.example\.com\/oauth\?a=bcde&code=\w+/)
    end
    
    it "should update the device scopes" do
      u = User.new
      u.generate_password("bacon")
      u.save

      key_with_stash
      post :oauth_login, params: {:code => @code, :username => u.user_name, :password => "bacon"}
      expect(response).to be_redirect
      expect(response.location).to match(/\/oauth2\/token\/status\?code=\w+/)

      str = RedisInit.default.get("oauth_#{@code}")
      expect(str).not_to eq(nil)
      json = JSON.parse(str)
      expect(json['scope']).to eq('something')
      expect(json['user_id']).to eq(u.id.to_s)
    end

    it "should allow authorizing with an approve token from an existing user session" do
      u = User.new
      u.generate_password("bacon")
      u.save

      key_with_stash

      d = Device.create(:user => u, :developer_key_id => 0, :device_key => 'asdf')
      token = d.tokens[0]

      post :oauth_login, params: {:code => @code, :username => u.user_name, :approve_token => token}
      expect(response).to be_redirect
      expect(response.location).to match(/\/oauth2\/token\/status\?code=\w+/)
    end

    it "should redirect to oauth flow if required for user" do
      o = Organization.create
      o.settings['saml_metadata_url'] = 'http://www.example.com/saml/meta'
      o.settings['saml_enforced'] = true
      o.save
      u = User.new
      u.generate_password("bacon")
      u.save
      o.add_user(u.user_name, false, false)
      o.reload
      expect(Organization.external_auth_for(u)).to eq(o)

      key_with_stash
      post :oauth_login, params: {:code => @code, :username => u.user_name, :password => "bacon"}
      expect(response).to be_redirect
      expect(response.location).to eq("http://test.host/saml/init?org_id=#{o.global_id}&device_id=saml_auth&embed=1&oauth_code=abcdefg")
    end
  end
  
  describe "oauth_token" do
    it "should not require api token"
    
    it "should fail on invalid developer key" do
      post :oauth_token
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('invalid_key')
    end
    
    it "should fail on invalid developer secret" do
      u = User.create
      key_with_stash(u)
      post :oauth_token, params: {:client_id => @key.key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('invalid_secret')
    end
    
    it "should fail when token flow not persisted to redis" do
      @key = DeveloperKey.create(:redirect_uri => DeveloperKey.oob_uri)
      post :oauth_token, params: {:client_id => @key.key, :client_secret => @key.secret}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('code_not_found')
    end
    
    it "should fail when user is missing from redis stash" do
      key_with_stash
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('token_not_ready')
    end

    it "should generate a new token for the user's device and return a json response" do
      u = User.create
      key_with_stash(u)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_name']).to eq(u.user_name)
      d = Device.find_by_global_id(json['access_token'])
      expect(d).not_to eq(nil)
      expect(d.developer_key).to eq(@key)
      expect(d.user).to eq(u)
    end
    
    it "should create a device for the user if not there yet" do
      u = User.create
      key_with_stash(u)
      expect(Device.count).to eq(0)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_name']).to eq(u.user_name)
      d = Device.find_by_global_id(json['access_token'])
      expect(d).not_to eq(nil)
      expect(d.developer_key).to eq(@key)
      expect(d.user).to eq(u)
    end
    
    it "should clear the data from redis on token exchange to prevent replay attacks" do
      u = User.create
      key_with_stash(u)
      expect(Device.count).to eq(0)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      expect(RedisInit.default.get("oauth_#{@code}")).to eq(nil)
    end
    
    it "should set specified scopes for the device" do
      u = User.create
      key_with_stash(u)
      @config['scope'] = 'read_profile'
      RedisInit.default.set("oauth_#{@code}", @config.to_json)

      expect(Device.count).to eq(0)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      expect(RedisInit.default.get("oauth_#{@code}")).to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.last
      expect(d.permission_scopes).to eq(['read_profile'])
    end
    
    it "should allow settings multiple whitelisted scopes" do
      u = User.create
      key_with_stash(u)
      @config['scope'] = 'read_profile:basic_supervision'
      RedisInit.default.set("oauth_#{@code}", @config.to_json)

      expect(Device.count).to eq(0)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      expect(RedisInit.default.get("oauth_#{@code}")).to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.last
      expect(d.permission_scopes).to eq(['read_profile', 'basic_supervision'])
    end

    it "should not set non-whitelisted scopes for the device" do
      u = User.create
      key_with_stash(u)

      expect(Device.count).to eq(0)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      expect(RedisInit.default.get("oauth_#{@code}")).to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.last
      expect(d.permission_scopes).to eq([])
    end

    it "should not automatically approve 2fa-required token" do
      u = User.create
      u.assert_2fa!
      u.save
      o = Organization.create(admin: true)
      o.add_manager(u.user_name, true)
      key_with_stash(u)
      @config['scope'] = 'read_profile:basic_supervision'
      RedisInit.default.set("oauth_#{@code}", @config.to_json)

      expect(Device.count).to eq(0)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      expect(RedisInit.default.get("oauth_#{@code}")).to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.last
      expect(d.permission_scopes).to eq(['none'])
    end

    it "should approve 2fa-required token if already confirmed" do
      u = User.create
      o = Organization.create(admin: true)
      o.add_manager(u.user_name, true)
      key_with_stash(u)
      @config['scope'] = 'read_profile:basic_supervision'
      @config['approved_2fa'] = true
      RedisInit.default.set("oauth_#{@code}", @config.to_json)

      expect(Device.count).to eq(0)
      post :oauth_token, params: {:code => @code, :client_id => @key.key, :client_secret => @key.secret}
      expect(response).to be_successful
      expect(RedisInit.default.get("oauth_#{@code}")).to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.last
      expect(d.permission_scopes).to eq(['read_profile', 'basic_supervision'])
    end
  end

  describe "oauth_token_refresh" do
    it "should ask for refresh on old tokens" do
      token_user
      @device.settings['keys'][-1]['last_timestamp'] = 6.months.ago.to_i  
      @device.save!
      get :token_check, params: {:access_token => @device.tokens[0]}
      json = assert_success_json
      expect(json['authenticated']).to eq(false)
      expect(json['expired']).to eq(true)
      expect(json['can_refresh']).to eq(true)
    end

    it "should allow refreshing an integration token" do
      token_user
      k = DeveloperKey.create
      @device.developer_key_id = k.id
      @device.save!
      token, refresh = @device.tokens
      post :oauth_token_refresh, params: {'access_token' => token, 'refresh_token' => refresh, 'client_id' => k.key, 'client_secret' => k.secret}
      json = assert_success_json
      expect(json['access_token']).to_not eq(token)
      expect(json['refresh_token']).to eq(refresh)
      expect(@device.reload.settings['keys'].length).to eq(2)
      expect(@device.settings['keys'][0]['timestamp']).to eq(@device.settings['keys'][1]['timestamp'])
      expect(@device.settings['keys'][0]['expire_at']).to be > Time.now.to_i
      expect(@device.settings['keys'][0]['expire_at']).to be < 10.minutes.from_now.to_i
    end

    it "should not allow refreshing a non-integration token" do
      token_user
      k = DeveloperKey.create
      token, refresh = @device.tokens
      post :oauth_token_refresh, params: {'access_token' => token, 'refresh_token' => refresh, 'client_id' => k.key, 'client_secret' => k.secret}
      assert_error('invalid_token')
    end

    it "should error on invalid token" do
      token_user
      k = DeveloperKey.create
      token, refresh = @device.tokens
      post :oauth_token_refresh, params: {'access_token' => 'asdf', 'refresh_token' => refresh, 'client_id' => k.key, 'client_secret' => k.secret}

      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error'] == "Missing user" || json['error'] == "Invalid token").to eq(true)
    end

    it "should error on invalid refresh token" do
      token_user
      k = DeveloperKey.create
      @device.developer_key_id = k.id
      @device.save!
      token, refresh = @device.tokens
      post :oauth_token_refresh, params: {'access_token' => token, 'refresh_token' => 'whatever', 'client_id' => k.key, 'client_secret' => k.secret}
      assert_error('Invalid refresh token')
    end

    it "should error on invalid developer key" do
      token_user
      k = DeveloperKey.create
      @device.developer_key_id = k.id
      @device.save!
      token, refresh = @device.tokens
      post :oauth_token_refresh, params: {'access_token' => token, 'refresh_token' => refresh, 'client_id' => 'xxx', 'client_secret' => k.secret}
      assert_error('invalid_key')
    end

    it "should error on invalid developer secret" do
      token_user
      k = DeveloperKey.create
      @device.developer_key_id = k.id
      @device.save!
      token, refresh = @device.tokens
      post :oauth_token_refresh, params: {'access_token' => token, 'refresh_token' => refresh, 'client_id' => k.key, 'client_secret' => 'secret'}
      assert_error('invalid_secret')
    end

    it "should error on mismatched developer key id" do
      token_user
      k = DeveloperKey.create
      token, refresh = @device.tokens
      post :oauth_token_refresh, params: {'access_token' => token, 'refresh_token' => refresh, 'client_id' => k.key, 'client_secret' => k.secret}
      assert_error('invalid_token')
    end
  end

  describe "oauth_logout" do
    it "should require api token" do
      post :oauth_logout
      assert_missing_token
    end
    it "should log out the device" do
      token_user
      post :oauth_logout
      expect(response).to be_successful
      expect(response.body).to eq({logout: true}.to_json)
      expect(@device.reload.settings['keys']).to eq([])
    end
  end

  describe "oauth_local" do
    it "should not require api token" do
      get :oauth_local
      expect(response).to be_successful
    end
  end

  describe "token" do
    it "should not require api token" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
    end
    
    it "should set browser token header" do
      post :token
      expect(response.headers['BROWSER_TOKEN']).not_to eq(nil)
    end
    
    it "should allow logging in with username and password only when browser_token is provided" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_name']).to eq('fred')
      expect(json['token_type']).to eq('bearer')
      expect(json['access_token']).not_to eq(nil)
      d = Device.find_by_global_id(json['access_token'])
      expect(d).not_to eq(nil)
      expect(d.developer_key_id).to eq(0)
      expect(d.user).to eq(u)
    end

    it "rejects password token when COPPA parental consent is still pending" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      token = GoSecure.browser_token
      u = User.process_new({
        'user_name' => 'coppa_login_kid',
        'name' => 'COPPA Login Kid',
        'email' => 'child_coppa_token@example.com',
        'password' => 'seashell',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_coppa_token@example.com'
      }, {:pending => true})
      expect(u).to be_persisted
      expect(u.coppa_parental_consent_pending?).to eq(true)

      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'coppa_login_kid', :password => 'seashell'}
      expect(response.status).to eq(400)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('awaiting parental consent')
      expect(json['coppa_parental_consent_pending']).to eq(true)
      expect(json['access_token']).to eq(nil)
    end
    
#     it "should not respect expired browser token" do
#       token = 15.days.ago.strftime('%Y%j')
#       token += '-' + GoSecure.sha512(token, 'browser_token')
#       expect(GoSecure.valid_browser_token_signature?(token)).to eq(true)
#       expect(GoSecure.valid_browser_token?(token)).to eq(false)
#       u = User.new(:user_name => "fred")
#       u.generate_password("seashell")
#       u.save
#       post :token, :grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'
#       expect(response).not_to be_successful
#       json = JSON.parse(response.body)
#       expect(json['error']).to eq('Invalid authentication attempt')
#     end
    
    it "should error on invalid login attempt" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashells'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Invalid authentication attempt')

      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fredx', :password => 'seashell'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Invalid authentication attempt')
    end
    
    it "should return a json response" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_name']).to eq('fred')
    end
    
    it "should match on accidental capitalization" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'Fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_name']).to eq('fred')
    end
    
    it "should match on email address" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_name']).to eq('fred')
    end
    
    it "should not match on email address if more than one user has the same email" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => "fred@example.com"})
      u.generate_password("seashell")
      u.save
      u2 = User.create(:user_name => "fred2", :settings => {:email => "fred@example.com"})
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashells'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Invalid authentication attempt')
    end
    
    it "should create a browser device for the user if not already defined" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      expect(Device.count).to eq(0)
      request.headers['X-INSTALLED-LINGOLINQ'] = 'false'
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.find_by_global_id(json['access_token'])
      expect(d).not_to eq(nil)
      expect(d.token_type).to eq(:browser)
      expect(d.developer_key_id).to eq(0)
      expect(d.default_device?).to eq(true)
      expect(d.user).to eq(u)
    end
    
    it "should use provided ip address and mobile flag" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      expect(Device.count).to eq(0)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell', :mobile => 'true'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.find_by_global_id(json['access_token'])
      expect(d).not_to eq(nil)
      expect(d.developer_key_id).to eq(0)
      expect(d.default_device?).to eq(true)
      expect(d.user).to eq(u)
      expect(d.settings['ip_address']).to eq('0.0.0.0')
      expect(d.settings['mobile']).to eq(true)
    end
    
    it "should create a new browser device for the user if specified" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      expect(Device.count).to eq(0)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell', :device_id => "1.235532 Cool Browser"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d = Device.find_by_global_id(json['access_token'])
      expect(d).not_to eq(nil)
      expect(d.developer_key_id).to eq(0)
      expect(d.user).to eq(u)
      expect(d.settings['name']).to eq("Cool Browser")
      expect(d.default_device?).to eq(false)
      expect(d.system_generated?).to eq(true)
    end
    
    it "should use the existing browser device for the user if already defined" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.generate_token!
      expect(Device.count).to eq(1)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d2 = Device.find_by_global_id(json['access_token'])
      expect(d2).to eq(d)
    end

    it "should handle long_token for browser" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.generate_token!
      expect(Device.count).to eq(1)
      request.headers['X-INSTALLED-LINGOLINQ'] = 'false'
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :long_token => true, :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d2 = Device.find_by_global_id(json['access_token'])
      expect(d2).to eq(d)
      expect(d.reload.token_type).to eq(:browser)
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(nil)
    end

    it "should handle no long_token for browser" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.settings['browser'] = true
      d.generate_token!
      expect(Device.count).to eq(1)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d2 = Device.find_by_global_id(json['access_token'])
      expect(d2).to eq(d)
      expect(d.reload.token_type).to eq(:browser)
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)
    end

    it "header overrides params when conflicting" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "hdrwins")
      u.generate_password("seashell")
      u.save
      request.headers['X-INSTALLED-LINGOLINQ'] = 'false'
      post :token, params: {grant_type: 'password', client_id: 'browser', client_secret: token, username: 'hdrwins', password: 'seashell', installed_app: 'true'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      device = Device.find_by_global_id(json['access_token'])
      expect(device.token_type).to eq(:browser)
      expect(device.settings['browser']).to eq(true)
      expect(device.settings['app']).to be_nil
    end

    it "sets browser from installed_app param when header is absent" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "parambrowser")
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'parambrowser', :password => 'seashell', :installed_app => 'false'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      d = Device.find_by_global_id(json['access_token'])
      expect(d.token_type).to eq(:browser)
      expect(d.settings['browser']).to eq(true)
      expect(d.settings['app']).to eq(nil)
    end

    it "ignores non-canonical header and uses installed_app param for app on token" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "garbagehdrapp")
      u.generate_password("seashell")
      u.save
      request.headers['X-INSTALLED-LINGOLINQ'] = 'maybe'
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'garbagehdrapp', :password => 'seashell', :installed_app => 'true'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      d = Device.find_by_global_id(json['access_token'])
      expect(d.token_type).to eq(:app)
      expect(d.settings['app']).to eq(true)
      expect(d.settings['browser']).to eq(nil)
    end

    it "clears stale browser flag when same device logs in as app" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "stalebrowser")
      u.generate_password("seashell")
      u.save
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.settings['browser'] = true
      d.save!
      request.headers['X-INSTALLED-LINGOLINQ'] = 'true'
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'stalebrowser', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      d2 = Device.find_by_global_id(json['access_token'])
      expect(d2).to eq(d)
      d.reload
      expect(d.settings['browser']).to eq(nil)
      expect(d.settings['app']).to eq(true)
      expect(d.token_type).to eq(:app)
    end

    it "clears stale app flag when same device logs in as browser" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "staleapp")
      u.generate_password("seashell")
      u.save
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.settings['app'] = true
      d.save!
      request.headers['X-INSTALLED-LINGOLINQ'] = 'false'
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'staleapp', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      d2 = Device.find_by_global_id(json['access_token'])
      expect(d2).to eq(d)
      d.reload
      expect(d.settings['app']).to eq(nil)
      expect(d.settings['browser']).to eq(true)
      expect(d.token_type).to eq(:browser)
    end

    it "should handle long_token for app" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.generate_token!
      expect(Device.count).to eq(1)
      request.headers['X-INSTALLED-LINGOLINQ'] = 'true'
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :long_token => true, :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d2 = Device.find_by_global_id(json['access_token'])
      expect(d2).to eq(d)
      expect(d.reload.token_type).to eq(:app)
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(nil)
    end

    it "should handle no long_token for app" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.settings['app'] = true
      d.generate_token!
      expect(Device.count).to eq(1)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['access_token']).not_to eq(nil)
      expect(Device.count).to eq(1)
      d2 = Device.find_by_global_id(json['access_token'])
      expect(d2).to eq(d)
      expect(d.reload.token_type).to eq(:app)
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)
    end

    it "should note a user name change if the password is correct" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.rename_to('freddy')
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('User name was changed')
      expect(json['user_name']).to eq('freddy')
    end
    
    it "should not note a user name change if the password is incorrect" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.rename_to('freddy')
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashells'}
      expect(response.code).to_not eq(200)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Invalid authentication attempt')
    end
    
    it "should throttle to prevent brute force attacks" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred")
      u.generate_password("seashell")
      u.save
      10.times do 
        post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred', :password => 'seashell'}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['user_name']).to eq('fred')
      end
    end
    
    it "should include permissions scopes in the response" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.generate_password("seashell")
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scopes']).to eq(['full'])
      expect(json['modeling_session']).to eq(false)
    end

    it "should make a valid token for an eval login" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.subscription_override('eval')
      u.generate_password("seashell")
      u.save
      expect(u.billing_state).to eq(:eval_communicator)
      post :token, params: {:device_id => 'asdf1', :grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['token_type']).to eq('bearer')
    end

    it "should make a temporary token for a second eval login" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.subscription_override('eval')
      u.generate_password("seashell")
      u.save
      expect(u.billing_state).to eq(:eval_communicator)
      post :token, params: {:device_id => 'asdf1', 'installed_app' => 'true', :grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['token_type']).to eq('bearer')
      d = Device.last
      expect(d.token_type).to eq(:app)

      post :token, params: {:device_id => 'asdf2', 'installed_app' => 'true', :grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['temporary_device']).to eq(true)
    end

    it "should not count temporary tokens when checking if already logged-in for an eval login" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.subscription_override('eval')
      u.generate_password("seashell")
      u.save
      expect(u.billing_state).to eq(:eval_communicator)
      post :token, params: {:device_id => 'asdf1', 'installed_app' => 'true', :grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['token_type']).to eq('bearer')
      d = Device.last
      expect(d.token_type).to eq(:app)

      post :token, params: {:device_id => 'asdf2', 'installed_app' => 'true', :grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['temporary_device']).to eq(true)

      d.destroy
      post :token, params: {:device_id => 'asdf3', 'installed_app' => 'true', :grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => 'fred@example.com', :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['temporary_device']).to_not eq(true)
    end

    it "should log in correctly with a valet login" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.generate_password("seashell")
      u.process({valet_login: true, valet_password: 'baconator'}, {updater: u})
      u.save
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "model@#{u.global_id.sub(/_/, '.')}", :password => 'baconator'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scopes']).to eq(['full', 'modeling'])
      expect(json['modeling_session']).to eq(true)
    end

    it "should mark when a valet login is used, and notify the user" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.generate_password("seashell")
      u.process({valet_login: true, valet_password: 'baconator'}, {updater: u})
      u.save
      expect(u.reload.settings['valet_password_at']).to eq(nil)
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_used, u.global_id)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "model@#{u.global_id.sub(/_/, '.')}", :password => 'baconator'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scopes']).to eq(['full', 'modeling'])
      expect(json['modeling_session']).to eq(true)
      expect(u.reload.settings['valet_password_at']).to_not eq(nil)
      expect(u.reload.settings['valet_password_at']).to be > Time.now.to_i - 5
    end

    it "should disable a used valet login when the regular login is used" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.generate_password("seashell")
      u.process({valet_login: true, valet_password: 'baconator'}, {updater: u})
      u.save
      expect(u.valet_allowed?).to eq(true)
      expect(u.reload.settings['valet_password_at']).to eq(nil)
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_used, u.global_id)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "model@#{u.global_id.sub(/_/, '.')}", :password => 'baconator'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scopes']).to eq(['full', 'modeling'])
      expect(json['modeling_session']).to eq(true)
      expect(u.reload.settings['valet_password_at']).to_not eq(nil)
      expect(u.reload.settings['valet_password_at']).to be > Time.now.to_i - 5
      expect(u.reload.settings['valet_password_disabled']).to eq(nil)

      expect(u.valet_allowed?).to eq(true)
      expect(UserMailer).to_not receive(:schedule_delivery).with(:valet_password_used, u.global_id)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "model@#{u.global_id.sub(/_/, '.')}", :password => 'baconator'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scopes']).to eq(['full', 'modeling'])
      expect(json['modeling_session']).to eq(true)
      expect(u.reload.settings['valet_password_at']).to_not eq(nil)
      expect(u.reload.settings['valet_password_at']).to be > Time.now.to_i - 5
      expect(u.reload.settings['valet_password_disabled']).to eq(nil)

      expect(u.valet_allowed?).to eq(true)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "fred@example.com", :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['token_type']).to eq('bearer')
      expect(json['scopes']).to eq(['full'])
      expect(u.reload.settings['valet_password_at']).to eq(nil)
      expect(u.reload.settings['valet_password_disabled']).to_not eq(nil)
      expect(u.reload.settings['valet_password_disabled']).to be > Time.now.to_i - 5

      expect(u.valet_allowed?).to eq(false)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "model@#{u.global_id.sub(/_/, '.')}", :password => 'baconator'}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Invalid authentication attempt')
    end

    it "should not disable an unused valet login when the regular login is used" do
      token = GoSecure.browser_token
      u = User.new(:user_name => "fred", :settings => {'email' => 'fred@example.com'})
      u.generate_password("seashell")
      u.process({valet_login: true, valet_password: 'baconator'}, {updater: u})
      u.save
      expect(u.valet_allowed?).to eq(true)
      expect(u.reload.settings['valet_password_at']).to eq(nil)

      expect(u.valet_allowed?).to eq(true)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "fred@example.com", :password => 'seashell'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['token_type']).to eq('bearer')
      expect(json['scopes']).to eq(['full'])
      expect(u.reload.settings['valet_password_at']).to eq(nil)
      expect(u.reload.settings['valet_password_disabled']).to eq(nil)
      
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_used, u.global_id)
      post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => "model@#{u.global_id.sub(/_/, '.')}", :password => 'baconator'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scopes']).to eq(['full', 'modeling'])
      expect(json['modeling_session']).to eq(true)
      expect(u.reload.settings['valet_password_at']).to_not eq(nil)
      expect(u.reload.settings['valet_password_at']).to be > Time.now.to_i - 5
      expect(u.reload.settings['valet_password_disabled']).to eq(nil)
    end
  end

  describe "token_check" do
    it "should not require api token" do
      get :token_check
      expect(response).to be_successful
    end
    
    it "should set the browser token header" do
      get :token_check
      expect(response.headers['BROWSER_TOKEN']).not_to eq(nil)
    end
    
    it "should check for a valid api token and respond accordingly" do
      get :token_check
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['authenticated']).to eq(false)
      
      token_user
      get :token_check, params: {:access_token => @device.tokens[0]}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['authenticated']).to eq(true)
      expect(json['user_name']).to eq(@user.user_name)
      
      device = Device.find(@device.id)
      expect(device.settings).not_to eq(nil)
      expect(device.settings).not_to eq("null")
      expect(device.settings['keys'][0]['value']).to eq(@device.tokens[0])
    end

    it "should error correctly (honor skip_on_token_check) on expired or invalid tokens" do
      token_user
      d = @user.devices[0]
      d.settings['disabled'] = true
      d.save
      get :token_check, params: {:access_token => @device.tokens[0]}
      expect(response).to be_successful
      expect(assigns[:cached]).to eq(nil)
      json = JSON.parse(response.body)
      expect(json['authenticated']).to eq(false)
    end

    it "should used cached values on repeat requests" do
      token_user
      get :token_check, params: {:access_token => @device.tokens[0]}
      expect(response).to be_successful
      expect(assigns[:cached]).to eq(nil)
      json = JSON.parse(response.body)
      expect(json['authenticated']).to eq(true)
      expect(json['user_name']).to eq(@user.user_name)

      get :token_check, params: {:access_token => @device.tokens[0]}
      expect(assigns[:cached]).to eq(true)
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['authenticated']).to eq(true)
      expect(json['user_name']).to eq(@user.user_name)
    end

    it "should notify if the token is expired" do
      token_user
      token = @device.tokens[0]
      @device.settings['keys'][-1]['timestamp'] = 10.years.ago.to_i  
      @device.settings['long_token'] = false
      @device.save!
      expect(@device.token_timeout).to eq(28.days.to_i)
      get :token_check, params: {:access_token => token}
      json = assert_success_json
      expect(json['authenticated']).to eq(false)
      expect(json['expired']).to eq(true)
      expect(json['can_refresh']).to eq(nil)
    end

    it "should notify if the token has been inactive too long" do
      token_user
      @device.settings['keys'][-1]['last_timestamp'] = 6.months.ago.to_i  
      @device.save!
      get :token_check, params: {:access_token => @device.tokens[0]}
      json = assert_success_json
      expect(json['authenticated']).to eq(false)
      expect(json['expired']).to eq(true)
      expect(json['can_refresh']).to eq(true)
    end

    it "should respond correctly for a valet token" do
      token_user
      @device.settings['valet'] = true
      @device.save!
      get :token_check, params: {:access_token => @device.tokens[0]}
      json = assert_success_json
      expect(json['authenticated']).to eq(true)
      expect(json['scopes']).to eq(['full', 'modeling'])
      expect(json['modeling_session']).to eq(true)
    end

    it "should retrieve a tmp_token correctly" do
      @tmp_token = true
      token_user
      token = RedisInit.default.setex("token_tmp_2387yt78iy78tay24", 10.minutes.to_i, @device.tokens[0])
      get :token_check, params: {:tmp_token => '2387yt78iy78tay24'}
      json = assert_success_json
      expect(json['authenticated']).to eq(true)
      expect(json['scopes']).to eq(['full'])
    end

    it "should send the 2fa URI if 2fa is required but not yet confirmed" do
      token_user
      @user.assert_2fa!
      expect(@user.reload.state_2fa).to eq({required: true, verified: false})
      @device.generate_token!(true)
      get :token_check, params: {:access_token => @device.tokens[0], '2fa_code' => 'abcdefg', :include_token => true}
      expect(response).to have_http_status(401)
      json = JSON.parse(response.body)
      expect(json['authenticated']).to eq(false)
      expect(json['scopes']).to eq(nil)
      expect(json['valid_2fa']).to eq(false)
      expect(json['token']).to_not eq(nil)
      expect(json['token']['set_2fa']).to eq("otpauth://totp/LingoLinq:#{@user.user_name}:?secret=#{@user.settings['2fa']['secret']}&issuer=LingoLinq")

      totp = ROTP::TOTP.new(@user.settings['2fa']['secret'], issuer: 'LingoLinq')
      code = totp.at(Time.now)
      get :token_check, params: {:access_token => @device.tokens[0], '2fa_code' => code, :include_token => true}
      json = assert_success_json
      expect(json['authenticated']).to eq(true)
      expect(json['valid_2fa']).to eq(true)
      expect(@device.reload.missing_2fa?).to eq(false)
      expect(json['scopes']).to eq(['full'])
      expect(json['token']).to_not eq(nil)
      expect(json['token']['set_2fa']).to eq(nil)
    end
  end

  describe "auth_admin" do
    it "should require an api tokne" do
      post :auth_admin
      json = assert_success_json
      expect(json['success']).to eq(false)
    end

    it "should require admin role" do
      token_user
      post :auth_admin
      json = assert_success_json
      expect(json['success']).to eq(false)
    end

    it "should set a cookie and return success" do
      token_user
      @user.settings['admin'] = true
      @user.save
      post :auth_admin
      json = assert_success_json
      expect(json['success']).to eq(true)
      expect(response.cookies['admin_token']).to_not eq(nil)
      user_id = Permissable.permissions_redis.get("/admin/auth/#{response.cookies['admin_token']}")
      expect(user_id).to eq(@user.global_id)
    end
  end

  describe "saml" do
    # SAML workflow
    # 1a. A user tries to authenticate, but saml is required so redirect
    # 1b. A user enters a saml-configured user name or shortcut, and is redirected
    # 2. SAML provider POSTs back to /consume with issuer and user identity info
    # 3. We validate the signature, find the org-issuer and user in that org
    # 4a. For auth, we generate an auth token and either redirect or window.parent.postMessage
    # 4b. For linking, we make the connection and redirect to the user's profile page

    describe "auth_lookup" do
      it "should error on no result" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        u = User.create
        u.settings['email'] = 'bob@yahoo.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload
        expect(o.external_auth_key).to_not eq(nil)
        expect(Organization.external_auth_for(u)).to eq(o)
        post :auth_lookup, params: {ref: 'bobx@yahoo.com'}
        json = assert_error("no result found")
      end

      it "should return an org url by issuer" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        post :auth_lookup, params: {ref: 'assdf'}
        json = assert_success_json
        expect(json['url']).to eq("http://test.host/saml/init?org_id=#{o.global_id}&device_id=saml_auth")
      end

      it "should return an org url by issuer shortcut" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        o.process({external_auth_shortcut: 'bacon', 'saml_metadata_url' => 'aassdf'}, {updater: User.create})
        expect(Organization.find_by_saml_issuer('bacon')).to eq(o)
        post :auth_lookup, params: {ref: 'bacon'}
        json = assert_success_json
        expect(json['url']).to eq("http://test.host/saml/init?org_id=#{o.global_id}&device_id=saml_auth")
      end

      it "should return an org url by global id" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        post :auth_lookup, params: {ref: o.global_id}
        json = assert_success_json
        expect(json['url']).to eq("http://test.host/saml/init?org_id=#{o.global_id}&device_id=saml_auth")
      end

      it "should error on org without config" do
        o = Organization.create
        post :auth_lookup, params: {ref: o.global_id}
        assert_error("no result found")
      end

      it "should return an org url by user name" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload
        expect(o.external_auth_key).to_not eq(nil)
        expect(Organization.external_auth_for(u)).to eq(o)
        post :auth_lookup, params: {ref: u.user_name}
        json = assert_success_json
        expect(json['url']).to eq("http://test.host/saml/init?org_id=#{o.global_id}&device_id=saml_auth")
      end

      it "should require a valid user to connect" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        post :auth_lookup, params: {ref: o.global_id, user_id: 'asdf'}
        assert_not_found('asdf')
      end

      it "should require auth to connect to a user" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        u = User.create
        post :auth_lookup, params: {ref: o.global_id, user_id: u.global_id}
        assert_unauthorized
      end

      it "should pass a temporary token to allow connecting to a user" do
        token_user
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        expect(GoSecure).to receive(:nonce).with('saml_tmp_token').and_return('abcdefg')
        post :auth_lookup, params: {ref: o.global_id, user_id: @user.global_id}
        json = assert_success_json
        expect(json['url']).to eq("http://test.host/saml/init?org_id=#{o.global_id}&device_id=saml_auth&user_id=#{@user.global_id}&tmp_token=abcdefg")
      end

      it "should return an org url by user email" do
        o = Organization.create
        o.settings['saml_metadata_url'] = "assdf"
        o.settings['saml_enforced'] = true
        o.save
        u = User.create
        u.settings['email'] = 'bob@yahoo.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload
        expect(o.external_auth_key).to_not eq(nil)
        expect(Organization.external_auth_for(u)).to eq(o)
        post :auth_lookup, params: {ref: 'bob@yahoo.com'}
        json = assert_success_json
        expect(json['url']).to eq("http://test.host/saml/init?org_id=#{o.global_id}&device_id=saml_auth")
      end
    end

    describe "saml_start" do
      it "should error without invalid org" do
        get 'saml_start', params: {}
        expect(response.body).to eq('Org missing')
      end

      it "should error without configured org" do
        o = Organization.create
        get 'saml_start', params: {org_id: o.global_id}
        expect(response.body).to eq('Org not set up for external auth')
      end

      it "should error if invalid user passed" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        get 'saml_start', params: {org_id: o.global_id, user_id: 'asdf'}
        expect(response.body).to eq('Could not connect external login to user account')
      end

      it "should error if not allowed to link for user" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        get 'saml_start', params: {org_id: o.global_id, user_id: u.global_id}
        expect(response.body).to eq('Could not connect external login to user account')
      end

      it "should redirect on success" do
        token_user
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        RedisInit.default.setex("token_tmp_abcdefg", 15.minutes.to_i, @device.tokens[0])
        expect(GoSecure).to receive(:nonce).with('saml_session_code').and_return('baconator')
        expect_any_instance_of(SessionController).to receive(:saml_settings).and_return("saml_stuff")
        expect_any_instance_of(OneLogin::RubySaml::Authrequest).to receive(:create).with("saml_stuff", :RelayState => 'baconator').and_return("https://www.example.com/saml/auth")
        get 'saml_start', params: {org_id: o.global_id, user_id: @user.global_id, tmp_token: 'abcdefg'}        
        expect(response).to be_redirect
        expect(response.location).to eq("https://www.example.com/saml/auth")
        expect(assigns[:saml_code]).to_not eq(nil)
        config = JSON.parse(RedisInit.default.get("saml_#{assigns[:saml_code]}"))
        expect(config).to_not eq(nil)
        expect(config).to eq({
          "device_id" => "unnamed device",
          "org_id" => o.global_id,
          "auth_user_id" => @user.global_id,
          "user_id" => @user.global_id,
          "app" => false,
        })
      end

      it "should store configuration for retrieval" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        expect_any_instance_of(SessionController).to receive(:saml_settings).and_return("saml_stuff")
        expect(GoSecure).to receive(:nonce).with('saml_session_code').and_return('baconator')
        expect_any_instance_of(OneLogin::RubySaml::Authrequest).to receive(:create).with("saml_stuff", :RelayState => 'baconator').and_return("https://www.example.com/saml/auth")
        get 'saml_start', params: {org_id: o.global_id, app: '1', embed: '1', oauth_code: 'asdfjkl', device_id: 'my-device'}
        expect(response).to be_redirect
        expect(response.location).to eq("https://www.example.com/saml/auth")
        expect(assigns[:saml_code]).to_not eq(nil)
        config = JSON.parse(RedisInit.default.get("saml_#{assigns[:saml_code]}"))
        expect(config).to_not eq(nil)
        expect(config).to eq({
          "device_id" => "my-device",
          "org_id" => o.global_id,
          'app' => true,
          'embed' => true,
          'oauth_code' => 'asdfjkl'
        })
      end

      it "does not treat 'false' string as true for app param" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        expect_any_instance_of(SessionController).to receive(:saml_settings).and_return("saml_stuff")
        expect(GoSecure).to receive(:nonce).with('saml_session_code').and_return('baconator')
        expect_any_instance_of(OneLogin::RubySaml::Authrequest).to receive(:create).with("saml_stuff", :RelayState => 'baconator').and_return("https://www.example.com/saml/auth")
        get 'saml_start', params: {org_id: o.global_id, app: 'false'}
        expect(response).to be_redirect
        stored = JSON.parse(RedisInit.default.get("saml_#{assigns[:saml_code]}"))
        expect(stored['app']).to eq(false)
      end

      it "should include popout_id if defined" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        expect_any_instance_of(SessionController).to receive(:saml_settings).and_return("saml_stuff")
        expect(GoSecure).to receive(:nonce).with('saml_session_code').and_return('baconator')
        expect_any_instance_of(OneLogin::RubySaml::Authrequest).to receive(:create).with("saml_stuff", :RelayState => 'baconator').and_return("https://www.example.com/saml/auth")
        get 'saml_start', params: {org_id: o.global_id, app: '1', popout_id: 'baconator', device_id: 'my-device'}
        expect(response).to be_redirect
        expect(response.location).to eq("https://www.example.com/saml/auth")
        expect(assigns[:saml_code]).to_not eq(nil)
        config = JSON.parse(RedisInit.default.get("saml_#{assigns[:saml_code]}"))
        expect(config).to_not eq(nil)
        expect(config).to eq({
          "device_id" => "my-device",
          "org_id" => o.global_id,
          'popout_id' => 'baconator',
          'app' => true,
        })
      end
      
    end

    describe "saml_metadata" do
      it "should error without org_id" do
        get 'saml_metadata'
        expect(response.body).to eq("Error: no org specified")
      end

      it "should error without configured org" do
        org = Organization.create
        get 'saml_metadata', params: {org_id: org.global_id}
        expect(response.body).to eq("Error: org not configured")
      end

      it "should return valid xml" do
        org = Organization.create
        org.settings['saml_metadata_url'] = 'whatever'
        org.save

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('whatever', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
    
        get 'saml_metadata', params: {org_id: org.global_id}
        xml = Nokogiri(response.body)
        expect(xml.css('mdui|DisplayName')[0].content).to eq('LingoLinq')
        expect(xml.css('md|AssertionConsumerService')[0]['Location']).to eq("http://test.host/saml/consume?org_id=#{org.global_id}")
      end
    end
    
    describe "saml_consume" do
      it "should error without valid config code" do
        RedisInit.default.del("saml_watermelon")
        post 'saml_consume', params: {}
        expect(assigns[:error]).to eq('Missing auth session code')

        post 'saml_consume', params: {RelayState: 'watermelon'}
        expect(assigns[:error]).to eq('Auth session lost')
      end

      it "should require an org that matches the config and issuer" do
        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {}.to_json)
        post 'saml_consume', params: {RelayState: 'watermelon'}
        expect(assigns[:error]).to eq('Provider not found in the system')

        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('user_name')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '',
          issuers: ['http://test.host/saml/meta'],
        })
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id}.to_json)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        expect(assigns[:error]).to eq('Org mismatch')
      end

      it "should error if trying to connect via unauthorized user" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        u2 = User.create
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('user_name')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id, user_id: u.global_id, auth_user_id: u2.global_id}.to_json)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        expect(assigns[:error]).to eq('Mismatched user connection')
      end

      it "should link user if explicitly set and authorized to do so" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('user_name')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id, user_id: u.global_id, auth_user_id: u.global_id}.to_json)

        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(assigns[:error]).to eq(nil)
      end


      it "should error if no lingolinq user matches" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('user_name')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id}.to_json)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        expect(assigns[:error]).to eq("User not found in the system, please have your account admin connect your accounts (user_name)")
      end
      
      it "should link up by user name if possible" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return(u.user_name)
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id}.to_json)
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(response).to be_redirect
        expect(response.location).to eq("http://test.host/login?auth-#{assigns[:temp_token]}_#{u.user_name}")
      end

      it "should link up by email if possible" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        u.settings['email'] = 'nunya@example.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('myname')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id}.to_json)
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(response).to be_redirect
        expect(response.location).to eq("http://test.host/login?auth-#{assigns[:temp_token]}_#{u.user_name}")
      end

      it "should error on invalid signature" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload
        o.link_saml_user(u, {external_id: '123456'})

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(false)
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id}.to_json)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        expect(assigns[:error]).to eq('Authenticator signature failed')
      end

      it "should redirect to oauth flow (with tmp_token correctly set) if specified" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        u.settings['email'] = 'nunya@example.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('myname')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id, oauth_code: 'abcd'}.to_json)
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(assigns[:temp_token]).to_not eq(nil)
        expect(response).to be_redirect
        expect(response.location).to eq("http://test.host/oauth2/token?oauth_code=abcd&tmp_token=#{assigns[:temp_token]}&user_name=#{u.user_name}")
      end

      it "should render inline success if specified" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        u.settings['email'] = 'nunya@example.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('myname')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id, embed: true}.to_json)
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(response).to_not be_redirect
        expect(assigns[:authenticated_user]).to eq(u)
        expect(assigns[:saml_data]).to eq({
          :email => "nunya@example.com",
          :external_id => "123456",
          :issuer => "https://www.example.com/saml/meta",
          :roles => [],
          :user_name => "myname",          
        })
      end

      it "clears stale app flag on SAML consume when stored config denies app" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        u.settings['email'] = 'nunya@example.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload

        d = Device.find_or_create_by!(user_id: u.id, developer_key_id: 0, device_key: 'unnamed device')
        d.settings['app'] = true
        d.save!

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('myname')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id, embed: true, 'app' => false, device_id: 'unnamed device'}.to_json)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        expect(response).to_not be_redirect
        d.reload
        expect(d.settings.key?('app')).to eq(false)
      end

      it "should redirect to the profile page if specified" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('user_name')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id, user_id: u.global_id, auth_user_id: u.global_id}.to_json)

        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(assigns[:error]).to eq(nil)
        expect(response).to be_redirect
        expect(response.location).to eq("http://test.host/#{u.user_name}")
      end

      it "should redirect to the login page (with tmp_token correctly set) by default" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        u.settings['email'] = 'nunya@example.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('myname')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id}.to_json)
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(response).to be_redirect
        expect(response.location).to eq("http://test.host/login?auth-#{assigns[:temp_token]}_#{u.user_name}")
      end

      it "should handle requests with popout_id defined" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml/meta'
        o.save
        u = User.create
        u.settings['email'] = 'nunya@example.com'
        u.save
        o.add_user(u.user_name, false, false)
        o.reload

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('https://www.example.com/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)
        attrs = {}
        expect(attrs).to receive(:fetch).with('email').and_return('nunya@example.com')
        expect(attrs).to receive(:fetch).with('uid').and_return('myname')
        expect(attrs).to receive(:multi).with(:role).and_return([])
        obj = OpenStruct.new({
          attributes: attrs,
          name_id: '123456',
          issuers: ['https://www.example.com/saml/meta'],
        })
        expect(obj).to receive(:is_valid?).and_return(true).at_least(1).times
        expect(OneLogin::RubySaml::Response).to receive(:new).with('ressy', :settings => settings).and_return(obj)

        RedisInit.default.setex("saml_watermelon", 1.hour.to_i, {org_id: o.global_id, popout_id: 'a1b2'}.to_json)
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to eq(nil)
        post 'saml_consume', params: {RelayState: 'watermelon', SAMLResponse: "ressy"}
        links = UserLink.links_for(u.reload)
        expect(links.detect{|l| l['type'] == 'saml_auth' }).to_not eq(nil)
        expect(response).to_not be_redirect
        expect(assigns[:authenticated_user]).to eq(u)
        expect(assigns[:no_parent]).to eq(true)
        expect(assigns[:saml_data]).to eq({
          :email => "nunya@example.com",
          :external_id => "123456",
          :issuer => "https://www.example.com/saml/meta",
          :roles => [],
          :user_name => "myname",          
        })
        device = u.devices.last
        expect(device.settings['used_for_saml']).to eq(true)
      end
    end
  
    describe "saml_idp_logout_request" do
      it "should error on invalid signature" do
        get 'saml_idp_logout_request', params: {SAMLRequest: 'abc', RelayState: 'qwer'}
        expect(response.body).to eq("Error: Invalid logout request")
      end

      it "should redirect to the correct endpoint" do
        org = Organization.create
        org.settings['saml_metadata_url'] = 'http://test.host/saml/meta'
        org.save

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('http://test.host/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)


        obj = {}
        expect(OneLogin::RubySaml::SloLogoutrequest).to receive(:new).with('abc').and_return(obj)
        expect(obj).to receive(:is_valid?).and_return(true)
        expect(obj).to receive(:id).and_return('zyxwv')
        expect(obj).to receive(:issuer).and_return('http://test.host/saml/meta').at_least(1).times
        expect(obj).to receive(:name_id).and_return('bob').at_least(1).times
        expect_any_instance_of(OneLogin::RubySaml::SloLogoutresponse).to receive(:create).with(settings, 'zyxwv', nil, :RelayState => 'qwer').and_return("https://www.example.com/saml/logout")
        get 'saml_idp_logout_request', params: {SAMLRequest: 'abc', RelayState: 'qwer'}
        expect(response).to be_redirect
        expect(response.location).to eq("https://www.example.com/saml/logout")
      end

      it "should clear only saml device tokens" do
        org = Organization.create
        org.settings['saml_metadata_url'] = 'http://test.host/saml/meta'
        org.save
        u = User.create
        org.add_user(u.user_name, false, false)
        expect(org.link_saml_user(u, {external_id: 'bob'})).to_not eq(false)
        d1 = u.devices.create
        d1.generate_token!
        d2 = u.devices.create
        d2.settings['used_for_saml'] = true
        d2.save
        d2.generate_token!
        d3 = u.devices.create
        d3.generate_token!
        d4 = u.devices.create
        d4.settings['used_for_saml'] = true
        d4.save
        d4.generate_token!

        settings = OneLogin::RubySaml::Settings.new
        settings.assertion_consumer_service_url = "http://test.host/saml/consume"
        settings.sp_entity_id                   = "http://test.host/saml/metadata"
        settings.idp_sso_service_url             = "https://app.example.com/saml/signon"
        settings.name_identifier_format         = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        expect_any_instance_of(OneLogin::RubySaml::IdpMetadataParser).to receive(:parse_remote).with('http://test.host/saml/meta', {:slo_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"], :sso_binding=>["urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"]}).and_return(settings)


        obj = {}
        expect(OneLogin::RubySaml::SloLogoutrequest).to receive(:new).with('abc').and_return(obj)
        expect(obj).to receive(:is_valid?).and_return(true)
        expect(obj).to receive(:id).and_return('zyxwv')
        expect(obj).to receive(:issuer).and_return('http://test.host/saml/meta').at_least(1).times
        expect(obj).to receive(:name_id).and_return('bob').at_least(1).times
        expect_any_instance_of(OneLogin::RubySaml::SloLogoutresponse).to receive(:create).with(settings, 'zyxwv', nil, :RelayState => 'qwer').and_return("https://www.example.com/saml/logout")
        get 'saml_idp_logout_request', params: {SAMLRequest: 'abc', RelayState: 'qwer'}
        expect(response).to be_redirect
        expect(response.location).to eq("https://www.example.com/saml/logout")

        expect(d1.reload.settings['keys'].length).to eq(1)
        expect(d2.reload.settings['keys'].length).to eq(0)
        expect(d3.reload.settings['keys'].length).to eq(1)
        expect(d4.reload.settings['keys'].length).to eq(0)
      end
    end
  end

  describe "saml_tmp_token" do
    it "should require an active session" do
      post 'saml_tmp_token'
      assert_error('no token available')
    end
    
    it "should generate a temp token and map it to the session token" do
      token_user
      post 'saml_tmp_token'
      json = assert_success_json
      expect(json['tmp_token']).to_not eq(nil)
      expect(json['tmp_token']).to_not eq(@device.tokens[0])
      expect(RedisInit.default.get("token_tmp_#{json['tmp_token']}")).to eq(@device.tokens[0])
    end
  end

  describe "token_wait" do
    it "should require popout_id" do
      post 'token_wait'
      assert_error('popout_id required')
    end

    it "should return not found by default" do
      post 'token_wait', params: {popout_id: 'bacon'}
      json = assert_success_json
      expect(json).to eq({'error' => 'not found'})
    end

    it "should return found token if found" do
      u = User.create
      d = Device.create(user: u)
      expect(RedisInit.default).to receive(:get).and_return(nil)
      expect(RedisInit.default).to receive(:get).with("token_popout_bacon").and_return({
        user_id: u.global_id,
        device_id: d.global_id
      }.to_json)
      expect(JsonApi::Token).to receive(:as_json).with(u, d).and_return({a: 1})
      post 'token_wait', params: {popout_id: 'bacon'}
      json = assert_success_json
      expect(json).to eq({'a' => 1})
    end

    it "should delete the reference once found" do
      u = User.create
      d = Device.create(user: u)
      expect(RedisInit.default).to receive(:get).and_return(nil)
      expect(RedisInit.default).to receive(:get).with("token_popout_bacon").and_return({
        user_id: u.global_id,
        device_id: d.global_id
      }.to_json)
      expect(RedisInit.default).to receive(:del).with("token_popout_bacon")
      expect(JsonApi::Token).to receive(:as_json).with(u, d).and_return({a: 1})
      post 'token_wait', params: {popout_id: 'bacon'}
      json = assert_success_json
      expect(json).to eq({'a' => 1})
    end
  end

  describe "status" do
    it "should return active" do
      post 'status'
      json = assert_success_json
      expect(json).to eq({'active' => true})
    end
    
    describe "heartbeat" do
      it "should return active" do
        get 'heartbeat'
        json = assert_success_json
        expect(json).to eq({'active' => true})
      end
    end

  end

end

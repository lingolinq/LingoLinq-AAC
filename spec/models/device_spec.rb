require 'spec_helper'

describe Device, :type => :model do
  let(:u) { User.create }

  describe "paper trail" do
    it "should make sure paper trail is doing its thing"
  end
  
  describe "generate_defaults" do
    it "should generate default values" do
      d = Device.new
      d.generate_defaults
      expect(d.settings).to eq({
      })
      d.device_key = 'default'
      d.developer_key_id = 0
      d.generate_defaults
      expect(d.settings).to eq({
        'name' => 'Web browser for Desktop'
      })
      
      d2 = Device.new
      d2.developer_key_id = 0
      d2.device_key = '1.241125 Cool One'
      d2.generate_defaults
      expect(d2.settings['name']).to eq('Cool One')
    end
  end

  describe "update_user_device_name" do
    it "should actually do something"
  end
  
  describe "device_key" do
    it "should correctly respond to default_device?" do
      d = Device.new
      expect(d.default_device?).to eq(false)
      d.device_key = 'default'
      expect(d.default_device?).to eq(false)
      d.developer_key_id = 2
      expect(d.default_device?).to eq(false)
      d.developer_key_id = 0
      expect(d.default_device?).to eq(true)
    end
    
    it "should always use 'default' for the default device" do
      d = Device.new
      expect { d.unique_device_key }.to raise_error("must be saved first")
      d.id = 123
      # nil developer_key_id is treated as system device (legacy devices from seeds)
      expect(d.unique_device_key).to eq('default')
      d.device_key = 'default'
      # nil developer_key_id treated as system-generated (legacy devices)
      d.developer_key_id = nil
      expect(d.unique_device_key).to eq('default')
      d.developer_key_id = 0
      expect(d.unique_device_key).to eq('default')
    end
    
    it "should include the developer key id in non-default devices" do
      d = Device.new
      d.id = 234
      d.device_key = 'default'
      d.developer_key_id = 1
      expect(d.unique_device_key).to eq('default_1')
      d.device_key = 'bacon'
      expect(d.unique_device_key).to eq('bacon_1')
    end
  end
    
  describe "generate_token!" do
    it "should error if the device isn't already saved" do
      d = Device.new
      expect { d.generate_token! }.to raise_error("device must already be saved")
    end
    
    it "should generate a new key" do
      d = Device.create(:user => u)
      d.generate_token!
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['keys'][0]['timestamp']).to be > Time.now.to_i - 100
      expect(d.settings['keys'][0]['value']).not_to eq(nil)
    end
    
    it "should generate a short key when no long-key specified" do
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.generate_token!
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['keys'][0]['timestamp']).to be > Time.now.to_i - 100
      expect(d.settings['keys'][0]['value']).not_to eq(nil)
      expect(d.inactivity_timeout).to eq(12.hours.to_i)
    end
    
    it "should generate a short key for non-default devices when not specified" do
      d = Device.create(:user => u)
      d.generate_token!
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['keys'][0]['timestamp']).to be > Time.now.to_i - 100
      expect(d.settings['keys'][0]['value']).not_to eq(nil)
      expect(d.token_type).to eq(:unknown)
      expect(d.inactivity_timeout).to eq(12.hours.to_i)
    end
    
    it "should generate a long key for default devices if specified" do
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.generate_token!(true)
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['keys'][0]['timestamp']).to be > Time.now.to_i - 100
      expect(d.settings['keys'][0]['value']).not_to eq(nil)
      expect(d.inactivity_timeout).to eq(14.days.to_i)
    end
    
    it "should track token generation history" do
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      expect(d.settings['token_history']).to eq(nil)
      d.generate_token!
      expect(d.settings['token_history']).not_to eq(nil)
      expect(d.settings['token_history'].length).to eq(1)
      expect(d.settings['token_history'][0]).to be > 10.seconds.ago.to_i
      d.generate_token!
      expect(d.settings['token_history'].length).to eq(2)
      d.generate_token!
      expect(d.settings['token_history'].length).to eq(3)
    end
    
    it "should not allow app devices to have multiple keys" do
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      expect(d.default_device?).to eq(true)
      expect(d.system_generated?).to eq(true)
      d.generate_token!
      d.generate_token!
      d.generate_token!
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(3)
      
      d.device_key = 'bob'
      expect(d.default_device?).to eq(false)
      expect(d.system_generated?).to eq(true)
      d.generate_token!
      expect(d.settings['keys'].length).to eq(4)
      
      d.developer_key_id = 1
      expect(d.default_device?).to eq(false)
      expect(d.system_generated?).to eq(false)
      expect(d.token_type).to eq(:integration)
      d.generate_token!
      expect(d.settings['keys'].length).to eq(5)

      d.developer_key_id = 0
      d.settings['app'] = true
      expect(d.token_type).to eq(:app)
      d.generate_token!
      expect(d.settings['keys'].length).to eq(1)
    end
    
    it "should flush out old keys as part of the generation process" do
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.settings['keys'] = [
        {'value' => 'bob', 'last_timestamp' => 12.days.ago.to_i},
        {'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}
      ]
      d.generate_token!
      expect(d.settings['keys'].length).to eq(2)
      expect(d.settings['keys'][0]['value']).to eq('fred')
    end

    it "should clear old keys for app devices" do
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 0)
      d.settings['app'] = true
      d.settings['keys'] = [
        {'value' => 'bob', 'last_timestamp' => 12.days.ago.to_i},
        {'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}
      ]
      expect(d.token_type).to eq(:app)
      d.generate_token!
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)
    end

    it "should always set to long_token for integration devices" do
      d = Device.create(:user => u, :device_key => 'default', :developer_key_id => 19)
      d.settings['keys'] = [
        {'value' => 'bob', 'last_timestamp' => 12.days.ago.to_i},
        {'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}
      ]
      expect(d.token_type).to eq(:integration)
      d.generate_token!
      expect(d.settings['keys'].length).to eq(2)
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(nil)
    end

    it "should not mark the long_token as set by the user for app device tokens" do
      d = Device.create(:user => u)
      expect(d.token_type).to eq(:unknown)
      d.settings['app'] = true
      expect(d.token_type).to eq(:app)
      d.generate_token!
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)

      d = Device.create(:user => u)
      expect(d.token_type).to eq(:unknown)
      d.settings['app'] = true
      expect(d.token_type).to eq(:app)
      d.generate_token!(true)
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(nil)
    end

    it "should not mark the long_token as set by the user for browser device tokens" do
      d = Device.create(:user => u)
      expect(d.token_type).to eq(:unknown)
      d.settings['browser'] = true
      expect(d.token_type).to eq(:browser)
      d.generate_token!
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)

      d = Device.create(:user => u)
      expect(d.token_type).to eq(:unknown)
      d.settings['browser'] = true
      expect(d.token_type).to eq(:browser)
      d.generate_token!(true)
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(nil)
    end
  end

  describe "logout!" do
    it "should remove all existing keys" do
      d = Device.new
      d.settings = {'keys' => [{}, {}, {}]}
      d.logout!
      expect(d.settings).to eq({'keys' => []})
    end
  end
  
  describe "clean_old_keys" do
    it "should remove old tokens" do
      d = Device.new
      d.settings = {}
      d.settings['keys'] = [
        {'value' => 'bob', 'last_timestamp' => 30.days.ago.to_i}, 
        {'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}
      ]
      d.clean_old_keys
      expect(d.settings['keys']).to eq([{'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}])
    end
    
    it "should remove tokens based on their timeouts" do
      fred_timestamp = 25.days.ago.to_i
      fred_last = 1.hour.ago.to_i
      d = Device.new
      d.settings = {}
      d.settings['long_token'] = false
      d.settings['keys'] = [
        {'value' => 'bob', 'timestamp' => 25.days.ago.to_i, 'last_timestamp' => 25.days.ago.to_i},
        {'value' => 'fred', 'timestamp' => fred_timestamp, 'last_timestamp' => fred_last},
        {'value' => 'sue', 'timestamp' => 30.days.ago.to_i, 'last_timestamp' => 1.minute.ago.to_i},
        {'value' => 'alice', 'timestamp' => 5.days.ago.to_i, 'last_timestamp' => 1.minute.ago.to_i, 'expire_at' => 5.minutes.ago.to_i},
        {'value' => 'alexis', 'timestamp' => 3.hours.ago.to_i, 'last_timestamp' => 20.minute.ago.to_i, 'timeout' => 10.minutes.to_i}
      ]
      d.clean_old_keys
      expect(d.settings['keys']).to eq([{'value' => 'fred', 'timestamp' => fred_timestamp, 'last_timestamp' => fred_last}])
    end

    it "should honor org-configured timeouts" do
      o = Organization.create
      u = User.create
      o.settings['inactivity_timeout'] = 20
      o.save
      d = Device.create(user: u, settings: {'browser' => true})
      expect(d.token_type).to eq(:browser)
      o.add_manager(u.user_name)
      d.generate_token!(false)
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['keys'][0]['timeout']).to eq(20.minutes.to_i)
      d.settings['keys'][0]['timestamp'] = 21.minutes.ago.to_i
      d.settings['keys'][0]['last_timestamp'] = 21.minutes.ago.to_i
      d.settings['keys'][0]['needs_refresh'] = nil
      d.clean_old_keys
      expect(d.settings['keys'].length).to eq(1)
      expect(d.settings['keys'][0]['needs_refresh']).to eq(true)
    end
  end

  describe "valid_token?" do
    it "should return a boolean" do
      d = Device.new
      expect(d.valid_token?('bob')).to eq(false)
      d.settings = {}
      d.settings['keys'] = [{'value' => 'bob', 'last_timestamp' => 1.second.ago.to_i}]
      expect(d.valid_token?('bob')).to eq(true)
      d.settings['keys'] = [{'value' => 'bob', 'last_timestamp' => 1.second.ago.to_i}, {'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}]
      expect(d.valid_token?('bob')).to eq(true)
      expect(d.valid_token?('fred')).to eq(true)
    end
    
    it "should ignore old tokens" do
      d = Device.new
      d.settings = {}
      d.settings['keys'] = [{'value' => 'bob', 'last_timestamp' => 30.days.ago.to_i}, {'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}]
      expect(d.valid_token?('bob')).to eq(false)
      expect(d.valid_token?('fred')).to eq(true)
    end
    
    it "should update timestamp periodically on token user" do
      d = Device.create(:user => u)
      d.settings ||= {}
      d.settings['keys'] = [{'value' => 'bob', 'last_timestamp' => 35.minutes.ago.to_i}]
      d.update_column(:settings, GoSecure::SecureJson.dump(d.settings))
      expect(d.valid_token?('bob')).to eq(true)
      d.reload
      expect(d.settings['keys'][0]['last_timestamp']).to be > 10.seconds.ago.to_i
    end
    
    it "should update the app version if passed in" do
      d = Device.create(:user => u)
      d.settings ||= {}
      d.settings['keys'] = [{'value' => 'bob', 'last_timestamp' => 35.minutes.ago.to_i}]
      d.update_column(:settings, GoSecure::SecureJson.dump(d.settings))
      expect(d.valid_token?('bob', '2011.01.01')).to eq(true)
      d.reload
      expect(d.settings['keys'][0]['last_timestamp']).to be > 10.seconds.ago.to_i
      expect(d.settings['app_version']).to eq('2011.01.01')
      expect(d.settings['app_versions']).not_to eq(nil)
      expect(d.settings['app_versions'].length).to eq(1)
      expect(d.settings['app_versions'][0][0]).to eq('2011.01.01')
      expect(d.settings['app_versions'][0][1]).to be > Time.now.to_i - 5
      expect(d.settings['app_versions'][0][1]).to be < Time.now.to_i + 5

      expect(d.valid_token?('bob')).to eq(true)
      expect(d.settings['app_versions'].length).to eq(1)

      expect(d.valid_token?('bob', '2012.01.01')).to eq(true)
      expect(d.settings['app_versions'].length).to eq(2)
      expect(d.settings['app_versions'][1][0]).to eq('2012.01.01')
      expect(d.settings['app_versions'][1][1]).to be > Time.now.to_i - 5
      expect(d.settings['app_versions'][1][1]).to be < Time.now.to_i + 5
    end
    
    it "should always return false for disabled tokens" do
      d = Device.new
      expect(d.valid_token?('bob')).to eq(false)
      d.settings = {}
      d.settings['keys'] = [{'value' => 'bob', 'last_timestamp' => 1.second.ago.to_i}]
      expect(d.valid_token?('bob')).to eq(true)
      d.settings['disabled'] = true
      expect(d.valid_token?('bob')).to eq(false)
      d.settings['keys'] = [{'value' => 'bob', 'last_timestamp' => 1.second.ago.to_i}, {'value' => 'fred', 'last_timestamp' => 1.second.ago.to_i}]
      expect(d.valid_token?('bob')).to eq(false)
      expect(d.valid_token?('fred')).to eq(false)
    end
  end

  describe "token" do
    it "should return the latest token" do
      d = Device.new
      d.settings = {}
      d.settings['keys'] = [{'value' => 'ham', 'last_timestamp' => 1.second.ago.to_i}, {'value' => 'bacon', 'last_timestamp' => 1.second.ago.to_i}]
      expect(d.tokens[0]).to eq('bacon')
      expect(d.tokens[0]).to eq('bacon')
    end
    
    it "should ignore old tokens" do
      d = Device.new
      d.settings = {}
      d.settings['keys'] = [{'value' => 'ham', 'last_timestamp' => 1.second.ago.to_i}, {'value' => 'bacon', 'last_timestamp' => 30.days.ago.to_i}]
      expect(d.tokens[0]).to eq('ham')
    end
    
    it "should generate a token if none are yet available" do
      d = Device.create(:user => u)
      d.settings = {}
      d.settings['keys'] = [{'value' => 'bacon', 'last_timestamp' => 30.days.ago.to_i}]
      expect(d.tokens[0]).not_to eq('ham')
      expect(d.tokens[0].length).to be > 24
      expect(d.settings['keys'].length).to eq(1)
      
      d.settings['keys'] = []
      expect(d.tokens[0].length).to be > 24
      expect(d.settings['keys'].length).to eq(1)
    end
  end
          
  it "should securely serialize settings" do
    d = Device.create(:user => u)
    d.settings ||= {}
    d.settings['test_key'] = 'test_value'
    d.save!
    d.reload
    expect(d.settings['test_key']).to eq('test_value')
  end
  

  describe "disabled?" do
    it "should return the correct value" do
      d = Device.new
      expect(d.disabled?).to eq(false)
      d.settings = {}
      expect(d.disabled?).to eq(false)
      d.settings['disabled'] = false
      expect(d.disabled?).to eq(false)
      d.settings['disabled'] = true
      expect(d.disabled?).to eq(true)
    end
  end
  
  describe "permission_scopes" do
    it "should return nothing if disabled" do
      d = Device.new
      d.settings = {'disabled' => true}
      expect(d.permission_scopes).to eq(['none'])
      d.settings['permission_scopes'] = ['a', 'b', 'c']
      expect(d.permission_scopes).to eq(['none'])
    end
    
    it "should return 'full' if not an integration" do
      d = Device.new
      expect(d.permission_scopes).to eq(['full'])
    end
    
    it "should return defined scopes if for an integration" do
      d = Device.new
      d.user_integration_id = 1
      expect(d.permission_scopes).to eq([])
      d.settings = {'permission_scopes' => ['a', 'b']}
      expect(d.permission_scopes).to eq(['a', 'b'])
    end
    
    it "should return defined scopes if for an oauth token" do
      d = Device.new
      d.developer_key_id = 1
      expect(d.permission_scopes).to eq([])
      d.settings = {'permission_scopes' => ['b', 'c']}
      expect(d.permission_scopes).to eq(['b', 'c'])
    end
  end
  
  describe "inactivity_timeout" do
    it "should return the correct value" do
      d = Device.new
      d.settings = {}
      expect(d.inactivity_timeout).to eq(12.hours.to_i)
      d.settings['long_token'] = true
      expect(d.inactivity_timeout).to eq(14.days.to_i)
      d.user_integration_id = 1
      expect(d.inactivity_timeout).to eq(24.hours.to_i)
      d.settings['long_token'] = false
      expect(d.inactivity_timeout).to eq(24.hours.to_i)
      d.user_integration_id = nil
      d.settings['valet'] = true
      expect(d.inactivity_timeout).to eq(20.hours.to_i)
      d.settings['valet_long_term'] = true
      expect(d.token_type).to eq(:unknown)
      expect(d.inactivity_timeout).to eq(12.hours.to_i)
      d.settings['browser'] = true
      d.settings['long_token'] = true
      expect(d.token_type).to eq(:browser)
      expect(d.inactivity_timeout).to eq(28.days.to_i)

      d.settings['browser'] = false
      d.settings['app'] = true
      expect(d.token_type).to eq(:app)
      expect(d.inactivity_timeout).to eq(14.months.to_i)
      
      d.settings['app'] = false
      expect(d.token_type).to eq(:unknown)
      expect(d.inactivity_timeout).to eq(14.days.to_i)
    end
  end
  
  describe "invalidate_keys!" do
    it "should invalidate keys" do
      d = Device.create(:user => u)
      d.generate_token!
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(1)
      
      d.invalidate_keys!
      expect(d.reload.settings['keys']).to eq([])
    end

    it 'should invalidate cached tokens' do
      d = Device.create(:user => u)
      d.generate_token!
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(1)
      key = d.settings['keys'][0]['value']
      expect(RedisInit.permissions).to receive(:del).with("user_token/#{key}").and_return(true)
      
      d.invalidate_keys!
      expect(d.reload.settings['keys']).to eq([])
    end

    it "should invalidate cached tokens on device destroy" do
      d = Device.create(:user => u)
      d.generate_token!
      expect(d.settings['keys']).not_to be_nil
      expect(d.settings['keys'].length).to eq(1)
      key = d.settings['keys'][0]['value']
      expect(RedisInit.permissions).to receive(:del).with("user_token/#{key}").and_return(true)
      d.destroy      
    end
  end

  describe "check_token" do
    it 'should check for a cached value' do
      expect(RedisInit.permissions).to receive(:get).with('user_token/asdf')
      Device.check_token('asdf', '1.2.3')
    end

    it 'should use the cached value if available' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(RedisInit.permissions).to receive(:get).with('user_token/asdf').and_return("#{u.global_id}::#{d.global_id}::a,b")
      res = Device.check_token('asdf', '1.2.3')
      expect(res[:cached]).to eq(true)
      expect(res[:user]).to eq(u)
      expect(res[:error]).to eq(nil)
      expect(res[:device_id]).to eq(d.global_id)
    end

    it 'should check for a valid token if not cached' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      expect(d).to receive(:valid_token?).with(d.tokens[0], '1.2.3').and_return(true).at_least(:once)
      res = Device.check_token(d.tokens[0], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq(nil)
    end

    it 'should mark a token as expired' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      d.generate_token!
      d.settings['keys'][0]['timestamp'] = 200.months.ago.to_i
      d.settings['keys'][0]['last_timestamp'] = 200.months.ago.to_i
      d.save
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      res = Device.check_token(d.settings['keys'][0]['value'], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq("Expired token")
    end

    it 'should mark a token as needing refresh' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      d.generate_token!
      d.settings['keys'][0]['timestamp'] = 36.months.ago.to_i
      d.settings['keys'][0]['last_timestamp'] = 36.months.ago.to_i
      d.save
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      res = Device.check_token(d.settings['keys'][0]['value'], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq("Token needs refresh")
      expect(res[:can_refresh]).to eq(true)
    end

    it 'should specify'

    it 'should mark a token as invalid' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      d.generate_token!
      d.settings['keys'][0]['timestamp'] = 36.months.ago.to_i
      d.settings['keys'][0]['last_timestamp'] = 36.months.ago.to_i
      d.save
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      res = Device.check_token("#{d.settings['keys'][0]['value']}x", '1.2.3')
      expect(res[:user]).to eq(nil)
      expect(res[:device_id]).to eq(nil)
      expect(res[:error]).to eq("Invalid token")
    end

    it 'should mark a token as disabled' do
      u = User.create
      d = Device.create(user: u, settings: {'disabled' => true, 'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      d.generate_token!
      d.settings['keys'][0]['timestamp'] = 36.months.ago.to_i
      d.settings['keys'][0]['last_timestamp'] = 36.months.ago.to_i
      d.save
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      res = Device.check_token(d.settings['keys'][0]['value'], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq("Disabled token")
    end

    it 'should error if the user is not found' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(RedisInit.permissions).to receive(:get).with('user_token/asdf').and_return("#{u.global_id}9::#{d.global_id}::a,b")
      res = Device.check_token('asdf', '1.2.3')
      expect(res[:error]).to eq("Missing user")
      expect(res[:user]).to eq(nil)
      expect(res[:cached]).to eq(true)
      expect(res[:device_id]).to eq(nil)
    end

    it 'should return a valid result if found' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      res = Device.check_token(d.tokens[0], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq(nil)
    end

    it 'should set permission scopes on the user from the cache' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(RedisInit.permissions).to receive(:get).with('user_token/asdf').and_return("#{u.global_id}::#{d.global_id}::a,b")
      res = Device.check_token('asdf', '1.2.3')
      expect(res[:cached]).to eq(true)
      expect(res[:user]).to eq(u)
      expect(res[:error]).to eq(nil)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:user].permission_scopes).to eq(['a', 'b'])
    end

    it 'should set permission scopes on the user from a fresh load' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      expect(d).to receive(:valid_token?).with(d.tokens[0], '1.2.3').and_return(true).at_least(:once)
      res = Device.check_token(d.tokens[0], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq(nil)
      expect(res[:user].permission_scopes).to eq(['a', 'b'])
    end

    it 'should persist the valid result to the cache' do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      token = d.tokens[0]
      expect(RedisInit.permissions).to receive(:setex) do |key, ts, val|
        expect(key).to eq("user_token/#{token}")
        expect(ts).to be > (12.hours.to_i - 100)
        expect(ts).to be < (12.hours.to_i + 100)
        expect(val).to eq("#{u.global_id}::#{d.global_id}::a,b::false")
      end
      res = Device.check_token(token, '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq(nil)
    end

    it 'should persist the valid result to the cache' do
      u = User.create
      d = Device.create(user: u)
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      res = Device.check_token(d.tokens[0], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:user].valet_mode?).to eq(false)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq(nil)
      expect(res[:user].permission_scopes).to eq(['full'])
    end

    it "should correctly assert valet mode" do
      u = User.create
      d = Device.create(user: u)
      d.settings['valet'] = true
      d.save
      expect(Device).to receive(:find_by_global_id).with(d.global_id).and_return(d)
      res = Device.check_token(d.tokens[0], '1.2.3')
      expect(res[:user]).to eq(u)
      expect(res[:user].valet_mode?).to eq(true)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:error]).to eq(nil)
      expect(res[:user].permission_scopes).to eq(['full', 'modeling'])
    end

    it "should retrieve valet mode data from cache" do
      u = User.create
      d = Device.create(user: u, settings: {'permission_scopes' => ['a', 'b']}, user_integration_id: 9)
      expect(RedisInit.permissions).to receive(:get).with('user_token/asdf').and_return("#{u.global_id}::#{d.global_id}::a,b::true")
      res = Device.check_token('asdf', '1.2.3')
      expect(res[:cached]).to eq(true)
      expect(res[:user]).to eq(u)
      expect(res[:user].valet_mode?).to eq(true)
      expect(res[:error]).to eq(nil)
      expect(res[:device_id]).to eq(d.global_id)
      expect(res[:user].permission_scopes).to eq(['a', 'b'])
    end
  end

  describe "token_timeout" do
    it "should return the correct timeout based on the token type" do
      u = User.create
      d = Device.create(user: u)
      d.settings['browser'] = true
      d.settings['long_token'] = false
      expect(d.token_timeout).to eq(28.days.to_i)
      d.settings['long_token'] = true
      expect(d.token_timeout).to eq(6.months.to_i)
      d.settings['browser'] = false
      expect(d.token_timeout).to eq(5.years)
      d.settings['long_token'] = false
      expect(d.token_timeout).to eq(28.days.to_i)
      d.settings['valet'] = true
      expect(d.token_timeout).to eq(24.hours.to_i)
      d.settings['valet_long_term'] = true
      expect(d.token_timeout).to eq(28.days.to_i)
    end
  end

  describe "token_type" do
    it "should return the correct token type" do
      u = User.create
      d = Device.create(user: u)
      expect(d.token_type).to eq(:unknown)
      d.developer_key_id = 0
      expect(d.token_type).to eq(:unknown)
      d.settings['app'] = true
      expect(d.token_type).to eq(:app)
      d.settings['browser'] = true
      expect(d.token_type).to eq(:browser)
      d.user_integration_id = 9
      expect(d.token_type).to eq(:integration)
      d.user_integration_id = nil
      d.developer_key_id = 11
      expect(d.token_type).to eq(:integration)
    end
  end

  describe "generate_from_refresh_token!" do
    it "should generate a new token with the same start and refresh token if match found" do
      u = User.create
      d = Device.create(user: u)
      d.developer_key_id = 1
      a, b = d.tokens
      g, h = d.generate_from_refresh_token!(a, b)
      e, f = d.tokens
      expect(a).to_not eq(e)
      expect(b).to eq(f)
      expect(g).to eq(e)
      expect(d.settings['keys'].length).to eq(2)
      expect(d.settings['keys'][0]['timestamp']).to eq(d.settings['keys'][1]['timestamp'])
    end

    it "should only allow for integration devices" do
      u = User.create
      d = Device.create(user: u)
      a, b = d.tokens
      g, h = d.generate_from_refresh_token!(a, b)
      expect(g).to eq(nil)
      expect(h).to eq(nil)
      expect(d.settings['keys'].length).to eq(1)
    end

    it "should return nothing if no match found" do
      u = User.create
      d = Device.create(user: u)
      d.developer_key_id = 1
      a, b = d.tokens
      g, h = d.generate_from_refresh_token!(a, "fff")
      expect(g).to eq(nil)
      expect(h).to eq(nil)
      expect(d.settings['keys'].length).to eq(1)
    end
  end

  describe "2fa" do
    describe "missing_2fa?" do
      it "should return a correct value" do
        d = Device.new
        expect(d.missing_2fa?).to eq(false)
        d.settings = {}
        expect(d.missing_2fa?).to eq(false)
        d.settings['2fa'] = {}
        expect(d.missing_2fa?).to eq(false)
        d.settings['2fa']['pending'] = true
        expect(d.missing_2fa?).to eq(true)
      end

      it "should change when generate_token! is called" do
        u = User.create
        d = Device.create(user: u)
        expect(d.missing_2fa?).to eq(false)
        expect(d.user).to receive(:state_2fa).and_return(required: true).at_least(:once)
        expect(d.missing_2fa?).to eq(false)
        d.generate_token!
        expect(d.missing_2fa?).to eq(true)
      end

      it "should not require 2fa when long_token was already set and code was recently confirmed" do
        u = User.create
        d = Device.create(user: u)
        d.settings['long_token'] = true
        d.settings['2fa'] = {'last_otp' => 15.days.ago.to_i}
        d.save
        expect(d.missing_2fa?).to eq(false)
        expect(d.user).to receive(:state_2fa).and_return(required: true).at_least(1).times
        expect(d.missing_2fa?).to eq(false)
        d.generate_token!
        expect(d.missing_2fa?).to eq(false)

        d.settings['2fa'] = {'last_otp' => 45.days.ago.to_i}
        d.save
        d.generate_token!
        expect(d.missing_2fa?).to eq(true)
      end

      it "should require 2fa when long_token was not already set and code was recently confirmed" do
        u = User.create
        d = Device.create(user: u)
        d.settings['2fa'] = {'last_otp' => 15.days.ago.to_i}
        d.save
        expect(d.missing_2fa?).to eq(false)
        expect(d.user).to receive(:state_2fa).and_return(required: true).at_least(1).times
        expect(d.missing_2fa?).to eq(false)
        d.generate_token!
        expect(d.missing_2fa?).to eq(true)
      end
    end

    describe "confirm_2fa!" do
      it "should track recent fails" do
        u = User.create
        d = Device.create(user: u)
        expect(d.user).to receive(:valid_2fa?).with('code').and_return(false)
        res = d.confirm_2fa!('code')
        expect(res).to eq(false)
        expect(d.settings['2fa']['fails']).to_not eq(nil)
        expect(d.settings['2fa']['fails'].length).to eq(1)
      end

      it "should store cooldown with too many fails" do
        u = User.create
        d = Device.create(user: u)
        expect(d.user).to receive(:valid_2fa?).with('code').and_return(false).at_least(1).times
        11.times do |i|
          res = d.confirm_2fa!('code')
          expect(res).to eq(false)
          expect(d.settings['2fa']['fails']).to_not eq(nil)
          expect(d.settings['2fa']['fails'].length).to eq(i + 1)
        end
        d.settings['2fa']['fails'] << 123
        d.save
        res = d.confirm_2fa!('code')
        expect(res).to eq(false)
        expect(d.settings['2fa']['fails']).to_not eq(nil)
        expect(d.settings['2fa']['fails'].length).to eq(12)
        expect(d.settings['2fa']['cooldown']).to_not eq(nil)
        expect(d.settings['2fa']['cooldown']).to be > 9.minutes.from_now.to_i
        expect(d.settings['2fa']['cooldown']).to be < 11.minutes.from_now.to_i
    end

      it "should clear cooldown and fails on success" do
        u = User.create
        d = Device.create(user: u)
        d.settings['2fa'] = {'cooldown' => true, 'pending' => true}
        d.save
        expect(d.user).to receive(:valid_2fa?).with('code').and_return(false).at_least(1).times
        7.times do |i|
          res = d.confirm_2fa!('code')
          expect(res).to eq(false)
          expect(d.settings['2fa']['fails']).to_not eq(nil)
          expect(d.settings['2fa']['fails'].length).to eq(i + 1)
        end
        expect(d.settings['2fa']['cooldown']).to_not eq(nil)
        expect(d.user).to receive(:valid_2fa?).with('winner').and_return(true)
        res = d.confirm_2fa!('winner')
        expect(res).to eq(true)
        expect(d.settings['2fa']['pending']).to eq(nil)
        expect(d.settings['2fa']['cooldown']).to eq(nil)
        expect(d.settings['2fa']['fails']).to eq(nil)
      end
    end
  end
end

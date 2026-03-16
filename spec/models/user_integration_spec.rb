require 'spec_helper'

describe UserIntegration, :type => :model do
  describe "generate_defaults" do
    it "should create a token" do
      ui = UserIntegration.new(:settings => {})
      expect(ui.settings['token']).to eq(nil)
      ui.generate_defaults
      expect(ui.settings['token']).to_not eq(nil)
    end
    
    it "should set a default scope" do
      ui = UserIntegration.new(:settings => {})
      expect(ui.settings['permission_scopes']).to eq(nil)
      ui.generate_defaults
      expect(ui.settings['permission_scopes']).to eq(['read_profile'])
    end
    
    it "should not overwrite an existing scope" do
      ui = UserIntegration.new(:settings => {})
      ui.settings['permission_scopes'] = ['read_logs']
      ui.generate_defaults
      expect(ui.settings['permission_scopes']).to eq(['read_logs'])
    end
    
    it "should asssert a device" do
      u = User.create
      ui = UserIntegration.new(:settings => {}, :user => u)
      ui.generate_defaults
      expect(ui.device).to_not eq(nil)
    end
  end
  
  describe "assert_device" do
    it "should create the device if not present" do
      u = User.create
      ui = UserIntegration.new(:settings => {}, :user => u)
      ui.assert_device
      expect(ui.device).to_not eq(nil)
      
      u = User.create
      d = Device.create(:user => u)
      ui = UserIntegration.new(:settings => {})
      ui.device = d
      ui.assert_device
      expect(ui.device).to eq(d)
    end
    
    it "should link the device to the integration once it's saved" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      expect(ui.device).to_not eq(nil)
      d = ui.device
      expect(d.user_integration).to eq(ui)
    end
    
    it "should apply the default scope by default to the device" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      expect(ui.device).to_not eq(nil)
      expect(ui.device.permission_scopes).to eq(['read_profile'])
    end
  end
  
  describe "assert_webhooks" do
    it "should install webhooks" do
      ui = UserIntegration.create(:user => User.create)
      ui.assert_webhooks
      expect(Worker.scheduled?(UserIntegration, 'perform_action', {'method' => 'assert_webhooks', 'id' => ui.id, 'arguments' => [true]})).to eq(false)
      ui.instance_variable_set('@install_default_webhooks', true)
      ui.assert_webhooks
      expect(Worker.scheduled?(UserIntegration, 'perform_action', {'id' => ui.id, 'method' => 'assert_webhooks', 'arguments' => [true]})).to eq(true)
    end

    it "should install button action wehooks" do
      u = User.create
      ui = UserIntegration.create(:user => u, :settings => {
        'button_webhook_url' => 'http://www.example.com'
      })
      ui.assert_webhooks(true)
      expect(ui.settings['button_webhook_id']).to_not eq(nil)
      wh = Webhook.find_by_path(ui.settings['button_webhook_id'])
      expect(wh).to_not eq(nil)
      expect(wh.record_code).to eq(ui.record_code)
      expect(wh.user_id).to eq(ui.user_id)
      expect(wh.settings['notifications']).to eq({'button_action' => [
        {
          'callback' => 'http://www.example.com',
          'include_content' => true,
          'content_type' => 'button'
        }
      ]})
      ui.settings
    end
    
    it "should not install button action webhook if already installed" do
      u = User.create
      wh = Webhook.create(:user => u)
      ui = UserIntegration.create(:user => u, :settings => {
        'button_webhook_url' => 'http://www.example.com',
        'button_webhook_id' => wh.global_id
      })
      ui.assert_webhooks(true)
      expect(ui.settings['button_webhook_id']).to_not eq(nil)
      wh = Webhook.find_by_path(ui.settings['button_webhook_id'])
      expect(wh).to_not eq(nil)
      expect(wh.record_code).to eq(ui.record_code)
      expect(wh.user_id).to eq(ui.user_id)
      expect(wh.settings['notifications']).to eq({'button_action' => [
        {
          'callback' => 'http://www.example.com',
          'include_content' => true,
          'content_type' => 'button'
        }
      ]})
      ui.settings
    end
    
    it "should do nothing if the webhook was manually deleted" do
      u = User.create
      ui = UserIntegration.create(:user => u, :settings => {
        'button_webhook_url' => 'http://www.example.com',
        'button_webhook_id' => 'abcd'
      })
      ui.assert_webhooks(true)
      expect(ui.settings['button_webhook_id']).to eq('abcd')
      expect(Webhook.count).to eq(0)
    end
  end 
  
  describe "process_params" do
    it "should raise an error if no user set" do
      expect { UserIntegration.process_new({}, {}) }.to raise_error('user required')
    end
    
    it "should set values" do
      u = User.create
      ui = UserIntegration.process_new({
        'name' => 'good integration',
        'custom_integration' => true
      }, {'user' => u})
      expect(ui).to_not eq(nil)
      expect(ui.id).to_not eq(nil)
      expect(ui.settings['name']).to eq('good integration')
      expect(ui.settings['custom_integration']).to eq(true)
      expect(ui.settings['token']).to_not eq(nil)
    end
    
    it "should mark webhooks as needing installed" do
      u = User.create
      ui = UserIntegration.process_new({
        'name' => 'good integration',
        'custom_integration' => true
      }, {'user' => u})
      expect(ui).to_not eq(nil)
      expect(Worker.scheduled?(UserIntegration, 'perform_action', {'id' => ui.id, 'method' => 'assert_webhooks', 'arguments' => [true]})).to eq(true)
    end
    
    it "should regenerate the token if specified" do
      u = User.create
      ui = UserIntegration.process_new({
        'name' => 'good integration',
        'custom_integration' => true
      }, {'user' => u})
      expect(ui).to_not eq(nil)
      expect(ui.id).to_not eq(nil)
      expect(ui.settings['token']).to_not eq(nil)
      token = ui.settings['token']
      ui.process({'regenerate_token' => true})
      expect(ui.settings['token']).to_not eq(nil)
      expect(ui.settings['token']).to_not eq(token)
    end
    
    it "should sanitize fields" do
      u = User.create
      ui = UserIntegration.process_new({
        'name' => '<b>good</b> integration',
        'custom_integration' => true
      }, {'user' => u})
      expect(ui).to_not eq(nil)
      expect(ui.id).to_not eq(nil)
      expect(ui.settings['name']).to eq('good integration')
      expect(ui.settings['custom_integration']).to eq(true)
      expect(ui.settings['token']).to_not eq(nil)
    end
    
    it "should error when failing to match to a template integration" do
      u = User.create
      ui = UserIntegration.process_new({'integration_key' => 'asdf'}, {'user' => u})
      expect(ui.errored?).to eq(true)
      expect(ui.processing_errors).to eq(['invalid template'])
    end
    
    it "should match to a template integration" do
      u = User.create
      template = UserIntegration.create(template: true, integration_key: 'grandness')
      ui = UserIntegration.process_new({'integration_key' => 'grandness'}, {'user' => u})
      expect(ui.errored?).to eq(false)
      expect(ui.template_integration).to eq(template)
      expect(ui.settings['template_key']).to eq('grandness')
    end
    
    it "should process template parameters" do
      u = User.create
      template = UserIntegration.create(template: true, integration_key: 'panda', settings: {
        'user_parameters' => [
          {
            'name' => 'a',
            'label' => 'A'
          },
          {
            'name' => 'b',
            'type' => 'password'
          }
        ]
      })
      ui = UserIntegration.process_new({
        'integration_key' => 'panda',
        'user_parameters' => [
          {'name' => 'a', 'value' => 'aaa'},
          {'name' => 'b', 'value' => 'bbb'}
        ]
      }, {'user' => u})
      expect(ui.errored?).to eq(false)
      expect(ui.template_integration).to eq(template)
      expect(ui.settings['user_settings']).to_not eq(nil)
      expect(ui.settings['user_settings']['a']).to eq({'label' => 'A', 'value' => 'aaa', 'type' => nil})
      expect(ui.settings['user_settings']['b']['value']).to eq(nil)
      expect(ui.settings['user_settings']['b']['value_crypt']).to_not eq(nil)
      expect(ui.settings['user_settings']['b']['salt']).to_not eq(nil)
    end

    it "should properly hash passwords" do
      u = User.create
      template = UserIntegration.create(template: true, integration_key: 'panda', settings: {
        'user_parameters' => [
          {
            'name' => 'a',
            'label' => 'A'
          },
          {
            'name' => 'b',
            'type' => 'password',
            'hash' => 'md5'
          },
          {
            'name' => 'c',
            'type' => 'password',
            'hash' => 'md5',
            'downcase' => true
          }
        ]
      })
      ui = UserIntegration.process_new({
        'integration_key' => 'panda',
        'user_parameters' => [
          {'name' => 'a', 'value' => 'aaa'},
          {'name' => 'b', 'value' => 'bbb'},
          {'name' => 'c', 'value' => 'cCc'}
        ]
      }, {'user' => u})
      expect(ui.errored?).to eq(false)
      expect(ui.template_integration).to eq(template)
      expect(ui.settings['user_settings']).to_not eq(nil)
      expect(ui.settings['user_settings']['a']).to eq({'label' => 'A', 'value' => 'aaa', 'type' => nil})
      expect(ui.settings['user_settings']['b']['value']).to eq(nil)
      expect(ui.settings['user_settings']['b']['value_crypt']).to_not eq(nil)
      expect(ui.settings['user_settings']['b']['salt']).to_not eq(nil)
      expect(GoSecure.decrypt(ui.settings['user_settings']['b']['value_crypt'], ui.settings['user_settings']['b']['salt'], 'integration_password')).to eq(Digest::MD5.hexdigest('bbb'))
      expect(ui.settings['user_settings']['c']['value']).to eq(nil)
      expect(ui.settings['user_settings']['c']['value_crypt']).to_not eq(nil)
      expect(ui.settings['user_settings']['c']['salt']).to_not eq(nil)
      expect(GoSecure.decrypt(ui.settings['user_settings']['c']['value_crypt'], ui.settings['user_settings']['c']['salt'], 'integration_password')).to eq(Digest::MD5.hexdigest('ccc'))
    end    
    
    it "should confirm recognized integrations actually work" do
      u = User.create
      template = UserIntegration.create(template: true, integration_key: 'lessonpix', settings: {
        'user_parameters' => [
          {'name' => 'username'}, {'name' => 'password', 'type' => 'password', 'hash' => 'md5'}
        ]
      })
      expect(Uploader).to receive(:find_images){|a, b, l, c|
        expect(a).to eq('hat')
        expect(b).to eq('lessonpix')
        expect(c).to_not eq(nil)
      }.and_return([])
      ui1 = UserIntegration.process_new({
        'integration_key' => 'lessonpix',
        'user_parameters' => [
          {'name' => 'username', 'value' => 'topside'},
          {'name' => 'password', 'value' => 'sidetop'}
        ]
      }, {'user' => u})
      expect(ui1.errored?).to eq(false)
      expect(ui1.unique_key).to_not eq(nil)
    end

    it "should error on failed confirmation" do
      u = User.create
      template = UserIntegration.create(template: true, integration_key: 'lessonpix', settings: {
        'user_parameters' => [
          {'name' => 'username'}, {'name' => 'password', 'type' => 'password', 'hash' => 'md5'}
        ]
      })
      expect(Uploader).to receive(:find_images){|a, b, l, c|
        expect(a).to eq('hat')
        expect(b).to eq('lessonpix')
        expect(c).to_not eq(nil)
      }.and_return(false)
      ui1 = UserIntegration.process_new({
        'integration_key' => 'lessonpix',
        'user_parameters' => [
          {'name' => 'username', 'value' => 'topside'},
          {'name' => 'password', 'value' => 'sidetop'}
        ]
      }, {'user' => u})
      expect(ui1.errored?).to eq(true)
      expect(ui1.processing_errors).to eq(['invalid user credentials'])
    end
    
    it "should error when trying to reuse an already-set template integration configuration" do
      u = User.create
      template = UserIntegration.create(template: true, integration_key: 'lessonpix', settings: {
        'user_parameters' => [
          {'name' => 'username'}, {'name' => 'password', 'type' => 'password', 'hash' => 'md5'}
        ]
      })
      expect(Uploader).to receive(:find_images){|a, b, l, c|
        expect(a).to eq('hat')
        expect(b).to eq('lessonpix')
        expect(l).to eq('en')
        expect(c).to_not eq(nil)
      }.and_return([])
      ui1 = UserIntegration.process_new({
        'integration_key' => 'lessonpix',
        'user_parameters' => [
          {'name' => 'username', 'value' => 'topside'},
          {'name' => 'password', 'value' => 'sidetop'}
        ]
      }, {'user' => u})
      expect(ui1.errored?).to eq(false)
      expect(ui1.unique_key).to_not eq(nil)
      ui2 = UserIntegration.process_new({
        'integration_key' => 'lessonpix',
        'user_parameters' => [
          {'name' => 'username', 'value' => 'topside'},
          {'name' => 'password', 'value' => 'sidetop'}
        ]
      }, {'user' => u})
      expect(ui2.errored?).to eq(true)
      expect(ui2.processing_errors).to eq(['account credentials already in use'])
    end
  end  
  
  describe "destroy_device" do
    it "should disable the device when the integration is destroyed" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      expect(ui.device).to_not eq(nil)
      expect(ui.device['settings']['disabled']).to eq(nil)
      device = ui.device
      ui.destroy
      device.reload
      expect(device.settings['disabled']).to eq(true)
    end
  end 

  describe "placement_code" do
    it "should generate correct values" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      expect { ui.placement_code() }.to raise_error("needs at least one arg")
      expect { ui.placement_code("asdf", 5) }.to raise_error("strings only")
      expect(ui.settings['static_token']).to_not eq(nil)
      expect(ui.placement_code("asdf")).to eq(GoSecure.sha512("asdf,#{ui.settings['static_token']}", 'user integration placement code'))
      expect(ui.placement_code("asdf", 'jkl')).to eq(GoSecure.sha512("asdf,jkl,#{ui.settings['static_token']}", 'user integration placement code'))
      expect(ui.placement_code("asdf", 'bob', 'fred', 'ok')).to eq(GoSecure.sha512("asdf,bob,fred,ok,#{ui.settings['static_token']}", 'user integration placement code'))
    end
  end
  
  describe "delete_webhooks" do
    it "should delete related webhooks on destroy" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      wh1 = Webhook.create(:user_integration => ui, :user => u)
      wh2 = Webhook.create(:user_integration => ui, :user => u)
      wh3 = Webhook.create(:user => u)
      expect(wh1.user_integration_id).to eq(ui.id)
      ui.destroy
      expect(Webhook.find_by(:id => wh1.id)).to eq(nil)
      expect(Webhook.find_by(:id => wh2.id)).to eq(nil)
      expect(Webhook.find_by(:id => wh3.id)).to eq(wh3)
    end
  end
  
  describe "global_integrations" do
    it "should return a list of found integrations" do
      allow(RedisInit.permissions).to receive(:get).and_return(nil)
      expect(RedisInit.permissions).to receive(:get).with('global_integrations').at_least(:twice)
      allow(RedisInit.permissions).to receive(:setex)
      expect(UserIntegration.global_integrations).to eq({})
      u = User.create
      ui1 = UserIntegration.create(:integration_key => 'asdf', :settings => {'global' => true}, :user => u)
      ui2 = UserIntegration.create(:integration_key => 'qwer', :user => u)
      ui3 = UserIntegration.create(:settings => {'global' => true}, :user => u)
      expect(UserIntegration.global_integrations).to eq({'asdf' => ui1.global_id})
    end
    
    it "should return a cached result if found" do
      expect(RedisInit.permissions).to receive(:get).with('global_integrations').and_return({a: 1, b: 2}.to_json)
      expect(RedisInit.permissions).to_not receive(:setex)
      expect(UserIntegration.global_integrations).to eq({'a' => 1, 'b' => 2})
    end
    
    it "should cached the result if computed" do
      allow(RedisInit.permissions).to receive(:get).and_return(nil)
      expect(RedisInit.permissions).to receive(:get).with('global_integrations').at_least(:twice)
      allow(RedisInit.permissions).to receive(:setex)
      expect(RedisInit.permissions).to receive(:setex).with('global_integrations', 30.minutes.to_i, '{}')
      expect(UserIntegration.global_integrations).to eq({})
      u = User.create
      ui1 = UserIntegration.create(:integration_key => 'asdf', :settings => {'global' => true}, :user => u)
      ui2 = UserIntegration.create(:integration_key => 'qwer', :user => u)
      ui3 = UserIntegration.create(:settings => {'global' => true}, :user => u)
      expect(RedisInit.permissions).to receive(:setex).with('global_integrations', 30.minutes.to_i, {'asdf' => ui1.global_id}.to_json)
      expect(UserIntegration.global_integrations).to eq({'asdf' => ui1.global_id})
    end
  end
  
  describe "user_token" do
    it "should generate a token" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      token = ui.user_token(u)
      expect(token).to_not eq(nil)
      expect(token.length).to be > 50
    end
    
    it "should generate the same token on repeat requests" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      token = ui.user_token(u)
      expect(token).to_not eq(nil)
      expect(token).to eq(ui.user_token(u))
      expect(token).to eq(ui.user_token(u))
      expect(token).to eq(ui.user_token(u))
      expect(token).to eq(ui.user_token(u))
    end
    
    it "should return nil for no user" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      expect(ui.user_token(nil)).to eq(nil)
    end
    
    it "should include a decipherable user_id" do
      10.times do 
        u = User.create
        ui = UserIntegration.create(:user => u)
        token = ui.user_token(u)
        expect(token).to_not eq(nil)
        user_id = token.split(/:/)[0]
        expect(UserIntegration.deobfuscate_user_id(user_id, ui.settings['obfuscation_offset'])).to eq(u.global_id)
      end
    end
    
    it "should generate unique values for obfuscation_offset" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      200.times do |i|
        last = ui.settings['obfuscation_offset'].to_a.map(&:last).uniq
        ui.settings['obfuscation_offset'] = nil
        ui.generate_defaults
        current = ui.settings['obfuscation_offset'].to_a.map(&:last).uniq
        expect(current.length).to eq(10)
        expect(current).to_not eq(last)
      end
    end
  end

  describe "user_from_token" do
    it "should return nil without a token" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      expect(ui.user_from_token(nil)).to eq(nil)
    end

    it "should return nil with a mismatched integration id" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      expect(ui.user_from_token("asdf")).to eq(nil)
      expect(ui.user_from_token("asdf:asdf")).to eq(nil)
      expect(ui.user_from_token("asdf:asdf:asdf")).to eq(nil)
    end

    it "should return nil with an invalid signature" do
    end

    it "should find the correct user based on the token" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      u = User.create
      token = ui.user_token(u)
      expect(ui.user_from_token(token)).to eq(u)

      u2 = User.create
      token = ui.user_token(u2)
      expect(token).to_not match(u2.global_id)
      expect(token).to match(ui.global_id)
      expect(ui.user_from_token(token)).to eq(u2)
    end
  end

  describe "track_focus" do
    it "should do nothing without integration defined" do
      expect(Typhoeus).to_not receive(:post)
      expect(UserIntegration.track_focus('a', 'b')).to eq(false)
    end

    it "should POST update if configured" do
      u = User.create
      dk = DeveloperKey.create
      ui = UserIntegration.create(integration_key: 'communication_workshop', user: u)
      ui.device.developer_key = dk
      ui.device.save
      ui.reload
      ui.device.reload
      expect(ui.device.developer_key_id).to_not eq(nil)
      expect(Typhoeus).to receive(:post).with("https://workshop.openaac.org/api/v1/external/focus", body: {
          integration_id: dk.key,
          integration_secret: dk.secret,
          user_id: nil,
          focus_id: 'focus_id'
      }, timeout: 10).and_return(OpenStruct.new(body: {}.to_json))
      expect(UserIntegration.track_focus(nil, 'focus_id')).to eq(false)
    end

    it "should send anonymized user id if available" do
      u = User.create
      dk = DeveloperKey.create
      ui = UserIntegration.create(integration_key: 'communication_workshop', user: u)
      ui.device.developer_key = dk
      ui.device.save
      ui.reload
      ui.device.reload
      expect(ui.device.developer_key_id).to_not eq(nil)
      expect(Typhoeus).to receive(:post).with("https://workshop.openaac.org/api/v1/external/focus", body: {
          integration_id: dk.key,
          integration_secret: dk.secret,
          user_id: u.anonymized_identifier("external_for_#{dk.id}"),
          focus_id: 'focus_id'
      }, timeout: 10).and_return(OpenStruct.new(body: {accepted: true}.to_json))
      expect(UserIntegration.track_focus(u.global_id, 'focus_id')).to eq(true)
    end
  end
end

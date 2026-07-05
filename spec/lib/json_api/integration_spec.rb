require 'spec_helper'

describe JsonApi::Integration do
  it "should have defined pagination defaults" do
    expect(JsonApi::Integration::TYPE_KEY).to eq('integration')
    expect(JsonApi::Integration::DEFAULT_PAGE).to eq(10)
    expect(JsonApi::Integration::MAX_PAGE).to eq(25)
  end

  describe "build_json" do
    it "should not include unlisted settings" do
      i = UserIntegration.create
      i.settings['hat'] = 'white'
      expect(JsonApi::Integration.build_json(i).keys).to_not be_include('hat')
    end
    
    it "should return appropriate attributes" do
      i = UserIntegration.create
      i.settings['name'] = 'some thing'
      expect(JsonApi::Integration.build_json(i)['id']).to eq(i.global_id)
      expect(JsonApi::Integration.build_json(i)['name']).to eq('some thing')
    end
    
    it "should include integration information only for custom integrations" do
      u = User.create
      i = UserIntegration.create(:user => u)
      d = i.device
      expect(d).to_not eq(nil)
      expect(d.user).to eq(u)
      i.settings['custom_integration'] = true
      hash = JsonApi::Integration.build_json(i, permissions: u)
      expect(hash['access_token']).to_not eq(nil)
      expect(hash['access_token']).to eq(d.tokens[0])
      expect(hash['token']).to_not eq(nil)
      expect(hash['token']).to eq(i.settings['token'])
    end
    
    it "should include truncated keys after 24 hours" do
      u = User.create
      i = UserIntegration.create(:user => u)
      i.created_at = 6.days.ago
      i.settings['custom_integration'] = true
      hash = JsonApi::Integration.build_json(i, permissions: u)
      expect(hash['access_token']).to eq(nil)
      expect(hash['token']).to eq(nil)
      expect(hash['truncated_access_token']).to_not eq(nil)
      expect(hash['truncated_token']).to_not eq(nil)
    end
    
    it "should not include keys without edit permissions" do
      u = User.create
      u2 = User.create
      i = UserIntegration.create(:user => u2)
      i.created_at = 6.days.ago
      i.settings['custom_integration'] = true
      hash = JsonApi::Integration.build_json(i, permissions: u)
      expect(hash['access_token']).to eq(nil)
      expect(hash['token']).to eq(nil)
      expect(hash['truncated_access_token']).to eq(nil)
      expect(hash['truncated_token']).to eq(nil)
    end
        
    it "should include user settings" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['user_settings'] = {
        'a' => {
          'label' => 'A',
          'value' => 'asdf'
        },
        'b' => {
          'label' => 'B',
          'value' => 'asdf',
          'type' => 'password'
        }
      }
      hash = JsonApi::Integration.build_json(ui, permissions: u)
      expect(hash['user_settings']).to_not eq(nil)
      expect(hash['user_settings'][0]['name']).to eq('a')
      expect(hash['user_settings'][0]['label']).to eq('A')
      expect(hash['user_settings'][0]['value']).to eq('asdf')
      expect(hash['user_settings'][1]['name']).to eq('b')
      expect(hash['user_settings'][1]['label']).to eq('B')
      expect(hash['user_settings'][1]['value']).to eq(nil)
      expect(hash['user_settings'][1]['protected']).to eq(true)
    end
    
    it "should round-trip board_render_url" do
      i = UserIntegration.create
      i.settings['board_render_url'] = 'https://example.com/render'
      hash = JsonApi::Integration.build_json(i)
      expect(hash['render']).to eq(true)
      expect(hash['board_render_url']).to eq('https://example.com/render')
    end

    it "should not include board_render_url when not set" do
      i = UserIntegration.create
      hash = JsonApi::Integration.build_json(i)
      expect(hash['render']).to eq(false)
      expect(hash['board_render_url']).to eq(nil)
    end

    it "should round-trip board_render_url regardless of permission, since extra_includes already exposes the same value as render_url to any viewer" do
      u = User.create
      viewer = User.create
      i = UserIntegration.create(user: u, settings: {'global' => true})
      i.settings['board_render_url'] = 'https://example.com/render'
      hash = JsonApi::Integration.build_json(i, permissions: viewer)
      expect(hash['render']).to eq(true)
      expect(hash['board_render_url']).to eq('https://example.com/render')
    end

    it "should serialize button_webhook_url for remote webhooks to a user with edit permission" do
      u = User.create
      i = UserIntegration.create(user: u)
      i.settings['button_webhook_url'] = 'http://example.com/hook'
      hash = JsonApi::Integration.build_json(i, permissions: u)
      expect(hash['webhook']).to eq(true)
      expect(hash['button_webhook_url']).to eq('http://example.com/hook')
      expect(hash['button_webhook_local']).to eq(nil)
    end

    it "should not leak a remote button_webhook_url (which may embed a secret key) without edit permission" do
      u = User.create
      viewer = User.create
      i = UserIntegration.create(user: u, settings: {'global' => true})
      i.settings['button_webhook_url'] = 'https://maker.ifttt.com/trigger/code/with/key/super-secret'
      hash = JsonApi::Integration.build_json(i, permissions: viewer)
      expect(hash['webhook']).to eq(true)
      expect(hash['button_webhook_url']).to eq(nil)
    end

    it "should include button_webhook_local and button_webhook_url when set for local webhooks, regardless of permission" do
      i = UserIntegration.create
      i.settings['button_webhook_url'] = 'http://localhost:1234/hook'
      i.settings['button_webhook_local'] = true
      hash = JsonApi::Integration.build_json(i)
      expect(hash['webhook']).to eq(true)
      expect(hash['button_webhook_url']).to eq('http://localhost:1234/hook')
      expect(hash['button_webhook_local']).to eq(true)
    end

    it "should not include a debug asdf key" do
      u = User.create
      i = UserIntegration.create(user: u)
      i.settings['custom_integration'] = true
      hash = JsonApi::Integration.build_json(i, permissions: u)
      expect(hash.keys).to_not be_include('asdf')
    end

    it "should include user parameters for templates" do
      u = User.create
      ui = UserIntegration.create(user: u, template: true, integration_key: 'keyed')
      ui.settings['user_parameters'] = [
        {
          'name' => 'a',
          'default_value' => 'aaa',
          'label' => 'A'
        },
        {
          'name' => 'b',
          'default_value' => 'bbb',
          'type' => 'password',
          'label' => 'B',
          'something' => 'nunya'
        }
      ]
      ui.template = true
      hash = JsonApi::Integration.build_json(ui, permissions: u)
      expect(hash['template']).to eq(true)
      expect(hash['user_parameters']).to eq([
        {
          'name' => 'a',
          'default_value' => 'aaa',
          'label' => 'A',
          'type' => 'text'
        },
        {
          'name' => 'b',
          'default_value' => 'bbb',
          'type' => 'password',
          'label' => 'B'
        }
      ])
    end
  end
end

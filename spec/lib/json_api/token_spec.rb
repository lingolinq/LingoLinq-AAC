require 'spec_helper'

describe JsonApi::Token do
  describe "as_json" do
    it "should return correct attributes" do
      u_for_device = User.create
      d = Device.create(:user => u_for_device)
      d.generate_token!
      u = User.new(user_name: 'fred')
      hash = JsonApi::Token.as_json(u, d)
      expect(hash.keys.sort).to eq(['access_token', 'anonymized_user_id', 'long_token', 'long_token_set', 'modeling_session', 'scopes', 'token_type', 'user_id', 'user_name'])
      expect(hash['access_token']).to eq(d.tokens[0])
      expect(hash['token_type']).to eq('bearer')
      expect(hash['user_name']).to eq('fred')
    end
    
    it "should include scopes data" do
      u_for_device = User.create
      d = Device.create(:user => u_for_device)
      d.developer_key_id = 1
      d.settings['permission_scopes'] = ['a', 'b']
      d.generate_token!
      u = User.new(user_name: 'fred')
      hash = JsonApi::Token.as_json(u, d)
      expect(hash.keys.sort).to eq(['access_token', 'anonymized_user_id', 'long_token', 'long_token_set', 'modeling_session', 'scopes', 'token_type', 'user_id', 'user_name'])
      expect(hash['access_token']).to eq(d.tokens[0])
      expect(hash['scopes']).to eq(['a', 'b'])
    end

    it "should return an anonymized keyed id that is unique to the developer key tied to the device" do
      u_for_device = User.create
      d = Device.create(:user => u_for_device)
      d.developer_key_id = 14
      u = User.new(user_name: 'fred')
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['anonymized_user_id']).to eq(u.anonymized_identifier('external_for_14'))
    end

    it "should include long_token information" do
      u_for_device = User.create
      d = Device.create(:user => u_for_device)
      u = User.new(user_name: 'fred')
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['long_token']).to eq(nil)
      expect(hash['long_token_set']).to eq(false)

      d.settings['long_token'] = false
      d.settings['long_token_set'] = true
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['long_token']).to eq(false)
      expect(hash['long_token_set']).to eq(true)
      
      d.created_at = Date.parse('Jan 1, 2000')
      d.settings['long_token_set'] = nil
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['long_token']).to eq(false)
      expect(hash['long_token_set']).to eq(true)
    end
  end

  describe "2fa" do
    it "should specify if missing_2fa" do
      u = User.create
      u.assert_2fa!
      d = Device.create(user: u)
      d.generate_token!
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['missing_2fa']).to eq(true)
      u.settings.delete('2fa')
      u.save
      d.user.reload
      d.generate_token!
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['missing_2fa']).to eq(nil)
      expect(hash['set_2fa']).to eq(nil)
    end

    it "should send the 2fa uri if not verified" do
      u = User.create
      u.assert_2fa!
      d = Device.create(user: u)
      d.generate_token!
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['missing_2fa']).to eq(true)
      expect(hash['set_2fa']).to_not eq(nil)
    end

    it "should send the cooldown timestamp if set" do
      u = User.create
      u.assert_2fa!
      d = Device.create(user: u)
      d.generate_token!
      d.settings['2fa']['cooldown'] = 12345
      d.save
      hash = JsonApi::Token.as_json(u, d)
      expect(hash['missing_2fa']).to eq(true)
      expect(hash['cooldown_2fa']).to eq(12345)
    end
  end
end

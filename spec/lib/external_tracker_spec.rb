require 'spec_helper'

describe ExternalTracker do
  describe "track_new_user" do
    it "should do nothing if not allowed" do
      ExternalTracker.track_new_user(nil)
      expect(Worker.scheduled_actions).to eq([])
      
      u = User.create
      u.settings['authored_organization_id'] = 'asdf'
      u.save
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled_actions).to eq([])
    end
    
    it "should schedule a persistence if allowed (supporter only)" do
      u = User.create
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.save
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled?(ExternalTracker, :persist_new_user, u.global_id)).to eq(true)
    end

    it "should not schedule for communicator accounts" do
      u = User.create
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'communicator'
      u.save
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled_actions).to eq([])
    end

    it "should not schedule when user opted out of cookies (GDPR consent)" do
      u = User.create
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.settings['preferences']['cookies'] = false
      u.save
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled_actions).to eq([])
    end

    it "should not schedule when cookies preference is legacy string false" do
      u = User.create
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.settings['preferences']['cookies'] = 'false'
      u.save
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled_actions).to eq([])
    end
  end
  
  describe "persist_new_user" do
    it "should return false if not allowed" do
      u = User.create
      u.settings['authored_organization_id'] = 'asdf'
      u.save
      expect(ExternalTracker.persist_new_user(u.global_id)).to eq(false)

      u2 = User.create
      u2.settings['preferences'] ||= {}
      u2.settings['preferences']['registration_type'] = 'communicator'
      u2.settings['email'] = 'comm@example.com'
      u2.save
      expect(ExternalTracker.persist_new_user(u2.global_id)).to eq(false)
    end

    it "should not call HubSpot when user opted out of cookies (GDPR)" do
      original_token = ENV['HUBSPOT_ACCESS_TOKEN']
      begin
        ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
        u = User.create
        u.settings['preferences'] ||= {}
        u.settings['preferences']['registration_type'] = 'therapist'
        u.settings['preferences']['cookies'] = false
        u.settings['email'] = 'therapist@example.com'
        u.save
        expect(Typhoeus).not_to receive(:post)
        expect(ExternalTracker.persist_new_user(u.global_id)).to eq(false)
      ensure
        ENV['HUBSPOT_ACCESS_TOKEN'] = original_token
      end
    end

    it "should not call HubSpot when cookies preference is legacy string false" do
      original_token = ENV['HUBSPOT_ACCESS_TOKEN']
      begin
        ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
        u = User.create
        u.settings['preferences'] ||= {}
        u.settings['preferences']['registration_type'] = 'therapist'
        u.settings['preferences']['cookies'] = 'false'
        u.settings['email'] = 'therapist2@example.com'
        u.save
        expect(Typhoeus).not_to receive(:post)
        expect(ExternalTracker.persist_new_user(u.global_id)).to eq(false)
      ensure
        ENV['HUBSPOT_ACCESS_TOKEN'] = original_token
      end
    end

    it "should return non-false on success" do
      u = User.create
      u.settings['email'] = 'testing@example.com'
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
#       geo = {
#         'country_code' => 'US',
#         'city' => 'Sandy',
#         'region_name' => 'Utah'
#       }
#      expect(Typhoeus).to receive(:get).with('asdf').and_return(OpenStruct.new(body: geo.to_json))
      expect(Typhoeus).to receive(:post).with("https://api.hubapi.com/contacts/v1/contact/", {
        body: {properties: [
          {property: 'email', value: 'testing@example.com' },
          {property: 'firstname', value: 'No'},
          {property: 'lastname', value: 'name'},
          {property: 'city', value: nil},
          {property: 'username', value: u.user_name},
          {property: 'state', value: nil},
          {property: 'country', value: nil},
          {property: 'account_type', value: 'Therapist'},
          {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'}
        ]}.to_json,
        headers: {'Content-Type' => 'application/json', "Authorization"=>"Bearer hubby"}
      }).and_return(OpenStruct.new(code: '201'))
      res = ExternalTracker.persist_new_user(u.global_id)
      expect(res).to eq('201')
    end
    
    it "should check for geo location based on ip address" do
      ENV['IPLOCATE_API_KEY'] = 'testkey'
      u = User.create
      u.settings['email'] = 'testing@example.com'
      u.settings['preferences']['registration_type'] = 'eval'
      u.save
      expect(u.devices.count).to eq(0)
      d = Device.create(:user => u)
      d.settings['ip_address'] = '1.2.3.4'
      d.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      geo = {
        'country_code' => 'US',
        'city' => 'Sandy',
        'subdivision' => 'Utah',
        'country' => 'United States'
      }
      expect(Typhoeus).to receive(:get).with("https://iplocate.io/api/lookup/1.2.3.4?apikey=#{ENV['IPLOCATE_API_KEY']}", {timeout: 5}).and_return(OpenStruct.new(body: geo.to_json))
      expect(Typhoeus).to receive(:post).with("https://api.hubapi.com/contacts/v1/contact/", {
        body: {properties: [
          {property: 'email', value: 'testing@example.com' },
          {property: 'firstname', value: 'No'},
          {property: 'lastname', value: 'name'},
          {property: 'city', value: 'Sandy'},
          {property: 'username', value: u.user_name},
          {property: 'state', value: 'Utah'},
          {property: 'country', value: 'United States'},
          {property: 'account_type', value: 'AT Specialist/Lending Library'},
          {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'}
        ]}.to_json,
        headers: {'Content-Type' => 'application/json', "Authorization"=>"Bearer hubby"}
      }).and_return(OpenStruct.new(code: '201'))
      res = ExternalTracker.persist_new_user(u.global_id)
      expect(res).to eq('201')
    end

    it "should push to external systems" do
      ENV['IPLOCATE_API_KEY'] = 'testkey'
      u = User.create
      u.settings['email'] = 'testing@example.com'
      u.settings['preferences']['registration_type'] = 'therapist'
      u.save
      expect(u.devices.count).to eq(0)
      d = Device.create(:user => u)
      d.settings['ip_address'] = '1.2.3.4'
      d.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      geo = {
        'country_code' => 'US',
        'city' => 'Sandy',
        'subdivision' => 'Utah',
        'country' => 'United States'
      }
      expect(Typhoeus).to receive(:get).with("https://iplocate.io/api/lookup/1.2.3.4?apikey=#{ENV['IPLOCATE_API_KEY']}", {timeout: 5}).and_return(OpenStruct.new(body: geo.to_json))
      expect(Typhoeus).to receive(:post).with("https://api.hubapi.com/contacts/v1/contact/", {
        body: {properties: [
          {property: 'email', value: 'testing@example.com' },
          {property: 'firstname', value: 'No'},
          {property: 'lastname', value: 'name'},
          {property: 'city', value: 'Sandy'},
          {property: 'username', value: u.user_name},
          {property: 'state', value: 'Utah'},
          {property: 'country', value: 'United States'},
          {property: 'account_type', value: 'Therapist'},
          {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'}
        ]}.to_json,
        headers: {'Content-Type' => 'application/json', "Authorization"=>"Bearer hubby"}
      }).and_return(OpenStruct.new(code: '201'))
      res = ExternalTracker.persist_new_user(u.global_id)
      expect(res).to eq('201')
    end

    it "should populate city/state/country for non-US locations" do
      ENV['IPLOCATE_API_KEY'] = 'testkey'
      u = User.create
      u.settings['email'] = 'testing@example.com'
      u.settings['preferences']['registration_type'] = 'therapist'
      u.save
      d = Device.create(:user => u)
      d.settings['ip_address'] = '1.2.3.4'
      d.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      geo = {
        'country_code' => 'FR',
        'city' => 'Paris',
        'subdivision' => 'Île-de-France',
        'country' => 'France'
      }
      expect(Typhoeus).to receive(:get).with("https://iplocate.io/api/lookup/1.2.3.4?apikey=#{ENV['IPLOCATE_API_KEY']}", {timeout: 5}).and_return(OpenStruct.new(body: geo.to_json))
      expect(Typhoeus).to receive(:post).with("https://api.hubapi.com/contacts/v1/contact/", {
        body: {properties: [
          {property: 'email', value: 'testing@example.com' },
          {property: 'firstname', value: 'No'},
          {property: 'lastname', value: 'name'},
          {property: 'city', value: 'Paris'},
          {property: 'username', value: u.user_name},
          {property: 'state', value: 'Île-de-France'},
          {property: 'country', value: 'France'},
          {property: 'account_type', value: 'Therapist'},
          {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'}
        ]}.to_json,
        headers: {'Content-Type' => 'application/json', "Authorization"=>"Bearer hubby"}
      }).and_return(OpenStruct.new(code: '201'))
      res = ExternalTracker.persist_new_user(u.global_id)
      expect(res).to eq('201')
    end

    it "should send referrer (source, truncated to origin) and ad_referrer (ad key) when present" do
      u = User.create
      u.settings['email'] = 'testing@example.com'
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      # Full referring URL carries a path + query that could include PII; only the
      # origin should leave the platform.
      u.settings['referrer'] = 'https://mail.google.com/mail/u/0?email=foo@bar.com'
      u.settings['ad_referrer'] = 'fb-spring-2026'
      u.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      expect(Typhoeus).to receive(:post).with("https://api.hubapi.com/contacts/v1/contact/", {
        body: {properties: [
          {property: 'email', value: 'testing@example.com' },
          {property: 'firstname', value: 'No'},
          {property: 'lastname', value: 'name'},
          {property: 'city', value: nil},
          {property: 'username', value: u.user_name},
          {property: 'state', value: nil},
          {property: 'country', value: nil},
          {property: 'account_type', value: 'Therapist'},
          {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'},
          {property: 'lingolinq_referrer', value: 'https://mail.google.com'},
          {property: 'lingolinq_ad_referrer', value: 'fb-spring-2026'}
        ]}.to_json,
        headers: {'Content-Type' => 'application/json', "Authorization"=>"Bearer hubby"}
      }).and_return(OpenStruct.new(code: '201'))
      res = ExternalTracker.persist_new_user(u.global_id)
      expect(res).to eq('201')
    end
  end

  describe "referrer_origin" do
    it "should reduce a full URL to scheme+host" do
      expect(ExternalTracker.referrer_origin('https://mail.google.com/mail/u/0?email=foo@bar.com')).to eq('https://mail.google.com')
      expect(ExternalTracker.referrer_origin('http://example.com:8080/path#frag')).to eq('http://example.com')
    end

    it "should strip userinfo credentials from the origin" do
      expect(ExternalTracker.referrer_origin('https://user:secret@host.example.com/x')).to eq('https://host.example.com')
    end

    it "should return nil for blank, hostless, or unparseable values" do
      expect(ExternalTracker.referrer_origin(nil)).to eq(nil)
      expect(ExternalTracker.referrer_origin('')).to eq(nil)
      expect(ExternalTracker.referrer_origin('not a url')).to eq(nil)
      expect(ExternalTracker.referrer_origin('javascript:alert(1)')).to eq(nil)
    end
  end
end

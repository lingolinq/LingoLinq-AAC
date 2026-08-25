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
          {property: 'firstname', value: nil},
          {property: 'lastname', value: nil},
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

    # Every example in this file asserts firstname/lastname as nil, because signup
    # collects no name. That used to be 'No'/'name' -- the placeholder split in
    # two -- which was accidental coverage of the split at external_tracker.rb:65.
    # Removing the placeholder removed the coverage with it, leaving the split
    # exercised only on the empty-string path. This restores it deliberately, on a
    # user who actually has a name. It ships PII to HubSpot, so the shape matters.
    it "should split a real name into firstname and lastname" do
      u = User.create
      u.settings['email'] = 'named@example.com'
      u.settings['name'] = 'Ada Lovelace'
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      posted = nil
      expect(Typhoeus).to receive(:post) { |_url, opts| posted = JSON.parse(opts[:body]); OpenStruct.new(code: '201') }
      ExternalTracker.persist_new_user(u.global_id)
      props = posted['properties'].each_with_object({}) { |p, h| h[p['property']] = p['value'] }
      expect(props['firstname']).to eq('Ada')
      expect(props['lastname']).to eq('Lovelace')
    end

    it "should put a single-word name in firstname and leave lastname nil" do
      u = User.create
      u.settings['email'] = 'mono@example.com'
      u.settings['name'] = 'Prince'
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      posted = nil
      expect(Typhoeus).to receive(:post) { |_url, opts| posted = JSON.parse(opts[:body]); OpenStruct.new(code: '201') }
      ExternalTracker.persist_new_user(u.global_id)
      props = posted['properties'].each_with_object({}) { |p, h| h[p['property']] = p['value'] }
      expect(props['firstname']).to eq('Prince')
      expect(props['lastname']).to eq(nil)
    end

    it "should keep a three-part name intact rather than dropping the middle" do
      u = User.create
      u.settings['email'] = 'triple@example.com'
      u.settings['name'] = 'Ada King Lovelace'
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      posted = nil
      expect(Typhoeus).to receive(:post) { |_url, opts| posted = JSON.parse(opts[:body]); OpenStruct.new(code: '201') }
      ExternalTracker.persist_new_user(u.global_id)
      props = posted['properties'].each_with_object({}) { |p, h| h[p['property']] = p['value'] }
      # split(/\s/, 2) caps at two fields, so everything after the first space
      # lands in lastname -- no part of the name is silently discarded.
      expect(props['firstname']).to eq('Ada')
      expect(props['lastname']).to eq('King Lovelace')
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
          {property: 'firstname', value: nil},
          {property: 'lastname', value: nil},
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
          {property: 'firstname', value: nil},
          {property: 'lastname', value: nil},
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
          {property: 'firstname', value: nil},
          {property: 'lastname', value: nil},
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
          {property: 'firstname', value: nil},
          {property: 'lastname', value: nil},
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

    it "should drop a hostile ad_referrer but still send a valid source" do
      u = User.create
      u.settings['email'] = 'testing@example.com'
      u.settings['preferences'] ||= {}
      u.settings['preferences']['registration_type'] = 'therapist'
      u.settings['referrer'] = 'https://www.bing.com/search?q=aac'
      u.settings['ad_referrer'] = "=cmd|'/c calc'!A1"
      u.save
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      expect(Typhoeus).to receive(:post).with("https://api.hubapi.com/contacts/v1/contact/", {
        body: {properties: [
          {property: 'email', value: 'testing@example.com' },
          {property: 'firstname', value: nil},
          {property: 'lastname', value: nil},
          {property: 'city', value: nil},
          {property: 'username', value: u.user_name},
          {property: 'state', value: nil},
          {property: 'country', value: nil},
          {property: 'account_type', value: 'Therapist'},
          {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'},
          {property: 'lingolinq_referrer', value: 'https://www.bing.com'}
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

    it "should reject non-http(s) schemes and empty hosts" do
      expect(ExternalTracker.referrer_origin('ftp://host.example.com/x')).to eq(nil)
      expect(ExternalTracker.referrer_origin('https:///path')).to eq(nil)
      expect(ExternalTracker.referrer_origin('app://capacitor/index')).to eq(nil)
    end

    it "should not raise on non-string values" do
      expect(ExternalTracker.referrer_origin({'a' => 1})).to eq(nil)
      expect(ExternalTracker.referrer_origin(12345)).to eq(nil)
    end
  end

  describe "ad_key_clean" do
    it "should allow a short campaign-token shape" do
      expect(ExternalTracker.ad_key_clean('fb-spring-2026')).to eq('fb-spring-2026')
      expect(ExternalTracker.ad_key_clean('google_cpc.v2')).to eq('google_cpc.v2')
    end

    it "should drop URLs, PII, and injection payloads" do
      expect(ExternalTracker.ad_key_clean("=cmd|'/c calc'!A1")).to eq(nil)
      expect(ExternalTracker.ad_key_clean('https://x.com/?email=foo@bar.com')).to eq(nil)
      expect(ExternalTracker.ad_key_clean('a,b,c')).to eq(nil)
      expect(ExternalTracker.ad_key_clean('with space')).to eq(nil)
    end

    it "should drop oversized, blank, and non-string values" do
      expect(ExternalTracker.ad_key_clean('a' * 65)).to eq(nil)
      expect(ExternalTracker.ad_key_clean(nil)).to eq(nil)
      expect(ExternalTracker.ad_key_clean('')).to eq(nil)
      expect(ExternalTracker.ad_key_clean({'a' => 1})).to eq(nil)
    end
  end
end

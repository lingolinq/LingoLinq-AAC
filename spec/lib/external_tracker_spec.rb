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
    
    it "should schedule a persistence if allowed" do
      u = User.create
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled?(ExternalTracker, :persist_new_user, u.global_id)).to eq(true)
    end
  end
  
  describe "persist_new_user" do
    it "should return false if not allowed" do
      u = User.create
      u.settings['authored_organization_id'] = 'asdf'
      u.save
      expect(ExternalTracker.persist_new_user(u.global_id)).to eq(false)
    end
    
    it "should return false if not configured" do
      u = User.create
      ENV['HUBSPOT_KEY'] = nil
      expect(ExternalTracker.persist_new_user(u.global_id)).to eq(false)
    end
    
    it "should return false if no email provided" do
      u = User.create
      ENV['HUBSPOT_KEY'] = 'hubby'
      expect(ExternalTracker.persist_new_user(u.global_id)).to eq(false)
    end
    
    it "should return non-false on success" do
      u = User.create
      u.settings['email'] = 'testing@example.com'
      u.save
      ENV['HUBSPOT_TOKEN'] = 'hubby'
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
          {property: 'account_type', value: 'Communicator Account'},
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
      ENV['HUBSPOT_TOKEN'] = 'hubby'
      geo = {
        'country_code' => 'US',
        'city' => 'Sandy',
        'subdivision' => 'Utah'
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
      ENV['HUBSPOT_TOKEN'] = 'hubby'
      geo = {
        'country_code' => 'US',
        'city' => 'Sandy',
        'subdivision' => 'Utah'
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
          {property: 'account_type', value: 'Therapist'},
          {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'}
        ]}.to_json,
        headers: {'Content-Type' => 'application/json', "Authorization"=>"Bearer hubby"}
      }).and_return(OpenStruct.new(code: '201'))
      res = ExternalTracker.persist_new_user(u.global_id)
      expect(res).to eq('201')
    end
  end
end

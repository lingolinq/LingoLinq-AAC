require 'spec_helper'

# #1063: after the final school hand-back the family can sign in. The hand-back must not leave a
# consent state that the token endpoint refuses.
describe SessionController, type: :controller do
  before(:each) { AuditEvent.delete_all }
  after(:each) { AuditEvent.delete_all }

  it 'issues a password token after a school-authorized under-13 is handed back' do
    allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
    JsonApi::Json.load_domain('test.host')
    token = GoSecure.browser_token
    u = User.process_new({
      'user_name' => "handoff_login_#{SecureRandom.hex(3)}",
      'name' => 'Handoff Login Kid',
      'email' => "handoff_login_#{SecureRandom.hex(3)}@example.com",
      'password' => 'seashell',
      'terms_agree' => true
    })
    u.settings['school_authorization'] = {
      'basis' => 'school_official',
      'organization_id' => '1_0',
      'authorized_at' => Time.now.utc.iso8601
    }
    u.save!
    u.begin_family_offboarding_consents!(org: Organization.create, birth_month: Time.now.utc.month, birth_year: Time.now.utc.year - 10)

    post :token, params: {:grant_type => 'password', :client_id => 'browser', :client_secret => token, :username => u.user_name, :password => 'seashell'}

    expect(response.status).to eq(200)
    json = JSON.parse(response.body)
    expect(json['access_token']).to be_present
  end
end

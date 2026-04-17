require 'spec_helper'

describe ParentalConsentsController, :type => :controller do
  describe "GET complete" do
    it "records consent and generates a device token" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'name' => 'minor_pc',
        'email' => 'minor_pc@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'guardian_pc@example.com'
      }, {:pending => true})
      expect(u).to be_persisted
      tok = u.settings['coppa']['parent_consent_token']
      get :complete, params: {user_id: u.global_id, token: tok}
      expect(response).to be_successful
      u.reload
      expect(u.coppa_parental_consent_pending?).to eq(false)
      d = Device.find_by(user_id: u.id, device_key: 'default', developer_key_id: 0)
      expect((d.settings['keys'] || []).length).to be > 0
    end

  end
end

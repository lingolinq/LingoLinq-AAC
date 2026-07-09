require 'spec_helper'

describe ParentalConsentsController, :type => :controller do
  describe "GET complete" do
    # AuditEvent.log_command commits outside the RSpec fixture transaction, so
    # clean up file-locally to avoid leaking committed rows into other specs.
    after(:each) { AuditEvent.delete_all }

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

    it "writes an immutable AuditEvent recording the consent grant" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'name' => 'minor_pc_audit',
        'email' => 'minor_pc_audit@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'guardian_pc_audit@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      get :complete, params: {user_id: u.global_id, token: tok}
      expect(response).to be_successful
      u.reload
      ae = AuditEvent.where(user_key: u.global_id).detect { |e| e.event_type == 'parental_consent_grant' }
      expect(ae).to be_present
      expect(ae.data['method']).to eq('email_token_link')
      expect(ae.data['privacy_policy_version']).to eq(User::PRIVACY_POLICY_VERSION)
      expect(ae.data).to have_key('ip')
      expect(ae.data).to have_key('user_agent')
      expect(ae.record_id).to be_present
      # The event must record the actual persisted grant timestamp, not a re-derived one.
      expect(ae.data['granted_at']).to eq(u.settings['coppa']['parent_consent_granted_at'])
    end

    it "does not record a second consent AuditEvent when consent was already granted" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'name' => 'minor_pc_idem',
        'email' => 'minor_pc_idem@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'guardian_pc_idem@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      get :complete, params: {user_id: u.global_id, token: tok}
      # A second visit to the same link is idempotent and must not double-log.
      expect {
        get :complete, params: {user_id: u.global_id, token: tok}
      }.to_not change { AuditEvent.where(user_key: u.global_id).count }
    end

  end
end

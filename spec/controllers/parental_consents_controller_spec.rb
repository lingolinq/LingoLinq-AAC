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
      expect(u.settings['coppa']['parent_consent_revoke_token']).to be_present
      d = Device.find_by(user_id: u.id, device_key: 'default', developer_key_id: 0)
      expect((d.settings['keys'] || []).length).to be > 0
    end

    it "queues the parent confirmation email on a fresh grant only" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'name' => 'minor_pc_mail',
        'email' => 'minor_pc_mail@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'guardian_pc_mail@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_confirmation, u.global_id)
      expect(UserMailer).to receive(:schedule_delivery).with(:confirm_registration, u.global_id)
      expect(UserMailer).to receive(:schedule_delivery).with(:new_user_registration, u.global_id)
      get :complete, params: {user_id: u.global_id, token: tok}
      expect(response).to be_successful
    end

    it "does not queue the parent confirmation email when consent was already granted" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'name' => 'minor_pc_idem_mail',
        'email' => 'minor_pc_idem_mail@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'guardian_pc_idem_mail@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      get :complete, params: {user_id: u.global_id, token: tok}
      expect(UserMailer).not_to receive(:schedule_delivery)
      get :complete, params: {user_id: u.global_id, token: tok}
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

  describe "GET revoke" do
    after(:each) { AuditEvent.delete_all }

    def create_granted_minor!(suffix)
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'name' => "minor_revoke_#{suffix}",
        'email' => "minor_revoke_#{suffix}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => "guardian_revoke_#{suffix}@example.com"
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      expect(u.grant_parental_consent!(tok)).to eq(true)
      u.reload
    end

    it "revokes consent and queues the parent withdrawal email" do
      u = create_granted_minor!('ok')
      revoke_tok = u.settings['coppa']['parent_consent_revoke_token']
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_revoked, u.global_id)
      get :revoke, params: {user_id: u.global_id, token: revoke_tok}
      expect(response).to be_successful
      u.reload
      expect(u.coppa_parental_consent_revoked?).to eq(true)
      expect(u.coppa_parental_consent_blocks_access?).to eq(true)
      ae = AuditEvent.where(user_key: u.global_id).detect { |e| e.event_type == 'parental_consent_revoke' }
      expect(ae).to be_present
    end

    it "does not record a second revoke AuditEvent when consent was already revoked" do
      u = create_granted_minor!('idem')
      revoke_tok = u.settings['coppa']['parent_consent_revoke_token']
      get :revoke, params: {user_id: u.global_id, token: revoke_tok}
      expect {
        get :revoke, params: {user_id: u.global_id, token: revoke_tok}
      }.to_not change { AuditEvent.where(user_key: u.global_id, event_type: 'parental_consent_revoke').count }
    end
  end
end

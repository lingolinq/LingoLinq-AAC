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

    it "skips signup welcome/device mint for org-offboarding grants" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'user_name' => "off_grant_#{SecureRandom.hex(4)}",
        'email' => "off_grant_#{SecureRandom.hex(4)}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true
      })
      u.settings['school_authorization'] = {
        'basis' => 'school_official',
        'organization_id' => '1_1',
        'authorized_at' => Time.now.utc.iso8601
      }
      u.save!
      o = Organization.create(settings: {'total_licenses' => 1})
      t = Time.now.utc
      u.begin_family_offboarding_consents!(
        org: o,
        parent_email: 'off_grant_parent@example.com',
        birth_month: t.month,
        birth_year: t.year - 10
      )
      u.reload
      tok = u.settings['coppa']['parent_consent_token']
      expect(u.settings['coppa']['offboarding']).to eq(true)
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_confirmation, u.global_id)
      expect(UserMailer).not_to receive(:schedule_delivery)
      expect(ExternalTracker).not_to receive(:track_new_user)
      get :complete, params: {user_id: u.global_id, token: tok}
      expect(response).to be_successful
      expect(assigns(:success)).to eq(true)
      u.reload
      expect(u.coppa_parental_consent_active?).to eq(true)
      d = Device.find_by(user_id: u.id, device_key: 'default', developer_key_id: 0)
      expect(d).to eq(nil).or satisfy { |dev| (dev.settings['keys'] || []).blank? }
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
      expect(UserMailer).not_to receive(:schedule_parent_consent_delivery)
      expect(UserMailer).not_to receive(:schedule_delivery)
      get :complete, params: {user_id: u.global_id, token: tok}
    end

    it "does not reveal grant status when the token is missing or wrong" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'name' => 'minor_pc_probe',
        'email' => 'minor_pc_probe@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'guardian_pc_probe@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      get :complete, params: {user_id: u.global_id, token: tok}
      u.reload
      # Controller specs do not render views by default; assert assigns that drive
      # the invalid vs already-granted branches (no body/PII without a valid token).
      get :complete, params: {user_id: u.global_id}
      expect(response).to be_successful
      expect(assigns(:success)).to eq(false)
      expect(assigns(:already_granted)).to eq(false)
      get :complete, params: {user_id: u.global_id, token: 'wrong-token'}
      expect(assigns(:success)).to eq(false)
      expect(assigns(:already_granted)).to eq(false)
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

    it "does not reveal revoke status when the token is missing or wrong" do
      u = create_granted_minor!('probe')
      revoke_tok = u.settings['coppa']['parent_consent_revoke_token']
      get :revoke, params: {user_id: u.global_id, token: revoke_tok}
      u.reload
      # Controller specs do not render views by default; assert assigns that drive
      # the invalid vs already-revoked branches (no body/PII without a valid token).
      get :revoke, params: {user_id: u.global_id}
      expect(response).to be_successful
      expect(assigns(:success)).to eq(false)
      expect(assigns(:already_revoked)).to eq(false)
      get :revoke, params: {user_id: u.global_id, token: 'wrong-token'}
      expect(assigns(:success)).to eq(false)
      expect(assigns(:already_revoked)).to eq(false)
    end
  end

  describe "decline" do
    render_views
    after(:each) { AuditEvent.delete_all }

    # An org-offboarding account sitting at pending parental consent, which is
    # the state both the confirmation page and the decline act on.
    def offboarding_user
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({
        'user_name' => "decl_#{SecureRandom.hex(4)}",
        'email' => "decl_#{SecureRandom.hex(4)}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true
      })
      u.settings['school_authorization'] = {
        'basis' => 'school_official',
        'organization_id' => '1_1',
        'authorized_at' => Time.now.utc.iso8601
      }
      u.save!
      o = Organization.create(settings: {'total_licenses' => 1})
      t = Time.now.utc
      u.begin_family_offboarding_consents!(
        org: o,
        parent_email: 'decl_ctrl@example.com',
        birth_month: t.month,
        birth_year: t.year - 10
      )
      u.reload
      u
    end

    def signup_user(name)
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      User.process_new({
        'name' => name,
        'email' => "#{name}_#{SecureRandom.hex(4)}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => "#{name}_parent@example.com"
      }, {:pending => true})
    end

    describe "GET decline (must not mutate)" do
      it "renders a confirmation page and declines nothing" do
        u = offboarding_user
        tok = u.settings['coppa']['parent_consent_token']
        expect(Exporter).not_to receive(:export_user)
        get :decline, params: {user_id: u.global_id, token: tok}
        expect(response).to be_successful
        expect(assigns(:state)).to eq(:confirm)
        expect(response.body).to include(I18n.t('parental_consent.decline_confirm_button'))
        u.reload
        expect(u.settings['coppa']['parent_consent_declined_at']).to be_blank
        expect(u.settings['coppa']['pending_parent_consent']).to eq(true)
        expect(u.schedule_deletion_at).to be_blank
      end

      it "does not schedule deletion for a signup consent either" do
        u = signup_user('signup_get_inert')
        tok = u.settings['coppa']['parent_consent_token']
        get :decline, params: {user_id: u.global_id, token: tok}
        expect(assigns(:state)).to eq(:confirm)
        u.reload
        expect(u.settings['coppa']['parent_consent_declined_at']).to be_blank
        expect(u.schedule_deletion_at).to be_blank
      end

      it "writes no AuditEvent" do
        u = offboarding_user
        tok = u.settings['coppa']['parent_consent_token']
        before_count = AuditEvent.where(event_type: 'parental_consent_decline').count
        get :decline, params: {user_id: u.global_id, token: tok}
        expect(AuditEvent.where(event_type: 'parental_consent_decline').count).to eq(before_count)
      end

      it "refuses to offer the confirm form once consent was already GRANTED" do
        u = signup_user('signup_granted')
        tok = u.settings['coppa']['parent_consent_token']
        c = u.settings['coppa']
        c['parent_consent_granted_at'] = Time.now.utc.iso8601
        u.settings['coppa'] = c
        u.save!
        get :decline, params: {user_id: u.global_id, token: tok}
        expect(assigns(:state)).to eq(:not_declinable)
        expect(response.body).not_to include(I18n.t('parental_consent.decline_confirm_button'))
      end

      it "refuses to offer the confirm form once the consent window has EXPIRED" do
        u = signup_user('signup_expired')
        tok = u.settings['coppa']['parent_consent_token']
        c = u.settings['coppa']
        c['parent_consent_expires_at'] = 1.day.ago.utc.iso8601
        u.settings['coppa'] = c
        u.save!
        get :decline, params: {user_id: u.global_id, token: tok}
        expect(assigns(:state)).to eq(:not_declinable)
      end

      it "shows the invalid page for a bad token, still without mutating" do
        u = offboarding_user
        get :decline, params: {user_id: u.global_id, token: 'not-the-token'}
        expect(assigns(:state)).to eq(:invalid)
        expect(response.body).to include(I18n.t('parental_consent.decline_invalid_title'))
        u.reload
        expect(u.settings['coppa']['parent_consent_declined_at']).to be_blank
      end
    end

    describe "POST decline (performs the decline)" do
      it "declines pending offboarding consent and schedules export-then-delete" do
        u = offboarding_user
        tok = u.settings['coppa']['parent_consent_token']
        expect(Exporter).to receive(:export_user).with(u.global_id).and_return({path: 'downloads/users/x.zip'})
        expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_offboarding_export, u.global_id)
        post :decline_submit, params: {user_id: u.global_id, token: tok}
        expect(response).to be_successful
        expect(assigns(:success)).to eq(true)
        expect(assigns(:state)).to eq(:declined)
        u.reload
        expect(u.settings['coppa']['parent_consent_declined_at']).to be_present
        expect(u.schedule_deletion_at).to be_present
        expect(assigns(:offboarding)).to eq(true)
      end

      it "declines a signup consent without exporting and without export copy" do
        u = signup_user('signup_decl_kid')
        tok = u.settings['coppa']['parent_consent_token']
        expect(Exporter).not_to receive(:export_user)
        expect(UserMailer).not_to receive(:schedule_parent_consent_delivery).with(:parental_consent_offboarding_export, anything)
        post :decline_submit, params: {user_id: u.global_id, token: tok}
        expect(response).to be_successful
        expect(assigns(:success)).to eq(true)
        expect(assigns(:offboarding)).to eq(false)
        u.reload
        expect(u.settings['coppa']['parent_consent_declined_at']).to be_present
        expect(u.schedule_deletion_at).to be_present
        expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_blank
      end

      it "shows deletion-only thanks copy for a signup decline" do
        u = signup_user('signup_decl_copy')
        tok = u.settings['coppa']['parent_consent_token']
        post :decline_submit, params: {user_id: u.global_id, token: tok}
        expect(response.body).to include(I18n.t('parental_consent.decline_thanks_body'))
        expect(response.body).not_to include('prepare an export')
      end

      it "tells the parent the truth when the export failed" do
        u = offboarding_user
        tok = u.settings['coppa']['parent_consent_token']
        expect(Exporter).to receive(:export_user).and_raise(StandardError.new('S3 throttled'))
        post :decline_submit, params: {user_id: u.global_id, token: tok}
        expect(assigns(:state)).to eq(:declined_export_pending)
        expect(response.body).to include(I18n.t('parental_consent.decline_export_pending_title'))
        # The decline itself still landed; only the export did not.
        u.reload
        expect(u.settings['coppa']['parent_consent_declined_at']).to be_present
        expect(u.schedule_deletion_at).to be_blank
        expect(response.body).not_to include(I18n.t('parental_consent.offboarding_decline_thanks_body'))
      end

      it "is idempotent on a repeat submit" do
        u = signup_user('signup_decl_twice')
        tok = u.settings['coppa']['parent_consent_token']
        post :decline_submit, params: {user_id: u.global_id, token: tok}
        expect(assigns(:state)).to eq(:declined)
        post :decline_submit, params: {user_id: u.global_id, token: tok}
        expect(assigns(:state)).to eq(:already_declined)
        expect(assigns(:success)).to eq(true)
      end

      it "refuses a bad token" do
        u = signup_user('signup_decl_badtok')
        post :decline_submit, params: {user_id: u.global_id, token: 'not-the-token'}
        expect(assigns(:state)).to eq(:invalid)
        expect(assigns(:success)).to eq(false)
        u.reload
        expect(u.settings['coppa']['parent_consent_declined_at']).to be_blank
        expect(u.schedule_deletion_at).to be_blank
      end
    end
  end
end

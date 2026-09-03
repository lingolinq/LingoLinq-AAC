require 'spec_helper'

describe EuAiParentalConsentsController, type: :controller do
  after(:each) { AuditEvent.delete_all }

  def create_pending_eu_user!(suffix)
    u = User.process_new({
      'name' => "eu_pc_#{suffix}",
      'email' => "eu_pc_#{suffix}@example.com",
      'password' => 'abcdefgh',
      'terms_agree' => true,
      'country' => 'FR',
      'under_16' => true
    })
    u.request_eu_ai_parental_consent!("guardian_pc_#{suffix}@example.com", requested_features: {
      'ai_features_enabled' => true,
      'ai_board_generation' => true
    })
    u.reload
  end

  describe 'GET complete' do
    it 'records consent and does not create a device or welcome emails' do
      u = create_pending_eu_user!('ok')
      tok = u.settings['eu_ai_parental_consent']['parent_consent_token']
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:eu_ai_parental_consent_confirmation, u.global_id)
      expect(UserMailer).not_to receive(:schedule_delivery).with(:confirm_registration, anything)
      expect(UserMailer).not_to receive(:schedule_delivery).with(:new_user_registration, anything)
      get :complete, params: { user_id: u.global_id, token: tok }
      expect(response).to be_successful
      u.reload
      expect(u.eu_ai_parental_consent_active?).to eq(true)
      expect(u.settings['preferences']['ai_features_enabled']).to eq(true)
      expect(u.settings['preferences']['ai_board_generation']).to eq(true)
      expect(Device.find_by(user_id: u.id, device_key: 'default', developer_key_id: 0)).to be_nil
      ae = AuditEvent.where(user_key: u.global_id).detect { |e| e.event_type == 'eu_ai_parental_consent_grant' }
      expect(ae).to be_present
    end

    it 'is idempotent when consent was already granted' do
      u = create_pending_eu_user!('idem')
      tok = u.settings['eu_ai_parental_consent']['parent_consent_token']
      get :complete, params: { user_id: u.global_id, token: tok }
      expect(UserMailer).not_to receive(:schedule_parent_consent_delivery)
      expect {
        get :complete, params: { user_id: u.global_id, token: tok }
      }.to_not change { AuditEvent.where(user_key: u.global_id, event_type: 'eu_ai_parental_consent_grant').count }
      expect(assigns(:already_granted)).to eq(true)
      expect(assigns(:success)).to eq(true)
    end

    it 'does not reveal grant status when the token is wrong' do
      u = create_pending_eu_user!('probe')
      get :complete, params: { user_id: u.global_id, token: 'wrong-token' }
      expect(assigns(:success)).to eq(false)
      expect(assigns(:already_granted)).to eq(false)
    end
  end

  describe 'GET revoke' do
    def create_granted_eu_user!(suffix)
      u = create_pending_eu_user!(suffix)
      tok = u.settings['eu_ai_parental_consent']['parent_consent_token']
      expect(u.grant_eu_ai_parental_consent!(tok)).to eq(true)
      u.reload
    end

    it 'revokes consent and queues the withdrawal email' do
      u = create_granted_eu_user!('rev')
      revoke_tok = u.settings['eu_ai_parental_consent']['parent_consent_revoke_token']
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:eu_ai_parental_consent_revoked, u.global_id)
      get :revoke, params: { user_id: u.global_id, token: revoke_tok }
      expect(response).to be_successful
      u.reload
      expect(u.eu_ai_parental_consent_revoked?).to eq(true)
      expect(u.eu_ai_parental_consent_blocks_ai?).to eq(true)
    end

    it 'does not double-log revoke' do
      u = create_granted_eu_user!('rev_idem')
      revoke_tok = u.settings['eu_ai_parental_consent']['parent_consent_revoke_token']
      get :revoke, params: { user_id: u.global_id, token: revoke_tok }
      expect {
        get :revoke, params: { user_id: u.global_id, token: revoke_tok }
      }.to_not change { AuditEvent.where(user_key: u.global_id, event_type: 'eu_ai_parental_consent_revoke').count }
    end
  end
end

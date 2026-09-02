require 'spec_helper'

describe 'User EU AI parental consent', type: :model do
  after(:each) { AuditEvent.delete_all }

  def create_eu_under16_user!(suffix: 'eu16')
    User.process_new({
      'name' => "eu_minor_#{suffix}",
      'email' => "eu_minor_#{suffix}@example.com",
      'password' => 'abcdefgh',
      'terms_agree' => true,
      'country' => 'DE',
      'under_16' => true,
      'preferences' => { 'registration_type' => 'communicator' }
    })
  end

  describe 'registration country and flags' do
    it 'persists trusted country and recomputes eu_under_16 server-side' do
      u = User.process_new({
        'name' => 'eu_reg',
        'email' => 'eu_reg@example.com',
        'password' => 'abcdefgh',
        'terms_agree' => true,
        'country' => 'de',
        'under_16' => true,
        'eu_under_16' => false # client lies — server must ignore
      })
      expect(u).to be_persisted
      expect(u.settings['country']).to eq('DE')
      expect(u.registration_country).to eq('DE')
      expect(u.under_16?).to eq(true)
      expect(u.eu_under_16?).to eq(true)
      expect(u.settings['registration']['eu_under_16']).to eq(true)
      expect(u.settings['registration']['registered_at']).to be_present
    end

    it 'does not set eu_under_16 for non-EU country even when under_16' do
      u = User.process_new({
        'name' => 'us_under16',
        'email' => 'us_under16@example.com',
        'password' => 'abcdefgh',
        'terms_agree' => true,
        'country' => 'US',
        'under_16' => true
      })
      expect(u.under_16?).to eq(true)
      expect(u.eu_under_16?).to eq(false)
      expect(u.settings['preferences']['ai_features_enabled']).not_to eq(false)
    end

    it 'defaults AI prefs to false for new eu_under_16 users' do
      u = create_eu_under16_user!(suffix: 'prefs')
      User::EU_AI_PREF_KEYS.each do |k|
        expect(u.settings['preferences'][k]).to eq(false)
      end
    end

    it 'forces product-improvement prefs false for new eu_under_16 users' do
      u = User.process_new({
        'user_name' => "eu_pi_#{Time.now.to_i}",
        'email' => "eu_pi_#{Time.now.to_i}@example.com",
        'password' => 'abcdefgh',
        'terms_agree' => true,
        'country' => 'DE',
        'under_16' => true,
        'preferences' => {
          'cookies' => true,
          'telemetry_opt_in' => true,
          'comms_log_opt_in' => true
        }
      })
      expect(u.eu_under_16?).to eq(true)
      expect(u.settings['preferences']['cookies']).to eq(false)
      expect(u.settings['preferences']['telemetry_opt_in']).to eq(false)
      expect(u.settings['preferences']['comms_log_opt_in']).to eq(false)
    end

    it 'rejects non-alpha-2 country codes' do
      u = User.process_new({
        'name' => 'bad_country',
        'email' => 'bad_country@example.com',
        'password' => 'abcdefgh',
        'terms_agree' => true,
        'country' => 'Germany',
        'under_16' => true
      })
      expect(u.settings['country']).to be_nil
      expect(u.eu_under_16?).to eq(false)
    end
  end

  describe 'preference write force-false' do
    it 'silently forces AI prefs false when eu_under_16 without active consent' do
      u = create_eu_under16_user!(suffix: 'force')
      u.process({
        'preferences' => {
          'ai_features_enabled' => true,
          'ai_board_generation' => true,
          'ai_word_prediction' => true
        }
      })
      u.reload
      expect(u.settings['preferences']['ai_features_enabled']).to eq(false)
      expect(u.settings['preferences']['ai_board_generation']).to eq(false)
      expect(u.settings['preferences']['ai_word_prediction']).to eq(false)
    end

    it 'allows AI prefs when parental consent is active' do
      u = create_eu_under16_user!(suffix: 'allow')
      expect(u.request_eu_ai_parental_consent!('parent_allow@example.com', requested_features: {
        'ai_features_enabled' => true,
        'ai_board_generation' => true
      })).to eq(true)
      tok = u.settings['eu_ai_parental_consent']['parent_consent_token']
      expect(u.grant_eu_ai_parental_consent!(tok)).to eq(true)
      u.reload
      u.process({
        'preferences' => {
          'ai_features_enabled' => true,
          'ai_board_generation' => true
        }
      })
      u.reload
      expect(u.settings['preferences']['ai_features_enabled']).to eq(true)
      expect(u.settings['preferences']['ai_board_generation']).to eq(true)
    end
  end

  describe 'grant / revoke' do
    def default_requested_features
      {
        'ai_features_enabled' => true,
        'ai_board_generation' => true,
        'ai_word_prediction' => false,
        'ai_board_suggestions' => false,
        'ai_symbol_search' => false
      }
    end

    it 'requests pending consent with tokens, expiry, and requested_features' do
      u = create_eu_under16_user!(suffix: 'req')
      expect(u.request_eu_ai_parental_consent!('guardian_req@example.com', requested_features: default_requested_features)).to eq(true)
      c = u.settings['eu_ai_parental_consent']
      expect(u.eu_ai_parental_consent_pending?).to eq(true)
      expect(u.eu_ai_parental_consent_blocks_ai?).to eq(true)
      expect(c['parent_email']).to eq('guardian_req@example.com')
      expect(c['parent_consent_token']).to be_present
      expect(c['parent_consent_expires_at']).to be_present
      expect(c['requested_features']['ai_features_enabled']).to eq(true)
      expect(c['requested_features']['ai_board_generation']).to eq(true)
      expect(c['requested_features']['ai_word_prediction']).to be_nil
      exp = Time.iso8601(c['parent_consent_expires_at'])
      expect(exp).to be > 13.days.from_now
      expect(exp).to be < 15.days.from_now
    end

    it 'drops unknown requested_features keys and requires at least one feature' do
      u = create_eu_under16_user!(suffix: 'sanitize')
      expect {
        u.request_eu_ai_parental_consent!('parent@example.com', requested_features: { 'not_a_real_pref' => true })
      }.to raise_error(ArgumentError, /requested_features required/)
      expect(u.request_eu_ai_parental_consent!('parent@example.com', requested_features: {
        'ai_word_prediction' => true,
        'bogus' => true
      })).to eq(true)
      feats = u.settings['eu_ai_parental_consent']['requested_features']
      expect(feats.keys.sort).to eq(%w[ai_features_enabled ai_word_prediction])
      expect(feats['bogus']).to be_nil
    end

    it 'grants consent, applies requested AI prefs, writes AuditEvent, and clears pending' do
      u = create_eu_under16_user!(suffix: 'grant')
      u.request_eu_ai_parental_consent!('guardian_grant@example.com', requested_features: default_requested_features)
      tok = u.settings['eu_ai_parental_consent']['parent_consent_token']
      expect(u.grant_eu_ai_parental_consent!(tok, ip: '1.2.3.4', user_agent: 'RSpec')).to eq(true)
      u.reload
      expect(u.eu_ai_parental_consent_active?).to eq(true)
      expect(u.eu_ai_parental_consent_pending?).to eq(false)
      expect(u.eu_ai_parental_consent_blocks_ai?).to eq(false)
      expect(u.settings['eu_ai_parental_consent']['parent_consent_revoke_token']).to be_present
      expect(u.settings['eu_ai_parental_consent']['requested_features']).to be_nil
      expect(u.settings['preferences']['ai_features_enabled']).to eq(true)
      expect(u.settings['preferences']['ai_board_generation']).to eq(true)
      expect(u.settings['preferences']['ai_word_prediction']).to eq(false)
      ae = AuditEvent.where(user_key: u.global_id).detect { |e| e.event_type == 'eu_ai_parental_consent_grant' }
      expect(ae).to be_present
      expect(ae.data['method']).to eq('email_token_link')
      expect(ae.data['ip']).to eq('1.2.3.4')
      expect(ae.data['granted_at']).to eq(u.settings['eu_ai_parental_consent']['parent_consent_granted_at'])
      expect(ae.data['requested_features']['ai_board_generation']).to eq(true)
    end

    it 'revokes consent, forces AI prefs false, and writes AuditEvent' do
      u = create_eu_under16_user!(suffix: 'revoke')
      u.request_eu_ai_parental_consent!('guardian_revoke@example.com', requested_features: default_requested_features)
      tok = u.settings['eu_ai_parental_consent']['parent_consent_token']
      expect(u.grant_eu_ai_parental_consent!(tok)).to eq(true)
      u.reload
      revoke_tok = u.settings['eu_ai_parental_consent']['parent_consent_revoke_token']
      expect(u.revoke_eu_ai_parental_consent!(revoke_tok)).to eq(true)
      u.reload
      expect(u.eu_ai_parental_consent_revoked?).to eq(true)
      expect(u.eu_ai_parental_consent_blocks_ai?).to eq(true)
      expect(u.settings['preferences']['ai_features_enabled']).to eq(false)
      expect(u.settings['preferences']['ai_board_generation']).to eq(false)
      ae = AuditEvent.where(user_key: u.global_id).detect { |e| e.event_type == 'eu_ai_parental_consent_revoke' }
      expect(ae).to be_present
    end

    it 'rejects invalid parent email on request' do
      u = create_eu_under16_user!(suffix: 'bademail')
      expect {
        u.request_eu_ai_parental_consent!('not-an-email', requested_features: default_requested_features)
      }.to raise_error(ArgumentError, /invalid parent consent email/)
    end
  end
end

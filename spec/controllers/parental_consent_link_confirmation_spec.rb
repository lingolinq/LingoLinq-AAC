require 'spec_helper'

# #1338. These four examples are the contract for the confirmation step.
# On develop, before the controllers change, a valid GET writes and the POST
# actions do not exist. A wrong token and an expired grant link must be refused
# on both verbs. Revoke links have no expiry field (User#revoke_parental_consent!
# and User#revoke_eu_ai_parental_consent!), so revoke is checked with a wrong token.

module ParentalConsentGateHelpers
  def pending_coppa_gate!(suffix)
    allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
    User.process_new({
      'name' => "gate_coppa_#{suffix}",
      'email' => "gate_coppa_#{suffix}@example.com",
      'password' => 'abcdefgh',
      'terms_agree' => true,
      'coppa_under_13' => true,
      'parent_consent_email' => "gate_guardian_#{suffix}@example.com"
    }, { pending: true })
  end

  def pending_eu_gate!(suffix)
    u = User.process_new({
      'name' => "gate_eu_#{suffix}",
      'email' => "gate_eu_#{suffix}@example.com",
      'password' => 'abcdefgh',
      'terms_agree' => true,
      'country' => 'FR',
      'under_16' => true
    })
    u.request_eu_ai_parental_consent!("gate_eu_guardian_#{suffix}@example.com", requested_features: {
      'ai_features_enabled' => true
    })
    u.reload
  end

  def expire_grant_gate!(user, bucket)
    user.settings[bucket]['parent_consent_expires_at'] = 2.days.ago.utc.iso8601
    user.save!
    user
  end
end

RSpec.describe ParentalConsentsController, type: :controller do
  include ParentalConsentGateHelpers
  render_views
  after(:each) { AuditEvent.delete_all }

  it 'GET complete with a valid token changes nothing' do
    u = pending_coppa_gate!('get')
    tok = u.settings['coppa']['parent_consent_token']
    get :complete, params: { user_id: u.global_id, token: tok }
    expect(response.headers['Referrer-Policy']).to eq('strict-origin')
    expect(response.body).to include(I18n.t('parental_consent.approve_confirm_button'))
    expect(response.body).to include(I18n.t('parental_consent.approve_confirm_body'))
    expect(response.body).to include('class="box__badge box__badge--neutral"')
    expect(response.body).not_to include('class="box__badge box__badge--err"')
    expect(response.body).not_to include('class="box__badge box__badge--ok"')
    u.reload
    expect(u.coppa_parental_consent_pending?).to eq(true)
    expect(u.coppa_parental_consent_active?).to eq(false)
    expect(u.settings['ai_consent']).to be_blank
    expect(AuditEvent.where(user_key: u.global_id, event_type: 'parental_consent_grant').count).to eq(0)
    expect(AuditEvent.where(user_key: u.global_id, event_type: 'ai_consent_grant').count).to eq(0)
    device = Device.find_by(user_id: u.id, device_key: 'default', developer_key_id: 0)
    expect(device.nil? || (device.settings['keys'] || []).empty?).to eq(true)
  end
end

RSpec.describe EuAiParentalConsentsController, type: :controller do
  include ParentalConsentGateHelpers
  render_views
  after(:each) { AuditEvent.delete_all }

  it 'GET complete with a valid token changes nothing' do
    u = pending_eu_gate!('get')
    tok = u.settings['eu_ai_parental_consent']['parent_consent_token']
    get :complete, params: { user_id: u.global_id, token: tok }
    expect(response.headers['Referrer-Policy']).to eq('strict-origin')
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.approve_confirm_button'))
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.approve_confirm_body'))
    expect(response.body).to include('class="box__badge box__badge--neutral"')
    expect(response.body).not_to include('class="box__badge box__badge--err"')
    u.reload
    expect(u.eu_ai_parental_consent_pending?).to eq(true)
    expect(u.eu_ai_parental_consent_active?).to eq(false)
    expect(u.settings['ai_consent']).to be_blank
    expect(AuditEvent.where(user_key: u.global_id, event_type: 'eu_ai_parental_consent_grant').count).to eq(0)
    expect(AuditEvent.where(user_key: u.global_id, event_type: 'ai_consent_grant').count).to eq(0)
  end
end

# Request specs, not controller specs. Replacing @controller inside a controller
# example leaves ParentalConsentsController.view_paths on rspec-rails' empty
# template resolver, and later render_views examples in this process render blank.
RSpec.describe 'parent approval link routes', type: :request do
  include ParentalConsentGateHelpers
  after(:each) { AuditEvent.delete_all }

  it 'GET revoke on both controllers changes nothing' do
    coppa = pending_coppa_gate!('revoke_get')
    expect(coppa.grant_parental_consent!(coppa.settings['coppa']['parent_consent_token'])).to eq(true)
    coppa.reload
    get '/parental_consent/revoke', params: { user_id: coppa.global_id, token: coppa.settings['coppa']['parent_consent_revoke_token'] }
    expect(response.body).to include(I18n.t('parental_consent.revoke_confirm_button'))
    expect(response.body).to include('class="box__badge box__badge--neutral"')
    expect(response.body).not_to include('class="box__badge box__badge--err"')
    coppa.reload
    expect(coppa.coppa_parental_consent_revoked?).to eq(false)
    expect(coppa.coppa_parental_consent_active?).to eq(true)
    expect(AuditEvent.where(user_key: coppa.global_id, event_type: 'parental_consent_revoke').count).to eq(0)

    eu = pending_eu_gate!('revoke_get')
    expect(eu.grant_eu_ai_parental_consent!(eu.settings['eu_ai_parental_consent']['parent_consent_token'])).to eq(true)
    eu.reload
    get '/eu_ai_parental_consent/revoke', params: { user_id: eu.global_id, token: eu.settings['eu_ai_parental_consent']['parent_consent_revoke_token'] }
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.revoke_confirm_button'))
    expect(response.body).to include('class="box__badge box__badge--neutral"')
    expect(response.body).not_to include('class="box__badge box__badge--err"')
    eu.reload
    expect(eu.eu_ai_parental_consent_revoked?).to eq(false)
    expect(eu.eu_ai_parental_consent_active?).to eq(true)
    expect(AuditEvent.where(user_key: eu.global_id, event_type: 'eu_ai_parental_consent_revoke').count).to eq(0)
  end

  it 'POST approves or withdraws, and a wrong or expired token is refused on GET and POST' do
    coppa = pending_coppa_gate!('post')
    tok = coppa.settings['coppa']['parent_consent_token']
    post '/parental_consent/complete', params: { user_id: coppa.global_id, token: tok }
    coppa.reload
    expect(coppa.coppa_parental_consent_active?).to eq(true)
    expect(coppa.settings['ai_consent']['source']).to eq('email_link')
    expect(coppa.settings['ai_consent']['granted_by']).to eq('parent')
    expect(AuditEvent.where(user_key: coppa.global_id, event_type: 'parental_consent_grant').count).to eq(1)
    device = Device.find_by(user_id: coppa.id, device_key: 'default', developer_key_id: 0)
    expect((device.settings['keys'] || []).length).to be > 0
    expect(response.body).to include(I18n.t('parental_consent.thanks_title'))
    expect(response.body).to include('class="box__badge box__badge--ok"')
    expect(response.body).not_to include('class="box__badge box__badge--neutral"')

    eu = pending_eu_gate!('post')
    eu_tok = eu.settings['eu_ai_parental_consent']['parent_consent_token']
    post '/eu_ai_parental_consent/complete', params: { user_id: eu.global_id, token: eu_tok }
    eu.reload
    expect(eu.eu_ai_parental_consent_active?).to eq(true)
    expect(eu.settings['ai_consent']['disclosures_version']).to eq(LingoLinq::AiConsentDisclosures::CURRENT_VERSION)
    expect(Device.find_by(user_id: eu.id, device_key: 'default', developer_key_id: 0)).to be_nil

    post '/parental_consent/revoke', params: { user_id: coppa.global_id, token: coppa.settings['coppa']['parent_consent_revoke_token'] }
    coppa.reload
    expect(coppa.coppa_parental_consent_revoked?).to eq(true)
    expect(AuditEvent.where(user_key: coppa.global_id, event_type: 'parental_consent_revoke').count).to eq(1)
    expect(coppa.settings['ai_consent']['source']).to eq('email_link')

    post '/eu_ai_parental_consent/revoke', params: { user_id: eu.global_id, token: eu.settings['eu_ai_parental_consent']['parent_consent_revoke_token'] }
    eu.reload
    expect(eu.eu_ai_parental_consent_revoked?).to eq(true)

    wrong = pending_coppa_gate!('wrong')
    get '/parental_consent/complete', params: { user_id: wrong.global_id, token: 'wrong-token' }
    expect(wrong.reload.coppa_parental_consent_pending?).to eq(true)
    expect(response.body).to include(I18n.t('parental_consent.invalid_title'))
    expect(response.body).to include('class="box__badge box__badge--err"')
    post '/parental_consent/complete', params: { user_id: wrong.global_id, token: 'wrong-token' }
    expect(wrong.reload.coppa_parental_consent_pending?).to eq(true)
    expect(wrong.settings['ai_consent']).to be_blank
    expect(response.body).to include(I18n.t('parental_consent.invalid_title'))

    expired = expire_grant_gate!(pending_coppa_gate!('expired'), 'coppa')
    expired_tok = expired.settings['coppa']['parent_consent_token']
    get '/parental_consent/complete', params: { user_id: expired.global_id, token: expired_tok }
    expect(expired.reload.coppa_parental_consent_pending?).to eq(true)
    expect(response.body).to include(I18n.t('parental_consent.invalid_title'))
    post '/parental_consent/complete', params: { user_id: expired.global_id, token: expired_tok }
    expect(expired.reload.coppa_parental_consent_pending?).to eq(true)
    expect(expired.settings['ai_consent']).to be_blank

    eu_wrong = pending_eu_gate!('wrong')
    get '/eu_ai_parental_consent/complete', params: { user_id: eu_wrong.global_id, token: 'wrong-token' }
    expect(eu_wrong.reload.eu_ai_parental_consent_pending?).to eq(true)
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.invalid_title'))
    post '/eu_ai_parental_consent/complete', params: { user_id: eu_wrong.global_id, token: 'wrong-token' }
    expect(eu_wrong.reload.eu_ai_parental_consent_pending?).to eq(true)
    expect(eu_wrong.settings['ai_consent']).to be_blank

    eu_expired = expire_grant_gate!(pending_eu_gate!('expired'), 'eu_ai_parental_consent')
    eu_expired_tok = eu_expired.settings['eu_ai_parental_consent']['parent_consent_token']
    get '/eu_ai_parental_consent/complete', params: { user_id: eu_expired.global_id, token: eu_expired_tok }
    expect(eu_expired.reload.eu_ai_parental_consent_pending?).to eq(true)
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.invalid_title'))
    post '/eu_ai_parental_consent/complete', params: { user_id: eu_expired.global_id, token: eu_expired_tok }
    expect(eu_expired.reload.eu_ai_parental_consent_pending?).to eq(true)
    expect(eu_expired.settings['ai_consent']).to be_blank
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.invalid_title'))

    legacy = pending_coppa_gate!('legacy_notice')
    legacy.settings['coppa'].delete('ai_disclosures_version')
    legacy.save!
    legacy_tok = legacy.settings['coppa']['parent_consent_token']
    get '/parental_consent/complete', params: { user_id: legacy.global_id, token: legacy_tok }
    expect(response.body).to include(I18n.t('parental_consent.approve_confirm_body_account_only'))
    expect(response.body).not_to include(I18n.t('parental_consent.approve_confirm_body'))
    expect(legacy.reload.coppa_parental_consent_pending?).to eq(true)

    older = pending_coppa_gate!('older_notice')
    older.settings['coppa']['ai_disclosures_version'] = LingoLinq::AiConsentDisclosures::CURRENT_VERSION - 1
    older.save!
    older_tok = older.settings['coppa']['parent_consent_token']
    get '/parental_consent/complete', params: { user_id: older.global_id, token: older_tok }
    expect(response.body).to include(I18n.t('parental_consent.approve_confirm_body_account_only'))
    expect(response.body).not_to include(I18n.t('parental_consent.approve_confirm_body'))
    expect(older.reload.coppa_parental_consent_pending?).to eq(true)

    granted = pending_coppa_gate!('revoke_wrong')
    expect(granted.grant_parental_consent!(granted.settings['coppa']['parent_consent_token'])).to eq(true)
    granted.reload
    get '/parental_consent/revoke', params: { user_id: granted.global_id, token: 'wrong-token' }
    expect(granted.reload.coppa_parental_consent_active?).to eq(true)
    expect(response.body).to include(I18n.t('parental_consent.revoke_invalid_title'))
    post '/parental_consent/revoke', params: { user_id: granted.global_id, token: 'wrong-token' }
    expect(granted.reload.coppa_parental_consent_revoked?).to eq(false)
    expect(granted.coppa_parental_consent_active?).to eq(true)

    eu_granted = pending_eu_gate!('revoke_wrong')
    expect(eu_granted.grant_eu_ai_parental_consent!(eu_granted.settings['eu_ai_parental_consent']['parent_consent_token'])).to eq(true)
    eu_granted.reload
    get '/eu_ai_parental_consent/revoke', params: { user_id: eu_granted.global_id, token: 'wrong-token' }
    expect(eu_granted.reload.eu_ai_parental_consent_active?).to eq(true)
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.revoke_invalid_title'))
    post '/eu_ai_parental_consent/revoke', params: { user_id: eu_granted.global_id, token: 'wrong-token' }
    expect(eu_granted.reload.eu_ai_parental_consent_revoked?).to eq(false)
    expect(eu_granted.eu_ai_parental_consent_active?).to eq(true)
    expect(response.body).to include(I18n.t('eu_ai_parental_consent.revoke_invalid_title'))
  end
end

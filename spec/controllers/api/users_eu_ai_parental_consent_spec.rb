require 'spec_helper'

describe Api::UsersController, 'request_eu_ai_parental_consent', type: :controller do
  after(:each) { AuditEvent.delete_all }

  def create_eu_under16!(suffix)
    User.process_new({
      'name' => "api_eu_#{suffix}",
      'email' => "api_eu_#{suffix}@example.com",
      'password' => 'abcdefgh',
      'terms_agree' => true,
      'country' => 'DE',
      'under_16' => true,
      'preferences' => { 'registration_type' => 'communicator' }
    })
  end

  def auth_as!(user)
    device = Device.create(user: user, developer_key_id: 0, device_key: 'eu_ai_test')
    request.headers['Authorization'] = "Bearer #{device.tokens[0]}"
    request.headers['Check-Token'] = 'true'
    device
  end

  it 'stores allowlisted requested_features and queues the parent email' do
    u = create_eu_under16!('ok')
    auth_as!(u)
    expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:eu_ai_parental_consent_request, u.global_id)
    post :request_eu_ai_parental_consent, params: {
      user_id: u.global_id,
      parent_email: 'parent_api@example.com',
      requested_features: {
        'ai_board_generation' => true,
        'ai_word_prediction' => 'true',
        'bogus_key' => true
      }
    }
    expect(response).to be_successful
    json = JSON.parse(response.body)
    expect(json['eu_ai_parental_consent_pending']).to eq(true)
    expect(json['requested_features']['ai_features_enabled']).to eq(true)
    expect(json['requested_features']['ai_board_generation']).to eq(true)
    expect(json['requested_features']['ai_word_prediction']).to eq(true)
    expect(json['requested_features']['bogus_key']).to be_nil
    u.reload
    expect(u.eu_ai_parental_consent_pending?).to eq(true)
    expect(u.settings['eu_ai_parental_consent']['requested_features']['ai_board_generation']).to eq(true)
  end

  it 'rejects when no valid features are requested' do
    u = create_eu_under16!('nofeat')
    auth_as!(u)
    post :request_eu_ai_parental_consent, params: {
      user_id: u.global_id,
      parent_email: 'parent_api2@example.com',
      requested_features: { 'bogus' => true }
    }
    expect(response).not_to be_successful
    json = JSON.parse(response.body)
    expect(json['error']).to match(/requested_features/)
  end

  it 'rejects non-eu_under_16 users' do
    u = User.process_new({
      'name' => 'api_adult',
      'email' => 'api_adult@example.com',
      'password' => 'abcdefgh',
      'terms_agree' => true,
      'country' => 'US',
      'under_16' => false
    })
    auth_as!(u)
    post :request_eu_ai_parental_consent, params: {
      user_id: u.global_id,
      parent_email: 'parent@example.com',
      requested_features: { 'ai_board_generation' => true }
    }
    expect(response).not_to be_successful
    json = JSON.parse(response.body)
    expect(json['error']).to eq('eu_under_16_required')
  end
end

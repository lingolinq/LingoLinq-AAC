require 'spec_helper'

# An AI preference sent with a sign-up (no signed-in editor) is logged with a
# fixed system actor, not the request identifier.
describe Api::UsersController, :type => :controller do
  it 'records a system actor for an AI preference sent with a sign-up' do
    post :create, params: { :user => {
      'name' => 'signup_ai_pref', 'birth_month' => 1, 'birth_year' => Time.now.utc.year - 20,
      'preferences' => { 'ai_features_enabled' => true }
    } }
    expect(response).to be_successful
    user = User.find_by_global_id(JSON.parse(response.body)['user']['id'])
    entry = (user.settings['confirmation_log'] || []).detect { |e| e['setting'] == 'ai_features_enabled' }
    expect(entry).to be_present
    expect(entry['updater']).to eq('system:unauthenticated')
    expect(entry.to_json).not_to include(request.remote_ip)
  end
end

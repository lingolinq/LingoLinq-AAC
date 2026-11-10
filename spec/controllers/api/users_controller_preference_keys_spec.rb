require 'spec_helper'

# The request path for `preference_keys` (spec/models/user_preference_keys_spec.rb covers the model):
# a JSON update from the app reaches User#process_params with the list as an Array, and the list
# cannot widen what a caller may write.
describe Api::UsersController, type: :controller do
  it 'applies only the listed key from a stale whole-preferences save' do
    token_user
    @user.settings['preferences']['ai_features_enabled'] = false
    @user.settings['preferences']['word_suggestions'] = false
    @user.save
    stale = JSON.parse(@user.settings['preferences'].to_json).merge('ai_features_enabled' => true, 'word_suggestions' => true)
    post :update, params: { id: @user.global_id, user: { preferences: stale, preference_keys: ['word_suggestions'] } }, as: :json
    expect(response).to be_successful
    prefs = @user.reload.settings['preferences']
    expect(prefs['word_suggestions']).to eq(true)
    expect(prefs['ai_features_enabled']).to eq(false)
  end

  it 'applies the whole save, as before, without the list' do
    token_user
    @user.settings['preferences']['word_suggestions'] = false
    @user.save
    post :update, params: { id: @user.global_id, user: { preferences: { word_suggestions: true } } }, as: :json
    expect(response).to be_successful
    expect(@user.reload.settings['preferences']['word_suggestions']).to eq(true)
  end

  it 'does not let the list widen what a supervise-only supervisor may write' do
    token_user
    u2 = User.create
    u2.settings['preferences']['ai_features_enabled'] = false
    u2.save
    b = Board.create(user: u2)
    User.link_supervisor_to_user(@user, u2, nil, false)
    put :update, params: { id: u2.global_id, user: {
      preferences: { home_board: { id: b.global_id, key: b.key }, ai_features_enabled: true },
      preference_keys: ['home_board', 'ai_features_enabled']
    } }, as: :json
    expect(response).to be_successful
    u2.reload
    expect(u2.settings['preferences']['home_board']['id']).to eq(b.global_id)
    expect(u2.settings['preferences']['ai_features_enabled']).to eq(false)
  end
end

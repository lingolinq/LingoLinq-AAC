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

  it 'does not let the list reach an account the caller may not edit' do
    token_user
    other = User.create
    other.settings['preferences']['word_suggestions'] = false
    other.save
    post :update, params: { id: other.global_id, user: { preferences: { word_suggestions: true }, preference_keys: ['word_suggestions'] } }, as: :json
    assert_unauthorized
    expect(other.reload.settings['preferences']['word_suggestions']).to eq(false)
  end
end

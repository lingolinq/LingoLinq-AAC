require 'spec_helper'

# When an organization admin acts for an account and changes its AI
# preferences, the AI preference log entry records that admin as the operator.
describe Api::UsersController, :type => :controller do
  def ai_entry(user)
    (user.reload.settings['confirmation_log'] || []).detect { |e| e['setting'] == 'ai_features_enabled' }
  end

  it 'records the admin as operator when they turn AI on while acting for the account' do
    o = Organization.create(:admin => true)
    admin = User.create
    target = User.create
    o.add_manager(admin.user_name, true)
    d = Device.create(:user => admin)
    request.headers['Authorization'] = "Bearer #{d.tokens[0]}"
    request.headers['Check-Token'] = 'true'
    request.headers['X-As-User-Id'] = target.global_id
    post :update, params: { :id => target.global_id, :user => { 'preferences' => { 'ai_features_enabled' => true } } }
    expect(response).to be_successful
    entry = ai_entry(target)
    expect(entry).to be_present
    expect(entry['to']).to eq(true)
    expect(entry['operator']).to eq(admin.global_id)
  end

  it 'records no operator when the account holder turns AI on' do
    token_user
    post :update, params: { :id => @user.global_id, :user => { 'preferences' => { 'ai_features_enabled' => true } } }
    expect(response).to be_successful
    entry = ai_entry(@user)
    expect(entry).to be_present
    expect(entry['updater']).to eq(@user.global_id)
    expect(entry.key?('operator')).to eq(false)
  end
end

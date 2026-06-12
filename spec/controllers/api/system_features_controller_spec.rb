require 'spec_helper'

describe Api::SystemFeaturesController, type: :controller do
  def make_site_admin
    token_user
    @user.settings['admin'] = true
    @user.save
  end

  def make_support_manager
    admin_org = Organization.admin || Organization.create!(admin: true, settings: {'name' => 'Admin Org'})
    token_user
    admin_org.add_manager(@user.user_name, true)
    @user.reload
  end

  after do
    [SystemFeatureSettings::DEFAULT_KEY,
     SystemFeatureSettings::CANARY_KEY,
     SystemFeatureSettings::BETA_KEY].each do |key|
      Setting.find_by(key: key)&.destroy
      RedisInit.default.del("setting/#{key}")
    end
  end

  describe 'GET index' do
    it 'requires api token' do
      get :index, params: {org_id: 'default'}
      assert_missing_token
    end

    it 'returns feature catalog for admin' do
      make_site_admin
      get :index, params: {org_id: 'default'}
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['features'].length).to eq(FeatureFlags::AVAILABLE_FRONTEND_FEATURES.length)
      expect(json['scope_type']).to eq('default')
    end

    it 'returns canary group scope' do
      make_site_admin
      SystemFeatureSettings.set_canary_enabled_features!(['goals'])
      get :index, params: {org_id: 'group:canary'}
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['scope_type']).to eq('group')
      expect(json['scope_id']).to eq('canary')
      expect(json['enabled_features']).to eq(['goals'])
      expect(json['inherited_from']).to eq('site_custom')
    end

    it 'returns beta group scope' do
      make_site_admin
      get :index, params: {org_id: 'group:beta'}
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['scope_type']).to eq('group')
      expect(json['scope_id']).to eq('beta')
      expect(json['inherited_from']).to eq('code_default')
    end

    it 'rejects non-admin users' do
      token_user
      get :index, params: {org_id: 'default'}
      assert_error('Not authorized', 403)
    end

    it 'allows support managers to read org-scoped features' do
      org = Organization.create
      make_support_manager
      get :index, params: {org_id: org.global_id}
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['scope_type']).to eq('org')
    end
  end

  describe 'PUT update' do
    it 'persists default enabled features' do
      make_site_admin
      put :update, params: {org_id: 'default', enabled_features: ['goals', 'lessons']}
      expect(response).to have_http_status(:ok)
      expect(SystemFeatureSettings.default_enabled_features).to eq(['goals', 'lessons'])
    end

    it 'persists canary group features' do
      make_site_admin
      put :update, params: {org_id: 'group:canary', enabled_features: ['goals']}
      expect(response).to have_http_status(:ok)
      expect(SystemFeatureSettings.canary_enabled_features).to eq(['goals'])
    end

    it 'persists beta group features' do
      make_site_admin
      put :update, params: {org_id: 'group:beta', enabled_features: ['profiles']}
      expect(response).to have_http_status(:ok)
      expect(SystemFeatureSettings.beta_opt_in_features).to eq(['profiles'])
    end

    it 'rejects support managers updating site-wide defaults' do
      make_support_manager
      put :update, params: {org_id: 'default', enabled_features: ['goals']}
      assert_error('Site admin required', 403)
    end

    it 'allows support managers to update org-scoped features' do
      org = Organization.create
      make_support_manager
      put :update, params: {org_id: org.global_id, enabled_features: ['goals']}
      expect(response).to have_http_status(:ok)
      expect(SystemFeatureSettings.org_enabled_features(org.reload)).to eq(['goals'])
    end
  end

  describe 'DELETE destroy' do
    it 'clears canary group override' do
      make_site_admin
      SystemFeatureSettings.set_canary_enabled_features!(['goals'])
      delete :destroy, params: {org_id: 'group:canary'}
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['scope_id']).to eq('canary')
      expect(json['inherited_from']).to eq('code_default')
      expect(SystemFeatureSettings.group_inherited_from('canary')).to eq('code_default')
    end
  end
end

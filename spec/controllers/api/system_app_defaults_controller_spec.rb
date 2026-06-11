require 'spec_helper'

describe Api::SystemAppDefaultsController, type: :controller do
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
    Setting.find_by(key: SystemAppDefaults::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemAppDefaults::DEFAULT_KEY}")
  end

  describe 'GET show' do
    it 'allows support managers to read app defaults' do
      make_support_manager
      get :show
      expect(response).to have_http_status(:ok)
    end
  end

  describe 'PUT update' do
    it 'allows site admin to update app defaults' do
      make_site_admin
      put :update, params: {settings: {app_name: 'Updated App'}}
      expect(response).to have_http_status(:ok)
      expect(SystemAppDefaults.get['app_name']).to eq('Updated App')
    end

    it 'rejects support managers updating app defaults' do
      make_support_manager
      put :update, params: {settings: {app_name: 'Updated App'}}
      assert_error('Site admin required', 403)
    end

    it 'returns validation errors for invalid values' do
      make_site_admin
      put :update, params: {settings: {admin_email: 'not-an-email'}}
      assert_error('admin_email must be a valid email address', 400)
    end
  end
end

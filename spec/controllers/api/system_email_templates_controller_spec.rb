require 'spec_helper'

describe Api::SystemEmailTemplatesController, type: :controller do
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
    Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
  end

  describe 'GET index' do
    it 'requires api token' do
      get :index, params: {org_id: 'default'}
      assert_missing_token
    end

    it 'returns templates for site admin' do
      make_site_admin
      get :index, params: {org_id: 'default'}
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['templates'].length).to eq(SystemEmailRegistry.all.length)
    end
  end

  describe 'PUT update' do
    it 'allows site admin to update default templates' do
      make_site_admin
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {subject: 'Custom welcome'}
      }
      expect(response).to have_http_status(:ok)
      expect(SystemEmailTemplates.lookup('user_mailer/confirm_registration')['subject']).to eq('Custom welcome')
    end

    it 'rejects support managers updating default templates' do
      make_support_manager
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {subject: 'Custom welcome'}
      }
      assert_error('Site admin required', 403)
    end

    it 'allows support managers to update org templates' do
      org = Organization.create
      make_support_manager
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: org.global_id,
        template: {subject: 'Org welcome'}
      }
      expect(response).to have_http_status(:ok)
      expect(org.reload.settings['email_templates']['user_mailer/confirm_registration']['subject']).to eq('Org welcome')
    end

    it 'rejects users without system settings access' do
      org = Organization.create
      token_user
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: org.global_id,
        template: {subject: 'Org welcome'}
      }
      assert_error('Not authorized', 403)
    end

    it 'rejects templates with Ruby code blocks' do
      make_site_admin
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {html_body: '<% if true %>nope<% end %>'}
      }
      assert_error('Email templates may only use <%= ... %> output tags, not Ruby code blocks (<% ... %>)', 400)
    end
  end

  describe 'POST preview' do
    it 'uses synthetic preview user data' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {html_body: '<p>Hello <%= @user.email %></p>'}
      }
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['html_body']).to include('preview@example.com')
      expect(json['note']).to include('synthetic')
    end

    it 'interpolates i18n placeholders in preview' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.parental_consent_request',
        org_id: 'default',
        template: {
          i18n_overrides: {
            'parental_consent_mailer.intro' => 'Welcome to %{app_name}!'
          }
        }
      }
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['html_body']).to include('Welcome to LingoLinq!')
      expect(json['html_body']).not_to include('%{app_name}')
    end
  end
end

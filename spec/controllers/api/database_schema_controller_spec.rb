require 'spec_helper'

describe Api::DatabaseSchemaController, :type => :controller do
  describe 'index' do
    it 'should require api token' do
      get :index
      assert_missing_token
    end

    it 'should return forbidden for a non-admin user' do
      token_user
      get :index
      assert_error('Not authorized', 403)
    end

    it 'should return schema for a user with admin_support_actions' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['database_schema']['tables']).to be_a(Array)
      names = json['database_schema']['tables'].map { |t| t['name'] }
      expect(names).to include('users')
      users = json['database_schema']['tables'].find { |t| t['name'] == 'users' }
      expect(users['columns']).to be_a(Array)
      col = users['columns'].find { |c| c['name'] == 'id' }
      expect(col['type']).to be_present
      expect(col).to have_key('nullable')
    end

    it 'should return schema for a settings admin user' do
      token_user
      @user.settings['admin'] = true
      @user.save

      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['database_schema']['tables']).to be_a(Array)
    end
  end
end

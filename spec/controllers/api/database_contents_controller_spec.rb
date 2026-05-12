require 'spec_helper'

describe Api::DatabaseContentsController, :type => :controller do
  describe 'index' do
    it 'should require api token' do
      get :index, params: {table: 'users'}
      assert_missing_token
    end

    it 'should return forbidden for a non-admin user' do
      token_user
      get :index, params: {table: 'users'}
      assert_error('Not authorized', 403)
    end

    it 'should return contents for an admin user' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      get :index, params: {table: 'users', limit: 5}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      payload = json['database_contents']
      expect(payload['table']).to eq('users')
      expect(payload['columns']).to be_a(Array)
      expect(payload['columns']).to include('id')
      expect(payload['rows']).to be_a(Array)
      expect(payload['limit']).to eq(5)
      expect(payload['offset']).to eq(0)
      expect(payload['total']).to be_a(Integer)
    end

    it 'should return 404 for an unknown table' do
      token_user
      @user.settings['admin'] = true
      @user.save

      get :index, params: {table: 'nope_does_not_exist'}
      expect(response.status).to eq(404)
    end

    it 'should reject table names with sql-meta characters' do
      token_user
      @user.settings['admin'] = true
      @user.save

      get :index, params: {table: 'users; DROP TABLE foo'}
      expect(response.status).to eq(404)
    end

    it 'should clamp limit to MAX_LIMIT' do
      token_user
      @user.settings['admin'] = true
      @user.save

      get :index, params: {table: 'users', limit: 99999}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['database_contents']['limit']).to eq(Api::DatabaseContentsController::MAX_LIMIT)
    end
  end
end

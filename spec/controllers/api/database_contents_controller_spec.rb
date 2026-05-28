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

    it 'redacts secure_serialize columns so raw secured values never leak' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)
      @user.settings['secret_marker'] = 'TOP-SECRET-PII-MARKER-12345'
      @user.save!

      raw_settings = ActiveRecord::Base.connection.exec_query(
        "SELECT settings FROM users WHERE id = #{@user.id.to_i}"
      ).first['settings']

      get :index, params: {table: 'users', limit: 50}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      payload = json['database_contents']

      settings_idx = payload['columns'].index('settings')
      expect(settings_idx).to be_present
      expect(payload['redacted_columns']).to include('settings')

      # Every secured cell is redacted, and the encrypted blob never appears.
      payload['rows'].each do |row|
        expect(row[settings_idx]).to eq(Api::DatabaseContentsController::REDACTED_PLACEHOLDER)
      end
      expect(response.body).not_to include(raw_settings)
      expect(response.body).not_to include('TOP-SECRET-PII-MARKER-12345')

      # Non-secured columns are untouched: the explorer still works.
      id_idx = payload['columns'].index('id')
      uname_idx = payload['columns'].index('user_name')
      row = payload['rows'].find { |r| r[id_idx].to_s == @user.id.to_s }
      expect(row).to be_present
      expect(row[uname_idx]).to eq(@user.user_name)
    end

    it 'redacts PaperTrail snapshot columns so secured blobs never leak via versions' do
      token_user
      @user.settings['admin'] = true
      @user.save

      raw_settings = ActiveRecord::Base.connection.exec_query(
        "SELECT settings FROM users WHERE id = #{@user.id.to_i}"
      ).first['settings']

      # A version row embeds the secured ciphertext in its snapshot, the way
      # paper_trail records User/Board :settings changes.
      PaperTrail::Version.create!(
        item_type: 'User', item_id: @user.id, event: 'update',
        object: {'settings' => raw_settings, 'marker' => 'VERSIONS-LEAK-MARKER-99'}.to_yaml
      )

      get :index, params: {table: 'versions', limit: 100}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      payload = json['database_contents']

      expect(payload['redacted_columns']).to include('object')
      obj_idx = payload['columns'].index('object')
      payload['rows'].each do |row|
        expect(row[obj_idx]).to eq(Api::DatabaseContentsController::REDACTED_PLACEHOLDER)
      end
      expect(response.body).not_to include(raw_settings)
      expect(response.body).not_to include('VERSIONS-LEAK-MARKER-99')
    end

    it 'redacts sensitive plaintext credential columns that are not secure_serialize' do
      token_user
      @user.settings['admin'] = true
      @user.save

      ActiveRecord::Base.connection.exec_query(
        "INSERT INTO developer_keys (secret, key, created_at, updated_at) " \
        "VALUES ('LIVE-OAUTH-SECRET-XYZ', 'CLIENT-KEY-ABC', now(), now())"
      )

      get :index, params: {table: 'developer_keys', limit: 50}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      payload = json['database_contents']

      expect(payload['redacted_columns']).to include('secret')
      expect(payload['redacted_columns']).to include('key')
      secret_idx = payload['columns'].index('secret')
      payload['rows'].each do |row|
        expect(row[secret_idx]).to eq(Api::DatabaseContentsController::REDACTED_PLACEHOLDER)
      end
      expect(response.body).not_to include('LIVE-OAUTH-SECRET-XYZ')
      expect(response.body).not_to include('CLIENT-KEY-ABC')
    end

    it 'reports no redacted columns for a table with no secured or snapshot column' do
      token_user
      @user.settings['admin'] = true
      @user.save

      # schema_migrations has no secure_serialize and no snapshot column.
      get :index, params: {table: 'schema_migrations', limit: 5}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['database_contents']['redacted_columns']).to eq([])
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

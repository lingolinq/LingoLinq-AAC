require 'spec_helper'

describe Api::DatabaseContentsController, :type => :controller do
  def make_admin
    token_user
    @user.settings['admin'] = true
    @user.save
  end

  # Mirrors the controller's stripping rule so column expectations stay in sync
  # with ALLOWED_MODELS / SENSITIVE_COLUMNS without duplicating literals.
  def columns_stripped_for(model)
    stripped = []
    if model.respond_to?(:secure_column) && model.secure_column
      stripped << model.secure_column.to_s
    end
    stripped += (Api::DatabaseContentsController::SENSITIVE_COLUMNS[model.table_name] || [])
    stripped
  end

  describe 'index' do
    it 'should require api token' do
      get :index, params: {table: 'organizations'}
      assert_missing_token
    end

    it 'should return forbidden for a non-admin user' do
      token_user
      get :index, params: {table: 'organizations'}
      assert_error('Not authorized', 403)
    end

    it 'should return contents for an admin user' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)
      expect_any_instance_of(User).not_to receive(:allows?).with(anything, 'admin_support_actions')

      Organization.create
      get :index, params: {table: 'organizations', limit: 5}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      payload = json['database_contents']
      expect(payload['table']).to eq('organizations')
      expect(payload['columns']).to be_a(Array)
      expect(payload['columns']).to include('id')
      expect(payload['rows']).to be_a(Array)
      expect(payload['limit']).to eq(5)
      expect(payload['offset']).to eq(0)
      expect(payload['total']).to be_a(Integer)
    end

    it 'should return 404 for an unknown table' do
      make_admin
      get :index, params: {table: 'nope_does_not_exist'}
      expect(response.status).to eq(404)
    end

    it 'should reject table names with sql-meta characters' do
      make_admin
      get :index, params: {table: 'organizations; DROP TABLE foo'}
      expect(response.status).to eq(404)
    end

    it 'should clamp limit to MAX_LIMIT' do
      make_admin
      get :index, params: {table: 'organizations', limit: 99999}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['database_contents']['limit']).to eq(Api::DatabaseContentsController::MAX_LIMIT)
    end

    # Deny-by-default: tables that hold regulated PII/PHI or credentials must not
    # be browsable even by an admin, since this endpoint dumps whole rows.
    ['users', 'log_sessions', 'contact_messages', 'devices', 'developer_keys', 'audit_events'].each do |table|
      it "should return 404 for non-allowlisted sensitive table #{table}" do
        make_admin
        get :index, params: {table: table}
        expect(response.status).to eq(404)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('Table not found')
      end
    end

    it 'should never expose a model secure_serialize column' do
      make_admin
      org = Organization.create
      org.settings['secret_pii_marker'] = 'TOP-SECRET-PII-VALUE'
      org.save

      get :index, params: {table: 'organizations'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      columns = json['database_contents']['columns']
      expect(columns).not_to include('settings')
      expect(columns).to include('id')
      expect(columns).to include('admin')
      # The decrypted secret must not surface anywhere in the payload, and the
      # raw encrypted blob is never serialized either.
      expect(response.body).not_to include('TOP-SECRET-PII-VALUE')
      expect(response.body).not_to include('secret_pii_marker')
    end

    it 'should strip non-encrypted sensitive columns (SSO auth keys)' do
      make_admin
      org = Organization.create
      # Write raw column values, bypassing the callback that derives them.
      org.update_columns(external_auth_key: 'sso-secret-key-123', external_auth_shortcut: 'sso-shortcut-456')

      get :index, params: {table: 'organizations'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      columns = json['database_contents']['columns']
      expect(columns).not_to include('external_auth_key')
      expect(columns).not_to include('external_auth_shortcut')
      expect(response.body).not_to include('sso-secret-key-123')
      expect(response.body).not_to include('sso-shortcut-456')
    end

    # Every allowlisted entry must resolve to a real model and serve a 200,
    # never raise (which would surface as a 500). Catches a future typo or a
    # removed model at CI time rather than in production.
    Api::DatabaseContentsController::ALLOWED_MODELS.each do |table, class_name|
      it "should resolve allowlisted table #{table} and strip its secure column" do
        make_admin
        get :index, params: {table: table, limit: 1}
        expect(response.successful?).to eq(true)
        json = JSON.parse(response.body)
        columns = json['database_contents']['columns']
        model = class_name.constantize
        if model.respond_to?(:secure_column) && model.secure_column
          expect(columns).not_to include(model.secure_column.to_s)
        end
        expect(columns).to match_array(model.column_names - columns_stripped_for(model))
      end
    end

    it 'should strip both the encrypted metadata and the plaintext external_reference (licenses)' do
      # licenses.metadata is now secure_serialize'd (LL-740bcb10fa), so it is
      # stripped via the secure_column guard; external_reference is a plaintext
      # PO/Stripe id that go_secure cannot also encrypt (one secure column per
      # model), so it must still be stripped explicitly via SENSITIVE_COLUMNS.
      make_admin
      expect(License.secure_column).to eq(:metadata)
      get :index, params: {table: 'licenses'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      columns = json['database_contents']['columns']
      expect(columns).not_to include('metadata')
      expect(columns).not_to include('external_reference')
    end

    it 'should strip the plaintext board search_string (AAC vocabulary)' do
      make_admin
      org = Organization.create
      board = Board.create(user: @user)
      board.update_column(:search_string, 'grandma hospital seizure medication')

      get :index, params: {table: 'boards'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      columns = json['database_contents']['columns']
      # boards.settings is encrypted (stripped automatically); search_string is a
      # plaintext denormalized copy of board content and must be stripped too.
      expect(columns).not_to include('settings')
      expect(columns).not_to include('search_string')
      expect(response.body).not_to include('grandma hospital seizure medication')
    end

    it 'should not allowlist the board_locales search/tsvector table' do
      make_admin
      get :index, params: {table: 'board_locales'}
      expect(response.status).to eq(404)
    end

    it 'should write an AuditEvent for a successful authorized read' do
      make_admin
      Organization.create
      expect {
        get :index, params: {table: 'organizations', limit: 5, offset: 0}
      }.to change { AuditEvent.count }.by(1)
      expect(response.successful?).to eq(true)
      event = AuditEvent.last
      expect(event.user_key).to eq(@user.global_id)
      expect(event.data['type']).to eq('database_contents')
      expect(event.data['command']).to eq('organizations')
      expect(event.data['limit']).to eq(5)
      expect(event.data).not_to have_key('acting_as')
    end

    it 'refuses the read with 503 when the audit write does not persist (fail-closed)' do
      make_admin
      Organization.create
      # Simulate an audit-write failure: log_command returns an unsaved record.
      allow(AuditEvent).to receive(:log_command).and_return(AuditEvent.new)
      get :index, params: {table: 'organizations', limit: 5, offset: 0}
      expect(response.status).to eq(503)
      json = JSON.parse(response.body)
      expect(json).not_to have_key('database_contents')
    end

    it 'should not write an AuditEvent for a non-allowlisted table (no disclosure)' do
      make_admin
      expect {
        get :index, params: {table: 'users'}
      }.not_to change { AuditEvent.count }
      expect(response.status).to eq(404)
    end

    it 'should not write an AuditEvent for an unauthorized request' do
      token_user
      expect {
        get :index, params: {table: 'organizations'}
      }.not_to change { AuditEvent.count }
      expect(response.status).to eq(403)
    end

    # The gate must authorize the ACTING admin (@true_user), not the account
    # being viewed (@api_user). The target here is deliberately a plain non-admin
    # user: the read still succeeds because the real actor is an admin-org
    # manager, and the disclosure is attributed to that admin (not the target).
    # This would 403 if the gate evaluated the impersonated user.
    # Masquerade authorization itself also writes one AuditEvent (type=masquerade),
    # so the request produces two rows: authorize + contents disclosure.
    it 'should authorize and attribute to the real admin when masquerading as a non-admin' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)
      target = User.create
      Organization.create

      expect {
        get :index, params: {table: 'organizations', as_user_id: target.global_id}
      }.to change { AuditEvent.count }.by(2)
      expect(response.successful?).to eq(true)
      masq = AuditEvent.where(user_key: @user.global_id).detect { |e| e.data['type'] == 'masquerade' }
      expect(masq).to be_present
      expect(masq.data['acting_as']).to eq(target.global_id)
      event = AuditEvent.where(user_key: @user.global_id).detect { |e| e.data['type'] == 'database_contents' }
      expect(event).to be_present
      expect(event.data['acting_as']).to eq(target.global_id)
    end

    it 'should route reads through the model and return only exposable columns' do
      make_admin
      org = Organization.create(admin: true)

      get :index, params: {table: 'organizations'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      payload = json['database_contents']
      # Each row is an array aligned to the columns array, with no secure/sensitive cols.
      expect(payload['rows']).to be_a(Array)
      expect(payload['rows'].first).to be_a(Array)
      expect(payload['rows'].first.length).to eq(payload['columns'].length)
      expected = Organization.column_names - ['settings', 'external_auth_key', 'external_auth_shortcut']
      expect(payload['columns']).to match_array(expected)
    end
  end
end

require 'spec_helper'

describe Api::DatabaseSchemaController, :type => :controller do
  def make_admin
    token_user
    @user.settings['admin'] = true
    @user.save
  end

  # Mirrors the concern's stripping rule so column expectations stay in sync with
  # ALLOWED_MODELS / SENSITIVE_COLUMNS without duplicating literals.
  def columns_stripped_for(model)
    stripped = []
    if model.respond_to?(:secure_column) && model.secure_column
      stripped << model.secure_column.to_s
    end
    stripped += (Api::SchemaExplorer::SENSITIVE_COLUMNS[model.table_name] || [])
    stripped
  end

  def table_named(name)
    json = JSON.parse(response.body)
    json['database_schema']['tables'].find { |t| t['name'] == name }
  end

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
      # Allowlist parity: only the ALLOWED_MODELS tables are introspectable now.
      expect(names).to match_array(Api::SchemaExplorer::ALLOWED_MODELS.keys)
      orgs = table_named('organizations')
      expect(orgs['columns']).to be_a(Array)
      col = orgs['columns'].find { |c| c['name'] == 'id' }
      expect(col['type']).to be_present
      expect(col).to have_key('nullable')
      expect(col).to have_key('default')
    end

    it 'should return schema for a settings admin user' do
      make_admin

      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['database_schema']['tables']).to be_a(Array)
      names = json['database_schema']['tables'].map { |t| t['name'] }
      expect(names).to match_array(Api::SchemaExplorer::ALLOWED_MODELS.keys)
    end

    # Deny-by-default: tables that hold regulated PII/PHI or credentials, or that
    # are simply not on the allowlist, must not be enumerated by the schema view.
    ['users', 'log_sessions', 'contact_messages', 'devices', 'developer_keys', 'audit_events', 'board_locales'].each do |table|
      it "should not enumerate non-allowlisted table #{table}" do
        make_admin
        get :index
        names = JSON.parse(response.body)['database_schema']['tables'].map { |t| t['name'] }
        expect(names).not_to include(table)
      end
    end

    it 'should strip the organizations secure and SSO columns from the schema' do
      make_admin
      get :index
      cols = table_named('organizations')['columns'].map { |c| c['name'] }
      # settings is secure_serialize; the external_auth_* pair is plaintext SSO.
      expect(cols).not_to include('settings')
      expect(cols).not_to include('external_auth_key')
      expect(cols).not_to include('external_auth_shortcut')
      expect(cols).to include('id')
    end

    it 'should strip the plaintext board search_string and encrypted settings' do
      make_admin
      get :index
      cols = table_named('boards')['columns'].map { |c| c['name'] }
      expect(cols).not_to include('settings')
      expect(cols).not_to include('search_string')
    end

    it 'should strip the licenses metadata and external_reference columns' do
      make_admin
      get :index
      cols = table_named('licenses')['columns'].map { |c| c['name'] }
      expect(cols).not_to include('metadata')
      expect(cols).not_to include('external_reference')
    end

    # Every allowlisted entry must resolve to a real model and surface exactly
    # the columns database_contents would expose: same tables, same columns.
    Api::SchemaExplorer::ALLOWED_MODELS.each do |table, class_name|
      it "should expose only exposable columns for allowlisted table #{table}" do
        make_admin
        get :index
        entry = table_named(table)
        expect(entry).not_to be_nil
        model = class_name.constantize
        exposable = model.column_names - columns_stripped_for(model)
        expect(entry['columns'].map { |c| c['name'] }).to match_array(exposable)
      end
    end

    it 'should write an AuditEvent for a successful authorized read' do
      make_admin
      expect {
        get :index
      }.to change { AuditEvent.count }.by(1)
      expect(response.successful?).to eq(true)
      event = AuditEvent.last
      expect(event.user_key).to eq(@user.global_id)
      expect(event.data['type']).to eq('database_schema')
      expect(event.data['tables']).to eq(Api::SchemaExplorer::ALLOWED_MODELS.keys.length)
    end

    it 'should not write an AuditEvent for an unauthorized request' do
      token_user
      expect {
        get :index
      }.not_to change { AuditEvent.count }
      expect(response.status).to eq(403)
    end

    it 'should still serve the read when the audit write fails' do
      make_admin
      expect(AuditEvent).to receive(:log_command).and_raise(StandardError.new('boom'))
      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['database_schema']['tables']).to be_a(Array)
    end
  end
end

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
      expect_any_instance_of(User).not_to receive(:allows?).with(anything, 'admin_support_actions')

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
      expect(event.data).not_to have_key('acting_as')
    end

    it 'should not write an AuditEvent for an unauthorized request' do
      token_user
      expect {
        get :index
      }.not_to change { AuditEvent.count }
      expect(response.status).to eq(403)
    end

    it 'refuses the read with 503 when the audit write does not persist (fail-closed)' do
      make_admin
      # log_command is fail-open and returns an unsaved record on failure; the
      # raw-data explorer refuses to disclose without a persisted audit row.
      allow(AuditEvent).to receive(:log_command).and_return(AuditEvent.new)
      get :index
      expect(response.status).to eq(503)
      json = JSON.parse(response.body)
      expect(json).not_to have_key('database_schema')
    end

    # The gate must authorize the ACTING admin (@true_user), not the account
    # being viewed (@api_user). The target here is deliberately a plain non-admin
    # user: the read still succeeds because the real actor is an admin-org
    # manager, and the disclosure is attributed to that admin (not the target).
    # This would 403 if the gate evaluated the impersonated user.
    # Masquerade authorization itself also writes one AuditEvent (type=masquerade),
    # so the request produces two rows: authorize + schema disclosure.
    it 'should authorize and attribute to the real admin when masquerading as a non-admin' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)
      target = User.create

      expect {
        get :index, params: {as_user_id: target.global_id}
      }.to change { AuditEvent.count }.by(2)
      expect(response.successful?).to eq(true)
      masq = AuditEvent.where(user_key: @user.global_id).detect { |e| e.data['type'] == 'masquerade' }
      expect(masq).to be_present
      expect(masq.data['acting_as']).to eq(target.global_id)
      event = AuditEvent.where(user_key: @user.global_id).detect { |e| e.data['type'] == 'database_schema' }
      expect(event).to be_present
      expect(event.data['acting_as']).to eq(target.global_id)
    end

    # A non-admin who is merely able to masquerade (an org manager viewing as one
    # of their users) must NOT inherit schema-explorer access just because the
    # impersonated target happens to be privileged. The gate authorizes the
    # acting non-admin (@true_user), who fails, so the read is denied and no
    # schema disclosure is logged. Masquerade authorization still writes its
    # own AuditEvent (type=masquerade). Guards the escalation direction of the
    # same gate.
    it 'should deny a non-admin who masquerades as a privileged target' do
      token_user
      org = Organization.create
      org.add_manager(@user.user_name, true)
      admin_org = Organization.create(admin: true)
      target = User.create(user_name: 'privtarget')
      org.add_user(target.user_name, false, false)
      admin_org.add_manager(target.user_name, true)

      expect {
        get :index, params: {as_user_id: target.global_id}
      }.to change { AuditEvent.count }.by(1)
      expect(response.status).to eq(403)
      event = AuditEvent.last
      expect(event.user_key).to eq(@user.global_id)
      expect(event.data['type']).to eq('masquerade')
      expect(event.data['acting_as']).to eq(target.global_id)
      expect(AuditEvent.where(user_key: @user.global_id).none? { |e| e.data['type'] == 'database_schema' }).to eq(true)
    end
  end
end

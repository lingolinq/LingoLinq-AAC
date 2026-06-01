class Api::DatabaseSchemaController < ApplicationController
  include Api::SchemaExplorer

  before_action :require_api_token
  before_action :require_schema_explorer_access

  # GET /api/v1/database_schema
  # Read-only introspection of public tables and columns (information_schema),
  # scoped to the same deny-by-default allowlist the row endpoint uses. Only the
  # ALLOWED_MODELS tables are returned, and within each table only the columns
  # that database_contents would expose (secure_serialize + SENSITIVE_COLUMNS
  # stripped). The schema view and the contents view therefore match exactly,
  # which keeps regulated table/column metadata from leaking to the explorer.
  def index
    rows = ActiveRecord::Base.connection.exec_query(<<~SQL.squish)
      SELECT
        c.table_name,
        c.column_name,
        c.ordinal_position,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    SQL

    columns_by_table = {}
    rows.each do |row|
      (columns_by_table[row['table_name']] ||= []) << row
    end

    table_list = ALLOWED_MODELS.keys.sort.filter_map do |table|
      model = allowed_model(table)
      next unless model
      exposable = exposable_columns(model)
      cols = (columns_by_table[table] || [])
               .select { |row| exposable.include?(row['column_name']) }
               .map { |row| column_json(row) }
      { 'name' => table, 'columns' => cols }
    end

    log_access(table_list.length)

    render json: { database_schema: { tables: table_list } }
  end

  private

  def column_json(row)
    {
      'name' => row['column_name'],
      'type' => build_type_display(row),
      'nullable' => row['is_nullable'] == 'YES',
      'default' => row['column_default']
    }
  end

  def build_type_display(row)
    dt = row['data_type'].to_s
    if dt == 'character varying' && row['character_maximum_length']
      "varchar(#{row['character_maximum_length']})"
    elsif (dt == 'numeric' || dt == 'decimal') && row['numeric_precision']
      scale = row['numeric_scale'].to_i
      prec = row['numeric_precision'].to_i
      scale.positive? ? "numeric(#{prec},#{scale})" : "numeric(#{prec})"
    else
      (row['udt_name'].presence || dt)
    end
  end

  # Record who read the schema, for FERPA/HIPAA accounting-of-disclosures.
  # Only successful, authorized reads reach here (403 paths disclose nothing).
  # Auditing is best-effort: an audit-write failure must never break a read the
  # requester is already authorized to perform. Mirrors
  # Api::DatabaseContentsController#log_access.
  def log_access(table_count)
    AuditEvent.log_command(@api_user&.global_id || 'unknown', {
      'type' => 'database_schema',
      'command' => 'schema',
      'tables' => table_count
    })
  rescue => e
    Rails.logger.error("database_schema audit log failed: #{e.class}: #{e.message}")
  end
end

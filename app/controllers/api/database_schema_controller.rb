class Api::DatabaseSchemaController < ApplicationController
  before_action :require_api_token
  before_action :require_schema_explorer_access

  # GET /api/v1/database_schema
  # Read-only introspection of public tables and columns (information_schema).
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

    tables_hash = {}
    rows.each do |row|
      name = row['table_name']
      tables_hash[name] ||= []
      tables_hash[name] << column_json(row)
    end

    table_list = tables_hash.keys.sort.map do |t|
      { 'name' => t, 'columns' => tables_hash[t] }
    end

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

  def require_schema_explorer_access
    return if @api_user&.admin?
    return if @api_user && @api_user.allows?(@api_user, 'admin_support_actions')

    api_error 403, {error: 'Not authorized'}
  end
end

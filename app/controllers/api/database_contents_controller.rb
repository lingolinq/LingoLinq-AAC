class Api::DatabaseContentsController < ApplicationController
  before_action :require_api_token
  before_action :require_schema_explorer_access

  DEFAULT_LIMIT = 50
  MAX_LIMIT = 500

  # GET /api/v1/database_contents?table=NAME&limit=50&offset=0
  # Read-only paginated dump of a public table's rows. Admin / admin_support_actions only.
  def index
    table = params[:table].to_s
    unless allowed_table?(table)
      return api_error(404, {error: 'Table not found'})
    end

    raw_limit = params[:limit].present? ? params[:limit].to_i : DEFAULT_LIMIT
    limit = [[raw_limit, 1].max, MAX_LIMIT].min
    offset = [params[:offset].to_i, 0].max

    conn = ActiveRecord::Base.connection
    quoted = conn.quote_table_name(table)
    columns = conn.columns(table).map(&:name)

    rows_result = conn.exec_query("SELECT * FROM #{quoted} ORDER BY 1 LIMIT #{limit.to_i} OFFSET #{offset.to_i}")
    total, total_exact = approximate_count(conn, table)

    serialized = rows_result.map do |row|
      columns.map { |c| serialize_value(row[c]) }
    end

    render json: {
      database_contents: {
        table: table,
        columns: columns,
        rows: serialized,
        total: total,
        total_exact: total_exact,
        limit: limit,
        offset: offset
      }
    }
  end

  private

  def allowed_tables
    @allowed_tables ||= ActiveRecord::Base.connection.exec_query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    ).map { |r| r['table_name'] }
  end

  def allowed_table?(name)
    return false if name.blank?
    return false unless name =~ /\A[a-zA-Z0-9_]+\z/
    allowed_tables.include?(name)
  end

  # Cheap approximate count via pg_class.reltuples for big tables; falls back
  # to exact COUNT(*) under the threshold so small tables still show truth.
  # Returns [count, exact_bool].
  APPROX_COUNT_THRESHOLD = 10_000
  def approximate_count(conn, table)
    row = conn.exec_query(
      "SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = #{conn.quote(table)} LIMIT 1"
    ).first
    estimate = row ? row['estimate'].to_i : 0
    if estimate < APPROX_COUNT_THRESHOLD
      exact = conn.exec_query("SELECT COUNT(*) AS c FROM #{conn.quote_table_name(table)}").first['c'].to_i
      [exact, true]
    else
      [estimate, false]
    end
  end

  def serialize_value(v)
    case v
    when nil
      nil
    when String
      v.length > 5000 ? "#{v[0, 5000]}…" : v
    when Hash, Array
      v.to_json
    else
      v.to_s
    end
  end

  def require_schema_explorer_access
    return if @api_user&.admin?
    return if @api_user && @api_user.allows?(@api_user, 'admin_support_actions')

    api_error 403, {error: 'Not authorized'}
  end
end

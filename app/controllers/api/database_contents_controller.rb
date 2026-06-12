class Api::DatabaseContentsController < ApplicationController
  include Api::SchemaExplorer

  before_action :require_api_token
  before_action :require_schema_explorer_access

  # ALLOWED_MODELS, SENSITIVE_COLUMNS, DEFAULT_LIMIT/MAX_LIMIT, allowed_model,
  # exposable_columns, and require_schema_explorer_access now live in the shared
  # Api::SchemaExplorer concern so this row endpoint and the schema (metadata)
  # endpoint expose the exact same tables and columns from one source of truth.

  # GET /api/v1/database_contents?table=NAME&limit=50&offset=0
  # Read-only paginated dump of an allowlisted table's rows. Admin /
  # admin_support_actions only. Reads route through the model so encrypted
  # (secure_serialize) and other sensitive columns are never exposed.
  def index
    model = allowed_model(params[:table].to_s)
    unless model
      return api_error(404, {error: 'Table not found'})
    end

    raw_limit = params[:limit].present? ? params[:limit].to_i : DEFAULT_LIMIT
    limit = [[raw_limit, 1].max, MAX_LIMIT].min
    offset = [params[:offset].to_i, 0].max

    columns = exposable_columns(model)

    records = model.order(model.primary_key).limit(limit).offset(offset)
    serialized = records.map do |record|
      attrs = record.attributes
      columns.map { |c| serialize_value(attrs[c]) }
    end

    total, total_exact = approximate_count(model)

    log_access(model.table_name, limit, offset, serialized.length)

    render json: {
      database_contents: {
        table: model.table_name,
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

  # Cheap approximate count via pg_class.reltuples for big tables; falls back
  # to an exact count under the threshold so small tables still show truth.
  # Returns [count, exact_bool].
  APPROX_COUNT_THRESHOLD = 10_000
  def approximate_count(model)
    conn = model.connection
    row = conn.exec_query(
      "SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = #{conn.quote(model.table_name)} LIMIT 1"
    ).first
    estimate = row ? row['estimate'].to_i : 0
    # pg_class.reltuples is -1 (or 0) for a table that has never been analyzed,
    # which can be a huge table with stale stats. Only run the exact COUNT(*)
    # when the estimate is a real, small, non-negative value; otherwise fall
    # back to the (possibly unknown) estimate rather than scanning a big table.
    if estimate >= 0 && estimate < APPROX_COUNT_THRESHOLD
      [model.count, true]
    else
      [[estimate, 0].max, false]
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

  # Record who read which table, for FERPA/HIPAA accounting-of-disclosures.
  # Only successful, authorized reads of real data reach here (404/403 paths
  # disclose nothing). Auditing is best-effort: an audit-write failure must
  # never break a read that the requester is already authorized to perform.
  def log_access(table, limit, offset, returned)
    AuditEvent.log_command(audit_user_key, {
      'type' => 'database_contents',
      'command' => table,
      'limit' => limit,
      'offset' => offset,
      'returned' => returned,
      'acting_as' => audit_acting_as
    }.compact)
  rescue => e
    Rails.logger.error("database_contents audit log failed: #{e.class}: #{e.message}")
  end
end

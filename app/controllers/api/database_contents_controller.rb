class Api::DatabaseContentsController < ApplicationController
  before_action :require_api_token
  before_action :require_schema_explorer_access

  DEFAULT_LIMIT = 50
  MAX_LIMIT = 500

  # Deny-by-default allowlist for the admin schema explorer. Only the tables
  # listed here may be browsed; every other table returns 404. Each entry maps a
  # table to its ActiveRecord model so rows are read through the model layer
  # (never via raw `SELECT *`), and the model's secure_serialize column is
  # stripped from the response automatically (see #exposable_columns).
  #
  # Tables that hold regulated PII/PHI in non-encrypted columns (users,
  # log_sessions, contact_messages, devices, ...) or plaintext credentials
  # (developer_keys) are deliberately omitted. board_locales is also omitted:
  # it is a search/tsvector table whose search_string and tsv_search_string are
  # a plaintext, denormalized copy of board content (button labels), so it
  # carries the same FERPA/HIPAA data that secure_serialize protects with no
  # admin-browse value. Widen this map only after a privacy review of every
  # non-encrypted column the candidate table would surface.
  ALLOWED_MODELS = {
    'organizations'          => 'Organization',
    'boards'                 => 'Board',
    'licenses'               => 'License',
    'library_caches'         => 'LibraryCache',
    'word_data'              => 'WordData',
    'weekly_stats_summaries' => 'WeeklyStatsSummary'
  }.freeze

  # Plaintext columns stripped in addition to each model's secure_serialize
  # column. These hold credentials or identifying data that is not encrypted at
  # rest, so the model layer would otherwise surface them:
  # - organizations.external_auth_key/shortcut: SAML SSO auth hashes.
  # - boards.search_string: denormalized board content (button labels), which is
  #   AAC user vocabulary (FERPA/HIPAA), even though boards.settings is encrypted.
  # - licenses.metadata/external_reference: License has no secure_serialize;
  #   metadata is an untyped catch-all and external_reference is a PO/Stripe id.
  SENSITIVE_COLUMNS = {
    'organizations' => ['external_auth_key', 'external_auth_shortcut'],
    'boards'        => ['search_string'],
    'licenses'      => ['metadata', 'external_reference']
  }.freeze

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

  def allowed_model(table)
    return nil if table.blank?
    class_name = ALLOWED_MODELS[table]
    return nil unless class_name
    # A misconfigured allowlist entry should 404, never raise a 500.
    class_name.safe_constantize
  end

  # Columns safe to surface: every DB column minus the model's secure_serialize
  # column (the encrypted blob) and any explicitly denied plaintext columns.
  # This is what guarantees encrypted/sensitive data never reaches the response,
  # even if a new secure column is later added to an allowlisted model.
  def exposable_columns(model)
    stripped = []
    if model.respond_to?(:secure_column) && model.secure_column
      stripped << model.secure_column.to_s
    end
    stripped += (SENSITIVE_COLUMNS[model.table_name] || [])
    model.column_names - stripped
  end

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
    AuditEvent.log_command(@api_user&.global_id || 'unknown', {
      'type' => 'database_contents',
      'command' => table,
      'limit' => limit,
      'offset' => offset,
      'returned' => returned
    })
  rescue => e
    Rails.logger.error("database_contents audit log failed: #{e.class}: #{e.message}")
  end

  def require_schema_explorer_access
    return if @api_user&.admin?
    return if admin_support_actions_allowed?

    api_error 403, {error: 'Not authorized'}
  end
end

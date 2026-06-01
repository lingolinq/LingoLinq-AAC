# Shared surface for the admin "schema explorer" endpoints
# (Api::DatabaseSchemaController and Api::DatabaseContentsController). Both the
# schema (metadata) view and the contents (row) view must expose the exact same
# tables and columns, so the allowlist, the column-stripping rules, and the
# authorization gate all live here as the single source of truth. Widening any
# of these affects both endpoints at once.
module Api::SchemaExplorer
  extend ActiveSupport::Concern

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

  def require_schema_explorer_access
    return if @api_user&.admin?
    return if @api_user && @api_user.allows?(@api_user, 'admin_support_actions')

    api_error 403, {error: 'Not authorized'}
  end
end

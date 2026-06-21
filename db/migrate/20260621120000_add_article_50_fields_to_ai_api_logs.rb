class AddArticle50FieldsToAiApiLogs < ActiveRecord::Migration[7.2]
  # Columns only. Indexes are added concurrently in a separate migration
  # (20260621120002) because ai_api_logs is an append-heavy production audit table
  # and a plain CREATE INDEX would take a write-blocking lock. Adding nullable /
  # defaulted columns is a fast metadata-only operation in PG 11+ (no table rewrite).
  def change
    # Detected user jurisdiction for the Article 50(1) disclosure gate (EU / US / OTHER / UNKNOWN).
    # NOTE: marking (50(2)) is unconditional and does NOT depend on this value.
    add_column :ai_api_logs, :jurisdiction, :string, limit: 10

    # Whether the EU AI Act Article 50(1) disclosure was shown for this AI call.
    add_column :ai_api_logs, :article_50_disclosure_shown, :boolean, default: false

    # Whether the AI-generated output was machine-readably marked (Article 50(2)).
    # Applied unconditionally, so this should be true for every successful generation.
    add_column :ai_api_logs, :ai_content_marked, :boolean, default: false

    # global_id of the content produced by this AI call (e.g. a Board global_id), for audit linkage.
    add_column :ai_api_logs, :ai_generated_content_id, :string
  end
end

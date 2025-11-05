# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema.define(version: 2023_10_30_173246) do

  # These are extensions that must be enabled in order to support this database
  enable_extension "btree_gin"
  enable_extension "plpgsql"

  create_table "activation_codes", id: :serial, force: :cascade do |t|
    t.string "code_hash"
    t.string "record_code"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code_hash"], name: "index_activation_codes_on_code_hash", unique: true
  end

  create_table "api_calls", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "audit_events", id: :serial, force: :cascade do |t|
    t.string "user_key"
    t.text "data"
    t.string "summary", limit: 4096
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "event_type"
    t.string "record_id"
    t.index ["event_type", "created_at"], name: "index_audit_events_on_event_type_and_created_at"
    t.index ["event_type", "record_id"], name: "index_audit_events_on_event_type_and_record_id"
    t.index ["user_key", "created_at"], name: "index_audit_events_on_user_key_and_created_at"
  end

  create_table "board_button_images", id: :serial, force: :cascade do |t|
    t.integer "button_image_id"
    t.integer "board_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id"], name: "index_board_button_images_on_board_id"
    t.index ["button_image_id"], name: "index_board_button_images_on_button_image_id"
  end

  create_table "board_button_sounds", id: :serial, force: :cascade do |t|
    t.integer "button_sound_id"
    t.integer "board_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id"], name: "index_board_button_sounds_on_board_id"
  end

  create_table "board_contents", id: :serial, force: :cascade do |t|
    t.text "settings"
    t.integer "board_count"
    t.integer "source_board_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "board_downstream_button_sets", id: :serial, force: :cascade do |t|
    t.text "data"
    t.integer "board_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id"
    t.index ["board_id", "user_id"], name: "index_board_downstream_button_sets_on_board_id_and_user_id", unique: true
  end

  create_table "board_locales", id: :serial, force: :cascade do |t|
    t.integer "board_id"
    t.integer "popularity"
    t.integer "home_popularity"
    t.string "locale"
    t.string "search_string", limit: 10000
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.tsvector "tsv_search_string"
    t.index "to_tsvector('simple'::regconfig, COALESCE((search_string)::text, ''::text))", name: "board_locales_search_string", using: :gin
    t.index ["tsv_search_string"], name: "index_board_locales_tsv_search_string", using: :gin
  end

  create_table "boards", id: :serial, force: :cascade do |t|
    t.string "name"
    t.string "key"
    t.string "search_string", limit: 4096
    t.boolean "public"
    t.text "settings"
    t.integer "parent_board_id"
    t.integer "user_id"
    t.integer "popularity"
    t.integer "home_popularity"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "current_revision"
    t.boolean "any_upstream"
    t.integer "board_content_id"
    t.index "COALESCE(search_string, (''::text)::character varying)", name: "boards_search_string2", using: :gin
    t.index "to_tsvector('simple'::regconfig, COALESCE((search_string)::text, ''::text))", name: "boards_search_string", using: :gin
    t.index ["key"], name: "index_boards_on_key", unique: true
    t.index ["parent_board_id", "user_id"], name: "index_boards_on_parent_board_id_and_user_id"
    t.index ["parent_board_id"], name: "index_boards_on_parent_board_id"
    t.index ["public", "home_popularity", "popularity", "id"], name: "board_pop_index"
    t.index ["public", "popularity", "home_popularity", "id"], name: "boards_all_pops"
    t.index ["public", "user_id"], name: "index_boards_on_public_and_user_id"
    t.index ["user_id", "popularity", "any_upstream", "id"], name: "board_user_index_popularity"
  end

  create_table "button_images", id: :serial, force: :cascade do |t|
    t.integer "board_id"
    t.integer "remote_id"
    t.integer "parent_button_image_id"
    t.integer "user_id"
    t.boolean "public"
    t.string "path"
    t.string "url", limit: 4096
    t.text "data"
    t.text "settings"
    t.string "file_hash"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "nonce"
    t.boolean "removable"
    t.index ["url"], name: "index_button_images_on_url"
  end

  create_table "button_sounds", id: :serial, force: :cascade do |t|
    t.integer "board_id"
    t.integer "remote_id"
    t.integer "user_id"
    t.boolean "public"
    t.string "path"
    t.string "url", limit: 4096
    t.text "data"
    t.text "settings"
    t.string "file_hash"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "nonce"
    t.boolean "removable"
    t.index ["file_hash"], name: "index_button_sounds_on_file_hash"
    t.index ["removable"], name: "index_button_sounds_on_removable"
    t.index ["url"], name: "index_button_sounds_on_url"
  end

  create_table "cluster_locations", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "cluster_type"
    t.string "cluster_hash"
    t.index ["cluster_type", "cluster_hash"], name: "index_cluster_locations_on_cluster_type_and_cluster_hash", unique: true
  end

  create_table "contact_messages", id: :serial, force: :cascade do |t|
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "deleted_boards", id: :serial, force: :cascade do |t|
    t.string "key"
    t.text "settings"
    t.integer "board_id"
    t.integer "user_id"
    t.boolean "cleared"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id"], name: "index_deleted_boards_on_board_id", unique: true
    t.index ["created_at", "cleared"], name: "index_deleted_boards_on_created_at_and_cleared"
    t.index ["key"], name: "index_deleted_boards_on_key"
    t.index ["user_id"], name: "index_deleted_boards_on_user_id"
  end

  create_table "developer_keys", id: :serial, force: :cascade do |t|
    t.string "key"
    t.string "redirect_uri", limit: 4096
    t.string "name"
    t.string "secret", limit: 4096
    t.string "icon_url", limit: 4096
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_developer_keys_on_key", unique: true
  end

  create_table "devices", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.string "device_key"
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "developer_key_id"
    t.integer "user_integration_id"
    t.index ["user_id"], name: "index_devices_on_user_id"
  end

  create_table "external_nonces", id: :serial, force: :cascade do |t|
    t.string "purpose"
    t.string "nonce"
    t.string "transform"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "uses"
  end

  create_table "gift_purchases", id: :serial, force: :cascade do |t|
    t.text "settings"
    t.boolean "active"
    t.string "code"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active", "code"], name: "index_gift_purchases_on_active_and_code"
    t.index ["code"], name: "index_gift_purchases_on_code", unique: true
  end

  create_table "job_stashes", id: :serial, force: :cascade do |t|
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "log_session_id"
    t.integer "user_id"
    t.index ["created_at"], name: "index_job_stashes_on_created_at"
    t.index ["user_id", "log_session_id"], name: "index_job_stashes_on_user_id_and_log_session_id"
  end

  create_table "lessons", id: :serial, force: :cascade do |t|
    t.text "settings"
    t.integer "user_id"
    t.integer "organization_id"
    t.integer "organization_unit_id"
    t.boolean "public"
    t.integer "popularity"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "library_caches", id: :serial, force: :cascade do |t|
    t.string "library"
    t.string "locale"
    t.text "data"
    t.datetime "invalidated_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["library", "locale"], name: "index_library_caches_on_library_and_locale", unique: true
  end

  create_table "log_mergers", id: :serial, force: :cascade do |t|
    t.datetime "merge_at"
    t.boolean "started"
    t.integer "log_session_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["log_session_id"], name: "index_log_mergers_on_log_session_id"
  end

  create_table "log_session_boards", id: :serial, force: :cascade do |t|
    t.integer "log_session_id"
    t.integer "board_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id", "log_session_id"], name: "index_log_session_boards_on_board_id_and_log_session_id"
  end

  create_table "log_sessions", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "author_id"
    t.integer "device_id"
    t.datetime "started_at"
    t.datetime "ended_at"
    t.text "data"
    t.boolean "processed"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "ip_cluster_id"
    t.integer "geo_cluster_id"
    t.string "log_type"
    t.boolean "has_notes"
    t.datetime "last_cluster_attempt_at"
    t.integer "goal_id"
    t.boolean "needs_remote_push"
    t.boolean "highlighted"
    t.integer "score"
    t.string "profile_id"
    t.index ["author_id"], name: "index_log_sessions_on_author_id"
    t.index ["device_id", "ended_at"], name: "index_log_sessions_on_device_id_and_ended_at"
    t.index ["needs_remote_push", "ended_at"], name: "index_log_sessions_on_needs_remote_push_and_ended_at"
    t.index ["started_at", "log_type"], name: "index_log_sessions_on_started_at_and_log_type"
    t.index ["user_id", "goal_id"], name: "index_log_sessions_on_user_id_and_goal_id"
    t.index ["user_id", "highlighted"], name: "index_log_sessions_on_user_id_and_highlighted"
    t.index ["user_id", "started_at"], name: "index_log_sessions_on_user_id_and_started_at"
  end

  create_table "log_snapshots", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.datetime "started_at"
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "started_at"], name: "index_log_snapshots_on_user_id_and_started_at"
  end

  create_table "nfc_tags", id: :serial, force: :cascade do |t|
    t.string "tag_id"
    t.string "user_id"
    t.string "nonce"
    t.boolean "public"
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "has_content"
    t.index ["tag_id", "has_content", "public", "user_id"], name: "index_nfc_tags_on_tag_id_and_has_content_and_public_and_user_id"
    t.index ["tag_id", "public", "user_id"], name: "index_nfc_tags_on_tag_id_and_public_and_user_id"
  end

  create_table "old_keys", id: :serial, force: :cascade do |t|
    t.string "record_id"
    t.string "type"
    t.string "key"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["type", "key"], name: "index_old_keys_on_type_and_key"
  end

  create_table "organization_units", id: :serial, force: :cascade do |t|
    t.integer "organization_id"
    t.text "settings"
    t.integer "position"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "user_goal_id"
    t.index ["organization_id", "position"], name: "index_organization_units_on_organization_id_and_position"
  end

  create_table "organizations", id: :serial, force: :cascade do |t|
    t.text "settings"
    t.boolean "admin"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "parent_organization_id"
    t.boolean "custom_domain"
    t.string "external_auth_key"
    t.string "external_auth_shortcut"
    t.integer "user_goal_id"
    t.index ["admin"], name: "index_organizations_on_admin", unique: true
    t.index ["custom_domain"], name: "index_organizations_on_custom_domain"
    t.index ["external_auth_key"], name: "index_organizations_on_external_auth_key", unique: true
    t.index ["external_auth_shortcut"], name: "index_organizations_on_external_auth_shortcut", unique: true
    t.index ["parent_organization_id"], name: "index_organizations_on_parent_organization_id"
  end

  create_table "profile_templates", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "organization_id"
    t.integer "parent_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "settings"
    t.string "public_profile_id"
    t.boolean "communicator"
    t.index ["public_profile_id"], name: "index_profile_templates_on_public_profile_id", unique: true
  end

  create_table "progresses", id: :serial, force: :cascade do |t|
    t.text "settings"
    t.string "nonce"
    t.datetime "started_at"
    t.datetime "finished_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["nonce"], name: "index_progresses_on_nonce"
  end

  create_table "purchase_tokens", id: :serial, force: :cascade do |t|
    t.string "token"
    t.integer "user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "hashed_device_id"
    t.index ["hashed_device_id"], name: "index_purchase_tokens_on_hashed_device_id"
    t.index ["token"], name: "index_purchase_tokens_on_token", unique: true
  end

  create_table "remote_actions", id: :serial, force: :cascade do |t|
    t.datetime "act_at"
    t.string "path"
    t.string "action"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "extra"
  end

  create_table "remote_targets", id: :serial, force: :cascade do |t|
    t.string "target_type"
    t.string "source_hash"
    t.string "target_hash"
    t.string "salt"
    t.integer "user_id"
    t.integer "target_id"
    t.integer "target_index"
    t.string "contact_id"
    t.datetime "last_outbound_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["target_type", "target_id", "target_index"], name: "remote_targets_target_sorting"
  end

  create_table "settings", id: :serial, force: :cascade do |t|
    t.string "key"
    t.string "value"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "data"
    t.index ["key"], name: "index_settings_on_key", unique: true
  end

  create_table "user_badges", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "user_goal_id"
    t.boolean "superseded"
    t.integer "level"
    t.text "data"
    t.boolean "highlighted"
    t.boolean "earned"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "disabled"
    t.index ["disabled"], name: "index_user_badges_on_disabled"
  end

  create_table "user_board_connections", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "board_id"
    t.boolean "home"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "parent_board_id"
    t.string "locale"
    t.index ["board_id", "home", "updated_at"], name: "user_board_lookups"
    t.index ["user_id", "board_id"], name: "index_user_board_connections_on_user_id_and_board_id"
  end

  create_table "user_extras", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_user_extras_on_user_id", unique: true
  end

  create_table "user_goals", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.boolean "active"
    t.text "settings"
    t.boolean "template"
    t.boolean "template_header"
    t.datetime "advance_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "primary"
    t.boolean "global"
    t.index ["advance_at"], name: "index_user_goals_on_advance_at"
    t.index ["global"], name: "index_user_goals_on_global"
    t.index ["template_header"], name: "index_user_goals_on_template_header"
    t.index ["user_id", "active"], name: "index_user_goals_on_user_id_and_active"
  end

  create_table "user_integrations", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "device_id"
    t.boolean "template"
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "for_button"
    t.string "integration_key"
    t.integer "template_integration_id"
    t.string "unique_key"
    t.index ["integration_key"], name: "index_user_integrations_on_integration_key", unique: true
    t.index ["template"], name: "index_user_integrations_on_template"
    t.index ["template_integration_id", "user_id"], name: "index_user_integrations_on_template_integration_id_and_user_id"
    t.index ["unique_key"], name: "index_user_integrations_on_unique_key", unique: true
    t.index ["user_id", "created_at"], name: "index_user_integrations_on_user_id_and_created_at"
    t.index ["user_id", "for_button"], name: "index_user_integrations_on_user_id_and_for_button"
  end

  create_table "user_link_codes", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.string "user_global_id"
    t.string "code"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_user_link_codes_on_code", unique: true
  end

  create_table "user_links", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.string "record_code"
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "secondary_user_id"
    t.index ["record_code"], name: "index_user_links_on_record_code"
    t.index ["secondary_user_id"], name: "index_user_links_on_secondary_user_id"
    t.index ["user_id"], name: "index_user_links_on_user_id"
  end

  create_table "user_videos", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.string "url", limit: 4096
    t.text "settings"
    t.string "file_hash"
    t.boolean "public"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "nonce"
  end

  create_table "users", id: :serial, force: :cascade do |t|
    t.string "user_name"
    t.string "email_hash", limit: 4096
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "expires_at"
    t.integer "managing_organization_id"
    t.integer "managed_organization_id"
    t.datetime "next_notification_at"
    t.boolean "possibly_full_premium"
    t.datetime "badges_updated_at"
    t.datetime "schedule_deletion_at"
    t.datetime "boards_updated_at"
    t.datetime "sync_stamp"
    t.index ["email_hash"], name: "index_users_on_email_hash"
    t.index ["managed_organization_id"], name: "index_users_on_managed_organization_id"
    t.index ["managing_organization_id"], name: "index_users_on_managing_organization_id"
    t.index ["next_notification_at"], name: "index_users_on_next_notification_at"
    t.index ["possibly_full_premium"], name: "index_users_on_possibly_full_premium"
    t.index ["schedule_deletion_at"], name: "index_users_on_schedule_deletion_at"
    t.index ["user_name"], name: "index_users_on_user_name", unique: true
  end

  create_table "utterances", id: :serial, force: :cascade do |t|
    t.text "data"
    t.integer "user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "nonce"
    t.string "reply_nonce"
    t.index ["reply_nonce"], name: "index_utterances_on_reply_nonce", unique: true
  end

  create_table "versions", id: :serial, force: :cascade do |t|
    t.string "item_type", null: false
    t.integer "item_id", null: false
    t.string "event", null: false
    t.string "whodunnit"
    t.text "object"
    t.datetime "created_at"
    t.index ["item_type", "item_id"], name: "index_versions_on_item_type_and_item_id"
  end

  create_table "webhooks", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.string "record_code"
    t.text "settings"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "user_integration_id"
    t.index ["record_code", "user_id"], name: "index_webhooks_on_record_code_and_user_id"
    t.index ["user_id"], name: "index_webhooks_on_user_id"
  end

  create_table "weekly_stats_summaries", id: :serial, force: :cascade do |t|
    t.integer "user_id"
    t.integer "board_id"
    t.integer "weekyear"
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id", "weekyear"], name: "index_weekly_stats_summaries_on_board_id_and_weekyear"
    t.index ["user_id", "weekyear"], name: "index_weekly_stats_summaries_on_user_id_and_weekyear"
  end

  create_table "word_data", id: :serial, force: :cascade do |t|
    t.string "word"
    t.string "locale"
    t.text "data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "priority"
    t.integer "reviews"
    t.index ["locale", "priority", "word"], name: "index_word_data_on_locale_and_priority_and_word"
    t.index ["locale", "reviews", "priority", "word"], name: "index_word_data_on_locale_and_reviews_and_priority_and_word"
    t.index ["word", "locale"], name: "index_word_data_on_word_and_locale", unique: true
  end

end

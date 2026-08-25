desc "This task is called by the Heroku scheduler add-on"

task :check_for_expiring_subscriptions => :environment do
  puts "Checking for expiring subscriptions..."
  res = User.check_for_subscription_updates
  User.schedule_for('slow', :check_for_subscription_updates)
  BoardContent.schedule_for('whenever', :link_clones, 1000)
  puts "done."
  puts JSON.pretty_generate(res)
end

task :generate_log_summaries => :environment do
  puts "Generating log summaries..."
  res = LogSession.generate_log_summaries
  puts "done. found #{res[:found]}, notified #{res[:notified]}"
end

task :check_for_log_mergers => :environment do
  puts "Checking for logs to merge..."
  res = LogSession.check_possible_mergers
  puts "done. found #{res} possible logs"
end

task :push_remote_logs => :environment do
  puts "Finding and pushing remote logs..."
  res = LogSession.push_logs_remotely
  Uploader.remote_remove_batch
  puts "done. updated #{res} logs"
end

task :flush_users => :environment do
  puts "Finding users that need to be deleted..."
  res = Flusher.flush_deleted_users
  Utterance.clear_old_nonces
  puts "done, deleted #{res} users" 
end

task :clean_old_deleted_boards => :environment do
  User.schedule_for(:slow, :flush_old_versions)
  Worker.schedule(Flusher, :flush_resque_errors)
  Worker.schedule_for(:slow, Flusher, :flush_leftovers)
  puts "Cleaning old deleted boards..."
  count = DeletedBoard.flush_old_records
  JobStash.flush_old_records
  puts "done, #{count} deleted."
end

task :advance_goals => :environment do
  puts "Advancing goals..."
  count = UserGoal.advance_goals.count
  puts "done, #{count} advanced."
end

task :transcode_errored_records => :environment do
  puts "Transcoding records that didn't get properly transcoded"
  count = ButtonSound.schedule_missing_transcodings
  puts "done, #{count} scheduled"
end

task :expire_stale_supervisor_consent_requests => :environment do
  puts "Expiring stale supervisor consent requests..."
  count = SupervisorConsentExpirationWorker.perform
  puts "done, #{count} expired."
end

desc "Unified scheduler dispatch for Render cron job - runs all hourly tasks, daily tasks at 6 AM UTC"
task "scheduler:dispatch" => :environment do
  run_task = Proc.new do |name, &block|
    puts "  [#{name}] starting..."
    result = block.call
    puts "  [#{name}] done: #{result}"
  rescue => e
    puts "  [#{name}] ERROR: #{e.class}: #{e.message}"
    Rails.logger.error("[Scheduler] #{name} failed: #{e.class}: #{e.message}")
    Rails.logger.error("[Scheduler] #{e.backtrace&.first(5)&.join("\n")}")
  end

  hour = Time.now.utc.hour
  puts "[#{Time.now.utc.iso8601}] === Scheduler Dispatch (hour=#{hour} UTC) ==="

  # --- Hourly tasks (every run) ---
  puts "--- Hourly tasks ---"

  run_task.call("generate_log_summaries") do
    res = LogSession.generate_log_summaries
    "found #{res[:found]}, notified #{res[:notified]}"
  end

  run_task.call("push_remote_logs") do
    res = LogSession.push_logs_remotely
    Uploader.remote_remove_batch
    "updated #{res} logs"
  end

  run_task.call("check_for_log_mergers") do
    res = LogSession.check_possible_mergers
    "found #{res} possible logs"
  end

  run_task.call("advance_goals") do
    count = UserGoal.advance_goals.count
    "#{count} advanced"
  end

  # --- Daily tasks (run once at 6 AM UTC) ---
  if hour == 6
    puts "--- Daily tasks (6 AM UTC) ---"

    run_task.call("check_for_expiring_subscriptions") do
      res = User.check_for_subscription_updates
      User.schedule_for('slow', :check_for_subscription_updates)
      BoardContent.schedule_for('whenever', :link_clones, 1000)
      JSON.pretty_generate(res)
    end

    run_task.call("transcode_errored_records") do
      count = ButtonSound.schedule_missing_transcodings
      "#{count} scheduled"
    end

    run_task.call("flush_users") do
      res = Flusher.flush_deleted_users
      Utterance.clear_old_nonces
      "deleted #{res} users"
    end

    run_task.call("clean_old_deleted_boards") do
      User.schedule_for(:slow, :flush_old_versions)
      Worker.schedule(Flusher, :flush_resque_errors)
      Worker.schedule_for(:slow, Flusher, :flush_leftovers)
      count = DeletedBoard.flush_old_records
      JobStash.flush_old_records
      "#{count} deleted"
    end

    run_task.call("enforce_data_retention_policies") do
      require_relative '../data_policy_enforcer'
      count = DataPolicyEnforcer.enforce_retention!
      "#{count} stale sessions purged"
    end

    run_task.call("redact_old_ai_api_log_ips") do
      count = AiApiLog.redact_old_ip_addresses!
      "#{count} AI log IPs redacted"
    end

    # AiApiLog tiered retention (reconciled with docs/legal/DATA_RETENTION.md and
    # docs/legal/AI_DATA_FLOW_CLASSIFICATION.md section 6; keep these three surfaces
    # identical). Windows: 24 months general, 12 months rolling children (under-13),
    # up to 5 years EU-jurisdiction, up to 6 years HIPAA hard floor
    # (45 CFR 164.316(b)(2)). NOT a flat 24-month purge.
    #
    # ENFORCED here today:
    #   - EU 5-year purge (purge_old_eu_ai_api_logs below): scans jurisdiction = 'EU'
    #     rows, which the Art50 Phase 4 shared call-context helper stamps at the three
    #     AI call sites. CORRECTED 2026-08-25: this said the purge is "functional
    #     wherever Phase 4 is deployed (staged on staging; effective in production only
    #     after the Phase 4/5 prod deploy)". Phase 4 IS in production. The purge is
    #     WIRED but currently deletes NOTHING: the stamp writes 'EU' only for a
    #     confirmed :eu user, production has none, and the filter is
    #     created_at < 5.years.ago while the jurisdiction column dates from
    #     2026-06-21 -- so no row can match before ~2031-06. See
    #     docs/legal/2026-08-23_article-50-production-flag-verification.md.
    #   - 90-day IP redaction (redact_old_ai_api_log_ips above).
    #   - Row-lifecycle deletion when the owning account is deleted (Flusher cascade).
    #
    # DECIDED, NOT YET ENFORCED (no task here on purpose): the 24-month general and
    # 12-month children tiers. ai_api_logs carries no per-row child-subject or
    # HIPAA-covered marker (only jurisdiction / user_global_id / organization_global_id),
    # so a purge that safely carves out the 6-year HIPAA audit floor and the 12-month
    # children tier cannot be written without first stamping those classes at write
    # time (a schema + call-site change). A blanket 24-month delete is deliberately NOT
    # shipped because it would destroy HIPAA audit-floor rows early. Tracked in
    # docs/legal/DATA_RETENTION.md and AI_DATA_FLOW_CLASSIFICATION.md section 6.
    run_task.call("purge_old_eu_ai_api_logs") do
      count = AiApiLog.purge_old_eu_logs!
      "#{count} EU AI logs purged (5-year retention)"
    end

    run_task.call("expire_stale_supervisor_consent_requests") do
      count = SupervisorConsentExpirationWorker.perform
      "#{count} expired"
    end

    run_task.call("expire_offboarding_coppa_consents") do
      count = OffboardingCoppaExpirationWorker.perform
      "#{count} export-then-delete scheduled"
    end

    run_task.call("flush_expired_beta_feedback_recordings") do
      count = BetaFeedbackRecording.flush_expired
      "#{count} recordings deleted"
    end

    run_task.call("expire_licenses") do
      count = License.expire_stale_licenses!
      "#{count} licenses expired"
    end
  end

  puts "[#{Time.now.utc.iso8601}] === Scheduler Dispatch Complete ==="
end
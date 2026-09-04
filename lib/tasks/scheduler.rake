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
# Loaded HERE, not inside the task body. A LoadError raised mid-dispatch is a ScriptError, which
# would abort the whole run and skip every task queued after it; loaded at definition time it
# fails loudly before any task has run. The rescue below still covers ScriptError for anything
# that loads lazily deeper in a task.
require_relative '../data_policy_enforcer'
task "scheduler:dispatch" => :environment do
  # One task's failure must not skip the rest (that is why each is rescued), but the RUN must
  # still fail. Before this, every task could raise and the process still exited 0.
  #
  # WHAT THIS DOES AND DOES NOT BUY, stated precisely, because an earlier version of this
  # comment overclaimed it. It makes the Cloud Run Job EXECUTION go red. It does NOT make the
  # failure reach a human:
  #   * Cloud Scheduler's target is `...jobs/lingolinq-scheduler:run`, which returns a
  #     long-running Operation with HTTP 200 BEFORE the rake task runs. Scheduler reports
  #     success no matter what this process exits with. That half is not fixed here and
  #     cannot be fixed from this file.
  #   * As of 2026-09-03 lingolinq-prod has exactly one alert policy ("Cloud Armor ROLLBACK
  #     TRIGGER"). Nothing watches Cloud Run Job execution failure, and the Job runs
  #     maxRetries=0 with no catch-up.
  # So until a log-based alert on execution failure exists, this is exit-code HYGIENE, not a
  # control: a failed GDPR/FERPA/COPPA purge is now recorded rather than reported. Do not read
  # a quiet inbox as evidence the purges ran.
  #
  # Non-execution is a separate hole this does not close either: the daily block is gated on
  # `hour == 6`, so a missed or delayed 06:00 fire skips those purges with `failed` empty and
  # an exit 0. Closing that needs a per-task last-run timestamp and a staleness alert.
  failed = []
  run_task = Proc.new do |name, &block|
    puts "  [#{name}] starting..."
    result = block.call
    puts "  [#{name}] done: #{result}"
  # StandardError is not enough for the stated promise. A ScriptError (e.g. a LoadError from a
  # `require_relative` inside a task body) is NOT a StandardError, so a bare `rescue` would let
  # it escape the Proc and kill the dispatch, skipping every later task -- including
  # purge_old_eu_ai_api_logs and expire_offboarding_coppa_consents. SignalException and
  # SystemExit are deliberately NOT caught: those mean "stop now", and `abort` below is itself
  # a SystemExit.
  rescue StandardError, ScriptError => e
    failed << name
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
    # WIRED here today (per-item status below; the EU purge currently matches zero rows):
    #   - EU 5-year purge (purge_old_eu_ai_api_logs below): scans jurisdiction = 'EU'
    #     rows, which the Art50 Phase 4 shared call-context helper stamps at the three
    #     AI call sites. CORRECTED 2026-08-25: this said the purge is "functional
    #     wherever Phase 4 is deployed (staged on staging; effective in production only
    #     after the Phase 4/5 prod deploy)". Phase 4 IS in production. The purge is
    #     WIRED but currently deletes NOTHING: the stamp writes 'EU' only for a
    #     confirmed :eu user, production had none as of the 2026-08-23 audited read,
    #     and the filter is
    #     created_at < 5.years.ago while the jurisdiction column dates from
    #     2026-06-21 -- so a write-time-stamped row cannot match before ~2031-06
    #     (the ai_api_logs table itself dates from 2026-02-21, so ~2031-02 is the
    #     earliest conceivable match at all). This is an absence of eligible DATA,
    #     not a broken control: the mechanism is verified end to end by
    #     spec/models/ai_api_log_spec.rb:550-586, which drives a real EU user
    #     through EuJurisdiction.retention_stamp and sees the row purged while an
    #     :unknown row is spared. See
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

    # Reports the MODE alongside the count. Without it "0 export-then-delete
    # scheduled" is ambiguous between "nothing was due" and "the sweep is off",
    # which are opposite operational facts. Default is disabled -- see the header
    # of app/workers/offboarding_coppa_expiration_worker.rb for why.
    run_task.call("expire_offboarding_coppa_consents") do
      mode = OffboardingCoppaExpirationWorker.mode
      count = OffboardingCoppaExpirationWorker.perform
      "mode=#{mode}, #{count} export-then-delete scheduled"
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

  if failed.any?
    msg = "#{failed.size} scheduled task(s) FAILED: #{failed.join(', ')}"
    puts "[#{Time.now.utc.iso8601}] === Scheduler Dispatch FAILED: #{msg} ==="
    Rails.logger.error("[Scheduler] #{msg}")
    abort(msg)
  end
  puts "[#{Time.now.utc.iso8601}] === Scheduler Dispatch Complete ==="
end
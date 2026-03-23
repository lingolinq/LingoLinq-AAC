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
      count = DeletedBoard.flush_old_records
      JobStash.flush_old_records
      "#{count} deleted"
    end

    run_task.call("enforce_data_retention_policies") do
      require_relative '../data_policy_enforcer'
      count = DataPolicyEnforcer.enforce_retention!
      "#{count} stale sessions purged"
    end
  end

  puts "[#{Time.now.utc.iso8601}] === Scheduler Dispatch Complete ==="
end
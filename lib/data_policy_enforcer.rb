module DataPolicyEnforcer
  # Discrete, timestamped communication logs the retention window in
  # DATA_RETENTION.md ("Communication logs (LogSession)") applies to -- the
  # same set api/logs_controller.rb exposes as browsable per-event logs.
  # Deliberately excludes 'daily_use' and 'modeling_activities': those are
  # per-user singleton trackers (LogSession.find_or_create_by(log_type:,
  # user_id:)) whose started_at freezes at first creation and never advances
  # on later updates, so an age-based purge would delete a still-in-use
  # record for any long-tenured active user instead of a stale one.
  RETAINABLE_LOG_TYPES = %w[session note assessment eval profile journal].freeze

  def self.enforce_retention!
    count = 0
    Organization.where("data_policy_version > 0").find_each do |org|
      policy = org.effective_data_policy
      months = policy['retention_months']
      next unless months && months > 0

      cutoff = months.months.ago
      user_ids = org.sponsored_users.map(&:id)
      next if user_ids.empty?

      stale = LogSession.where(user_id: user_ids)
                        .where(log_type: RETAINABLE_LOG_TYPES)
                        .where('started_at < ?', cutoff)

      stale.find_each do |session|
        Flusher.flush_record(session)
        count += 1
      end
    end
    count
  end
end

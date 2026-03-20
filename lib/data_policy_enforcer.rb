module DataPolicyEnforcer
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
                        .where(log_type: 'session')
                        .where('started_at < ?', cutoff)

      stale.find_each do |session|
        Flusher.flush_record(session)
        count += 1
      end
    end
    count
  end
end

module DataPolicyEnforcer
  # Discrete, timestamped communication logs the retention window in
  # DATA_RETENTION.md ("Communication logs (LogSession)") applies to -- the
  # same set api/logs_controller.rb exposes as browsable per-event logs.
  # Deliberately excludes 'daily_use' and 'modeling_activities': those are
  # per-user singleton trackers (LogSession.find_or_create_by(log_type:,
  # user_id:)) whose started_at freezes at first creation and never advances
  # on later updates, so an age-based purge would delete a still-in-use
  # record for any long-tenured active user instead of a stale one.
  # Deliberately excludes 'profile': UserExtra#process_profile caches each
  # profile session's identifiable summary + global_id into
  # UserExtra.settings['recent_profiles'] and matching
  # UserLink.data['state']['profile_history'] (app/models/user_extra.rb:40-97),
  # and nothing refreshes those caches when the source LogSession is later
  # destroyed. Purging 'profile' logs here today would delete the source
  # record while leaving its identifiable summary behind in those caches --
  # tracked as a follow-up (LL-caf2528468) rather than shipped half-fixed.
  RETAINABLE_LOG_TYPES = %w[session note assessment eval journal].freeze

  # An organization may only purge sessions recorded SINCE ITS OWN SPONSORSHIP BEGAN.
  #
  # A communicator may be supported by more than one organization at a time, and
  # org.sponsored_users lists every student the organization sponsors regardless of who else
  # does. Before this bound, the query selected EVERY qualifying session those students had
  # ever recorded, so the organization with the shortest retention_months purged globally: a
  # clinic configured to one month deleted years of a district's classroom history, including
  # sessions recorded before that clinic had any relationship with the student. Flusher
  # destroys the row and purges its PaperTrail versions, so none of it is recoverable.
  #
  # The lower bound is the earliest point at which this organization's sponsorship can be
  # established: the org_user link's 'added' stamp, or the earliest granted_at among the seats
  # it has assigned to that student, whichever is earlier and available. Links created by the
  # pre-2026-09 claim path carry no 'added' stamp (UserLink.generate was called with only
  # {sponsored: true}), which is why the license fallback exists rather than being redundant.
  #
  # When NEITHER can be established the student is skipped and the skip is logged, because on
  # an irreversible deletion an unknown start date must not be read as "since the beginning of
  # time". That trades silent over-deletion for a visible retention gap, which is the right
  # direction for this operation but does mean the log needs watching.
  #
  # This iterates per student rather than issuing one query per organization. The job is
  # nightly and the bound is per student, so the extra queries are accepted deliberately.
  def self.sponsorship_started_at(org, user)
    stamps = []

    link = UserLink.links_for(org).detect do |l|
      l['type'] == 'org_user' && l['user_id'] == user.global_id
    end
    added = link && link['state'] && link['state']['added']
    if added
      parsed = (Time.parse(added) rescue nil)
      stamps << parsed if parsed
    end

    granted = License.where(organization_id: org.id, user_id: user.id).minimum(:granted_at)
    stamps << granted if granted

    stamps.compact.min
  end

  def self.enforce_retention!
    count = 0
    Organization.where("data_policy_version > 0").find_each do |org|
      policy = org.effective_data_policy
      months = policy['retention_months']
      next unless months && months > 0

      cutoff = months.months.ago

      org.sponsored_users.find_each do |user|
        started = sponsorship_started_at(org, user)
        if started.nil?
          Rails.logger.warn(
            "DataPolicyEnforcer: skipping retention purge for user #{user.global_id} under " \
            "org #{org.global_id}; no sponsorship start date could be established, so the " \
            "purge window cannot be bounded"
          )
          next
        end

        stale = LogSession.where(user_id: user.id)
                          .where(log_type: RETAINABLE_LOG_TYPES)
                          .where('started_at < ?', cutoff)
                          .where('started_at >= ?', started)

        stale.find_each do |session|
          Flusher.flush_record(session)
          count += 1
        end
      end
    end
    count
  end
end

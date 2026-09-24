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
  # Full ISO-8601 date and time. Deliberately stricter than Time.parse, which accepts
  # "01/02/03" and reads it as 2001-02-03. A stamp read EARLIER than the truth widens an
  # irreversible deletion, so an unrecognised format must fall through to the license fallback
  # (and from there to skipping) rather than be guessed at. update_subscription_organization
  # writes Time.now.iso8601, so a conforming value is the norm and a non-conforming one is
  # corruption.
  ISO8601_STAMP = /\A\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.freeze

  # Build the org_user 'added' stamps for a whole organization in ONE pass.
  #
  # Hoisted out of the per-student loop deliberately. UserLink.links_for(org) returns EVERY link
  # for the organization, not just org_user, and each call is a Redis GET plus a JSON.parse of the
  # whole blob followed by a linear scan. Called per student it made the nightly job O(students^2)
  # in parse and comparison work for one organization: a 10,000-student district meant 10,000
  # parses of a multi-megabyte blob. The scheduler aborts the run on failure, so a timeout here
  # takes the whole nightly dispatch down with it.
  def self.sponsorship_stamps_for(org)
    stamps = {}
    UserLink.links_for(org).each do |l|
      next unless l['type'] == 'org_user'

      stamps[l['user_id']] = l['state'] && l['state']['added']
    end
    stamps
  end

  def self.sponsorship_started_at(org, user, added)

    if added.is_a?(String) && added.match?(ISO8601_STAMP)
      parsed = (Time.parse(added) rescue nil)
      return parsed if parsed
    end

    # Fallback for links predating the 'added' stamp: the earliest seat this organization
    # CURRENTLY holds for the student.
    #
    # Scoped to status 'active', which the first version of this method omitted. A non-active
    # row that still carries user_id belongs to an ENDED sponsorship episode, so its granted_at
    # would extend the purge window backwards across the gap in which this organization had no
    # relationship with the student, and the purge is irreversible. Rows in that state are
    # reachable in practice: expire_stale_licenses! sets status before calling release_user!,
    # and scheduled dispatch was interrupted from 2026-07-21 to 2026-09-02 (LL-3e36a18199).
    #
    # The link stamp is preferred over this rather than taking the earlier of the two. Both are
    # legitimate readings of when sponsorship began, and on an irreversible deletion the
    # narrower one is the right default.
    License.where(organization_id: org.id, user_id: user.id, status: 'active')
           .minimum(:granted_at)
  end

  def self.enforce_retention!
    count = 0
    Organization.where("data_policy_version > 0").find_each do |org|
      policy = org.effective_data_policy
      months = policy['retention_months']
      next unless months && months > 0

      cutoff = months.months.ago

      stamps = sponsorship_stamps_for(org)

      org.sponsored_users.find_each do |user|
        started = sponsorship_started_at(org, user, stamps[user.global_id])
        if started.nil?
          Rails.logger.warn(
            "DataPolicyEnforcer: skipping retention purge for user #{user.global_id} under " \
            "org #{org.global_id}; no sponsorship start date could be established, so the " \
            "purge window cannot be bounded"
          )
          next
        end

        # A start date at or after the cutoff makes the two predicates contradictory, so the
        # purge silently does nothing and the nightly output is indistinguishable from "nothing
        # to purge". Reachable from a clock-skewed or regenerated 'added' stamp: the ISO-8601
        # gate accepts a well-formed future date. Warn rather than stay silent, because a
        # customer's contractual retention deletion never happening is the compliance-visible
        # half of failing safe.
        if started >= cutoff
          Rails.logger.warn(
            "DataPolicyEnforcer: retention purge window is empty for user #{user.global_id} " \
            "under org #{org.global_id}; sponsorship start #{started.iso8601} is at or after " \
            "the retention cutoff #{cutoff.iso8601}, so nothing can be purged"
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

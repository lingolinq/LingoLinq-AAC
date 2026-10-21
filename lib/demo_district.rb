# Keeps the Demo School District showing realistic recent activity.
#
# db/seeds.rb builds the district once, with 90 days of backdated usage, so on a long-lived
# environment the data ages out of every "recent" view. refresh! extends each demo
# communicator's history from their latest session through yesterday (America/Los_Angeles),
# so the first run backfills the gap and every later run adds one school day. It runs daily
# from scheduler:dispatch and by hand with `rake demo:refresh`.
#
# SAFETY: this writes synthetic records, so it only ever touches
#   * the organization explicitly flagged settings['demo_data'] == true (Organization settings
#     are secure_serialize'd, so the flag is checked in Ruby, never in SQL), and
#   * users in that organization whose email ends in @demoschooldistrict.org.
# Anyone else is skipped and logged. Every session written carries
# data['seed_marker'] = SEED_MARKER, and a user/day that already has one is skipped, so
# reruns are safe.
module DemoDistrict
  FLAG = 'demo_data'.freeze
  EMAIL_DOMAIN = '@demoschooldistrict.org'.freeze
  SEED_MARKER = 'DEMO_DISTRICT_ROLLING'.freeze
  # A communicator with no sessions at all starts this many days back, matching the seed.
  INITIAL_HISTORY_DAYS = 90
  # Upper bound on one run's backfill, so a long outage cannot turn into an unbounded write.
  MAX_BACKFILL_DAYS = 120
  # Each communicator's primary goal is tracked every 3 to 10 days (stable per user), always
  # inside the two-week window the Goals tile counts as "recently logged".
  GOAL_CADENCE_DAYS = (3..10).freeze

  class RefusedError < StandardError; end

  module_function

  def demo_email?(user)
    !!user && user.settings.is_a?(Hash) && user.settings['email'].to_s.strip.downcase.end_with?(EMAIL_DOMAIN)
  end

  def flagged?(org)
    !!org && !org.admin && org.settings.is_a?(Hash) && org.settings[FLAG] == true
  end

  # The one flagged organization, or nil when none is flagged. More than one is a
  # configuration error: refuse rather than guess.
  def demo_organization
    flagged = []
    Organization.find_each { |org| flagged << org if flagged?(org) }
    if flagged.length > 1
      raise RefusedError, "#{flagged.length} organizations are flagged #{FLAG}; expected exactly one (#{flagged.map(&:global_id).join(', ')})"
    end
    flagged.first
  end

  # One-off: set the flag on the non-admin organization whose name matches exactly.
  # Refuses unless exactly one organization matches and no other organization is flagged.
  def flag_organization!(name)
    matches = []
    Organization.where(admin: [false, nil]).find_each { |org| matches << org if (org.settings || {})['name'] == name }
    raise RefusedError, "expected exactly one organization named #{name.inspect}, found #{matches.length}" unless matches.length == 1
    org = matches.first
    existing = demo_organization
    if existing && existing.id != org.id
      raise RefusedError, "organization #{existing.global_id} is already flagged #{FLAG}"
    end
    org.settings[FLAG] = true
    org.save!
    log("flagged #{org.global_id} (#{name}) as #{FLAG}")
    org
  end

  # Extends the flagged organization's demo activity through yesterday. Pass organization:
  # to target one explicitly; it is refused unless it carries the flag. With no flagged
  # organization (most non-production environments) this logs and does nothing.
  def refresh!(organization: nil, now: Time.now)
    org = organization
    if org
      raise RefusedError, "organization #{org.global_id} is not flagged #{FLAG}; refusing to write demo data" unless flagged?(org)
    else
      org = demo_organization
      unless org
        log("no organization flagged #{FLAG}; nothing to do")
        return { skipped_org: true }
      end
    end

    tz = UsageGenerator.time_zone
    yesterday = now.in_time_zone(tz).to_date - 1
    result = {
      organization: org.global_id, through: yesterday.iso8601, communicators: 0,
      sessions_created: 0, summaries_updated: 0, goals_tracked: 0, profiles_refreshed: 0,
      skipped_users: []
    }

    communicators = org.approved_users(false)
    communicators.each do |user|
      unless demo_email?(user)
        skip_user(result, user, 'communicator email is not @demoschooldistrict.org')
        next
      end
      refresh_communicator(org, user, yesterday, result)
    end

    supervisors = org.supervisors.to_a.select do |user|
      next true if demo_email?(user)
      skip_user(result, user, 'supervisor email is not @demoschooldistrict.org')
      false
    end
    demo_communicators = communicators.select { |u| demo_email?(u) }
    result[:profiles_refreshed] += refresh_profiles(org, 'communicator', demo_communicators, now)
    result[:profiles_refreshed] += refresh_profiles(org, 'supervisor', supervisors, now)

    log("refreshed #{org.global_id} through #{yesterday}: #{result.except(:skipped_users).inspect}, skipped #{result[:skipped_users].length}")
    result
  end

  def refresh_communicator(org, user, yesterday, result)
    tz = UsageGenerator.time_zone
    sessions = LogSession.where(user_id: user.id, log_type: 'session')
    latest = sessions.order('started_at DESC').where('started_at IS NOT NULL').first

    start_date = latest ? latest.started_at.in_time_zone(tz).to_date + 1 : yesterday - (INITIAL_HISTORY_DAYS - 1)
    start_date = [start_date, yesterday - (MAX_BACKFILL_DAYS - 1)].max
    return if start_date > yesterday

    board = board_for(user, latest)
    unless board
      skip_user(result, user, 'no board to log against')
      return
    end

    # A day that already holds a rolling session is done (or was partly done by an
    # interrupted run): skip it either way.
    marked_days = sessions.where('started_at >= ?', tz.local(start_date.year, start_date.month, start_date.day))
                          .select { |s| (s.data || {})['seed_marker'] == SEED_MARKER }
                          .map { |s| s.started_at.in_time_zone(tz).to_date }
                          .to_set

    index, profile = UsageGenerator.profile_for(user)
    generator = UsageGenerator.new(
      student: user, profile: profile, index: index, author: author_for(org, user, latest),
      board: board, device: UsageGenerator.ensure_device!(user, profile, index),
      seed_marker: SEED_MARKER
    )

    # Summaries are rebuilt a week at a time as the loop leaves each week, so a run that is
    # killed part way (the one-off backfill is long) leaves every finished week reportable.
    # The week of the latest existing session is rebuilt too: an interrupted earlier run may
    # have written sessions there without reaching its summary, and the next run starts
    # after that session, so this is the only chance to catch it.
    pending_weeks = Set.new
    pending_weeks << weekyear_for(latest.started_at) if latest
    latest_created_at = nil
    (start_date..yesterday).each do |date|
      next if marked_days.include?(date)
      made = generator.generate_day(date)
      result[:sessions_created] += made.length
      made.each do |s|
        pending_weeks << weekyear_for(s.started_at)
        latest_created_at = [latest_created_at, s.started_at].compact.max
      end
      if date == yesterday || weekyear_for(date + 1) != weekyear_for(date)
        flush_summaries(user, pending_weeks, result) if latest_created_at
      end
    end
    result[:communicators] += 1
    return unless latest_created_at

    result[:goals_tracked] += 1 if track_goal(user, latest_created_at)
  end

  def weekyear_for(time_or_date)
    date = time_or_date.is_a?(Date) ? time_or_date : time_or_date.utc.to_date
    WeeklyStatsSummary.date_to_weekyear(date)
  end

  def flush_summaries(user, weekyears, result)
    weekyears.to_a.sort.each do |weekyear|
      begin
        WeeklyStatsSummary.update_now(user.id, weekyear)
        result[:summaries_updated] += 1
      rescue => e
        log("WARN #{user.user_name} weekyear #{weekyear}: #{e.class}: #{e.message}")
      end
    end
    weekyears.clear
  end

  # Bump primary_goal last_tracked when the user's goal is due on their cadence. Users with
  # no primary goal are left alone.
  def track_goal(user, latest_session_at)
    user.reload
    goal = user.settings['primary_goal']
    return false unless goal.is_a?(Hash) && goal['id']
    cadence = GOAL_CADENCE_DAYS.min + (user.id.to_i % GOAL_CADENCE_DAYS.size)
    last = goal['last_tracked'].present? ? (Time.zone.parse(goal['last_tracked'].to_s) rescue nil) : nil
    return false if last && last > latest_session_at - cadence.days
    user.update_setting({ 'primary_goal' => { 'last_tracked' => latest_session_at.utc.iso8601 } })
    true
  end

  # Keep each user's recent_profiles for the org's configured profile counting on the
  # Profiles tile. The org stats endpoint reads only the LAST entry (profs[-1]) against the
  # frequency window, while the list is stored newest first, so two things are maintained:
  #   * once the newest entry is half a frequency old, a new entry is prepended. It repeats
  #     the newest real one with a fresh 'added', so it still points at a real profile session.
  #   * entries within a week (or a quarter frequency, if shorter) of leaving the window are
  #     dropped before they do, so the tail the stats endpoint reads never goes stale between
  #     refreshes while the daily run keeps going.
  # Users with no profile history are left alone.
  def refresh_profiles(org, type, users, now)
    settings = org.settings["#{type}_profile"]
    return 0 unless settings.is_a?(Hash)
    profile_id = settings['profile_id']
    profile_id = ProfileTemplate.default_profile_id(type) if profile_id == 'default'
    return 0 if profile_id.blank? || %w[none blank].include?(profile_id)
    frequency = org.profile_frequency(type).to_i
    return 0 unless frequency > 0
    expiring_cutoff = (now - frequency + [7.days.to_i, frequency / 4].min).to_i

    refreshed = 0
    users.each do |user|
      extra = UserExtra.find_by(user_id: user.id)
      recents = extra && (extra.settings['recent_profiles'] || {})[profile_id]
      next if recents.blank?
      newest = recents.max_by { |r| r['added'].to_i }
      due = newest['added'].to_i <= (now - (frequency / 2)).to_i
      kept = recents.select { |r| r['added'].to_i > expiring_cutoff }
      next unless due || kept.length < recents.length

      if due || kept.empty?
        added = school_time_on(last_weekday_before(now), user).to_i
        entry = newest.merge('added' => added)
        entry['expected'] = added + frequency if newest.key?('expected')
        kept = [entry] + kept
      end
      extra.settings['recent_profiles'][profile_id] = kept.first(10)
      extra.save!
      refreshed += 1
    end
    refreshed
  end

  # Board reference from the user's latest session, falling back to their home board.
  def board_for(user, latest)
    events = ((latest&.data || {})['events'] || [])
    board = events.map { |e| e['type'] == 'button' && e.dig('button', 'board') }.detect { |b| b.is_a?(Hash) && b['id'] }
    return board.slice('id', 'key') if board
    home = (user.settings['preferences'] || {})['home_board']
    return home.slice('id', 'key') if home.is_a?(Hash) && home['id']
    nil
  end

  # The supervisor who authored their latest session (the seed uses the classroom SLP),
  # else any demo supervisor of theirs, else the communicator themselves.
  def author_for(org, user, latest)
    author = latest&.author
    return author if author && author.id != user.id && demo_email?(author)
    supervisor = user.supervisors.detect { |s| demo_email?(s) && org.supervisor?(s) }
    supervisor || user
  end

  def last_weekday_before(now)
    date = now.in_time_zone(UsageGenerator.time_zone).to_date - 1
    date -= 1 while date.saturday? || date.sunday?
    date
  end

  def school_time_on(date, user)
    UsageGenerator.time_zone.local(date.year, date.month, date.day,
                                   UsageGenerator::FIRST_HOUR + (user.id.to_i % UsageGenerator::HOUR_SPAN), 30, 0)
  end

  def skip_user(result, user, reason)
    result[:skipped_users] << user.user_name
    log("SKIP #{user.user_name}: #{reason}")
  end

  def log(msg)
    Rails.logger.info("[DemoDistrict] #{msg}")
    puts "[DemoDistrict] #{msg}" unless Rails.env.test?
  end
end

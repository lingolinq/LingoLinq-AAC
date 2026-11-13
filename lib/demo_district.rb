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
  # Set on the last session of each finished day, so a rerun can tell a day that a killed
  # process left half written from one that is done.
  DAY_COMPLETE = 'seed_day_complete'.freeze
  # A communicator with no sessions at all starts this many days back, matching the seed.
  INITIAL_HISTORY_DAYS = 90
  # Upper bound on one run's backfill, so a long outage cannot turn into an unbounded write.
  MAX_BACKFILL_DAYS = 120
  # Each communicator's primary goal is tracked every 3 to 10 days (stable per user), always
  # inside the two-week window the Goals tile counts as "recently logged".
  GOAL_CADENCE_DAYS = (3..10).freeze
  # The primary goal refresh! gives a demo communicator who has none, by skill.
  GOAL_SUMMARIES = {
    beginner: "Use core words to ask for more, help and all done",
    intermediate: "Combine two core words to make requests and comments",
    advanced: "Build three-word sentences that include a verb"
  }.freeze
  # Goal status (1 to 4) on each check-in note, drawn by skill so the room's weekly goal
  # faces vary between students.
  GOAL_STATUSES = { beginner: [1, 2, 2, 3], intermediate: [2, 2, 3, 4], advanced: [2, 3, 4, 4] }.freeze
  # Supervisor daily activity (rooms read it) is rebuilt for at least this many recent days
  # on every run, so a day a failed run missed is filled in by a later one.
  SUPERVISOR_DAYS_WINDOW = 14
  # Supporter minutes counted for each session they authored, for the activity level.
  SUPERVISOR_MINUTES_PER_SESSION = 3
  # Postgres advisory lock ("DEMO") held by refresh!, create_district! and flag_organization!,
  # so two runs never interleave.
  LOCK_KEY = 0x44454D4F
  # The Cloud Run jobs create_district! may run in. Every deployed environment runs
  # RAILS_ENV=production, so only the job name (CLOUD_RUN_JOB, which Cloud Run sets and does
  # not let a job override) tells nonprod from production. Job names are unique only within a
  # project: never create a job with one of these names in lingolinq-prod.
  NONPROD_JOBS = %w[lingolinq-migrate-dev lingolinq-migrate-staging].freeze

  class RefusedError < StandardError; end
  # Another run holds LOCK_KEY.
  class BusyError < RefusedError; end
  # Raised at the end of a refresh that could not finish some user's sessions or summaries,
  # after every other user has been processed, so the scheduler run is recorded as failed.
  class RefreshError < StandardError; end

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
    with_write_lock do
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
  end

  # Runs the block holding LOCK_KEY, taken and released on one connection (a session-level
  # lock belongs to the session that took it). Raises BusyError when another session holds
  # it. A failed release is logged, never raised, so it cannot hide the block's own error.
  def with_write_lock
    ActiveRecord::Base.connection_pool.with_connection do |conn|
      raise BusyError, "another demo run is in progress" unless conn.select_value("SELECT pg_try_advisory_lock(#{LOCK_KEY})")
      begin
        yield
      ensure
        begin
          log("WARN the demo lock was not held at release") unless conn.select_value("SELECT pg_advisory_unlock(#{LOCK_KEY})")
        rescue => e
          log("WARN could not release the demo lock: #{e.class}: #{e.message}")
        end
      end
    end
  end

  # One-off: build a fresh, flagged Demo School District (lib/demo_district/seeder.rb) for an
  # environment whose existing demo org has no synthetic users, such as nonprod's "Demo".
  # Run refresh!(organization: org) afterwards to give it 90 days of history.
  #
  # It creates, and never adopts: it refuses if any organization is already flagged, if one
  # is already named Seeder::ORG_NAME, or if any of the district's user names is taken,
  # because an existing account with one of those names may be a real person. The checks and
  # the build run under LOCK_KEY, and Seeder.build! (adopt: false) refuses an account or
  # board that appears after the checks. The new organization is admin nil, not false:
  # organizations.admin is uniquely indexed and the existing demo org may already hold false.
  # It runs only in a NONPROD_JOBS job (and in specs).
  def create_district!(password:)
    unless Rails.env.test? || NONPROD_JOBS.include?(ENV['CLOUD_RUN_JOB'])
      raise RefusedError, "create_district! runs only in a nonprod migrate job (#{NONPROD_JOBS.join(', ')}); this is #{ENV['CLOUD_RUN_JOB'].inspect}"
    end
    raise RefusedError, "a password for the demo accounts is required" if password.to_s.strip.empty?
    if password.to_s.length < Passwords::MIN_PASSWORD_LENGTH
      raise RefusedError, "the demo account password must be at least #{Passwords::MIN_PASSWORD_LENGTH} characters"
    end
    with_write_lock do
      existing = demo_organization
      raise RefusedError, "organization #{existing.global_id} is already flagged #{FLAG}" if existing
      named = []
      Organization.find_each { |org| named << org if (org.settings || {})['name'] == Seeder::ORG_NAME }
      if named.any?
        raise RefusedError, "an organization named #{Seeder::ORG_NAME.inspect} already exists (#{named.map(&:global_id).join(', ')})"
      end
      taken = User.where(user_name: Seeder.user_names).pluck(:user_name)
      raise RefusedError, "user names already taken: #{taken.sort.join(', ')}" if taken.any?
      # A fresh district must not adopt a board it does not own.
      raise RefusedError, "a board with key #{Seeder.board_key.inspect} already exists" if Board.where(key: Seeder.board_key).exists?

      # No surrounding transaction, matching db/seeds.rb: user and board saves schedule
      # background jobs that a worker could pick up before an outer transaction committed.
      # The flag goes on only once the build has finished, so a run stopped part way (an
      # error, or a job timeout or kill that no rescue sees) leaves an organization refresh!
      # ignores; a rerun refuses until it is removed.
      org = Organization.new
      org.settings = Seeder.org_settings.except(FLAG)
      org.admin = nil
      org.save!
      begin
        district = Seeder.build!(org, password: password, adopt: false, log: ->(msg) { log(msg.strip) })
        board_ref = { 'id' => district[:board].global_id, 'key' => district[:board].key }
        district[:students].each do |entry|
          # add_user saved the student's settings through another copy; start from those.
          student = entry[:user].reload
          Seeder.prepare_student!(student)
          # A brand-new student has no session for refresh! to take a board from, so give
          # them the district board as their home board. Reports aggregate only with
          # allow_log_reports on (db/seeds.rb sets it after generating usage).
          student.settings['preferences']['home_board'] = board_ref
          student.settings['preferences']['allow_log_reports'] = true
          student.save!
        end
        # Link each room's SLP to its students now rather than waiting for the job adding them
        # scheduled: refresh! picks a session's author (who models) from the student's
        # supervisors, and a backfill run straight after this would otherwise find none.
        district[:units].each { |unit| unit.reload.assert_supervision! }
      rescue => e
        log("FAILED building #{org.global_id} part way, left unflagged: #{e.class}: #{e.message}")
        raise
      end
      org.reload
      org.settings[FLAG] = true
      org.save!
      log("created #{org.global_id} (#{Seeder::ORG_NAME}), flagged #{FLAG}")
      org
    end
  end


  # One-off for environments whose demo accounts were created before Seeder.build! turned
  # their email off: runs Seeder.disable_email! on every seeded demo user name and on every
  # member of the flagged organization (it acts only on @demoschooldistrict.org accounts).
  # refresh! repeats it for the flagged organization's members every day. Safe to rerun.
  # Returns the number of accounts changed.
  def disable_demo_emails!
    users = User.where(user_name: Seeder.user_names).to_a
    org = demo_organization
    users += org_members(org) if org
    changed, problems = turn_email_off(users)
    problems.each { |name, status| log("#{name}: email not turned off (#{status})") }
    log("email turned off for #{changed} demo account(s)")
    changed
  end

  def org_members(org)
    org.approved_users(false).to_a + org.supervisors.to_a + org.managers.to_a
  end

  # Seeder.disable_email! on each account, reloaded just before it is written so
  # Processable#update_setting does not refuse a stale copy. Returns the number changed and
  # { user_name => status } for each change that was queued (:pending, applied later by its
  # job) or :failed.
  def turn_email_off(users)
    changed = 0
    problems = {}
    users.uniq(&:id).each do |user|
      # One member that cannot be loaded or saved (deleted mid-run) must not stop the others.
      status = begin
        Seeder.disable_email!(user.reload)
      rescue => e
        log("#{user.user_name}: turning email off failed: #{e.class}: #{e.message}")
        :failed
      end
      changed += 1 if status == :disabled
      problems[user.user_name] = status if %i[pending failed].include?(status)
    end
    [changed, problems]
  end

  # Extends the flagged organization's demo activity through yesterday. Pass organization:
  # to target one explicitly; it is refused unless it carries the flag. With no flagged
  # organization (most non-production environments) this logs and does nothing. While
  # another run holds LOCK_KEY it does nothing and returns { skipped_busy: true }.
  def refresh!(organization: nil, now: Time.now)
    with_write_lock { refresh_locked!(organization, now) }
  rescue BusyError => e
    log("#{e.message}; skipping this run")
    { skipped_busy: true }
  end

  def refresh_locked!(organization, now)
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

    yesterday = last_school_day_ended(now)
    result = {
      organization: org.global_id, through: yesterday.iso8601, communicators: 0,
      sessions_created: 0, summaries_updated: 0, goals_tracked: 0, goals_created: 0, goal_notes: 0,
      supervisor_days: 0, profiles_refreshed: 0, emails_turned_off: 0, skipped_users: [], failures: []
    }
    # author id => dates this run wrote sessions or notes for, so their daily activity is rebuilt
    touched = Hash.new { |h, k| h[k] = Set.new }

    # Demo accounts added since the district was built get their email turned off too.
    result[:emails_turned_off], email_problems = turn_email_off(org_members(org))
    email_problems.each do |name, status|
      if status == :failed
        result[:failures] << "#{name} email not turned off"
      else
        log("#{name}: turning email off was queued (#{status})")
      end
    end

    communicators = org.approved_users(false)
    communicators.each do |user|
      unless demo_email?(user)
        skip_user(result, user, 'communicator email is not @demoschooldistrict.org')
        next
      end
      refresh_communicator(org, user, yesterday, result, touched)
    end
    demo_communicators = communicators.select { |u| demo_email?(u) }
    demo_ids = demo_communicators.map(&:id)

    supervisors = org.supervisors.to_a.select do |user|
      next true if demo_email?(user)
      skip_user(result, user, 'supervisor email is not @demoschooldistrict.org')
      false
    end
    recent = ((yesterday - (SUPERVISOR_DAYS_WINDOW - 1))..yesterday).to_a
    supervisors.each do |sup|
      begin
        dates = touched[sup.id] + recent + unrecorded_supervisor_days(sup, yesterday, demo_ids)
        result[:supervisor_days] += record_supervisor_days!(sup, dates, communicator_ids: demo_ids)
      rescue => e
        result[:failures] << "#{sup.user_name} daily activity: #{e.class}: #{e.message}"
      end
    end
    result[:profiles_refreshed] += refresh_profiles(org, 'communicator', demo_communicators, now)
    result[:profiles_refreshed] += refresh_profiles(org, 'supervisor', supervisors, now)

    log("refreshed #{org.global_id} through #{yesterday}: #{result.except(:skipped_users, :failures).inspect}, skipped #{result[:skipped_users].length}")
    if result[:failures].any?
      result[:failures].each { |f| log("FAILED #{f}") }
      raise RefreshError, "#{result[:failures].length} failure(s): #{result[:failures].first(5).join('; ')}"
    end
    result
  end

  def refresh_communicator(org, user, yesterday, result, touched = Hash.new { |h, k| h[k] = Set.new })
    tz = UsageGenerator.time_zone
    sessions = LogSession.where(user_id: user.id, log_type: 'session')
    latest = sessions.order('started_at DESC').where('started_at IS NOT NULL').first
    latest = discard_unfinished_day(user, sessions, latest, tz) if latest

    start_date = latest ? latest.started_at.in_time_zone(tz).to_date + 1 : yesterday - (INITIAL_HISTORY_DAYS - 1)
    start_date = [start_date, yesterday - (MAX_BACKFILL_DAYS - 1)].max
    if start_date > yesterday
      # Already caught up. Still rebuild the latest week: a run killed after its last
      # session but before that week's summary would otherwise leave Reports stale until
      # the next school day adds a session.
      if latest
        weeks = Set[weekyear_for(latest.started_at)]
        flush_summaries(user, weeks, result)
        result[:failures] << "#{user.user_name} weekly summaries #{weeks.to_a.join(', ')}" if weeks.any?
        # Catches up goal notes a killed earlier run did not reach.
        write_goal_notes(user, author_for(org, user, latest), yesterday, result, touched)
      end
      return
    end

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
      if generator.errors.any?
        # Stop at a failed day so the next run, which starts after the latest saved
        # session, retries it instead of leaving a permanent gap. Remove the day's partial
        # sessions first: left in place they would move that cursor past the failed day.
        made.each(&:destroy)
        failed_date, message = generator.errors.first
        result[:failures] << "#{user.user_name} sessions on #{failed_date}: #{message}"
        flush_summaries(user, pending_weeks, result)
        break
      end
      if made.any? && !mark_day_complete(made.last)
        # Without the mark the next run would discard the day anyway; do it now and retry.
        made.each(&:destroy)
        result[:failures] << "#{user.user_name} sessions on #{date}: could not mark the day complete"
        flush_summaries(user, pending_weeks, result)
        break
      end
      result[:sessions_created] += made.length
      made.each do |s|
        pending_weeks << weekyear_for(s.started_at)
        latest_created_at = [latest_created_at, s.started_at].compact.max
      end
      touched[generator.author.id] << date if made.any?
      if date == yesterday || weekyear_for(date + 1) != weekyear_for(date)
        flush_summaries(user, pending_weeks, result)
      end
    end
    result[:communicators] += 1
    if pending_weeks.any?
      result[:failures] << "#{user.user_name} weekly summaries #{pending_weeks.to_a.sort.join(', ')}"
    end
    write_goal_notes(user, generator.author, yesterday, result, touched)
    return unless latest_created_at

    result[:goals_tracked] += 1 if track_goal(user, latest_created_at)
  end

  # Gives a demo communicator with no primary goal one (authored by their SLP), then logs a
  # goal check-in note on the user's cadence across the days since the goal's latest note
  # that hold sessions. Working from what is stored, not from what this run wrote, means a
  # run killed before reaching a user's notes is caught up by the next one. The notes are
  # what the room's weekly goal faces and the Goals tile read, and saving one is how the app
  # itself moves primary_goal last_tracked. A user whose primary goal is not a real active
  # goal of theirs keeps the plain last_tracked bump in track_goal.
  def write_goal_notes(user, author, yesterday, result, touched)
    return if author.nil? || author.id == user.id || !demo_email?(author)
    user.reload
    if user.settings['primary_goal'].blank?
      _, profile = UsageGenerator.profile_for(user)
      created = UserGoal.process_new({
        'summary' => GOAL_SUMMARIES[profile[:skill]] || GOAL_SUMMARIES[:intermediate],
        'active' => true,
        'primary' => true
      }, { user: user, author: author })
      unless created.persisted?
        result[:failures] << "#{user.user_name} primary goal: #{created.processing_errors.join(', ').presence || 'not saved'}"
        return
      end
      result[:goals_created] += 1
      user.reload
    end
    goal = UserGoal.find_by_global_id((user.settings['primary_goal'] || {})['id'])
    return unless goal && goal.user_id == user.id && goal.active

    tz = UsageGenerator.time_zone
    # user_id first, so the (user_id, goal_id) index serves this.
    last_note = LogSession.where(user_id: user.id, goal_id: goal.id, log_type: 'note').where('started_at IS NOT NULL').order('started_at DESC').first
    last_date = last_note && last_note.started_at.in_time_zone(tz).to_date
    from = last_date ? last_date + 1 : yesterday - (MAX_BACKFILL_DAYS - 1)
    return if from > yesterday
    # Each day since then that holds sessions, and when its last one ended.
    day_ends = {}
    LogSession.where(user_id: user.id, log_type: 'session',
                     started_at: tz.local(from.year, from.month, from.day)..tz.local(yesterday.year, yesterday.month, yesterday.day).end_of_day)
              .pluck(:started_at, :ended_at).each do |started, ended|
      date = started.in_time_zone(tz).to_date
      day_ends[date] = [day_ends[date], ended || started].compact.max
    end
    cadence = GOAL_CADENCE_DAYS.min + (user.id.to_i % GOAL_CADENCE_DAYS.size)
    _, profile = UsageGenerator.profile_for(user)
    statuses = GOAL_STATUSES[profile[:skill]] || GOAL_STATUSES[:intermediate]
    device = UsageGenerator.ensure_supervisor_device!(author)
    day_ends.keys.sort.each do |date|
      next if last_date && date < last_date + cadence
      at = day_ends[date] + 5.minutes
      note = LogSession.process_new({
        'note' => { 'text' => "Goal check-in: #{goal.summary}", 'timestamp' => at.to_i },
        'goal_id' => goal.global_id,
        'goal_status' => statuses.sample
      }, { user: user, author: author, device: device })
      unless note.persisted?
        result[:failures] << "#{user.user_name} goal note on #{date}: not saved"
        return
      end
      note.data['seed_marker'] = SEED_MARKER
      note.save!
      # update_usage normally runs later on the slow queue; run it now so the Goals tile
      # does not wait on a worker.
      goal.reload.update_usage(note.ended_at.iso8601)
      result[:goal_notes] += 1
      touched[author.id] << date
      last_date = date
    end
  rescue => e
    result[:failures] << "#{user.user_name} goal notes: #{e.class}: #{e.message}"
  end

  # Dates within the backfill horizon on which the supervisor authored sessions or notes for
  # one of communicator_ids (the flagged organization's demo communicators) but their
  # daily_use log has no entry, such as days a killed run wrote but never recorded. Reads only
  # started_at and the one daily_use row, so it is cheap to run every day.
  def unrecorded_supervisor_days(supervisor, yesterday, communicator_ids)
    tz = UsageGenerator.time_zone
    from = yesterday - (MAX_BACKFILL_DAYS - 1)
    authored = LogSession.where(author_id: supervisor.id, user_id: communicator_ids, log_type: %w[session note])
                         .where.not(user_id: supervisor.id)
                         .where(started_at: tz.local(from.year, from.month, from.day)..tz.local(yesterday.year, yesterday.month, yesterday.day).end_of_day)
                         .pluck(:started_at).map { |t| t.in_time_zone(tz).to_date }.uniq
    daily = LogSession.find_by(log_type: 'daily_use', user_id: supervisor.id)
    recorded = ((daily && daily.data && daily.data['days']) || {}).keys
    authored.reject { |date| recorded.include?(date.iso8601) }
  end

  # Rebuilds a supervisor's daily activity (the 'daily_use' log the app keeps for each
  # supporter, which a room reads for its supervisor rows and modeled words) for each date
  # from the sessions they authored and the notes they wrote that day for communicator_ids
  # (the demo communicators, so nobody else's words reach a demo room), so a rerun gives the
  # same answer. Shape and activity levels follow the app's own track_daily_use
  # (app/frontend/app/services/stashes.js). Returns the number of days written.
  def record_supervisor_days!(supervisor, dates, communicator_ids:)
    tz = UsageGenerator.time_zone
    gid = supervisor.global_id
    days = dates.to_a.uniq.sort.filter_map do |date|
      range = tz.local(date.year, date.month, date.day)..tz.local(date.year, date.month, date.day).end_of_day
      authored = LogSession.where(author_id: supervisor.id, user_id: communicator_ids, started_at: range).where.not(user_id: supervisor.id)
      sessions = authored.where(log_type: 'session').to_a
      notes = authored.where(log_type: 'note').count
      next if sessions.empty? && notes == 0
      models = 0
      modeled = []
      seconds = 0
      sessions.each do |s|
        stats = (s.data || {})['stats'] || {}
        models += ((stats['modeling_user_ids'] || {})[gid]).to_i
        (stats['modeled_word_counts'] || {}).each { |word, count| modeled.concat(Array.new(count.to_i) { word }) }
        # Generated sessions last seconds; a supporter's time with the student around one is
        # longer, so count each as at least SUPERVISOR_MINUTES_PER_SESSION.
        seconds += [stats['session_seconds'].to_i, SUPERVISOR_MINUTES_PER_SESSION * 60].max
      end
      minutes = seconds / 60.0 + notes * 2
      level = if minutes >= 60 then 5 elsif minutes >= 30 then 4 elsif minutes >= 15 then 3 elsif minutes >= 5 then 2 elsif minutes > 0 then 1 else 0 end
      day = { 'date' => date.iso8601, 'activity_level' => level, 'active' => minutes >= 30, 'models' => models, 'modeled' => modeled }
      day['notes'] = notes if notes > 0
      day
    end
    return 0 if days.empty?
    LogSession.process_daily_use({ 'events' => days }, { author: supervisor, device: UsageGenerator.ensure_supervisor_device!(supervisor) })
    days.length
  end

  # A process killed part way through a day leaves some of its sessions behind with no
  # exception handler to clean them up. Only the latest day can be in that state (days are
  # written in order), so if it holds rolling sessions but none carries the completion mark,
  # remove them and return the new latest session so the run redoes that day in full.
  def discard_unfinished_day(user, sessions, latest, tz)
    return latest unless (latest.data || {})['seed_marker'] == SEED_MARKER
    date = latest.started_at.in_time_zone(tz).to_date
    day = sessions.where(started_at: tz.local(date.year, date.month, date.day)..tz.local(date.year, date.month, date.day).end_of_day)
                  .select { |s| (s.data || {})['seed_marker'] == SEED_MARKER }
    return latest if day.any? { |s| s.data[DAY_COMPLETE] }
    notes = LogSession.where(user_id: user.id, log_type: 'note', started_at: tz.local(date.year, date.month, date.day)..tz.local(date.year, date.month, date.day).end_of_day)
                      .select { |s| (s.data || {})['seed_marker'] == SEED_MARKER }
    log("#{user.user_name}: discarding #{day.length} session(s) and #{notes.length} goal note(s) from unfinished day #{date}")
    day.each(&:destroy)
    notes.each(&:destroy)
    sessions.order('started_at DESC').where('started_at IS NOT NULL').first
  end

  def mark_day_complete(session)
    session.data[DAY_COMPLETE] = true
    session.save!
    true
  rescue => e
    log("WARN could not mark #{session.global_id} complete: #{e.class}: #{e.message}")
    false
  end

  def weekyear_for(time_or_date)
    date = time_or_date.is_a?(Date) ? time_or_date : time_or_date.utc.to_date
    WeeklyStatsSummary.date_to_weekyear(date)
  end

  # Rebuilds each week and removes it from the set. A week that fails stays in the set, so
  # the next flush retries it and refresh_communicator reports whatever is still left.
  def flush_summaries(user, weekyears, result)
    weekyears.to_a.sort.each do |weekyear|
      begin
        WeeklyStatsSummary.update_now(user.id, weekyear)
        result[:summaries_updated] += 1
        weekyears.delete(weekyear)
      rescue => e
        log("WARN #{user.user_name} weekyear #{weekyear}: #{e.class}: #{e.message}")
      end
    end
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
    # The literal configured id, because that is the bucket the org stats endpoint reads
    # (organizations_controller#stats). For 'default' that bucket is never written by
    # UserExtra#process_profile, so those users are skipped below as having no history.
    profile_id = settings['profile_id']
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
    return author if author && author.id != user.id && demo_email?(author) && org.supervisor?(author)
    supervisor = user.supervisors.detect { |s| demo_email?(s) && org.supervisor?(s) }
    supervisor || user
  end

  # "Yesterday" means the latest LA date whose school window (8am to 3pm) has closed. The
  # scheduler runs at 06:00 UTC, which is still the previous evening in Los Angeles, so a
  # plain LA date - 1 would always lag a school day.
  def last_school_day_ended(now)
    local = now.in_time_zone(UsageGenerator.time_zone)
    school_out = UsageGenerator::FIRST_HOUR + UsageGenerator::HOUR_SPAN
    local.hour >= school_out ? local.to_date : local.to_date - 1
  end

  def last_weekday_before(now)
    date = last_school_day_ended(now)
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

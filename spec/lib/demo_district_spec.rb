require 'spec_helper'

describe DemoDistrict do
  include ActiveSupport::Testing::TimeHelpers

  # Wednesday afternoon in Los Angeles, away from any day rollover. "Yesterday" is
  # Tuesday 2026-10-20.
  let(:now) { Time.utc(2026, 10, 21, 20, 0, 0) }

  # Absences (UsageGenerator#absent?, about 1 school day in 10) are keyed on the student's database id, which
  # comes from a sequence that does not roll back, so it differs from run to run (and srand does not reach it).
  # Left on, any example that needs a session on a given day failed whenever that day came up absent: about
  # 1 run in 10 for "redoes a day that a killed run left half written", 1 in 100 for "stops at a day whose
  # sessions failed", 1 in 1000 for three others. Off for every example; the "absences" examples below
  # turn them back on (the real rule, or a fixed day).
  before { allow_any_instance_of(DemoDistrict::UsageGenerator).to receive(:absent?).and_return(false) }

  def org_with(settings = {})
    Organization.create(settings: { 'name' => 'Spec District', 'total_licenses' => 5 }.merge(settings))
  end

  def member(org, email)
    u = User.create(settings: { 'email' => email, 'preferences' => { 'home_board' => { 'id' => '1_1', 'key' => 'example/home' } } })
    org.add_user(u.user_name, false, true)
    u.reload
  end

  def prior_session(user, started_at)
    s = LogSession.create(user: user, author: user, device: Device.create(user: user))
    s.update_column(:log_type, 'session')
    s.update_column(:started_at, started_at)
    s
  end

  def rolling_sessions(user)
    LogSession.where(user_id: user.id).select { |s| (s.data || {})['seed_marker'] == DemoDistrict::SEED_MARKER }
  end

  # Holds the demo write lock from a second database session for the block. It has to be a
  # separate session: transactional fixtures pin the example to one connection, and an
  # advisory lock is re-entrant within the session that holds it. Taking the lock with try
  # also fails the example if an earlier run left it held.
  def holding_demo_lock
    cfg = ActiveRecord::Base.connection_db_config.configuration_hash
    other = PG.connect({ dbname: cfg[:database], host: cfg[:host], port: cfg[:port], user: cfg[:username], password: cfg[:password] }.compact)
    expect(other.exec("SELECT pg_try_advisory_lock(#{DemoDistrict::LOCK_KEY})").getvalue(0, 0)).to eq('t')
    yield
  ensure
    other&.close
  end

  describe "refresh!" do
    it "refuses an organization that is not flagged demo_data" do
      o = org_with
      u = member(o, 'kid@demoschooldistrict.org')
      prior_session(u, now - 5.days)
      expect {
        DemoDistrict.refresh!(organization: o.reload, now: now)
      }.to raise_error(DemoDistrict::RefusedError, /not flagged/)
      expect(LogSession.where(user_id: u.id).count).to eq(1)
    end

    it "refuses an organization whose flag is only truthy, not true" do
      o = org_with('demo_data' => 'true')
      expect {
        DemoDistrict.refresh!(organization: o, now: now)
      }.to raise_error(DemoDistrict::RefusedError)
    end

    it "does nothing when no organization is flagged" do
      o = org_with
      u = member(o, 'kid@demoschooldistrict.org')
      prior_session(u, now - 5.days)
      expect(DemoDistrict.refresh!(now: now)).to eq({ skipped_org: true })
      expect(LogSession.where(user_id: u.id).count).to eq(1)
    end

    it "refuses to pick between two flagged organizations" do
      org_with('demo_data' => true)
      org_with('demo_data' => true)
      expect { DemoDistrict.refresh!(now: now) }.to raise_error(DemoDistrict::RefusedError, /expected exactly one/)
    end

    it "skips members without a demo email and fills weekdays through yesterday for demo members" do
      srand(20261021)
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      outsider = member(o, 'parent@example.com')
      # Thursday 2026-10-15, so the gap is Fri 16, Mon 19, Tue 20 (the weekend is skipped)
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))
      prior_session(outsider, Time.utc(2026, 10, 15, 18, 0, 0))

      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }

      expect(res[:skipped_users]).to include(outsider.user_name)
      expect(res[:skipped_users]).not_to include(demo.user_name)
      expect(LogSession.where(user_id: outsider.id).count).to eq(1)
      expect(rolling_sessions(outsider)).to eq([])

      made = rolling_sessions(demo)
      expect(made.length).to be > 0
      expect(res[:sessions_created]).to eq(made.length)
      tz = ActiveSupport::TimeZone['America/Los_Angeles']
      days = made.map { |s| s.started_at.in_time_zone(tz).to_date }.uniq
      expect(days - [Date.new(2026, 10, 16), Date.new(2026, 10, 19), Date.new(2026, 10, 20)]).to eq([])
      made.each do |s|
        expect(s.started_at.in_time_zone(tz).hour).to be_between(8, 14)
      end
      expect(res[:summaries_updated]).to be > 0
    end

    it "is safe to rerun: a day that already has a rolling session is not filled again" do
      srand(20261021)
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))

      travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      first = rolling_sessions(demo).length
      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      expect(res[:sessions_created]).to eq(0)
      expect(rolling_sessions(demo).length).to eq(first)
    end

    it "turns email off for a demo member added after seeding, and leaves anyone else's alone" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      outsider = member(o, 'parent@example.com')
      prior_session(demo, Time.utc(2026, 10, 20, 18, 0, 0))

      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      expect(demo.reload.settings['email_disabled']).to eq(true)
      expect(outsider.reload.settings['email_disabled']).to eq(nil)
      expect(res[:emails_turned_off]).to eq(1)
    end

    it "turns email off for the other members when one fails, and fails the run only at the end" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      gone = member(o, 'kid2@demoschooldistrict.org')
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))
      gone_name = gone.user_name
      # Deleted after the run has listed the members, so reloading it raises.
      allow(DemoDistrict).to receive(:org_members).and_wrap_original do |orig, org|
        members = orig.call(org)
        User.where(id: gone.id).delete_all
        members
      end

      expect {
        travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      }.to raise_error(DemoDistrict::RefreshError, /#{gone_name} email not turned off/)
      expect(demo.reload.settings['email_disabled']).to eq(true)
      expect(rolling_sessions(demo)).not_to eq([])
    end

    it "skips the run while another run holds the demo lock" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))

      res = holding_demo_lock { travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) } }
      expect(res).to eq({ skipped_busy: true })
      expect(rolling_sessions(demo)).to eq([])
    end
  end

  describe "absences" do
    it "does not fill an absent last day on a rerun" do
      allow_any_instance_of(DemoDistrict::UsageGenerator).to receive(:absent?).and_call_original
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      gen = DemoDistrict::UsageGenerator.new(student: demo, profile: DemoDistrict::UsageGenerator::DEFAULT_PROFILE,
                                             index: 0, author: demo, board: {}, device: nil)
      # The first weekday from 2026-10-20 back that this communicator is absent on
      absent_day = (0..200).map { |i| Date.new(2026, 10, 20) - i }.detect { |d| !d.saturday? && !d.sunday? && gen.absent?(d) }
      run_at = ActiveSupport::TimeZone['America/Los_Angeles'].local(absent_day.year, absent_day.month, absent_day.day, 13) + 1.day
      prior_session(demo, (absent_day - 7).in_time_zone('America/Los_Angeles').change(hour: 10).utc)

      travel_to(run_at) { DemoDistrict.refresh!(organization: o.reload, now: run_at) }
      first = rolling_sessions(demo).length
      expect(rolling_sessions(demo).map { |s| s.started_at.in_time_zone('America/Los_Angeles').to_date }).not_to include(absent_day)
      res = travel_to(run_at) { DemoDistrict.refresh!(organization: o.reload, now: run_at) }
      expect(res[:sessions_created]).to eq(0)
      expect(rolling_sessions(demo).length).to eq(first)
    end

    # An absence in the middle of the gap leaves that day empty and the fill carries on past it. Also fails if
    # absent? is renamed, which would otherwise make the pin at the top silently stop applying.
    it "fills the days around an absence in the middle of the gap, and a rerun adds nothing" do
      allow_any_instance_of(DemoDistrict::UsageGenerator).to receive(:absent?) { |_gen, date| date == Date.new(2026, 10, 19) }
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      # Thursday 2026-10-15, so the gap is Fri 16, Mon 19 (absent), Tue 20.
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))
      travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      days = rolling_sessions(demo).map { |s| s.started_at.in_time_zone('America/Los_Angeles').to_date }.uniq.sort
      expect(days).to eq([Date.new(2026, 10, 16), Date.new(2026, 10, 20)])
      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      expect(res[:sessions_created]).to eq(0)
    end
  end

  describe "scheduled run time" do
    it "counts the LA school day that just ended when run at 06:00 UTC (the previous LA evening)" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      prior_session(demo, Time.utc(2026, 10, 16, 18, 0, 0))
      # Tuesday 2026-10-20 06:00 UTC is Monday 23:00 in Los Angeles; Monday's school day is over.
      run_at = Time.utc(2026, 10, 20, 6, 0, 0)
      res = travel_to(run_at) { DemoDistrict.refresh!(organization: o.reload, now: run_at) }
      expect(res[:through]).to eq('2026-10-19')
      # An LA afternoon before 3pm still stops at the day before.
      expect(DemoDistrict.send(:last_school_day_ended, Time.utc(2026, 10, 20, 21, 0, 0))).to eq(Date.new(2026, 10, 19))
      expect(DemoDistrict.send(:last_school_day_ended, Time.utc(2026, 10, 20, 22, 0, 0))).to eq(Date.new(2026, 10, 20))
    end
  end

  describe "interrupted runs" do
    it "redoes a day that a killed run left half written" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      prior_session(demo, Time.utc(2026, 10, 16, 18, 0, 0))
      # Monday's first session was saved with the rolling marker, then the process died.
      orphan = prior_session(demo, Time.utc(2026, 10, 19, 17, 0, 0))
      orphan.data['seed_marker'] = DemoDistrict::SEED_MARKER
      orphan.save!
      orphan.update_columns(started_at: Time.utc(2026, 10, 19, 17, 0, 0), log_type: 'session')
      expect(rolling_sessions(demo).map(&:id)).to eq([orphan.id])

      travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      expect(LogSession.find_by(id: orphan.id)).to be_nil
      by_day = rolling_sessions(demo).group_by { |s| s.started_at.in_time_zone('America/Los_Angeles').to_date }
      expect(by_day.keys).to include(Date.new(2026, 10, 20))
      by_day.each_value { |day| expect(day.count { |s| s.data[DemoDistrict::DAY_COMPLETE] }).to eq(1) }

      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      expect(res[:sessions_created]).to eq(0)
    end

    it "rebuilds the latest week for a caught-up user, so a run killed before its summary is repaired by a rerun" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      # Yesterday's session exists (an earlier run saved it) but its week was never summarised.
      last = prior_session(demo, Time.utc(2026, 10, 20, 18, 0, 0))
      week = WeeklyStatsSummary.date_to_weekyear(last.started_at.utc.to_date)
      expect(WeeklyStatsSummary).to receive(:update_now).with(demo.id, week)

      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      expect(res[:sessions_created]).to eq(0)
      expect(res[:summaries_updated]).to eq(1)
    end
  end

  describe "failures" do
    it "stops at a day whose sessions failed, so the next run retries it, and fails the refresh" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))
      allow(LogSession).to receive(:process_new).and_raise(StandardError, 'boom')

      expect {
        travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      }.to raise_error(DemoDistrict::RefreshError, /#{demo.user_name} sessions on 2026-10-1[69]: StandardError: boom/)
      # The cursor did not move past the failed day.
      expect(LogSession.where(user_id: demo.id).maximum(:started_at)).to eq(Time.utc(2026, 10, 15, 18, 0, 0))
      # The failed run let go of the demo lock.
      holding_demo_lock { }
    end

    it "removes a partly written day so the cursor stays before it and the next run redoes the whole day" do
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      prior = Time.utc(2026, 10, 15, 18, 0, 0)
      prior_session(demo, prior)
      calls = 0
      allow(LogSession).to receive(:process_new).and_wrap_original do |orig, *args|
        calls += 1
        raise StandardError, 'second write fails' if calls == 2
        orig.call(*args)
      end

      expect {
        travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      }.to raise_error(DemoDistrict::RefreshError, /second write fails/)
      expect(rolling_sessions(demo)).to eq([])
      expect(LogSession.where(user_id: demo.id, log_type: 'session').maximum(:started_at)).to eq(prior)
    end

    it "retries a failed weekly summary and fails the refresh if it never builds" do
      srand(20261021)
      o = org_with('demo_data' => true)
      demo = member(o, 'kid@demoschooldistrict.org')
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))
      allow(WeeklyStatsSummary).to receive(:update_now).and_raise(StandardError, 'db blip')

      expect {
        travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      }.to raise_error(DemoDistrict::RefreshError, /#{demo.user_name} weekly summaries/)
    end
  end

  describe "default profile setting" do
    it "does not report a refresh the org stats endpoint cannot see" do
      o = org_with('demo_data' => true, 'communicator_profile' => { 'profile_id' => 'default' })
      demo = member(o, 'kid@demoschooldistrict.org')
      allow(ProfileTemplate).to receive(:default_profile_id).and_return('concrete-default')
      UserExtra.create!(user: demo, settings: { 'recent_profiles' => { 'concrete-default' => [
        { 'template_id' => 't1', 'summary' => 4, 'log_id' => '1_5', 'added' => (now - 11.months).to_i }
      ] } })

      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }
      expect(res[:profiles_refreshed]).to eq(0)
    end
  end

  describe "goal and profile freshness" do
    it "bumps a stale primary goal and a due recent profile so the org tiles count them" do
      srand(20261021)
      o = org_with('demo_data' => true, 'communicator_profile' => { 'profile_id' => 'spec-profile', 'frequency' => 6.months.to_i })
      demo = member(o, 'kid@demoschooldistrict.org')
      demo.settings['primary_goal'] = { 'id' => '1_99', 'summary' => 'Spec goal', 'last_tracked' => (now - 30.days).utc.iso8601 }
      demo.save!
      old_added = (now - 5.months).to_i
      UserExtra.create!(user: demo, settings: { 'recent_profiles' => { 'spec-profile' => [
        { 'template_id' => 't1', 'summary' => 4, 'log_id' => '1_5', 'added' => old_added }
      ] } })
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))

      res = travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }

      expect(res[:goals_tracked]).to eq(1)
      expect(demo.reload.settings['primary_goal']['last_tracked']).to be > 2.weeks.ago(now).iso8601
      expect(res[:profiles_refreshed]).to eq(1)
      recents = UserExtra.find_by(user_id: demo.id).settings['recent_profiles']['spec-profile']
      expect(recents.first['added']).to be > (now - 3.days).to_i
      expect(recents.first['log_id']).to eq('1_5')
      expect(recents.last['added']).to be > (now - 6.months).to_i
    end
  end

  describe "profile tail" do
    # The org stats endpoint reads profs[-1] (the oldest kept entry) against the frequency
    # window, so an old tail must be dropped before it expires even when the newest entry
    # is not yet due for a refresh.
    it "drops an entry about to leave the window so the entry the stats endpoint reads stays fresh" do
      srand(20261021)
      o = org_with('demo_data' => true, 'communicator_profile' => { 'profile_id' => 'spec-profile', 'frequency' => 6.months.to_i })
      demo = member(o, 'kid@demoschooldistrict.org')
      fresh = (now - 1.month).to_i
      UserExtra.create!(user: demo, settings: { 'recent_profiles' => { 'spec-profile' => [
        { 'template_id' => 't1', 'summary' => 4, 'log_id' => '1_6', 'added' => fresh },
        { 'template_id' => 't1', 'summary' => 3, 'log_id' => '1_5', 'added' => (now - 6.months + 3.days).to_i }
      ] } })
      prior_session(demo, Time.utc(2026, 10, 15, 18, 0, 0))

      travel_to(now) { DemoDistrict.refresh!(organization: o.reload, now: now) }

      recents = UserExtra.find_by(user_id: demo.id).settings['recent_profiles']['spec-profile']
      expect(recents.map { |r| r['log_id'] }).to eq(['1_6'])
      expect(recents[-1]['added']).to eq(fresh)
    end
  end

  describe "create_district!" do
    let(:names) { DemoDistrict::Seeder.user_names }

    it "builds a premium district, so its org page shows the communicator and eval statistics" do
      # db/seeds.rb assigns these settings too.
      expect(DemoDistrict::Seeder.org_settings['premium']).to eq(true)
      org = DemoDistrict.create_district!(password: 'spec-demo-password')

      expect(org.reload.settings['premium']).to eq(true)
      expect(JsonApi::Organization.build_json(org)['premium']).to eq(true)
    end

    it "builds a flagged district whose every member qualifies for refresh!, and refresh! fills it" do
      org = DemoDistrict.create_district!(password: 'spec-demo-password')

      expect(DemoDistrict.flagged?(org)).to eq(true)
      expect(org.admin).to eq(nil)
      expect(org.settings['name']).to eq('Demo School District')
      communicators = org.approved_users(false)
      expect(communicators.map(&:user_name).sort).to eq(DemoDistrict::UsageGenerator::STUDENT_PROFILES.map { |p| p[:user_name] }.sort)
      expect(communicators).to all(satisfy { |u| DemoDistrict.demo_email?(u) })
      expect(org.supervisors.map(&:user_name).sort).to eq(DemoDistrict::Seeder::SLP_PROFILES.map { |p| p[:user_name] }.sort)
      expect(org.supervisors).to all(satisfy { |u| DemoDistrict.demo_email?(u) })
      expect(OrganizationUnit.where(organization_id: org.id).count).to eq(3)
      communicators.each do |u|
        expect(DemoDistrict.board_for(u, nil)).to eq({ 'id' => org.settings['default_home_board']['id'], 'key' => org.settings['default_home_board']['key'] })
        expect(u.settings['preferences']['allow_log_reports']).to eq(true)
      end

      # A brand-new district has no history, so refresh! starts INITIAL_HISTORY_DAYS back; one
      # day keeps the example short. Yesterday is Tuesday 2026-10-20.
      stub_const('DemoDistrict::INITIAL_HISTORY_DAYS', 1)
      res = travel_to(now) { DemoDistrict.refresh!(organization: org.reload, now: now) }
      expect(res[:skipped_users]).to eq([])
      expect(res[:communicators]).to eq(20)
      expect(res[:sessions_created]).to be > 0
      expect(res[:summaries_updated]).to be > 0
      # Each room's SLP is linked to its students before the backfill, so every session is
      # authored (and modeled) by an SLP, never by the student.
      aiden = User.find_by(user_name: 'aiden_parker')
      expect(aiden.supervisors.map(&:user_name)).to include('sarah_chen_slp')
      authors = LogSession.where(user_id: communicators.map(&:id), log_type: 'session').map(&:author_id).uniq
      expect(authors).not_to eq([])
      expect(authors - org.supervisors.map(&:id)).to eq([])

      # Each student who used the device got a primary goal from their SLP and a check-in
      # note, which is what moves the Goals tile and the room's weekly goal faces.
      expect(res[:goals_created]).to eq(20)
      with_sessions = LogSession.where(user_id: communicators.map(&:id), log_type: 'session').distinct.count(:user_id)
      expect(res[:goal_notes]).to eq(with_sessions)
      notes = LogSession.where(user_id: communicators.map(&:id), log_type: 'note')
      expect(notes.count).to eq(res[:goal_notes])
      notes.each do |n|
        expect(n.goal_id).not_to eq(nil)
        expect(n.score).to be_between(1, 4)
        expect(n.data['seed_marker']).to eq(DemoDistrict::SEED_MARKER)
        expect(org.supervisors.map(&:id)).to include(n.author_id)
        expect(n.user.reload.settings['primary_goal']['last_tracked']).to be >= n.ended_at.iso8601
      end

      # Supervisor daily activity, which the room page reads for its supervisor rows.
      expect(res[:supervisor_days]).to be > 0
      daily = LogSession.where(log_type: 'daily_use', user_id: org.supervisors.map(&:id))
      expect(daily.map { |d| d.data['days'].keys }.flatten.uniq).to eq(['2026-10-20'])

      # A run killed after the sessions but before the notes and SLP days (simulated by
      # removing them) is caught up by the next run, which writes no new sessions.
      LogSession.where(user_id: communicators.map(&:id), log_type: 'note').destroy_all
      daily.destroy_all
      again = travel_to(now) { DemoDistrict.refresh!(organization: org.reload, now: now) }
      expect(again[:sessions_created]).to eq(0)
      expect(again[:goals_created]).to eq(0)
      expect(again[:goal_notes]).to eq(with_sessions)
      expect(LogSession.where(log_type: 'daily_use', user_id: org.supervisors.map(&:id)).map { |d| d.data['days'].keys }.flatten.uniq).to eq(['2026-10-20'])
    end

    it "refuses when a board already has the district board's key" do
      Board.create(user: User.create, settings: { 'name' => 'Spec Board' }).update_column(:key, DemoDistrict::Seeder.board_key)
      expect(Board.where(key: 'sarah_chen_slp/demo_district_home').count).to eq(1)
      before_count = Organization.count
      expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /board/)
      expect(Organization.count).to eq(before_count)
    end

    it "reuses the district board on a second build (db/seeds.rb reruns)" do
      org = Organization.create(settings: DemoDistrict::Seeder.org_settings)
      quiet = ->(_msg) {}
      first = DemoDistrict::Seeder.build!(org, password: 'spec-demo-password', log: quiet, adopt: true)
      expect(first[:board].key).to eq('sarah_chen_slp/demo_district_home')
      boards = Board.count
      second = DemoDistrict::Seeder.build!(org.reload, password: 'spec-demo-password', log: quiet, adopt: true)
      expect(second[:board].id).to eq(first[:board].id)
      expect(Board.count).to eq(boards)
      expect(org.reload.settings['premium']).to eq(true)
    end

    # Every deployed environment runs RAILS_ENV=production; only the Cloud Run job name
    # (CLOUD_RUN_JOB, set by Cloud Run) tells nonprod from production.
    describe "in a deployed environment" do
      before { allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('production')) }

      def expect_refused_outside_nonprod
        before_count = Organization.count
        expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /nonprod/)
        expect(Organization.count).to eq(before_count)
        expect(User.where(user_name: names).count).to eq(0)
      end

      env_wrap('CLOUD_RUN_JOB' => nil) do
        it "refuses outside a Cloud Run job, and creates nothing" do
          expect_refused_outside_nonprod
        end
      end

      env_wrap('CLOUD_RUN_JOB' => 'lingolinq-migrate') do
        it "refuses in the production migrate job, and creates nothing" do
          expect_refused_outside_nonprod
        end
      end

      %w[lingolinq-migrate-dev lingolinq-migrate-staging].each do |job|
        env_wrap('CLOUD_RUN_JOB' => job) do
          it "passes the environment check in #{job}" do
            # An empty password stops it at the next check, before anything is written.
            expect { DemoDistrict.create_district!(password: '') }.to raise_error(DemoDistrict::RefusedError, /a password for the demo accounts is required/)
          end
        end
      end
    end

    it "refuses a missing or short password and creates nothing" do
      expect { DemoDistrict.create_district!(password: '') }.to raise_error(DemoDistrict::RefusedError, /password/)
      expect { DemoDistrict.create_district!(password: 'short') }.to raise_error(DemoDistrict::RefusedError, /at least/)
      expect(User.where(user_name: names).count).to eq(0)
    end

    it "refuses when an organization is already flagged, and creates nothing" do
      org_with('demo_data' => true)
      before_count = Organization.count
      expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /already flagged/)
      expect(Organization.count).to eq(before_count)
      expect(User.where(user_name: names).count).to eq(0)
    end

    it "refuses when an organization already has the district's name, and creates nothing" do
      org_with('name' => 'Demo School District')
      before_count = Organization.count
      expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /already exists/)
      expect(Organization.count).to eq(before_count)
    end

    it "refuses when one of the district's user names is taken, and leaves that account alone" do
      existing = User.create(user_name: 'ruby_adams', settings: { 'email' => 'someone@example.com' })
      before_count = Organization.count
      expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /ruby_adams/)
      expect(Organization.count).to eq(before_count)
      expect(User.where(user_name: names).count).to eq(1)
      existing.reload
      expect(existing.settings['email']).to eq('someone@example.com')
      expect(existing.settings.dig('preferences', 'home_board')).to eq(nil)
    end

    it "refuses, without adopting it, an account that takes a demo user name after the up-front check" do
      intruder = nil
      allow(DemoDistrict::Seeder).to receive(:build!).and_wrap_original do |orig, *args, **kwargs|
        intruder = User.create(user_name: 'tessa_campbell', settings: { 'email' => 'someone@example.com' })
        orig.call(*args, **kwargs)
      end
      expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /tessa_campbell/)
      intruder.reload
      expect(Organization.attached_orgs(intruder)).to eq([])
      expect(intruder.settings['email_disabled']).to eq(nil)
      expect(intruder.settings.dig('preferences', 'home_board')).to eq(nil)
      # The half-built district is no longer flagged, so refresh! leaves it alone, and the
      # failed run let go of the demo lock.
      expect(DemoDistrict.demo_organization).to eq(nil)
      holding_demo_lock { }
    end

    # The app gives a new account a numbered name when its own was taken after the lookup
    # (Processable#generate_unique_key), so the build must refuse rather than carry on.
    %w[marcus_williams_slp tessa_campbell].each do |taken|
      it "refuses #{taken} when it is taken between its lookup and the account's creation" do
        intruder = nil
        allow(User).to receive(:process_new).and_wrap_original do |orig, params, *rest|
          if params[:user_name] == taken && !intruder
            intruder = User.create(user_name: taken, settings: { 'email' => 'someone@example.com' })
          end
          orig.call(params, *rest)
        end
        expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /created #{taken}_1 instead/)
        expect(Organization.attached_orgs(intruder.reload)).to eq([])
        # The numbered account left behind has its email off and belongs to no organization.
        numbered = User.find_by(user_name: "#{taken}_1")
        expect(numbered.settings['email_disabled']).to eq(true)
        expect(Organization.attached_orgs(numbered)).to eq([])
        expect(DemoDistrict.demo_organization).to eq(nil)
      end
    end

    it "refuses a district board key taken between its lookup and the board's creation" do
      allow(Board).to receive(:process_new).and_wrap_original do |orig, params, opts|
        Board.create(user: opts[:user], key: DemoDistrict::Seeder.board_key)
        orig.call(params, opts)
      end
      expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(DemoDistrict::RefusedError, /board/)
      expect(DemoDistrict.demo_organization).to eq(nil)
    end

    it "leaves a district stopped part way unflagged, even by an exception no rescue catches" do
      # A job timeout or kill: the build stops without running any rescue.
      stop = Class.new(Exception)
      allow(DemoDistrict::Seeder).to receive(:prepare_student!).and_raise(stop)
      expect { DemoDistrict.create_district!(password: 'spec-demo-password') }.to raise_error(stop)
      expect(Organization.all.count { |o| (o.settings || {})['name'] == 'Demo School District' }).to eq(1)
      expect(DemoDistrict.demo_organization).to eq(nil)
      holding_demo_lock { }
    end

    it "refuses while another run holds the demo lock, and creates nothing" do
      before_count = Organization.count
      expect {
        holding_demo_lock { DemoDistrict.create_district!(password: 'spec-demo-password') }
      }.to raise_error(DemoDistrict::RefusedError, /in progress/)
      expect(Organization.count).to eq(before_count)
      expect(User.where(user_name: names).count).to eq(0)
    end

    it "turns email off for every account it creates" do
      DemoDistrict.create_district!(password: 'spec-demo-password')
      users = User.where(user_name: names).to_a
      expect(users.length).to eq(names.length)
      expect(users.map { |u| [u.user_name, u.settings['email_disabled']] }).to all(satisfy { |_, disabled| disabled == true })
    end
  end

  describe "disable_demo_emails!" do
    it "turns email off for existing demo accounts and drops their reset codes, once" do
      slp = User.create(user_name: 'sarah_chen_slp', settings: { 'email' => 'sarah.chen@demoschooldistrict.org' })
      kid = User.create(user_name: 'aiden_parker', settings: { 'email' => 'aiden_parker@demoschooldistrict.org',
                                                               'password_resets' => [{ 'timestamp' => Time.now.to_i, 'code' => 'spec-code' }] })

      expect(DemoDistrict.disable_demo_emails!).to eq(2)
      expect(slp.reload.settings['email_disabled']).to eq(true)
      expect(kid.reload.settings['email_disabled']).to eq(true)
      expect(kid.settings['password_resets']).to eq([])
      expect(DemoDistrict.disable_demo_emails!).to eq(0)
    end

    it "also covers a demo member of the flagged organization with another user name" do
      o = org_with('demo_data' => true)
      extra = member(o, 'extra@demoschooldistrict.org')
      outsider = member(o, 'outsider@example.com')
      expect(DemoDistrict.disable_demo_emails!).to eq(1)
      expect(extra.reload.settings['email_disabled']).to eq(true)
      expect(outsider.reload.settings['email_disabled']).to eq(nil)
    end

    it "leaves an account with a demo user name but another email alone" do
      someone = User.create(user_name: 'ruby_adams', settings: { 'email' => 'someone@example.com' })
      expect(DemoDistrict.disable_demo_emails!).to eq(0)
      expect(someone.reload.settings['email_disabled']).to eq(nil)
    end
  end

  describe "Seeder.disable_email!" do
    it "acts only on an @demoschooldistrict.org account" do
      someone = User.create(user_name: 'ruby_adams', settings: { 'email' => 'someone@example.com' })
      expect(DemoDistrict::Seeder.disable_email!(someone)).to eq(:skipped)
      expect(someone.reload.settings['email_disabled']).to eq(nil)

      kid = User.create(user_name: 'aiden_parker', settings: { 'email' => 'aiden_parker@demoschooldistrict.org' })
      expect(DemoDistrict::Seeder.disable_email!(kid)).to eq(:disabled)
      expect(kid.reload.settings['email_disabled']).to eq(true)
      expect(DemoDistrict::Seeder.disable_email!(kid)).to eq(:skipped)
    end

    it "drops reset codes from an account whose email is already off" do
      kid = User.create(user_name: 'aiden_parker', settings: {
        'email' => 'aiden_parker@demoschooldistrict.org', 'email_disabled' => true,
        'password_resets' => [{ 'timestamp' => Time.now.to_i, 'code' => 'spec-code', 'token' => 'spec-token' }]
      })
      expect(kid.valid_reset_token?('spec-token')).to eq(true)
      expect(DemoDistrict::Seeder.disable_email!(kid)).to eq(:disabled)
      kid.reload
      expect(kid.settings['password_resets']).to eq([])
      expect(kid.valid_reset_token?('spec-token')).to eq(false)
    end
  end

  describe "author_for" do
    it "credits the latest session's author only when they supervise in the organization" do
      o = org_with('demo_data' => true, 'total_supervisor_licenses' => 5)
      kid = member(o, 'kid@demoschooldistrict.org')
      slp = User.create(settings: { 'email' => 'slp@demoschooldistrict.org' })
      o.add_supervisor(slp.user_name, false, true)
      stranger = User.create(settings: { 'email' => 'stranger@demoschooldistrict.org' })

      expect(DemoDistrict.author_for(o.reload, kid, LogSession.new(author: stranger))).not_to eq(stranger)
      expect(DemoDistrict.author_for(o, kid, LogSession.new(author: slp))).to eq(slp)
    end
  end

  describe "record_supervisor_days!" do
    it "rebuilds a supervisor's day from the sessions they modeled in, the same way on a rerun" do
      srand(20261021)
      o = org_with('demo_data' => true)
      kid = member(o, 'kid@demoschooldistrict.org')
      slp = User.create(settings: { 'email' => 'slp@demoschooldistrict.org', 'name' => 'Spec SLP' })
      gen = DemoDistrict::UsageGenerator.new(student: kid, profile: { name: 'Kid', user_name: kid.user_name, skill: :beginner, freq: :high, modeling_rate: 0.5 },
                                             index: 0, author: slp, board: { 'id' => '1_1', 'key' => 'example/home' },
                                             device: Device.create(user: kid))
      date = Date.new(2026, 10, 20)
      made = gen.generate_day(date)
      expect(made).not_to eq([])
      modeled = made.map { |s| s.data['events'].select { |e| e['modeling'] } }.flatten

      expect(DemoDistrict.record_supervisor_days!(slp, [date, date - 1], communicator_ids: [kid.id])).to eq(1)
      day = LogSession.find_by(log_type: 'daily_use', user_id: slp.id).data['days']['2026-10-20']
      expect(day['models']).to eq(modeled.length)
      expect(day['modeled'].sort).to eq(modeled.map { |e| e['button']['label'].downcase }.sort)
      expect(day['activity_level']).to be_between(1, 5)

      DemoDistrict.record_supervisor_days!(slp, [date], communicator_ids: [kid.id])
      again = LogSession.where(log_type: 'daily_use', user_id: slp.id)
      expect(again.count).to eq(1)
      expect(again.first.data['days']['2026-10-20']).to eq(day)
    end

    it "counts only the demo communicators' sessions, not one the SLP authored for anyone else" do
      srand(20261021)
      o = org_with('demo_data' => true)
      kid = member(o, 'kid@demoschooldistrict.org')
      outsider = User.create(settings: { 'email' => 'outsider@example.com' })
      slp = User.create(settings: { 'email' => 'slp@demoschooldistrict.org', 'name' => 'Spec SLP' })
      gen = DemoDistrict::UsageGenerator.new(student: outsider, profile: { name: 'Outsider', user_name: outsider.user_name, skill: :beginner, freq: :high, modeling_rate: 0.5 },
                                             index: 0, author: slp, board: { 'id' => '1_1', 'key' => 'example/home' },
                                             device: Device.create(user: outsider))
      date = Date.new(2026, 10, 20)
      expect(gen.generate_day(date)).not_to eq([])

      expect(DemoDistrict.unrecorded_supervisor_days(slp, date, [kid.id])).to eq([])
      expect(DemoDistrict.record_supervisor_days!(slp, [date], communicator_ids: [kid.id])).to eq(0)
      expect(LogSession.find_by(log_type: 'daily_use', user_id: slp.id)).to eq(nil)
    end
  end

  describe "flag_organization!" do
    it "flags the single matching organization" do
      o = org_with('name' => 'Demo School District')
      DemoDistrict.flag_organization!('Demo School District')
      expect(o.reload.settings['demo_data']).to eq(true)
    end

    it "refuses when the name matches more than one organization" do
      org_with('name' => 'Demo School District')
      org_with('name' => 'Demo School District')
      expect {
        DemoDistrict.flag_organization!('Demo School District')
      }.to raise_error(DemoDistrict::RefusedError, /found 2/)
    end
  end
end

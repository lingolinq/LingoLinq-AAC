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

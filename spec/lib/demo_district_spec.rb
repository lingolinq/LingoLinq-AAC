require 'spec_helper'

describe DemoDistrict do
  include ActiveSupport::Testing::TimeHelpers

  # Wednesday afternoon in Los Angeles, away from any day rollover. "Yesterday" is
  # Tuesday 2026-10-20.
  let(:now) { Time.utc(2026, 10, 21, 20, 0, 0) }

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

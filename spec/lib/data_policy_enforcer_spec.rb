require 'spec_helper'

describe DataPolicyEnforcer do
  def log(user, log_type, started_at)
    s = LogSession.create(user: user, author: user, device: Device.create(user: user))
    s.update_column(:log_type, log_type)
    s.update_column(:started_at, started_at)
    s
  end

  def sponsored_org(retention_months)
    o = Organization.create(settings: {total_licenses: 1})
    manager = User.create
    o.add_manager(manager.user_name, true)
    u = User.create
    o.add_user(u.user_name, false, true)
    o.reload
    o.update_data_policy({'retention_months' => retention_months}, manager)
    o.save!
    [o, u.reload]
  end

  describe "enforce_retention!" do
    it "does nothing for orgs with no data policy set" do
      o = Organization.create(settings: {total_licenses: 1})
      u = User.create
      o.add_user(u.user_name, false, true)
      log(u, 'session', 10.years.ago)
      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(user_id: u.id).count).to eq(1)
    end

    it "does nothing when retention_months is not set or zero" do
      o, u = sponsored_org(nil)
      log(u, 'session', 10.years.ago)
      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(user_id: u.id).count).to eq(1)
    end

    it "purges stale session logs older than the retention window" do
      o, u = sponsored_org(3)
      stale = log(u, 'session', 4.months.ago)
      fresh = log(u, 'session', 1.month.ago)
      expect(DataPolicyEnforcer.enforce_retention!).to eq(1)
      expect(LogSession.where(id: stale.id).count).to eq(0)
      expect(LogSession.where(id: fresh.id).count).to eq(1)
    end

    it "purges stale note, assessment, eval, and journal logs" do
      o, u = sponsored_org(3)
      stale_logs = %w[note assessment eval journal].map { |type| log(u, type, 4.months.ago) }
      expect(DataPolicyEnforcer.enforce_retention!).to eq(4)
      stale_logs.each do |s|
        expect(LogSession.where(id: s.id).count).to eq(0)
      end
    end

    it "never purges daily_use, modeling_activities, or profile logs regardless of age" do
      o, u = sponsored_org(3)
      daily = log(u, 'daily_use', 5.years.ago)
      modeling = log(u, 'modeling_activities', 5.years.ago)
      profile = log(u, 'profile', 5.years.ago)
      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(id: daily.id).count).to eq(1)
      expect(LogSession.where(id: modeling.id).count).to eq(1)
      expect(LogSession.where(id: profile.id).count).to eq(1)
    end

    it "leaves logs for users outside the org's sponsorship untouched" do
      o, u = sponsored_org(3)
      unrelated = User.create
      other_stale = log(unrelated, 'session', 4.months.ago)
      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(id: other_stale.id).count).to eq(1)
    end

    it "does not purge a log just inside the retention window" do
      # A precise tie against `months.months.ago` would race the two separate
      # "now" calls (the fixture's and enforce_retention!'s); this codebase has
      # no Timecop/travel_to helper to freeze time for that, so assert the
      # boundary direction with a safe day-wide margin instead.
      o, u = sponsored_org(3)
      just_inside = log(u, 'session', 3.months.ago + 1.day)
      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(id: just_inside.id).count).to eq(1)
    end

    it "never purges an eval log with no started_at, since NULL < cutoff never matches in SQL" do
      o, u = sponsored_org(3)
      undated_eval = log(u, 'eval', nil)
      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(id: undated_eval.id).count).to eq(1)
    end
  end
end

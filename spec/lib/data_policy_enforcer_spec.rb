require 'spec_helper'

describe DataPolicyEnforcer do
  def log(user, log_type, started_at)
    s = LogSession.create(user: user, author: user, device: Device.create(user: user))
    s.update_column(:log_type, log_type)
    s.update_column(:started_at, started_at)
    s
  end

  # Backdate when this organization's sponsorship began. An organization may only purge
  # sessions recorded since it attached, so a fixture that attaches "now" can never purge
  # anything older than the cutoff, and every age-based example below would assert zero for the
  # wrong reason. Real long-tenured students are the case these examples stand for.
  def sponsored_org(retention_months, sponsored_since: 5.years.ago)
    o = Organization.create(settings: {total_licenses: 1})
    manager = User.create
    o.add_manager(manager.user_name, true)
    u = User.create
    o.add_user(u.user_name, false, true)
    o.reload
    o.update_data_policy({'retention_months' => retention_months}, manager)
    o.save!
    backdate_sponsorship(o, u, sponsored_since)
    [o, u.reload]
  end

  def backdate_sponsorship(org, user, when_at)
    link = UserLink.generate(user.reload, org, 'org_user')
    link.data['state']['added'] = when_at.iso8601
    link.save!
    UserLink.invalidate_cache_for(org)
    UserLink.invalidate_cache_for(user)
    link
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

    it "never purges sessions recorded BEFORE this organization sponsored the student" do
      # A student may be supported by more than one organization, and org.sponsored_users lists
      # them regardless of who else does. Unbounded, the organization with the shortest window
      # purged every qualifying session the student had ever recorded, including history from
      # before it had any relationship with them. Flusher destroys the row and its PaperTrail
      # versions, so this is not recoverable.
      o, u = sponsored_org(3, sponsored_since: 6.months.ago)
      before_us = log(u, 'session', 3.years.ago)
      during_us = log(u, 'session', 5.months.ago)
      fresh = log(u, 'session', 1.month.ago)

      expect(DataPolicyEnforcer.enforce_retention!).to eq(1)

      # Only the session inside our own sponsorship window and past the cutoff is purged.
      expect(LogSession.where(id: during_us.id).count).to eq(0)
      expect(LogSession.where(id: before_us.id).count).to eq(1)
      expect(LogSession.where(id: fresh.id).count).to eq(1)
    end

    it "skips the purge when no sponsorship start date can be established" do
      # On an irreversible deletion an unknown start date must not be read as "since the
      # beginning of time". Links created by the pre-2026-09 claim path carry no 'added' stamp.
      o, u = sponsored_org(3)
      link = UserLink.generate(u.reload, o, 'org_user')
      link.data['state'].delete('added')
      link.save!
      UserLink.invalidate_cache_for(o)
      UserLink.invalidate_cache_for(u)
      License.where(organization_id: o.id, user_id: u.id).update_all(granted_at: nil)
      stale = log(u, 'session', 4.years.ago)

      # Assert the WARNING, not just the zero. Zero proves nothing here: with the guard deleted,
      # `where('started_at >= ?', nil)` renders `started_at >= NULL`, which matches no rows, so the
      # count is zero either way. This suite documents that same SQL semantics further down
      # ("NULL < cutoff never matches in SQL"). The log line is the only effect the guard uniquely
      # produces, and it is the compliance-visible half of choosing to fail safe.
      expect(Rails.logger).to receive(:warn).with(/no sponsorship start date could be established/)

      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(id: stale.id).count).to eq(1)
    end

    it "ignores a non-active license when establishing when sponsorship began" do
      # A row that still carries user_id but is no longer active belongs to an ENDED sponsorship
      # episode. Using its granted_at would extend the purge window back across the gap in which
      # this organization had no relationship with the student, and the purge is irreversible.
      o, u = sponsored_org(3, sponsored_since: 6.months.ago)
      # Strip the link stamp so the license fallback is the path under test.
      link = UserLink.generate(u.reload, o, 'org_user')
      link.data['state'].delete('added')
      link.save!
      UserLink.invalidate_cache_for(o)
      UserLink.invalidate_cache_for(u)
      # An ended episode from years ago, still carrying user_id.
      License.create!(organization: o, user_id: u.id, seat_type: 'student',
                      status: 'expired', granted_at: 4.years.ago)
      License.where(organization_id: o.id, user_id: u.id, status: 'active')
             .update_all(granted_at: 6.months.ago)
      ancient = log(u, 'session', 3.years.ago)

      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(id: ancient.id).count).to eq(1)
    end

    it "refuses an ambiguous sponsorship stamp rather than guessing at it" do
      # Time.parse reads "01/02/03" as 2001-02-03. A stamp read earlier than the truth widens an
      # irreversible deletion, so a non-ISO-8601 value must not be used.
      o, u = sponsored_org(3)
      link = UserLink.generate(u.reload, o, 'org_user')
      link.data['state']['added'] = '01/02/03'
      link.save!
      UserLink.invalidate_cache_for(o)
      UserLink.invalidate_cache_for(u)
      License.where(organization_id: o.id, user_id: u.id).update_all(granted_at: nil)
      ancient = log(u, 'session', 3.years.ago)

      # No usable stamp and no license fallback, so the student is skipped, not purged from 2001.
      expect(DataPolicyEnforcer.enforce_retention!).to eq(0)
      expect(LogSession.where(id: ancient.id).count).to eq(1)
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

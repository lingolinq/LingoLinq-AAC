require 'spec_helper'

describe Progress, "idempotency" do
  it "should reuse an existing pending progress record for the same operation" do
    obj = User.create
    method = :count
    args = [1, 2]

    p1 = Progress.schedule(obj, method, *args)
    expect(p1.settings['state']).to eq('pending')

    p2 = Progress.schedule(obj, method, *args)
    expect(p2.id).to eq(p1.id)
    expect(Progress.count).to eq(1)
  end

  it "should reuse an existing started progress record for the same operation" do
    obj = User.create
    method = :count
    args = [3, 4]

    p1 = Progress.schedule(obj, method, *args)
    p1.start!
    expect(p1.settings['state']).to eq('started')

    p2 = Progress.schedule(obj, method, *args)
    expect(p2.id).to eq(p1.id)
    expect(Progress.count).to eq(1)
  end

  it "should NOT reuse a finished progress record" do
    obj = User.create
    method = :count
    args = [5, 6]

    p1 = Progress.schedule(obj, method, *args)
    p1.finish!
    expect(p1.settings['state']).to eq('finished')

    p2 = Progress.schedule(obj, method, *args)
    expect(p2.id).not_to eq(p1.id)
    expect(Progress.count).to eq(2)
  end

  it "should NOT reuse an errored progress record" do
    obj = User.create
    method = :count
    args = [7, 8]

    p1 = Progress.schedule(obj, method, *args)
    p1.error!(nil)
    expect(p1.settings['state']).to eq('errored')

    p2 = Progress.schedule(obj, method, *args)
    expect(p2.id).not_to eq(p1.id)
    expect(Progress.count).to eq(2)
  end

  it "should NOT reuse an old progress record (over 4 hours for started)" do
    obj = User.create
    method = :count
    args = [9, 10]

    p1 = Progress.schedule(obj, method, *args)
    p1.start!
    p1.update_attribute(:started_at, 5.hours.ago)

    p2 = Progress.schedule(obj, method, *args)
    expect(p2.id).not_to eq(p1.id)
  end

  describe "cross-user safety (audit-reports/security-review-2026-05-04 finding #2)" do
    it "does NOT pool a progress across users when for_user differs" do
      obj = User.create
      user_a = User.create
      user_b = User.create
      method = :count
      args = [11, 12]

      p1 = Progress.schedule(obj, method, *args, for_user: user_a)
      p2 = Progress.schedule(obj, method, *args, for_user: user_b)

      expect(p1.id).not_to eq(p2.id)
      expect(p1.settings['for_user_global_id']).to eq(user_a.global_id)
      expect(p2.settings['for_user_global_id']).to eq(user_b.global_id)
    end

    it "DOES pool a progress for the same user when args match" do
      obj = User.create
      user_a = User.create
      method = :count
      args = [13, 14]

      p1 = Progress.schedule(obj, method, *args, for_user: user_a)
      p2 = Progress.schedule(obj, method, *args, for_user: user_a)

      expect(p1.id).to eq(p2.id)
    end

    it "treats two nil-owner progresses as poolable (legacy / system path)" do
      obj = User.create
      method = :count
      args = [15, 16]

      p1 = Progress.schedule(obj, method, *args)
      p2 = Progress.schedule(obj, method, *args)

      expect(p1.id).to eq(p2.id)
      expect(p1.settings['for_user_global_id']).to be_nil
    end

    it "does NOT pool a nil-owner progress with a for_user-scoped one" do
      obj = User.create
      user_a = User.create
      method = :count
      args = [17, 18]

      p1 = Progress.schedule(obj, method, *args)
      p2 = Progress.schedule(obj, method, *args, for_user: user_a)

      expect(p1.id).not_to eq(p2.id)
    end

    it "stores for_user_global_id when a User object is passed" do
      obj = User.create
      user_a = User.create
      method = :count

      p1 = Progress.schedule(obj, method, for_user: user_a)
      expect(p1.settings['for_user_global_id']).to eq(user_a.global_id)
    end

    it "stores for_user_global_id when a string global_id is passed" do
      obj = User.create
      method = :count

      p1 = Progress.schedule(obj, method, for_user: '42_test')
      expect(p1.settings['for_user_global_id']).to eq('42_test')
    end
  end

  describe "view permission (audit-reports/security-review-2026-05-04 finding #2)" do
    it "denies view to a user who is not the owner" do
      user_a = User.create
      user_b = User.create
      progress = Progress.schedule(User.create, :count, 1, for_user: user_a)

      expect(progress.allows?(user_b, 'view')).to eq(false)
    end

    it "allows view for the owner" do
      user_a = User.create
      progress = Progress.schedule(User.create, :count, 2, for_user: user_a)

      expect(progress.allows?(user_a, 'view')).to eq(true)
    end

    it "allows view for any authenticated user when there is no owner (legacy)" do
      user_a = User.create
      progress = Progress.schedule(User.create, :count, 3)

      expect(progress.allows?(user_a, 'view')).to eq(true)
    end
  end
end

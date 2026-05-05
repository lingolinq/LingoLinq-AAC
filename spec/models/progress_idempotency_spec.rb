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
end

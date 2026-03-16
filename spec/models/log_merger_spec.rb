require 'spec_helper'

describe LogMerger, :type => :model do
  it 'should have generate a merge_at value' do
    u = User.create
    d = Device.create(user: u)
    s = LogSession.create(user: u, author: u, device: d)
    m = LogMerger.create(log_session: s)
    expect(m.merge_at).to be > Time.now
    expect(m.started).to_not eq(true)
  end
end

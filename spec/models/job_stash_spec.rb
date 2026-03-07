require 'spec_helper'

describe JobStash, :type => :model do
  before(:each) { JobStash.delete_all }
  it 'should flush_old_records' do
    expect(JobStash.count).to eq(0)
    j1 = JobStash.create
    j2 = JobStash.create
    j3 = JobStash.create
    JobStash.where(id: [j1.id, j2.id]).update_all(created_at: 6.weeks.ago)
    expect(JobStash.count).to eq(3)
    JobStash.flush_old_records
    expect(JobStash.count).to eq(1)
    expect(JobStash.last).to eq(j3)
  end

  describe "events_for" do
    it "should return all events stashes for the specified log" do
      l = LogSession.new(user_id: 9)
      l.id = 77
      JobStash.create(user_id: 9, data: {'events' => ['a']})
      JobStash.create(log_session_id: 77, data: {'events' => ['b']})
      JobStash.create(user_id: 9, log_session_id: 77, data: {'events' => ['c']})
      JobStash.create(user_id: 9, log_session_id: 77, data: {'events' => ['d']})
      JobStash.create(user_id: 10, log_session_id: 77, data: {'events' => ['e']})
      JobStash.create(user_id: 9, log_session_id: 75, data: {'events' => ['f']})
      JobStash.create(user_id: 9, log_session_id: 77, data: {'events' => ['g']})
      expect(JobStash.events_for(l).sort).to eq(['c', 'd', 'g'])
    end
  end

  describe "add_events_to" do
    it "should add events correctly" do
      l = LogSession.new(user_id: 9)
      l.id = 88
      l2 = LogSession.new
      l3 = LogSession.new(user_id: 9)
      l3.id = 99
      JobStash.add_events_to(l, ['a', 'b', 'c'])
      JobStash.add_events_to(l, ['c', 'd', 'e'])
      JobStash.add_events_to(l, ['f', 'g', 'h'])
      expect { JobStash.add_events_to(nil, ['i', 'j', 'k']) }.to raise_error("Log need id and user id before stashing events")
      expect { JobStash.add_events_to(l2, ['f', 'g', 'h']) }.to raise_error("Log need id and user id before stashing events")
      JobStash.add_events_to(l3, ['l', 'm', 'n'])
      expect(JobStash.count).to eq(4)
      expect(JobStash.events_for(l).sort).to eq(['a', 'b', 'c', 'c', 'd', 'e', 'f', 'g', 'h'])
      expect(JobStash.events_for(l2)).to eq([])
      expect(JobStash.events_for(l3).sort).to eq(['l', 'm', 'n'])
    end
  end

  describe "remove_events_from" do
    it "should remove events correctly" do
      l = LogSession.new(user_id: 9)
      l.id = 88
      l2 = LogSession.new
      l3 = LogSession.new(user_id: 9)
      l3.id = 99
      JobStash.add_events_to(l, [{'id' => 1, 'timestamp' => 1}, {'id' => 2, 'timestamp' => 2}, {'id' => 3, 'timestamp' => 3}])
      JobStash.add_events_to(l, [{'id' => 3, 'timestamp' => 4}, {'id' => 4, 'timestamp' => 4}, {'id' => 5, 'timestamp' => 5}])
      JobStash.add_events_to(l, [{'id' => 6, 'timestamp' => 6}, {'id' => 7, 'timestamp' => 7}, {'id' => 8, 'timestamp' => 8}])
      expect { JobStash.add_events_to(nil, ['i', 'j', 'k']) }.to raise_error("Log need id and user id before stashing events")
      expect { JobStash.add_events_to(l2, ['f', 'g', 'h']) }.to raise_error("Log need id and user id before stashing events")
      JobStash.add_events_to(l3, [{'id' => 9, 'timestamp' => 9}, {'id' => 9, 'timestamp' => 9}, {'id' => 9, 'timestamp' => 8}])
      expect(JobStash.count).to eq(4)
      expect(JobStash.events_for(l).length).to eq(9)
      expect(JobStash.events_for(l2).length).to eq(0)
      expect(JobStash.events_for(l3).length).to eq(3)

      JobStash.remove_events_from(l, [{'id' => 2, 'timestamp' => 2}, {'id' => 3, 'timestamp' => 3}, {'id' => 7, 'timestamp' => 7}])
      JobStash.remove_events_from(l2, [{'id' => 2, 'timestamp' => 2}, {'id' => 3, 'timestamp' => 3}, {'id' => 7, 'timestamp' => 7}])
      JobStash.remove_events_from(l3, [{'id' => 9, 'timestamp' => 9}])

      expect(JobStash.events_for(l).length).to eq(6)
      expect(JobStash.events_for(l).map{|e| e['id']}.sort).to eq([1, 3, 4, 5, 6, 8])
      expect(JobStash.events_for(l2).length).to eq(0)
      expect(JobStash.events_for(l3).length).to eq(1)
      expect(JobStash.events_for(l3)[0]['id']).to eq(9)
    end
  end
end

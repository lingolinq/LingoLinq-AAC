require 'spec_helper'

describe ClusterLocation, :type => :model do
  describe "clusterize" do
    it "should do nothing if user not found" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0003', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s5 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '11.9999']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ClusterLocation.clusterize_ips("a_1")
      ClusterLocation.clusterize_geos("a_1")
      expect(ClusterLocation.count).to eq(0)
    end
    
    it "should create geo and ip clusters" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0003', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s5 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '11.9999']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4, 1.2.3'})
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      expect(ClusterLocation.count).to eq(2)
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      c1 = ClusterLocation.where(:cluster_type => 'geo').first
      expect(c1.cluster_type).to eq('geo')
      expect(c1.data['geo']).to eq([13.0001, 12.0001, 0])
      expect(c1.geo_sessions.count).to eq(5)
      expect(c1.ip_sessions.count).to eq(0)
      c2 = ClusterLocation.where(:cluster_type => 'ip_address').first
      expect(c2.cluster_type).to eq('ip_address')
      expect(c2.data['ip_address']).to eq('0000:0000:0000:0000:0000:ffff:0102:0304')
      expect(c2.geo_sessions.count).to eq(0)
      expect(c2.ip_sessions.count).to eq(5)
    end
    
    it "should not create geo clusters without enough data points" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['14', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['14.0003', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s5 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['14.0001', '11.9999']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      expect(ClusterLocation.count).to eq(1)
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      c1 = ClusterLocation.last
      expect(c1.cluster_type).to eq('ip_address')
      expect(c1.data['ip_address']).to eq('0000:0000:0000:0000:0000:ffff:0102:0304')
    end
    
    it "should ignore already-clustered sessions" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s1.geo_cluster_id = 0
      s1.save
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0003', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s5 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '11.9999']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      expect(ClusterLocation.count).to eq(1)
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      c1 = ClusterLocation.last
      expect(c1.cluster_type).to eq('ip_address')
    end
    
    it "should find multiple new clusters" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
      s4 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0003', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s5 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '11.9999']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s6 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['18', '18']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.9'})
      s7 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['18.0001', '18.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
      s8 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['18', '18.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s9 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['18.0003', '18.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s10 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['18.0001', '17.9999']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.9'})
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      expect(ClusterLocation.count).to eq(5)
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      ips = ClusterLocation.all.select{|c| c.ip_address? }
      expect(ips.length).to eq(3)
      ips = ips.sort_by{|i| i.data['ip_address'] }
      expect(ips.map{|c| c.ip_sessions.count }).to eq([6, 2, 2])
      expect(ips.map{|c| c.data['ip_address'] }).to eq(["0000:0000:0000:0000:0000:ffff:0102:0304", "0000:0000:0000:0000:0000:ffff:0102:0306", "0000:0000:0000:0000:0000:ffff:0102:0309"])
      
      geos = ClusterLocation.all.select{|c| c.geo? }
      expect(geos.length).to eq(2)
      geos = geos.sort_by{|i| i.data['geo'] }
      expect(geos.map{|c| c.geo_sessions.count }).to eq([5, 5])
      expect(geos.map{|c| c.data['geo'] }).to eq([[13.0001, 12.0001, 0], [18.0001, 18.0001, 0]])
    end
    
    it "should still try to match to existing clusters even if found through clusterize" do
      u = User.create
      d = Device.create(:user => u)
      ClusterLocation.create(:user => u, :cluster_type => 'geo', :data => {'geo' => [13, 12, 0]})
      ClusterLocation.create(:user => u, :cluster_type => 'ip_address', :data => {'ip_address' => '0000:0000:0000:0000:0000:ffff:0102:0304'})
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0003', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s5 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '11.9999']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      expect(ClusterLocation.count).to eq(2)
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      c1 = ClusterLocation.first
      expect(c1.cluster_type).to eq('geo')
      expect(c1.data['geo']).to eq([13.0, 12.0, 0])
      expect(c1.geo_sessions.count).to eq(5)
      expect(c1.ip_sessions.count).to eq(0)
      c2 = ClusterLocation.last
      expect(c2.cluster_type).to eq('ip_address')
      expect(c2.data['ip_address']).to eq('0000:0000:0000:0000:0000:ffff:0102:0304')
      expect(c2.geo_sessions.count).to eq(0)
      expect(c2.ip_sessions.count).to eq(5)
    end
  end
  
  describe "adding to an existing cluster" do
    it "should do nothing if session not found" do
      res = nil
      expect { res = ClusterLocation.add_to_cluster(nil) }.to_not raise_error
      expect(res).to eq(false)
    end
    
    it "should find an existing ip and geo cluster" do
      u = User.create
      d = Device.create(:user => u)
      c1 = ClusterLocation.create(:user => u, :cluster_type => 'geo', :data => {'geo' => [13.0001, 12.0001, 0]})
      c2 = ClusterLocation.create(:user => u, :cluster_type => 'ip_address', :data => {'ip_address' => '0000:0000:0000:0000:0000:ffff:0102:0304'})
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(ClusterLocation.add_to_cluster(s1.global_id)).to eq(true)
      s1.reload
      expect(s1.ip_cluster_id).to eq(c2.id)
      expect(s1.geo_cluster_id).to eq(c1.id)
    end
    
    it "should update the cluster's existing geo median" do
      u = User.create
      d = Device.create(:user => u)
      c1 = ClusterLocation.create(:user => u, :cluster_type => 'geo', :data => {'geo' => [13.0001, 12.0001, 0]})
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ClusterLocation.add_to_cluster(s1.global_id)
      expect(s1.reload.geo_cluster_id).to eq(c1.id)
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      c1.reload
      expect(c1.data['geo']).to eq([13.00005, 12.00005, 0.0])
    end
    
    it "should automatically be scheduled on save for an unassigned log session" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(Worker.scheduled?(ClusterLocation, :perform_action, {'method' => 'add_to_cluster', 'arguments' => [s1.global_id]})).to eq(true)
    end
    
    it "should not schedule a call to clusterize if geo or ip cluster not found but data present on session, but not enough new sessions" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(ClusterLocation.add_to_cluster(s1.global_id)).to eq(false)
      expect(Worker.scheduled_for?('slow', ClusterLocation, :perform_action, {'method' => 'clusterize_ips', 'arguments' => [u.global_id]})).to eq(false)
      expect(Worker.scheduled_for?('slow', ClusterLocation, :perform_action, {'method' => 'clusterize_geos', 'arguments' => [u.global_id]})).to eq(false)
    end

    it "should schedule a call to clusterize if geo or ip cluster not found but data present on session" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      20.times do |i|
        dd = Device.create(:user => u)
        LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => dd, :ip_address => "1.2.3.1#{i}"})
      end
      obj = OpenStruct.new
      expect(ClusterLocation.add_to_cluster(s1.global_id)).to eq(false)
      expect(Worker.scheduled_for?(:slow, ClusterLocation, :perform_action, {'method' => 'clusterize_ips', 'arguments' => [u.global_id]})).to eq(true)
      expect(Worker.scheduled_for?(:slow, ClusterLocation, :perform_action, {'method' => 'clusterize_geos', 'arguments' => [u.global_id]})).to eq(true)
    end
  end

  describe "generate_stats" do
    it "should count basic stats" do
      u = User.create
      d = Device.create(:user => u)
      c = ClusterLocation.create(:user => u, :cluster_type => 'geo')
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'utterance' => {'text' => 'hello there', 'buttons' => []}, 'type' => 'utterance', 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s1.geo_cluster_id = c.id
      s1.save
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'type' => 'button', 'button' => {'button_id' => '1', 'label' => 'hat', 'board' => {'id' => '1_1'}}, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2.geo_cluster_id = c.id
      s2.save
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      c.reload
      expect(c.data['total_utterances']).to eq(1)
      expect(c.data['total_buttons']).to eq(1)
      expect(c.data['total_boards']).to eq(1)
    end
    
    # An assessment session stores stats without utterance or button counters
    # (LogSession sets data['stats'] = {} for assessments). Raising on it stopped the cluster's
    # stats for good, which also froze updated_at, the field the 12-month purge reads.
    it "should count an assessment session that has no utterance or button counters" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({'assessment' => {'totals' => {'correct' => 1, 'incorrect' => 0}, 'tallies' => []},
        'events' => [{'timestamp' => Time.now.to_i, 'type' => 'button', 'button' => {'label' => 'x', 'board' => {'id' => '1_1'}}}]},
        {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s.log_type).to eq('assessment')
      c = ClusterLocation.create(:user => u, :cluster_type => 'ip_address', :data => {'ip_address' => s.data['ip_address']})
      LogSession.where(id: s.id).update_all(ip_cluster_id: c.id)

      expect { ClusterLocation.find(c.id).generate_stats(true) }.not_to raise_error
      c.reload
      expect(c.data['total_sessions']).to eq(1)
      expect(c.data['last_session_id']).to eq(s.id)
    end

    it "should calculate geo as median of all sessions" do
      u = User.create
      d = Device.create(:user => u)
      c = ClusterLocation.create(:user => u, :cluster_type => 'geo')
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13', '12']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s1.geo_cluster_id = c.id
      s1.save
      s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'geo' => ['13.0001', '12.0001']}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2.geo_cluster_id = c.id
      s2.save
      ClusterLocation.all.each{|c| c.generate_stats(true) }
      c.reload
      expect(c.data['geo']).to eq([13.00005, 12.00005, 0.0])
    end
  end
  
  describe "median_geo" do
    it "should calculate the median location for a bunch of geolocation objects" do
      geos = [[1,2,3],[2,3,4]]
      expect(ClusterLocation.median_geo(geos)).to eq([1.5, 2.5, 3.5])
    end
    
    it "should use 0 for altitude of none provided" do
      geos = [[1,2],[2,3]]
      expect(ClusterLocation.median_geo(geos)).to eq([1.5, 2.5, 0.0])
    end
    
    it "should return nil of no objects passed" do
      expect(ClusterLocation.median_geo([])).to eq(nil)
      expect(ClusterLocation.median_geo(nil)).to eq(nil)
    end
  end

  describe "calculate_attributes" do
    it "should not error on no data" do
      s = LogSession.new(:data => {})
      expect { ClusterLocation.calculate_attributes(s) }.to_not raise_error
    end
    
    it "should compute a session's median geolocation" do
      s = LogSession.create(:data => {'events' => [
        {'geo' => ['1', '2', '4'], 'timestamp' => 1400104669},
        {'geo' => nil, 'timestamp' => 1400104679},
        {'geo' => ['1', '3', '4.1'], 'timestamp' => 1400104688}
      ]})
      res = ClusterLocation.calculate_attributes(s)
      expect(res['geo']).to eq([1.0, 2.5, 4.05])
    end
    
    it "should compute a session's most-common ip address" do
      s = LogSession.create(:data => {'events' => [
        {'ip_address' => '1.1.1.1', 'timestamp' => 1400104669},
        {'ip_address' => nil, 'timestamp' => 1400104687},
        {'ip_address' => '2.2.2.2', 'timestamp' => 1400104688},
        {'ip_address' => '2.2.2.2', 'timestamp' => 1400104689}
      ]})
      res = ClusterLocation.calculate_attributes(s)
      expect(res['ip_address']).to eq("0000:0000:0000:0000:0000:ffff:0202:0202")
    end
  end
  
  it "should intelligently lump ip addresses into geo clusters when a level of confidence is reached"

  # Clusters older than 12 months are deleted, measured from last use (updated_at), not
  # creation: a cluster a user keeps returning to is refreshed every time a session joins it.
  describe "purge_unused!" do
    include ActiveSupport::Testing::TimeHelpers
    let(:base) { Time.utc(2026, 6, 17, 12, 0, 0) }

    def cluster_used_at(user, ip, used_at, created_at: used_at)
      c = ClusterLocation.create(:user => user, :cluster_type => 'ip_address', :data => {'ip_address' => ip})
      c.update_columns(updated_at: used_at, created_at: created_at)
      c
    end

    it "deletes a cluster last used just outside 12 months and keeps one just inside" do
      u = User.create
      travel_to(base) do
        outside = cluster_used_at(u, '10.0.0.1', base - 12.months - 1.day)
        inside = cluster_used_at(u, '10.0.0.2', base - 12.months + 1.day)

        expect(ClusterLocation.purge_unused!).to eq(1)
        expect(ClusterLocation.where(id: outside.id)).to be_empty
        expect(inside.reload).to be_present
      end
    end

    it "keeps an old cluster that is still in use" do
      u = User.create
      travel_to(base) do
        in_use = cluster_used_at(u, '10.0.0.3', base - 1.week, created_at: base - 3.years)

        expect(ClusterLocation.purge_unused!).to eq(0)
        expect(in_use.reload).to be_present
      end
    end

    it "deletes every eligible cluster when they span several batches" do
      u = User.create
      travel_to(base) do
        old = 3.times.map { |i| cluster_used_at(u, "10.0.1.#{i}", base - 2.years) }

        expect(ClusterLocation.purge_unused!(batch_size: 1)).to eq(3)
        expect(ClusterLocation.where(id: old.map(&:id))).to be_empty
      end
    end

    # The field choice rests on this: a session joining a cluster moves updated_at.
    it "moves updated_at forward when a new session joins the cluster" do
      u = User.create
      d = Device.create(:user => u)
      # Sessions store the IP in the normalized IPv6 form; the cluster must match it.
      c = ClusterLocation.create(:user => u, :cluster_type => 'ip_address', :data => {'ip_address' => '0000:0000:0000:0000:0000:ffff:0102:0304'})
      # First run seeds the total_* counters, so only the joining session can change data below.
      ClusterLocation.find(c.id).generate_stats(true)
      stale = 13.months.ago
      c.update_column(:updated_at, stale)
      s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'type' => 'utterance', 'utterance' => {'text' => 'hi', 'buttons' => []}}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      Worker.flush_queues
      # The real join path: the session joins, the cluster's after_save queues
      # generate_stats(true), and the queued job is what moves updated_at.
      expect(ClusterLocation.add_to_ip_cluster(s1, ClusterLocation.where(user_id: u.id))).to eq(true)
      expect(c.reload.updated_at).to be_within(1.second).of(stale)
      Worker.process_queues

      expect(c.reload.updated_at).to be > stale + 1.month
    end
  end
end

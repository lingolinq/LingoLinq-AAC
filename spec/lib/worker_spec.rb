require 'spec_helper'

describe Worker do
  it "should properly flush queues" do
    Worker.schedule(User, 'do_something', 2)
    Worker.flush_queues
    expect(Worker.scheduled?(User, :do_something, 2)).to eq(false)
  end
  
  describe "perform" do
    it "should parse out Worker options and call the appropriate method" do
      expect(User).to receive(:bacon).with(12)
      Worker.perform('User', 'bacon', 12)
      
      expect(Board).to receive(:halo).with(6, {a: 1})
      Worker.perform('Board', :halo, 6, {a: 1})
    end
    
    it "should run scheduled events when told" do
      Worker.schedule(User, :bacon, 12)
      Worker.schedule(Board, :halo, 6, {a: 1})
      expect(User).to receive(:bacon).with(12)
      expect(Board).to receive(:halo).with(6, {'a' => 1})
      Worker.process_queues
    end
    
    it "should catch termination exceptions and re-queue" do
      expect(User).to receive(:bacon).with(12).and_raise(Resque::TermException.new('SIGTERM'))
      Worker.schedule(User, :bacon, 12)
      Worker.process_queues
      expect(Worker.scheduled?(User, :bacon, 12)).to be_truthy
    end

    it "should load the domain override if set" do
      JsonApi::Json.set_host("https://whatever.com:1234")
      Worker.schedule(User, :last)
      expect(JsonApi::Json).to receive(:set_host).with('https://whatever.com:1234')
      expect(JsonApi::Json).to receive(:load_domain).with('https://whatever.com:1234')
      Worker.process_queues
    end
  end
  
  describe "schedule" do
    it "should add to the queue" do
      Worker.schedule(User, 'do_something', 2)
      expect(Worker.scheduled?(User, :do_something, 2)).to be_truthy
      expect(Worker.scheduled?(User, :do_something, 1)).to be_falsey
      Worker.schedule(User, 'do_something', {a: 1, b: [2,3,4], c: {d: 7}})
      expect(Worker.scheduled?(User, :do_something, {a: 1, b: [2,3,4], c: {d: 7}})).to be_truthy
    end

    it "should add to a difference queue" do
      Worker.schedule_for('bacon', User, 'do_something', 2)
      expect(Worker.scheduled?(User, :do_something, 2)).to be_falsey
      expect(Worker.scheduled?(User, :do_something, 1)).to be_falsey
      expect(Worker.scheduled_for?('bacon', User, :do_something, 2)).to be_truthy
      expect(Worker.scheduled_for?('bacon', User, :do_something, 1)).to be_falsey
      Worker.schedule_for('priority', User, 'do_something', {a: 1, b: [2,3,4], c: {d: 7}})
      expect(Worker.scheduled?(User, :do_something, {a: 1, b: [2,3,4], c: {d: 7}})).to be_falsey
      expect(Worker.scheduled_for?('priority', User, :do_something, {a: 1, b: [2,3,4], c: {d: 7}})).to be_truthy
    end
    
    it "should add to the queue from async-enabled models" do
      User.schedule(:hip_hop, 16)
      u = User.create!
      u.schedule(:hip_hop, 17)
      expect(Worker.scheduled?(User, :perform_action, {'method' => 'hip_hop', 'arguments' => [16]})).to be_truthy
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'hip_hop', 'arguments' => [17]})).to be_truthy
    end
  end
  
  describe "perform_at" do
    it "should not log on short jobs" do
      expect(Worker).to receive(:ts).and_return(1469141072, 1469141072 + 10)
      expect(Rails.logger).to_not receive(:error)
      Worker.perform_at(:normal, 'User', 'count')
    end

    it "should log on long-running jobs" do
      expect(Worker).to receive(:ts).and_return(1469141072, 1469141072 + 65)
      expect(Rails.logger).to receive(:error).with("long-running job, User . count (), 65s")
      Worker.perform_at(:normal, 'User', 'count')
    end
    
    it "should not log on semi-long jobs for the slow queue" do
      expect(Worker).to receive(:ts).and_return(1469141072, 1469141072 + (60*2))
      expect(Rails.logger).to_not receive(:error)
      Worker.perform_at(:slow, 'User', 'count')
    end
    
    it "should log on really-long jobs for the slow queue" do
      expect(Worker).to receive(:ts).and_return(1469141072, 1469141072 + (60*11))
      expect(Rails.logger).to receive(:error).with("long-running job, User . count () (expected slow), 660s")
      Worker.perform_at(:slow, 'User', 'count')
    end
  end

  describe "clear_request_thread_caches" do
    after(:each) do
      Thread.current[:board_content_cache] = nil
      Thread.current[:word_inflection_cache] = nil
      Thread.current[:bulk_copy_in_progress] = nil
      PiiScrubber.reset_blocklist!
    end

    it "should clear all request-scoped thread caches" do
      Thread.current[:board_content_cache] = {'a' => 1}
      Thread.current[:word_inflection_cache] = {'b' => 2}
      Thread.current[:bulk_copy_in_progress] = true
      PiiScrubber.configure_blocklist(['Alice', 'Bob'])
      expect(PiiScrubber.blocklist).to eq(['Alice', 'Bob'])
      Worker.clear_request_thread_caches
      expect(Thread.current[:board_content_cache]).to be_nil
      expect(Thread.current[:word_inflection_cache]).to be_nil
      expect(Thread.current[:bulk_copy_in_progress]).to be_nil
      expect(PiiScrubber.blocklist).to eq([])
      expect(Thread.current[:pii_scrubber_blocklist_pattern]).to be_nil
    end

    it "should clear caches after a normal job runs via Worker.perform" do
      expect(User).to receive(:bacon) {
        Thread.current[:board_content_cache] = {'x' => 1}
        PiiScrubber.configure_blocklist(['Charlie'])
      }
      Thread.current[:word_inflection_cache] = {'y' => 2}
      Worker.perform('User', 'bacon')
      expect(Thread.current[:board_content_cache]).to be_nil
      expect(Thread.current[:word_inflection_cache]).to be_nil
      expect(PiiScrubber.blocklist).to eq([])
    end

    it "should clear caches after a slow-queue job runs via SlowWorker.perform" do
      # Regression: slow jobs execute through SlowWorker.perform -> Worker.perform_at,
      # bypassing Worker.perform, so the caches must be cleared on the slow path too
      # or they leak across jobs in a long-lived worker process.
      expect(User).to receive(:bacon) {
        Thread.current[:board_content_cache] = {'x' => 1}
        Thread.current[:bulk_copy_in_progress] = true
        # Mirrors AiBoardGenerator / AiWordPredictor which configure the
        # blocklist per-user before invoking the AI vendor. Without the slow-path
        # clear, this blocklist would leak into the next job on the same worker
        # and be silently applied to a different user's AiApiLog scrub via the
        # before_validation hook in app/models/ai_api_log.rb:20-24.
        PiiScrubber.configure_blocklist(['Dana'])
      }
      SlowWorker.perform('User', 'bacon')
      expect(Thread.current[:board_content_cache]).to be_nil
      expect(Thread.current[:bulk_copy_in_progress]).to be_nil
      expect(PiiScrubber.blocklist).to eq([])
    end

    it "should clear caches after a slow-queue job runs through the full enqueue + process path" do
      # End-to-end coverage: schedule onto the slow queue and let
      # Worker.process_queues pop it (which invokes SlowWorker.perform with the
      # chain-tracking arg suffix appended by boy_band). This exercises the
      # actual production code path that an OOM-causing leak would travel,
      # rather than the direct SlowWorker.perform invocation above. Catches
      # regressions where the ensure block is moved or the enqueue/pop path
      # adds a new layer that bypasses the cleared sites.
      Worker.schedule_for('slow', User, :bacon)
      expect(User).to receive(:bacon) {
        Thread.current[:board_content_cache] = {'real-enqueue' => 1}
        PiiScrubber.configure_blocklist(['Eve'])
      }
      Worker.process_queues
      expect(Thread.current[:board_content_cache]).to be_nil
      expect(PiiScrubber.blocklist).to eq([])
    end
  end

  describe "scheduled_actions" do
    it "should have list actions" do
      Worker.schedule(User, :something)
      expect(Worker.scheduled_actions.length).to eq(1)
      expect(Worker.scheduled_actions[-1].except('domain_id')).to eq({
        'class' => 'Worker', 'args' => ['User', 'something']
      })
      u = User.create
      u.schedule(:do_something, 'cool')
      expect(Worker.scheduled_actions.length).to be >= 2
      expect(Worker.scheduled_actions[-1].except('domain_id')).to eq({
        'class' => 'Worker', 'args' => ['User', 'perform_action', {'id' => u.id, 'method' => 'do_something', 'scheduled' => Time.now.to_i, 'arguments' => ['cool']}]
      })
    end
  end

  describe "stop_stuck_workers" do
    it "should have unregister only stuck workers" do
      worker1 = OpenStruct.new({
        :processing => {
          'run_at' => 6.weeks.ago
        }
      })
      worker2 = OpenStruct.new({
        :processing => {
          'run_at' => 1.seconds.ago
        }
      })
      worker3 = OpenStruct.new({
        :processing => {
        }
      })
      expect(Resque).to receive(:workers).and_return([worker1, worker2, worker3])
      expect(worker1).to receive(:unregister_worker)
      expect(worker2).to_not receive(:unregister_worker)
      expect(worker3).to_not receive(:unregister_worker)
      Worker.stop_stuck_workers
    end
  end

  describe "prune_dead_workers" do
    it "should prune dead workers" do
      worker1 = OpenStruct.new
      worker2 = OpenStruct.new
      worker3 = OpenStruct.new
      expect(Resque).to receive(:workers).and_return([worker1, worker2])
      expect(worker1).to receive(:prune_dead_workers)
      expect(worker2).to receive(:prune_dead_workers)
      expect(worker3).to_not receive(:prune_dead_workers)
      Worker.prune_dead_workers
    end
  end

  describe "kill_all_workers" do
    it "should kill all workers" do
      worker1 = OpenStruct.new
      worker2 = OpenStruct.new
      worker3 = OpenStruct.new
      expect(Resque).to receive(:workers).and_return([worker1, worker2])
      expect(worker1).to receive(:unregister_worker)
      expect(worker2).to receive(:unregister_worker)
      expect(worker3).to_not receive(:unregister_worker)
      Worker.kill_all_workers
    end
  end
  
  describe "whodunnit" do
    it "should mark whodunnit correctly" do
      PaperTrail.request.whodunnit = 'user:bob'
      u = User.create
      expect(u.versions.last.whodunnit).to eq('user:bob')
      expect(u.reload.versions.count).to eq(1)

      u.schedule(:enable_feature, 'bacon')
      Worker.process_queues
      expect(u.reload.versions.count).to eq(1)
      expect(u.versions.last.whodunnit).to eq("user:bob")
    end
  end
end

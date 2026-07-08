require 'spec_helper'

describe Progress, :type => :model do
  describe "permissions" do
  end
  
  describe "global_id (overrides standard global_id)" do
    it "should generate global_id from the nonce" do
      p = Progress.new
      p.id = 123
      p.nonce = "susan"
      expect(p.global_id).to eq("1_123_susan")
    end
    
    it "should allow finding by nonce (global_id)" do
      p = Progress.create
      expect(p.nonce).not_to eq(nil)
      expect(Progress.find_by_global_id("1_#{p.id}_#{p.nonce}")).to eq(p)
    end
  end

  describe "set_error" do
    it "should set the error on the next record" do
      p = Progress.create
      expect(p.settings['error_result']).to eq(nil)
      Progress.set_error("bacon!")
      p.error!(nil)
      expect(p.settings['error_result']).to eq('bacon!')
    end

    it "should not crash if no error set" do
      p = Progress.create
      expect(p.settings['error_result']).to eq(nil)
      p.error!(nil)
      expect(p.settings['error_result']).to eq(nil)
    end

    it "should only set the error once" do
      p = Progress.create
      p2 = Progress.create
      expect(p.settings['error_result']).to eq(nil)
      expect(p2.settings['error_result']).to eq(nil)
      Progress.set_error("bacon!")
      p.error!(nil)
      p2.error!(nil)
      expect(p.settings['error_result']).to eq('bacon!')
      expect(p2.settings['error_result']).to eq(nil)
    end
  end
  
  describe "generate_defaults" do
    it "should always have a nonce" do
      p = Progress.create
      p.generate_defaults
      n = p.nonce
      expect(n).not_to be_nil
      p.generate_defaults
      expect(p.nonce).to eq(n)
    end
    
    it "should default state to pending" do
      p = Progress.new
      p.generate_defaults
      expect(p.settings['state']).to eq('pending')
      
      p.settings['state'] = 'done'
      p.generate_defaults
      expect(p.settings['state']).to eq('done')
    end
  end

  describe "starting and finishing" do
    it "should set and save start attributes" do
      p = Progress.new
      p.start!
      expect(p.reload.started_at).to be > 10.seconds.ago
      expect(p.settings['state']).to eq('started')
    end
    
    it "should set and save finid attributes" do
      p = Progress.new
      p.finish!
      expect(p.reload.finished_at).to be > 10.seconds.ago
      expect(p.settings['state']).to eq('finished')
    end
    
    it "should set and save error attributes" do
      p = Progress.new
      e = Progress::ProgressError.new("abc")
      p.error!(e)
      expect(p.reload.finished_at).to be > 10.seconds.ago
      expect(p.settings['state']).to eq('errored')
      expect(p.settings['error']).to eq('abc')
      expect(p.settings['backtrace']).to eq('')
    end
  end

  describe "schedule" do
    it "should clear old progresses" do
      expect(Progress).to receive(:clear_old_progresses)
      Progress.schedule(User, :count)
    end
    
    it "should return a progress object" do
      res = Progress.schedule(User, :count)
      expect(res).to be_is_a(Progress)
    end
    it "should schedule a worker action for classes or objects" do
      p = Progress.schedule(User, :count)
      expect(Worker.scheduled_for?('priority', Progress, :perform_action, p.id)).to eq(true)
      expect(p.settings).to eq({'class' => 'User', 'id' => nil, 'method' => 'count', 'arguments' => [], 'for_user_global_id' => nil, 'state' => 'pending'})

      u = User.create
      p = Progress.schedule(u, :touch, true, false)
      expect(Worker.scheduled_for?('priority', Progress, :perform_action, p.id)).to eq(true)
      expect(p.settings).to eq({'class' => 'User', 'id' => u.id, 'method' => 'touch', 'arguments' => [true, false], 'for_user_global_id' => nil, 'state' => 'pending'})
    end
  end

  describe "update_current_progress" do
    it "should update the progress element for the matching pid if any" do
      progress = Progress.create
      Progress.class_variable_set(:@@running_progresses, {})
      Progress.update_current_progress(0.5, 'happiness')
      expect(progress.settings['percent']).to eq(nil)
      expect(progress.settings['message_key']).to eq(nil)

      hash = {}
      hash[Worker.thread_id] = progress
      Progress.class_variable_set(:@@running_progresses, hash)
      
      Progress.update_current_progress(0.5, 'happiness')
      progress.reload
      expect(progress.settings['percent']).to eq(0.5)
      expect(progress.settings['message_key']).to eq('happiness')
    end
  end

  describe "as_percent" do
    it "should update progresses correctly" do
      progress = Progress.create
      Progress.class_variable_set(:@@running_progresses, {})

      hash = {}
      hash[Worker.thread_id] = progress
      Progress.class_variable_set(:@@running_progresses, hash)

      Progress.as_percent(0.0, 0.5) do
        Progress.update_current_progress(0.1, 'bacon')
        progress.reload
        expect(progress.settings['percent']).to eq(0.05)

        Progress.update_current_progress(0.8, 'bacon')
        progress.reload
        expect(progress.settings['percent']).to eq(0.4)

        Progress.update_current_progress(0.9, 'bacon')
        progress.reload
        expect(progress.settings['percent']).to eq(0.4)
      end
      progress.reload
      expect(progress.settings['percent']).to eq(0.5)

      Progress.update_current_progress(0.9, 'bacon')
      progress.reload
      expect(progress.settings['percent']).to eq(0.9)

      Progress.update_current_progress(1.0, 'bacon')
      progress.reload
      expect(progress.settings['percent']).to eq(0.9)
    end

    it "should update nested progresses" do
    end
  end


  describe "clear_old_progresses" do
    it "should delete old progresses" do
      Progress.create(:finished_at => 8.days.ago)
      Progress.create(:finished_at => 6.days.ago)
      Progress.create()
      
      expect(Progress.count).to eq(3)
      Progress.clear_old_progresses
      expect(Progress.count).to eq(2)
    end
  end

  describe "perform_action" do
    it "no-ops when the progress record was deleted before the job runs" do
      p = Progress.create(:settings => {'method' => 'count', 'class' => 'User'})
      id = p.id
      p.destroy
      expect(Progress.find_by(:id => id)).to eq(nil)
      expect { Progress.perform_action(id) }.not_to raise_error
    end

    it "should set the progress record for the current pid" do
      p = Progress.create(:settings => {'method' => 'count', 'class' => 'User'})
      expect(User).to receive(:count) do |*args|
        expect(Progress.class_variable_get(:@@running_progresses)[Worker.thread_id]).to eq(p)
      end
      Progress.perform_action(p.id)
    end
    
    it "should call start! and finish! if nothing goes wrong" do
      p = Progress.create(:settings => {'method' => 'count', 'class' => 'User'})
      expect(p).to receive(:start!)
      expect(Progress).to receive(:find_by).and_return(p)
      Progress.perform_action(p.id)
      expect(p.reload.finished_at).to be > 10.seconds.ago
      expect(p.settings['state']).to eq('finished')
    end
    
    it "should call error! if there is an exception caught" do
      p = Progress.create(:settings => {'method' => 'countless', 'class' => 'User'})
      expect(p).to receive(:start!)
      expect(p).to receive(:error!) do |e|
        expect(e.message).to match(/undefined method/)
      end
      expect(Progress).to receive(:find_by).and_return(p)
      Progress.perform_action(p.id)
    end
    
    it "should call the method on the class or record specified in the progress object" do
      p = Progress.create(:settings => {'method' => 'count', 'class' => 'User'})
      expect(User).to receive(:count)
      Progress.perform_action(p.id)
      expect(p.reload.finished_at).to be > 10.seconds.ago
      expect(p.settings['state']).to eq('finished')

      u = User.create
      p = Progress.create(:settings => {'method' => 'touch', 'id' => u.id, 'class' => 'User'})
      expect_any_instance_of(User).to receive(:touch)
      Progress.perform_action(p.id)
      expect(p.reload.finished_at).to be > 10.seconds.ago
      expect(p.settings['state']).to eq('finished')
            
    end
  end
  
  describe "nested progress events" do
    class SimpleNestedProgressor
      cattr_accessor :progress
      cattr_accessor :percents
      def self.run
        self.percents = []
        Progress.as_percent(0, 0.5) do
          Progress.update_current_progress(0.3)
          self.percents << self.progress.reload.settings['percent']
          Progress.update_current_progress(0.7)
          self.percents << self.progress.reload.settings['percent']
          Progress.update_current_progress(1.0)
          self.percents << self.progress.reload.settings['percent']
        end
        self.percents << self.progress.reload.settings['percent']
        Progress.as_percent(0.5, 0.8) do
          Progress.update_current_progress(0.5)
          self.percents << self.progress.reload.settings['percent']
          Progress.update_current_progress(1.0)
          self.percents << self.progress.reload.settings['percent']
        end
        self.percents << self.progress.reload.settings['percent']
        Progress.as_percent(0.8, 1.0) do
          Progress.update_current_progress(1.0)
          self.percents << self.progress.reload.settings['percent']
        end
        self.percents << self.progress.reload.settings['percent']
      end
    end
    class NestedProgressor
      cattr_accessor :progress
      cattr_accessor :percents
      def self.run
        self.percents = []
        Progress.as_percent(0, 0.5) do
          Progress.update_current_progress(0.3)
          self.percents << self.progress.reload.settings['percent']
          Progress.update_current_progress(0.7)
          self.percents << self.progress.reload.settings['percent']
          Progress.update_current_progress(1.0)
          self.percents << self.progress.reload.settings['percent']
        end
        Progress.as_percent(0.5, 0.8) do
          Progress.update_current_progress(0.1)
          self.percents << self.progress.reload.settings['percent']
          Progress.as_percent(0.1, 0.5) do
            Progress.as_percent(0, 0.33) do
              Progress.update_current_progress(1.0)
              self.percents << self.progress.reload.settings['percent']
            end
            Progress.as_percent(0.33, 0.66) do
              Progress.update_current_progress(0.5)
              self.percents << self.progress.reload.settings['percent']

              Progress.update_current_progress(1.0)
              self.percents << self.progress.reload.settings['percent']
            end
          end
          self.percents << self.progress.reload.settings['percent']
          Progress.as_percent(0.5, 1.0) do
            Progress.update_current_progress(0.3)
            self.percents << self.progress.reload.settings['percent']
            Progress.update_current_progress(0.7)
            self.percents << self.progress.reload.settings['percent']
          end
        end
        self.percents << self.progress.reload.settings['percent']
        Progress.as_percent(0.8, 1.0) do
          Progress.update_current_progress(1.0)
          self.percents << self.progress.reload.settings['percent']
        end
        self.percents << self.progress.reload.settings['percent']
      end
    end
    it "should correctly update progress on nested progress events" do
      p = Progress.create(:settings => {'method' => 'run', 'class' => 'SimpleNestedProgressor'})
      SimpleNestedProgressor.progress = p
      Progress.perform_action(p.id)
      expect(SimpleNestedProgressor.percents).to eq([0.15, 0.15, 0.5, 0.5, 0.5, 0.5, 0.8, 1.0, 1.0])

      p = Progress.create(:settings => {'method' => 'run', 'class' => 'NestedProgressor'})
      NestedProgressor.progress = p
      Progress.perform_action(p.id)
      expect(NestedProgressor.percents[0, 4]).to eq([0.15, 0.15, 0.5, 0.5])
      # Progress doesn't get updated every single time now, only after enough
      # change, so these values don't work anymore
      expect(NestedProgressor.percents[4]).to eq(0.53) #(0.5 + (0.1 * 0.1) + 0.3*0.4*0.33).round(2))
      expect(NestedProgressor.percents[5]).to eq(0.57) # (0.5 + (0.3 * 0.1) + 0.3*0.4*0.33 + 0.3*0.4*0.33*0.5).round(2))
      expect(NestedProgressor.percents[6]).to eq(0.57) #(0.5 + (0.3 * 0.1) + 0.3*0.4*0.33 + 0.3*0.4*0.33).round(2))
      expect(NestedProgressor.percents[7]).to eq(0.65) #0.5 + (0.3 * 0.1) + 0.3*0.4)
      expect(NestedProgressor.percents[8]).to eq(0.65) #(0.5 + (0.3 * 0.1) + 0.3*0.4 + 0.3*0.5*0.3).round(2))
      expect(NestedProgressor.percents[9]).to eq(0.65) #(0.5 + (0.3 * 0.1) + 0.3*0.4 + 0.3*0.5*0.7).round(2))
      expect(NestedProgressor.percents[10]).to eq(0.8)
      expect(NestedProgressor.percents[11]).to eq(1.0)
      expect(NestedProgressor.percents[12]).to eq(1.0)
    end
  end
            
  it "should securely serialize settings" do
    p = Progress.new(:settings => {:a => 1})
    p.generate_defaults
    expect(GoSecure::SecureJson).to receive(:dump).with(p.settings)
    p.save
  end
end

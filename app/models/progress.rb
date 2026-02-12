class Progress < ActiveRecord::Base
  include GlobalId
  include SecureSerialize
  protect_global_id
  secure_serialize :settings
  before_save :generate_defaults
  
  include Permissions
  add_permissions('view' ,['*']) { true }
  
  
  def generate_defaults
    self.settings ||= {}
    self.settings['state'] ||= 'pending'
  end
  
  def start!
    self.started_at = Time.now
    self.settings ||= {}
    self.settings['state'] = 'started'
    self.save!
  end

  def self.chain(progress)
    if @@running_progresses[Worker.thread_id]
      current_progress = @@running_progresses[Worker.thread_id]
      progress.settings['root_id'] = current_progress.settings['root_id'] || current_progress.global_id
      progress.save
      current_progress.settings['following_id'] = progress.global_id
      root = current_progress
      root = Progress.find_by_global_id(current_progress.settings['root_id']) if current_progress.settings['root_id']
      root.settings['last_following_id'] = progress.global_id
      root.save
      current_progress.save unless current_progress == root
    end
  end

  def last_in_chain
    if self.settings['last_following_id']
      return Progress.find_by_global_id(self.settings['last_following_id'])
    end
  end
  
  def finish!
    self.finished_at = Time.now
    self.settings ||= {}
    self.settings['state'] = 'finished'
    self.save!
  end
  
  def error!(e)
    self.settings ||= {}
    if e
      self.settings['error'] = e.message.to_s
      self.settings['backtrace'] = e.backtrace.to_s
    end
    @@progress_error ||= nil
    if @@progress_error
      self.settings['error_result'] = @@progress_error
      @@progress_error = nil
    end
    self.finished_at = Time.now
    self.settings['state'] = 'errored'
    self.save!
  end
  
  def error_message
    puts ([self.settings['error']] + JSON.parse(self.settings['backtrace'])).join("\n")
    nil
  end

  def self.set_error(str)
    @@progress_error = str
  end
  
  def self.schedule(obj, method, *args)
    # TODO: this (clear_old_progresses) should probably be more of a cron task
    clear_old_progresses
    
    id = nil
    if obj.is_a?(ActiveRecord::Base)
      id = obj.id
      obj = obj.class
    end
    progress = Progress.new
    progress.settings = {
      'class' => obj.to_s,
      'id' => id,
      'method' => method,
      'arguments' => args
    }
    progress.save!
    Worker.schedule_for(:priority, Progress, :perform_action, progress.id)
    progress
  end
  # p = Progress.create(settings: {'class' => 'Board', 'id' => Board.find_by_path('example/core-24').id.to_s, 'method' => 'generate_download', 'arguments' => ["1_2", "pdf", {"include"=>"all", "headerless"=>true, "text_on_top"=>true, "transparent_background"=>true, "symbol_background"=>nil, "text_only"=>false, "text_case"=>nil, "font"=>"default"}]}); Progress.perform_action(p.id)
  # Progress.perform_action(4511932)
  
  def self.as_percent(start_percent, end_percent, &block)
    @@running_progresses ||= {}
    progress = @@running_progresses[Worker.thread_id]
    if progress
      # puts "BLOCK START #{start_percent} #{end_percent}"
      # initialize block
      progress.settings['current_multiplier'] ||= 1.0
      start_percent = [0, start_percent].compact.max.to_f
      end_percent = [1.0, [start_percent, end_percent].max.to_f].min
      percent_spread = (end_percent - start_percent)
      percent_tally_addition = start_percent * progress.settings['current_multiplier']
      progress.settings['percent_tallies'] ||= []
      full_percent_tally_addition = end_percent * progress.settings['current_multiplier']
      full_percent_tally_addition += progress.settings['percent_tallies'].sum
      
      # prep for progress updates
      progress.settings['percent_tallies'] << percent_tally_addition
      progress.settings['percents_before'] ||= []
      progress.settings['percents_before'] << percent_spread.to_f
      progress.settings['current_multiplier'] = (progress.settings['current_multiplier'] * percent_spread).round(4)
      progress.save
      block.call
      
      # tear-down after progress updates
      # if full_percent_tally_addition.round(2) < (progress.settings['percent'] || 0)
      #   puts "WENT BACKWARDS! from #{progress.settings['percent']} to #{full_percent_tally_addition}"
      #   puts JSON.pretty_generate(progress.settings)
      #   raise "asdf"
      # else
      #   puts "WENT FORWARDS! from #{progress.settings['percent']} to #{full_percent_tally_addition} #{progress.settings['message_key']}"
      # end
      progress.settings['percent'] = full_percent_tally_addition.round(2)
      progress.settings['percent_tallies'].pop
      progress.settings['percents_before'].pop
      progress.settings['current_multiplier'] = (progress.settings['current_multiplier'] / percent_spread).round(4)
      progress.save
      # puts "BLOCK END"
    else
      block.call
    end
  end

  def self.update_minutes_estimate(minutes, message_key=nil)
    @@running_progresses ||= {}
    progress = @@running_progresses[Worker.thread_id]
    if progress && (progress.settings['minutes_estimate'] != minutes || (message_key && progress.settings['message_key'] != message_key))
      progress.settings['minutes_estimate'] = minutes.round
      progress.settings['message_key'] = message_key.to_s if message_key
      progress.save
    end
  end
  
  def self.update_current_progress(percent, message_key=nil)
    @@running_progresses ||= {}
    progress = @@running_progresses[Worker.thread_id]
    if progress
      if progress.settings['current_multiplier']
        percent *= progress.settings['current_multiplier'] || 1.0
        percent += progress.settings['percent_tallies'].sum
      end
      percent = [[0.0, percent].max, 1.0].min
      # if percent.round(2) + 0.1 < (progress.settings['percent'] || 0)
      #   puts "WENT BACKWARDS from #{progress.settings['percent']} to #{percent}"
      #   puts JSON.pretty_generate(progress.settings)
      #   # raise "asdf"
      # else
      #   puts "WENT FORWARDS from #{progress.settings['percent']} to #{percent} #{message_key || 'unnamed update'}"
      # end
      progress.settings['percent'] = percent.round(2)
      progress.settings['message_key'] = message_key.to_s if message_key
      if !progress.settings['last_saved_percent'] || progress.settings['last_saved_percent'] < progress.settings['percent'] - 0.3
        progress.settings['last_saved_percent'] = progress.settings['percent']
        progress.save
      end
    else
      false
    end
  end
 
  def self.clear_old_progresses
    Progress.where(["finished_at IS NOT NULL AND finished_at < ?", 7.days.ago]).delete_all
  end
  
  def self.perform_action(progress_id)
    progress = Progress.find_by(:id => progress_id)
    @@running_progresses ||= {}
    @@running_progresses[Worker.thread_id] = progress
    progress.start!
    obj = progress.settings['class'].constantize
    if progress.settings['id']
      obj = obj.find_by(:id => progress.settings['id'])
    end
    begin
      Progress.as_percent(0, 1.0) do
        res = obj.send(progress.settings['method'], *progress.settings['arguments'])
        progress.settings['result'] = res
        progress.finish!
      end
    rescue ProgressError => e
      Rails.logger.error("[Progress#perform_action] ProgressError in #{progress.settings['class']}.#{progress.settings['method']}: #{e.message}")
      progress.error!(e)
    rescue => e
      Rails.logger.error("[Progress#perform_action] Error in #{progress.settings['class']}.#{progress.settings['method']}: #{e.class}: #{e.message}")
      Rails.logger.error("[Progress#perform_action] #{e.backtrace&.first(5)&.join("\n")}")
      progress.error!(e)
      if Rails.env.development?
        raise e
      end
    end
    @@running_progresses[Worker.thread_id] = nil
    progress
  end

  class ProgressError < StandardError
  end
end

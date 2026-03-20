class LogSession < ActiveRecord::Base
  include Async
  include Processable
  include GlobalId
  include SecureSerialize
  include Notifier
  include ExtraData
  belongs_to :user
  belongs_to :author, :class_name => 'User'
  belongs_to :ip_cluster, :class_name => 'ClusterLocation', optional: true
  belongs_to :geo_cluster, :class_name => 'ClusterLocation', optional: true
  belongs_to :device
  belongs_to :goal, :class_name => 'UserGoal', optional: true
  before_save :generate_defaults
  before_save :generate_stats
  after_save :split_out_later_sessions
  after_save :schedule_clustering
  after_save :schedule_summary
  after_save :push_notification
  after_save :update_board_connections
  after_save :update_profile_summaries
  include Replicate

  has_paper_trail :on => [:destroy] #:only => [:data, :user_id, :author_id, :device_id]
  secure_serialize :data
  DAILY_EVENT_TYPES = ['models', 'modeled', 'remote_models', 'focus_words', 'eval', 'modeling_ideas', 'notes', 'quick_assessments', 'goals', 'profile'];

  def generate_defaults
    self.data ||= {}
    return true if skip_extra_data_processing?
    self.data['events'] ||= []
    if self.user_id && self.id
      ApplicationRecord.using(:master) do
        # pull in missing job_stash events that might have gotten clobbered
        ids = {}
        self.data['events'].each{|e| ids[e['id']] = true }
        JobStash.events_for(self).each do |event|
          self.data['events'] << event if event['id'] && !ids[event['id']]
          ids[event['id']] = true
        end
      end
    end
    # if two events share the same timestamp, put the buttons before the actions
    if !self.data['note']
      self.data['events'].sort_by!{|e| [e['timestamp'] || 0, (e['type'] == 'button' ? 0 : 1)] }
      last = self.data['events'].last
      first = self.data['events'].first
      self.ended_at = (last && last['timestamp']) ? DateTime.strptime(last['timestamp'].to_s, '%s') : nil
      self.started_at = (first && first['timestamp']) ? DateTime.strptime(first['timestamp'].to_s, '%s') : nil
      if self.ended_at && self.started_at == self.ended_at && self.data['events']
        self.ended_at += 5
      end
      self.data['event_count'] = self.data['events'].length
    end

    attrs = ClusterLocation.calculate_attributes(self)
    self.data['geo'] = attrs['geo']
    self.geo_cluster_id = nil if !self.data['geo']
    self.geo_cluster_id = nil if self.data['geo'] && self.geo_cluster_id == -1
    self.data['ip_address'] = attrs['ip_address']
    self.ip_cluster_id = nil if !self.data['ip_address']
    self.ip_cluster_id = nil if self.data['ip_address'] && self.ip_cluster_id == -1
    self.data['readable_ip_address'] = attrs['readable_ip_address']

    # Enforce org data policy: strip geo/IP data if org explicitly disallows geo logging
    if self.user && self.user.effective_data_policy['geo_logging_allowed'] == false
      self.data.delete('geo')
      self.data.delete('ip_address')
      self.data.delete('readable_ip_address')
      self.geo_cluster_id = nil
      self.ip_cluster_id = nil
    end

    self.data['duration'] = last && last['timestamp'] && first && first['timestamp'] && (last['timestamp'] - first['timestamp'])
    utterances = self.data['events'].select{|e| e['type'] == 'utterance' }
    buttons = self.data['events'].select{|e| e['type'] == 'button' }
    self.data['button_count'] = buttons.length
    self.data['utterance_count'] = utterances.length
    self.data['utterance_word_count'] = utterances.map{|u| u['utterance']['text'].split(/\s+/).length }.sum
    
    last_stamp = nil
    last_highlight_stamp = nil
    max_diff = (60.0 * 10.0)
    max_dots = 5
    str = ""
    hit_locations = {}
    event_notes = 0
    ids = (self.data['events'] || []).map{|e| e['id'] }.compact
    seen_ids = {}
    spelling_sequence = []
    highlight_words = []
    last_board_id = nil
    word_lookups = (self.data['events']).map{|e| LogSession.event_text(e) }.compact.uniq
    # TODO: find_words can support locales
    words = WordData.find_words(word_lookups)
    incrs = 0
    (self.data['events'] || []).each_with_index do |event, idx|
      next_event = self.data['events'][idx + 1]
      event.each do |key, val|
        event.delete(key) if val == nil
      end
      parts = event['button'] && (event['button']['vocalization'] || "").split(/&&/).map{|v| v.strip }.select{|p| p.match(/^(\+|:)/)}
      parts ||= []
      next_parts = event['button'] && next_event && next_event['button'] && (next_event['button']['vocalization'] || "").split(/&&/).map{|v| v.strip }.select{|v| v.match(/^(\+|:)/)}
      next_parts ||= []
      if next_parts.any?{|p| p.match(/^:/) }
        event['modified_by_next'] = true
      end
      # if it's part of a spelling, add the letter(s) to the spelling sequence
      if parts.any?{|p| p.match(/^\+/) }
        spelling_next = !!next_parts.any?{|p| p.match(/^\+/)}
        event['modified_by_next'] ||= spelling_next
        parts.select{|p| p.match(/^\+/)}.each do |part|
          spelling_sequence << part[1..-1]
        end
      # if it's a modifier, mark the spelling sequence as tainted (it'll be handled by the completion, anyway)
      elsif parts.any?{|p| p.match(/^:/) }
        spelling_sequence << ":"
      end
      event_word_updated = false
      
      # if this is the end of the spelling sequence, go ahead and try to process it
      if spelling_sequence.length > 0 && !event['modified_by_next']
        # if it's not tainted, combine it
        if !spelling_sequence.any?{|s| s == ":" }
          spelling = spelling_sequence.join("").strip
          event_word_updated = true unless event['spelling'] == spelling
          event['spelling'] = spelling unless spelling.match(/:/)
        end
        spelling_sequence = []
      end
      if event['button'] && event['button']['percent_x'] && event['button']['percent_y'] && event['button']['board'] && event['button']['board']['id']
        x = (event['button']['percent_x']* 2).to_f.round(1) / 2
        y = (event['button']['percent_y'] * 2).to_f.round(1) / 2
        board_id = event['button']['board']['id']
        hit_locations[board_id] ||= {}
        hit_locations[board_id][x] ||= {}
        hit_locations[board_id][x][y] ||= 0
        hit_locations[board_id][x][y] += 1
        if board_id != last_board_id
          event['button']['first_on_board'] = true
        end
        last_board_id = board_id
      end

      if event['button'] && event['button']['label'] && (!event['parts_of_speech'] || event['parts_of_speech']['types'] == ['other'])
        if event['button']['part_of_speech']
          speech = {'types' => [event['button']['part_of_speech']]}
        end
        word = LogSession.event_text(event)
        speech ||= words[word]
        speech ||= WordData.find_word(word) if event_word_updated

        if !speech && !event['modified_by_next'] && (event['spelling'] || event['button']['completion'] || !(event['button']['vocalization'] || "").strip.match(/^[\+:]/))
          speech = {'types' => ['other']}
          if event['button'] && event['button']['type'] == 'speak' && !word.match(/\s/) && incrs < 25
            incrs += 1
            RedisInit.default.hincrby('missing_words', word.to_s, 1) if RedisInit.default
          end
        end
        speech = nil unless speech && speech['types']
        speech = speech.slice('types', 'word') if speech
        event['parts_of_speech'] = speech
        event['core_word'] = WordData.core_for?(word, self.user)
      end
      event_notes += (event['notes'] || []).length
    
      event['id'] = nil if event['id'] && seen_ids[event['id']]
      event['id'] ||= (ids.max || 0) + 1
      ids << event['id']
      seen_ids[event['id']] = true
      
      next if event['action'] && event['action']['action'] == 'auto_home'
      stamp = event['timestamp']
      event_string = event['button'] && event['button']['label']
      event_string = nil if event['button'] && !event['button']['spoken'] && !event['button']['for_speaking']
      event_string = "[#{event['action']['action']}]" if event['action'] && ['clear', 'vocalize', 'backspace', 'home'].include?(event['action']['action'])
      event_string = "_" if event['action'] && event['action']['action'] == 'open_board'
      event_string = "✖" if event['action'] && event['action']['action'] == 'clear'
      event_string = "⌂" if event['action'] && event['action']['action'] == 'home'
      event_string = "‹" if event['action'] && event['action']['action'] == 'backspace'
      event_string = "💬" if event['action'] && event['action']['action'] == 'vocalize'
      event_string = event['button']['completion'] if event && event['button'] && event['button']['completion']
      event_string = "💬" if event['utterance']
      event_string ||= ""
      if !last_stamp
        str += event_string
      else
        stamp ||= last_stamp + max_diff
        diff = [0.0, [stamp - last_stamp, max_diff].min].max
        dots = " "
        dots = "." + dots if diff >= max_diff
        dots = "." + dots if diff > (60.0 * 5.0)
        dots = "." + dots if diff > (60.0 * 1.0)
        dots = "." + dots if diff > 10
        str += dots + event_string
      end
      if event['highlighted']
        last_highlight_stamp ||= stamp
        diff = [0.0, [stamp - last_highlight_stamp, max_diff].min].max
        highlight_string = event_string
        if diff >= max_diff
          highlight_words << ".."
        end
        highlight_words << highlight_string 
        last_highlight_stamp = stamp
      end
      last_stamp = stamp
    end
    self.data['event_note_count'] = event_notes
    self.has_notes = event_notes > 0
    self.data['touch_locations'] = hit_locations
    self.log_type = 'session' unless self.log_type == 'modeling_activities'
    if self.data['note']
      self.log_type = 'note'
      if self.data['note']['timestamp']
        time = DateTime.strptime(self.data['note']['timestamp'].to_s, '%s')
        self.started_at = time
        self.ended_at = time
      end
      self.started_at ||= Time.now
      self.ended_at ||= self.started_at
      str = "Note by #{self.author ? self.author.user_name : 'user'}: "
      str = "Note by #{self.data['author_contact']['name']}: " if self.data['author_contact']
      if self.data['note']['video'] 
        duration = self.data['note']['video']['duration'].to_i
        time = "#{duration}s"
        if duration > 60
          time = "#{(duration / 60).to_i}m"
        end 
        str += "recording (#{time})"
        str += " - #{self.data['note']['text']}" if !self.data['note']['text'].blank?
      else
        str += self.data['note']['text'] || ""
      end
    elsif self.data['assessment']
      self.log_type = 'assessment'
      str = "Assessment by #{self.author ? self.author.user_name : 'user'}: "
      str += self.data['assessment']['description'] || "Quick assessment"

      self.data['assessment']['totals'] ||= {}
      tallies_raw = self.data['assessment']['tallies']
      tallies_raw = tallies_raw.values if tallies_raw.is_a?(Hash)
      self.data['assessment']['tallies'] = Array(tallies_raw || [])
      self.data['assessment']['totals']['correct'] ||= 0
      self.data['assessment']['totals']['incorrect'] ||= 0
      correct = (self.data['assessment']['totals']['correct'] || 0).to_i
      incorrect = (self.data['assessment']['totals']['incorrect'] || 0).to_i
      post_str = "(#{correct} correct, #{incorrect} incorrect"
      total = correct + incorrect
      if total > 0
        pct = (correct.to_f / total.to_f * 100).round(1)
        post_str += ", #{pct}%"
      end
      post_str += ")"
      self.data['assessment']['summary'] = post_str
      str += " " + post_str

      ts_val = self.data['assessment']['start_timestamp']
      self.started_at = (Time.at(ts_val.to_f).to_datetime rescue nil) if ts_val.present?
      ts_val = self.data['assessment']['end_timestamp']
      self.ended_at = (Time.at(ts_val.to_f).to_datetime rescue nil) if ts_val.present?
      last_tally = self.data['assessment']['tallies'].last
      first_tally = self.data['assessment']['tallies'].first
      ts_val = first_tally && first_tally['timestamp']
      self.started_at ||= (Time.at(ts_val.to_f).to_datetime rescue nil) if ts_val.present?
      ts_val = last_tally && last_tally['timestamp']
      self.ended_at ||= (Time.at(ts_val.to_f).to_datetime rescue nil) if ts_val.present?
      self.started_at ||= Time.now
      self.ended_at ||= self.started_at
    elsif self.data['eval']
      self.log_type = 'eval'
      str = "Evaluation by #{self.author ? self.author.user_name : 'user'}: "
      str += self.data['eval']['name'] || "Evaluation"
      self.started_at = DateTime.strptime(self.data['eval']['started'].to_s, '%s') if self.data['eval']['started']
      self.ended_at = DateTime.strptime(self.data['eval']['ended'].to_s, '%s') if self.data['eval']['ended']
      if !self.data['prior_evals']
        existing_evals = LogSession.where(user_id: self.user_id, log_type: 'eval').count
        self.data['prior_evals'] = existing_evals
      end
      self.data['duration'] = (self.ended_at - self.started_at).to_i rescue nil
    elsif self.data['profile']
      self.log_type = 'profile'
      str = "Profile: by #{self.author ? self.author.user_name : 'user'}: "
      str += self.data['profile']['name'] || "Communication Profile"
      self.started_at = DateTime.strptime(self.data['profile']['started'].to_s, '%s') if self.data['profile']['started']
      self.started_at ||= self.created_at
      self.ended_at = DateTime.strptime((self.data['profile']['ended'] || self.data['profile']['submitted']).to_s, '%s') if self.data['profile']['ended'] || self.data['profile']['submitted']
      self.data['duration'] = (self.ended_at - self.started_at).to_i rescue nil
      self.data['guid'] = self.data['profile']['guid']
      if self.data['profile']['type'] != 'funding'
        self.profile_id = self.data['profile']['id']
        self.profile_id ||= self.data['profile']['template_id']
      end
    elsif self.data['journal']
      self.log_type = 'journal'
      self.started_at ||= Time.at(self.data['journal']['timestamp'] || Time.now.to_i)
      self.data['events'] = []
    elsif self.data['days']
      self.log_type = 'daily_use'
      self.data['events'] = []
    end
    self.score ||= rand(5) if self.log_type == 'note'
    if self.data['goal']
      if self.data['assessment']
        self.data['goal']['positives'] = self.data['assessment']['totals']['correct']
        self.data['goal']['negatives'] = self.data['assessment']['totals']['incorrect']
      elsif self.data['goal']['status']
        self.data['goal']['positives'] = self.data['goal']['status'] > 1 ? 1 : 0
        self.data['goal']['negatives'] = self.data['goal']['status'] <= 1 ? 1 : 0
      end
      self.score = self.data['goal']['status']
    end
    self.data['event_summary'] = str
    self.highlighted = true if highlight_words.length > 0
    self.data['highlight_summary'] = highlight_words.join(' ').gsub(/ \.\./, '..')
    self.data['nonce'] ||= GoSecure.nonce('log_nonce')
    
    if (!self.geo_cluster_id || !self.ip_cluster_id) && (!self.last_cluster_attempt_at || self.last_cluster_attempt_at < 12.hours.ago)
      self.last_cluster_attempt_at = Time.now
      @clustering_scheduled = true
    end
    
    self.processed ||= false
    if self.needs_remote_push == nil
      org_allows_logging = self.user.effective_data_policy['logging_allowed'] != false
      self.needs_remote_push = !!(self.log_type == 'session' && self.user_id && self.user && !self.user.private_logging? && org_allows_logging) 
    end
    throw(:abort) unless self.user_id && self.author_id && self.device_id
    true
  end
  
  def self.event_text(event)
    return nil unless event
    (event['button'] && event['button']['completion']) || event['spelling'] || (event['button'] && event['button']['vocalization']) || (event['button'] && event['button']['label']) || nil
  end

  def anonymized_identifier
    self.data ||= {}
    if !self.data['anonymized_identifier']
      self.data['anonymized_identifier'] = GoSecure.nonce('log_pseudonymization')
      self.save
    end
    GoSecure.lite_hmac("#{self.global_id}:#{self.created_at.iso8601}", self.data['anonymized_identifier'], 1)
  end
  
  def require_nonce
    if !self.data['nonce']
      self.data['nonce'] = GoSecure.nonce('log_nonce')
      self.save
    end
    self.data['nonce']
  end
  
  def generate_stats
    self.data['stats'] ||= {}
    return true if skip_extra_data_processing?
    return true if self.log_type == 'note' || self.log_type == 'journal'
    # TODO: questions we want to answer:
    # for board B, what's the most common starting location
    # for board B, how much travel and usage does each button get?
    # for user U, how much work (travel AND activation) and usage does each word get?
    # for parent_board P, what's the most common starting location?
    # for parent_board P, how much travel and usage does each button get?
    # for parent board P, how much travel and usage does each button (including sub-boards, with measurements relative to this board as the starting place) get?
    # for argument's sake, let's say activate = 0.5 pct_travel
    self.data['stats']['session_seconds'] = 0
    self.data['stats']['utterances'] = 0.0
    self.data['stats']['utterance_words'] = 0.0
    self.data['stats']['utterance_buttons'] = 0.0
    self.data['stats']['all_button_counts'] = {}
    self.data['stats']['all_word_counts'] = {}
    self.data['stats']['all_word_sequence'] = []
    self.data['stats']['modeled_button_counts'] = {}
    self.data['stats']['modeled_word_counts'] = {}
    self.data['stats']['all_board_counts'] = {}
    self.data['stats']['parts_of_speech'] = {}
    self.data['stats']['modeled_parts_of_speech'] = {}
    self.data['stats']['core_words'] = {}
    self.data['stats']['modeled_core_words'] = {}
    self.data['stats']['parts_of_speech_combinations'] = {}
    self.data['stats']['board_keys'] = {}
    self.data['stats']['word_pairs'] = {}
    self.data['stats']['time_blocks'] = {}
    self.data['stats']['modeled_time_blocks'] = {}
    self.data['stats']['volumes'] = {}
    self.data['stats']['all_ambient_light_levels'] = []
    self.data['stats']['all_screen_brightness_levels'] = []
    self.data['stats']['all_orientations'] = []
    utterance_lengths = []
    speech_lengths = []
    valid_words = WordData.standardized_words
    if self.device && self.user
      device_prefs = self.user.settings['preferences']['devices'][self.device.device_key]
      if device_prefs
        device_prefs['access_method'] = self.user.access_methods(self.device)[0]
        self.data['stats']['voice_uri'] = ((device_prefs['voice'] || {})['voice_uris'] || [])[0] || 'default'
        self.data['stats']['text_position'] = device_prefs['text_position'] || 'top'
        self.data['stats']['auto_home_return'] = self.user.settings['preferences']['auto_home_return']
        self.data['stats']['auto_home_return'] = true if self.data['stats']['auto_home_return'] == nil
        self.data['stats']['vocalization_height'] = device_prefs['vocalization_height']
      end
    end
    
    if self.data['events'] && self.started_at && self.ended_at
      self.data['stats']['session_seconds'] = (self.ended_at - self.started_at).to_i

      last_button_event = nil
      travel_tally = 0
      self.data['events'].each do |event|
        self.data['stats']['modeling_events'] ||= 0
        if event['modeling']
          self.data['stats']['modeling_events'] += 1 
          modeling_user_id = event['session_user_id']
          modeling_user_id ||= self.related_global_id(self.author_id) if self.author_id != self.user_id
          modeling_user_id ||= self.related_global_id(self.user_id)
          self.data['stats']['modeling_user_ids'] ||= {}
          self.data['stats']['modeling_user_ids'][modeling_user_id] ||= 0
          self.data['stats']['modeling_user_ids'][modeling_user_id] += 1
          self.data['stats']
        end
        self.data['stats']['system'] ||= event['system']
        self.data['stats']['browser'] ||= event['browser']
        self.data['stats']['window_width'] ||= event['window_width'] if event['window_width'] && event['window_width'] > 0
        self.data['stats']['window_height'] ||= event['window_height'] if event['window_height'] && event['window_height'] > 0

        if event['type'] == 'button' && event['button'] && event['button']['board']
          key = event['button']['board']['key']
          self.data['stats']['board_keys'][key] ||= 0
          self.data['stats']['board_keys'][key] += 1
        end
        if event['timestamp']
          timed_block = event['timestamp'].to_i / 15
          key = event['modeling'] ? 'modeled_time_blocks' : 'time_blocks'
          self.data['stats'][key][timed_block] ||= 0
          self.data['stats'][key][timed_block] += 1
        end

        if !event['modeling'] && event['type'] == 'utterance'
          self.data['stats']['utterances'] += 1
          self.data['stats']['utterance_words'] += event['utterance']['text'].split(/\s+/).length
          utterance_lengths << event['utterance']['text'].length
          speech_lengths << event['utterance']['text'].length
          self.data['stats']['utterance_buttons'] += (event['utterance']['buttons'] || []).length
        elsif event['type'] == 'button'
          if event['button'] && event['button']['access']
            self.data['stats']['access_method'] = event['button']['access']
          end
          if event['button'] && event['button']['board']
            button = {
              'button_id' => event['button']['button_id'],
              'board_id' => event['button']['board']['id'],
              'text' => LogSession.event_text(event),
              'count' => 0
            }
            button['overlay'] = event['button']['overlay'] if event['button']['overlay']
            if (event['button']['depth'] || 0) == 0
              travel_tally = 0
            else
              travel_tally += LogSession.travel_activation_score
            end
            travel_tally += LogSession.travel_activation_score if event['button']['overlay']
            travel_tally += event['button']['percent_travel'] || 0

            if button['button_id'] && button['board_id']
              ref = "#{button['button_id']}::#{button['board_id']}"
              if !event['modeling']
                self.data['stats']['all_button_counts'][ref] ||= button
                if self.data['stats']['all_button_counts'][ref]['overlay'] && !button['overlay']
                  self.data['stats']['all_button_counts'][ref].delete('overlay')
                  self.data['stats']['all_button_counts'][ref]['text'] = LogSession.event_text(event);
                end
                self.data['stats']['all_button_counts'][ref]['count'] += 1
                if event['button']['depth']
                  # This will only allow us to determine the
                  # amount of work to reach this button on average.
                  # When looking at trends for how many buttons are
                  # hit at different depths, it will affect the
                  # accuracy of the data, but on average it's
                  # probably ok.
                  self.data['stats']['all_button_counts'][ref]['depth_sum'] = (self.data['stats']['all_button_counts'][ref]['depth_sum'] || 0) + (event['button']['depth'])
                end
                if event['button']['percent_travel']
                  # add total travel distance for the button, and mark if it was spoken or not,
                  # because we really mostly just care about travel distance for spoken buttons
                  self.data['stats']['all_button_counts'][ref]['spoken'] = true if (event['button']['spoken'] || event['button']['for_speaking'])
                  self.data['stats']['all_button_counts'][ref]['full_travel_sum'] ||= 0
                  self.data['stats']['all_button_counts'][ref]['full_travel_sum'] += travel_tally.round(2)
                end
                if button['text'] && button['text'].length > 0 && (event['button']['spoken'] || event['button']['for_speaking'])
                  speech_lengths << button['text'].length
                  button['text'].split(/\s+/).each do |word|
                    self.data['stats']['all_word_counts'][word.downcase] ||= 0
                    self.data['stats']['all_word_counts'][word.downcase] += 1
                    self.data['stats']['all_word_sequence'] << word if word
                  end
                end
            
                board = event['button']['board'].merge({'count' => 0})
                self.data['stats']['all_board_counts'][button['board_id']] ||= board
                self.data['stats']['all_board_counts'][button['board_id']]['count'] ||= 0
                self.data['stats']['all_board_counts'][button['board_id']]['count'] += 1
              else
                self.data['stats']['modeled_button_counts'][ref] ||= button
                if self.data['stats']['modeled_button_counts'][ref]['overlay'] && !button['overlay']
                  self.data['stats']['modeled_button_counts'][ref].delete('overlay')
                  self.data['stats']['modeled_button_counts'][ref]['text'] = LogSession.event_text(event);
                end
                self.data['stats']['modeled_button_counts'][ref]['count'] += 1
                if button['text'] && button['text'].length > 0 && (event['button']['spoken'] || event['button']['for_speaking'])
                  button['text'].split(/\s+/).each do |word|
                    self.data['stats']['modeled_word_counts'][word.downcase] ||= 0
                    self.data['stats']['modeled_word_counts'][word.downcase] += 1
                  end
                end
              end
            end
          end

          pairs = {}
          text = LogSession.event_text(event)
          if text && text.length > 0 && (event['button']['spoken'] || event['button']['for_speaking'])
            if last_button_event
              last_text = LogSession.event_text(last_button_event)
              if valid_words[text.downcase] && last_text && valid_words[last_text.downcase]
                if (event['timestamp'] || 0) - (last_button_event['timestamp'] || 0) < 5.minutes.to_i
                  a = last_text.downcase.strip
                  b = text.downcase.strip
                  if a != b
                    hash = Digest::MD5.hexdigest(b + "::" + a)
                    pairs[hash] ||= {
                      'a' => a,
                      'b' => b,
                      'count' => 0
                    }
                    pairs[hash]['count'] += 1
                  end
                end
              end
            end
            last_button_event = event
          end
          pairs.each do |pair, hash|
            if self.data['stats']['word_pairs'][pair]
              self.data['stats']['word_pairs'][pair]['count'] += hash['count']
            else
              self.data['stats']['word_pairs'][pair] = hash
            end
          end
        end
        
        if event['volume']
          vol = (event['volume'] * 100).to_i
          self.data['stats']['volumes'][vol] ||= 0
          self.data['stats']['volumes'][vol] += 1
        end
        self.data['stats']['all_ambient_light_levels'] << event['ambient_light'].to_f if event['ambient_light']
        self.data['stats']['all_screen_brightness_levels'] << (event['screen_brightness'] * 100).to_f if event['screen_brightness']
        if event['orientation']
          event['orientation']['alpha'] = event['orientation']['alpha'].to_f.round(2) if event['orientation']['alpha']
          event['orientation']['beta'] = event['orientation']['beta'].to_f.round(2) if event['orientation']['beta']
          event['orientation']['gamma'] = event['orientation']['gamma'].to_f.round(2) if event['orientation']['gamma']
          self.data['stats']['all_orientations'] << event['orientation'] 
        end
      
        pos_key = event['modeling'] ? 'modeled_parts_of_speech' : 'parts_of_speech'
        core_key = event['modeling'] ? 'modeled_core_words' : 'core_words'
        if event['parts_of_speech'] && event['parts_of_speech']['types'] && event['button'] && (event['button']['spoken'] || event['button']['for_speaking'])
          part = event['parts_of_speech']['types'][0]
          if part
            self.data['stats'][pos_key][part] ||= 0
            self.data['stats'][pos_key][part] += 1
          end
        end
        if event['core_word'] != nil
          self.data['stats'][core_key][event['core_word'] ? 'core' : 'not_core'] ||= 0
          self.data['stats'][core_key][event['core_word'] ? 'core' : 'not_core'] += 1
        end
      end

      self.generate_speech_combinations
      self.generate_button_usage
      self.generate_sensor_stats
    end
    if self.data['assessment'] && self.started_at && self.ended_at
      self.data['stats'] = {}
      self.data['stats']['session_seconds'] = (self.ended_at - self.started_at).to_i
      total_correct = (self.data['assessment']['totals']['correct'] || 0).to_i
      total_incorrect = (self.data['assessment']['totals']['incorrect'] || 0).to_i
      self.data['stats']['total_correct'] = total_correct
      self.data['stats']['total_incorrect'] = total_incorrect
      self.data['stats']['recorded_correct'] = self.data['assessment']['tallies'].select{|t| t['correct'] == true }.length
      self.data['stats']['recorded_incorrect'] = self.data['assessment']['tallies'].select{|t| t['correct'] == false }.length
      total = total_correct + total_incorrect
      recorded_total = self.data['stats']['recorded_correct'] + self.data['stats']['recorded_incorrect']

      pct_correct = total > 0 ? total_correct.to_f / total.to_f : 0.0
      pct_incorrect = total > 0 ? total_incorrect.to_f / total.to_f : 0.0
      self.data['stats']['total_tallies'] = total
      self.data['stats']['total_recorded_tallies'] = recorded_total
      self.data['stats']['percent_correct'] = (pct_correct * 100).round(1)
      self.data['stats']['percent_incorrect'] = (pct_incorrect * 100).round(1)
      self.data['stats']['avg_speech_length'] = (speech_lengths.sum.to_f / [speech_lengths.length, 1].max.to_f).round(3)
      self.data['stats']['avg_utterance_length'] = (utterance_lengths.sum.to_f / [utterance_lengths.length, 1].max.to_f).round(3)
      
      biggest_correct_streak = 0
      biggest_incorrect_streak = 0
      self.data['assessment']['tallies'].chunk{|t| t['correct'] }.each do |correct, list|
        if correct
          biggest_correct_streak = [biggest_correct_streak, list.length].max
        else
          biggest_incorrect_streak = [biggest_incorrect_streak, list.length].max
        end
      end
      self.data['stats']['longest_correct_streak'] = biggest_correct_streak
      self.data['stats']['longest_incorrect_streak'] = biggest_incorrect_streak
    end
    if self.data['profile']
      # pull out data['profile']['summary'] if available
      # also pull out mastery_cnt and cnt to get an average mastery %
      # might as well get a duration as well
      (self.data['profile']['score_categories'] || {}).each do |id, cat|
        cat['function'] # ['mastery_cnt', 'sum', 'avg', etc]
        cat['manuals'] #
        cat['tally'] #
        cat['cnt'] #
        cat['mastery_cnt'] #
        cat['max'] #
        cat['value']
      end
      self.data['stats']['duration'] = (self.data['submitted'] || self.ended_at.to_i) - (self.data['started'] || self.started_at.to_i)
      self.data['stats']['questions'] = 0
      (self.data['profile']['question_groups'] || []).each do |group|
        (group['questions'] || []).each do |question|
          self.data['stats']['questions'] += 1
        end
      end
    end
    true
  end
  
  def generate_sensor_stats
    session = self
    if !session.data['stats']['all_volumes'].blank?
      session.data['stats']['volume'] = {
        'total' => session.data['stats']['all_volumes'].length,
        'average' => (session.data['stats']['all_volumes'].sum.to_f / session.data['stats']['all_volumes'].length.to_f),
        'histogram' => {
          '0-10' => session.data['stats']['all_volumes'].select{|v| v < 10 }.length,
          '10-20' => session.data['stats']['all_volumes'].select{|v| v >= 10 && v < 20 }.length,
          '20-30' => session.data['stats']['all_volumes'].select{|v| v >= 20 && v < 30 }.length,
          '30-40' => session.data['stats']['all_volumes'].select{|v| v >= 30 && v < 40 }.length,
          '40-50' => session.data['stats']['all_volumes'].select{|v| v >= 40 && v < 50 }.length,
          '50-60' => session.data['stats']['all_volumes'].select{|v| v >= 50 && v < 60 }.length,
          '60-70' => session.data['stats']['all_volumes'].select{|v| v >= 60 && v < 70 }.length,
          '70-80' => session.data['stats']['all_volumes'].select{|v| v >= 70 && v < 80 }.length,
          '80-90' => session.data['stats']['all_volumes'].select{|v| v >= 80 && v < 90 }.length,
          '90-100' => session.data['stats']['all_volumes'].select{|v| v >= 90 }.length
        }
      }
    elsif !session.data['stats']['volumes'].blank?
      tally = 0; sum = 0
      session.data['stats']['volume'] = {'total' => 0, 'average' => 0.0, 'histogram' => {
        '0-10' => 0,
        '10-20' => 0,
        '20-30' => 0,
        '30-40' => 0,
        '40-50' => 0,
        '50-60' => 0,
        '60-70' => 0,
        '70-80' => 0,
        '80-90' => 0,
        '90-100' => 0
      }}
      session.data['stats']['volumes'].each do |val, cnt|
        val = [[0, val.to_i].max, 99].min
        tally += cnt
        sum += val
        pre = ((val / 10.0).floor * 10).to_i
        post = pre + 10
        hist = "#{pre}-#{post}"
        session.data['stats']['volume']['histogram'][hist] += cnt
      end

      session.data['stats']['volume']['total'] = tally
      session.data['stats']['volume']['average'] = tally > 0 ? (sum.to_f / tally.to_f).round(2) : 0.0
    end
    if !session.data['stats']['all_ambient_light_levels'].blank?
      session.data['stats']['ambient_light'] = {
        'total' => session.data['stats']['all_ambient_light_levels'].length,
        'average' => (session.data['stats']['all_ambient_light_levels'].sum.to_f / session.data['stats']['all_ambient_light_levels'].length.to_f),
        'histogram' => {
          '0-1' => session.data['stats']['all_ambient_light_levels'].select{|v| v < 1 }.length,
          '1-50' => session.data['stats']['all_ambient_light_levels'].select{|v| v >= 1 && v < 50 }.length,
          '50-100' => session.data['stats']['all_ambient_light_levels'].select{|v| v >= 50 && v < 100 }.length,
          '100-250' => session.data['stats']['all_ambient_light_levels'].select{|v| v >= 100 && v < 250 }.length,
          '250-500' => session.data['stats']['all_ambient_light_levels'].select{|v| v >= 250 && v < 500 }.length,
          '500-1000' => session.data['stats']['all_ambient_light_levels'].select{|v| v >= 500 && v < 1000 }.length,
          '1000-15000' => session.data['stats']['all_ambient_light_levels'].select{|v| v >= 1000 && v < 15000 }.length,
          '15000-30000' => session.data['stats']['all_ambient_light_levels'].select{|v| v >= 15000 }.length
        }
      }
      session.data['stats'].delete('all_ambient_light_levels')
    end
    if !session.data['stats']['all_screen_brightness_levels'].blank?
      session.data['stats']['screen_brightness'] = {
        'total' => session.data['stats']['all_screen_brightness_levels'].length,
        'average' => (session.data['stats']['all_screen_brightness_levels'].sum.to_f / session.data['stats']['all_screen_brightness_levels'].length.to_f),
        'histogram' => {
          '0-10' => session.data['stats']['all_screen_brightness_levels'].select{|v| v < 10 }.length,
          '10-20' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 10 && v < 20 }.length,
          '20-30' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 20 && v < 30 }.length,
          '30-40' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 30 && v < 40 }.length,
          '40-50' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 40 && v < 50 }.length,
          '50-60' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 50 && v < 60 }.length,
          '60-70' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 60 && v < 70 }.length,
          '70-80' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 70 && v < 80 }.length,
          '80-90' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 80 && v < 90 }.length,
          '90-100' => session.data['stats']['all_screen_brightness_levels'].select{|v| v >= 90 }.length
        }
      }
      session.data['stats'].delete('all_screen_brightness_levels')
    end
    if !session.data['stats']['all_orientations'].blank?
      session.data['stats']['orientation'] = {
        'total' => session.data['stats']['all_orientations'].length,
        'alpha' => {
          'total' => session.data['stats']['all_orientations'].select{|o| o['alpha'] }.length,
          'average' => (session.data['stats']['all_orientations'].map{|o| o['alpha'] }.sum.to_f / session.data['stats']['all_orientations'].length.to_f),
          'histogram' => { # 0 - 360
            'N' => session.data['stats']['all_orientations'].select{|o| (o['alpha'] >= 0 && o['alpha'] < 22.5) || o['alpha'] > 337.5 }.length,
            'NE' => session.data['stats']['all_orientations'].select{|o| o['alpha'] >= 22.5 && o['alpha'] < 67.5 }.length,
            'E' => session.data['stats']['all_orientations'].select{|o| o['alpha'] >= 67.5 && o['alpha'] < 112.5 }.length,
            'SE' => session.data['stats']['all_orientations'].select{|o| o['alpha'] >= 112.5 && o['alpha'] < 157.5 }.length,
            'S' => session.data['stats']['all_orientations'].select{|o| o['alpha'] >= 157.5 && o['alpha'] < 202.5 }.length,
            'SW' => session.data['stats']['all_orientations'].select{|o| o['alpha'] >= 202.5 && o['alpha'] < 247.5 }.length,
            'W' => session.data['stats']['all_orientations'].select{|o| o['alpha'] >= 247.5 && o['alpha'] < 292.5 }.length,
            'NW' => session.data['stats']['all_orientations'].select{|o| o['alpha'] >= 292.5 && o['alpha'] < 337.5 }.length
          }
        },
        'beta' => {
          'total' => session.data['stats']['all_orientations'].select{|o| o['beta'] }.length,
          'average' => (session.data['stats']['all_orientations'].map{|o| o['beta'] }.sum.to_f / session.data['stats']['all_orientations'].length.to_f),
          'histogram' => { # -180 - 180
            '180-140' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= 140 }.length,
            '140-100' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= 100 && o['beta'] < 140 }.length,
            '100-60' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= 60 && o['beta'] < 100 }.length,
            '20-60' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= 20 && o['beta'] < 60 }.length,
            '-20-20' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= -20 && o['beta'] < 20 }.length,
            '-60--20' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= -60 && o['beta'] < -20 }.length,
            '-100--60' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= -100 && o['beta'] < -60 }.length,
            '-140--100' => session.data['stats']['all_orientations'].select{|o| o['beta'] >= -140 && o['beta'] < -100 }.length,
            '-180--140' => session.data['stats']['all_orientations'].select{|o| o['beta'] < -140 }.length
          }
        },
        'gamma' => {
          'total' => session.data['stats']['all_orientations'].select{|o| o['gamma'] }.length,
          'average' => (session.data['stats']['all_orientations'].map{|o| o['gamma'] }.sum.to_f / session.data['stats']['all_orientations'].length.to_f),
          'histogram' => { # -90 - 90
            '-90--54' => session.data['stats']['all_orientations'].select{|o| o['gamma'] < -54 }.length,
            '-54--18' => session.data['stats']['all_orientations'].select{|o| o['gamma'] >= -54 && o['gamma'] < -18 }.length,
            '-18-18' => session.data['stats']['all_orientations'].select{|o| o['gamma'] >= -18 && o['gamma'] < 18 }.length,
            '18-54' => session.data['stats']['all_orientations'].select{|o| o['gamma'] >= 18 && o['gamma'] < 54 }.length,
            '54-90' => session.data['stats']['all_orientations'].select{|o| o['gamma'] >= 54 }.length,
          }
        },
        'layout' => {
          'total' => session.data['stats']['all_orientations'].select{|o| o['layout'] }.length,
          'landscape-primary' => session.data['stats']['all_orientations'].select{|o| o['layout'] == 'landscape-primary' }.length,
          'landscape-secondary' => session.data['stats']['all_orientations'].select{|o| o['layout'] == 'landscape-secondary' }.length,
          'portrait-primary' => session.data['stats']['all_orientations'].select{|o| o['layout'] == 'portrait-primary' }.length,
          'portrait-secondary' => session.data['stats']['all_orientations'].select{|o| o['layout'] == 'portrair-secondary' }.length
        }
      }
      session.data['stats'].delete('all_orientations')
    end
  end

  def generate_speech_combinations
    prior_parts = []
    sequences = {}
    self.data['events'].each do |event|
      if event['type'] == 'action' && event['action'] == 'clear'
        prior_parts = []
      elsif event['type'] == 'utterance'
        prior_parts = []
      elsif event['modified_by_next']
      else
        if event['parts_of_speech'] && event['parts_of_speech']['types']
          current_part = event['parts_of_speech']
          if prior_parts[-1] && prior_parts[-1]['types'] && prior_parts[-2] && prior_parts[-2]['types']
            from_from = prior_parts[-2]['types'][0] || '?'
            from = prior_parts[-1]['types'][0] || '?' 
            to = current_part['types'][0] || '?'
            sequences[from_from + "," + from + "," + to] ||= 0
            sequences[from_from + "," + from + "," + to] += 1
            sequences[from_from + "," + from] -= 1 if sequences[from_from + "," + from]
            sequences.delete(from_from + "," + from) if sequences[from_from + "," + from] == 0
            sequences[from + "," + to] ||= 0
            sequences[from + "," + to] += 1
          elsif prior_parts[-1] && prior_parts[-1]['types']
            from = prior_parts[-1]['types'][0] || '?'
            to = current_part['types'][0] || '?'
            sequences[from + "," + to] ||= 0
            sequences[from + "," + to] += 1
          end
        end
        prior_parts << event['parts_of_speech']
      end
    end
    self.data['stats']['parts_of_speech_combinations'] = sequences
  end

  def generate_button_usage
    current_chain = []
    last_timestamp = nil
    last_button_id = nil
    self.data['stats']['buttons_used'] = {
      'button_ids' => [], 'button_chains' => {}
    }
    self.data['events'].each do |event|
      if event['type'] == 'button'
        button = event['button']
        if !event['modeling'] && button
          button_text = LogSession.event_text(event)

          if button_text && button_text.length > 0 && button['board'] && (event['button']['spoken'] || event['button']['for_speaking'])
            button_key = "#{button['board']['id']}:#{button['button_id']}"
            self.data['stats']['buttons_used']['button_ids'] << button_key
            
            # If less than 2 minutes since the last hit, let's add it to the button sequence,
            # and we'll go ahead and stop counting if it's the same button multiple times
            if (!last_button_id || last_button_id != button_key) && (!last_timestamp || (event['timestamp'] - last_timestamp) < (2 * 60))
              current_chain << button_text
              if current_chain.length >= 3
                sequence = current_chain[-3, 3]
                sequence_key = sequence.join(', ')
                if sequence.length < 100
                  self.data['stats']['buttons_used']['button_chains'][sequence_key] = (self.data['stats']['buttons_used']['button_chains'][sequence_key] || 0) + 1
                  if current_chain.length >= 4
                    sequence = current_chain[-4, 4]
                    sequence_key = sequence.join(', ')
                    self.data['stats']['buttons_used']['button_chains'][sequence_key] = (self.data['stats']['buttons_used']['button_chains'][sequence_key] || 0) + 1
                  end
                end
              end
            end
            last_timestamp = event['timestamp']
            last_button_id = button_key
          end
        else
          last_timestamp = nil
          last_button_id = nil
          current_chain = []
        end
      elsif event['type'] == 'utterance' || (event['type'] == 'action' && event['action']['action'] == 'clear')
        last_timestamp = nil
        last_button_id = nil
        current_chain = []
      end
    end
  end
  
  def schedule_clustering
    if @clustering_scheduled
      ClusterLocation.schedule(:add_to_cluster, self.global_id)
      @clustering_scheduled = false
    end
    if @goal_clustering_scheduled && self.goal_id
      goal = self.goal
      if goal && goal.user_id == self.user_id
        goal.update_stats_eventually
      end
      @goal_clustering_scheduled = false
    end
    true
  end

  def self.travel_activation_score
    0.5 # add 50% screen travel as an approximation for the work of activating the button
  end
  
  def schedule_summary
    return true if @skip_extra_data_update
    if self.processed && (self.log_type == 'session' || self.goal)
      WeeklyStatsSummary.schedule_update_for(self)
#        WeeklyStatsSummary.schedule_once_for('slow', :update_for, self.global_id)
    end
    if self.goal && self.goal.primary && self.ended_at
      self.goal.schedule_for('slow', :update_usage, self.ended_at.iso8601)
    end
    true
  end

  def update_profile_summaries(frd=false)
    if self.log_type == 'profile' && self.data['profile'] && self.profile_id && self.user
      if !frd
        self.schedule(:update_profile_summaries, true)
        return
      end
      ue = UserExtra.find_or_create_by(user: self.user)
      ue.process_profile(self.profile_id, self.data['profile']['template_id'])
    end
    true
  end

  def update_board_connections(frd=false)
    return true if @skip_extra_data_update
    board_ids = []
    if self.data['events']
      self.data['events'].each do |event|
        if event['type'] == 'button' && event['button'] && event['button']['board']
          board_ids << event['button']['board']['id']
          board_ids << event['button']['board']['parent_id']
        elsif event['type'] == 'action' && event['action'] && event['action']['action'] == 'open_board'
          pre = event['action']['previous_key']
          board_ids << pre['id'] if pre && pre['id']
          post = event['action']['new_id']
          board_ids << post['id'] if post && post['id']
        end
      end
    end
    board_ids -= (self.data['known_board_ids'] || [])
    if board_ids.length > 0
      if frd
        self.data['known_board_ids'] = (self.data['known_board_ids'] ||  []) | board_ids
        @skip_extra_data_update = true
        self.save
        @skip_extra_data_update = false
        # Board.find_all_by_global_id(board_ids.uniq).each do |board|
        #   LogSessionBoard.find_or_create_by(:board_id => board.id, :log_session_id => self.id)
        # end
      else
        schedule_once_for((RedisInit.queue_pressure? ? 'whenever' : 'slow'), :update_board_connections, true)
        return true
      end
    end
  end
  
  def geo_object
    @geo ||= ClusterLocation.geo_object(self)
  end

  def session_split_check
    cutoff = (self.user && self.user.log_session_duration) || User.default_log_session_duration
    last_stamp = nil
    sessions = []
    more_sessions = []
    current_user_id = nil
    current_session = []
    self.data ||= {}
    self.assert_extra_data
    (self.data['events'] || []).each do |event|
      stamp = event['timestamp'] || last_stamp
      if event['note'] || event['assessment'] || event['share'] || event['alert'] || event['eval'] || event['profile'] || event['error']
        # certain events are always in their own session
        more_sessions << [event]
      elsif (!stamp || !last_stamp || stamp - last_stamp < cutoff) && (!current_user_id || event['user_id'] == current_user_id)
        # when the user_id changes or there's a long delay, split out into another session
        current_session << event
      else
        sessions << current_session if current_session.length > 0
        current_session = []
        current_session << event
      end
      current_user_id = event['user_id']
      last_stamp = stamp
    end
    sessions << current_session if current_session.length > 0
    sessions << [] if sessions.length == 0
    sessions += more_sessions
    sessions
  end
  
  def split_out_later_sessions(frd=false)
    return if @skip_split_out_later_sessions || @skip_extra_data_update
    # Step 1: stash away any just-added events to prevent clobbering
    if @just_added_events && @just_added_events.length > 0
      JobStash.add_events_to(self, @just_added_events, 'initial')
      @just_added_events = nil
    end

    # Step 2: check for actual splits that need to happen
    sessions = session_split_check
    if sessions.length > 1
      if !frd
        schedule_once(:split_out_later_sessions, true)
      else
        ApplicationRecord.using(:master) do
          # self.with_lock do
            self.assert_extra_data
            sessions = session_split_check
            # NOTE: first session will always be a session-type log
            self.data['events'] = sessions.shift
            sessions.each do |session|
              user_id = session.map{|e| e['user_id'] }.compact.first || (self.user && self.user.global_id)
              user = User.find_by_global_id(user_id)
              # TODO: right now this silently throws away any unauthorized log attempts. Is this a good idea?
              if user && user.allows?(self.author, 'model')
                params = {:events => session}
                event = session[0] if session.length == 1
                if event && event['note']
                  note = event['note']
                  note = note['note'] if note['note'].is_a?(Hash)
                  params = {
                    note: note,
                    timestamp: event['timestamp'],
                    notify: event['notify'],
                    video_id: event['video_id'],
                    goal_id: event['goal_id'],
                    goal_status: event['goal_status']
                  }
                elsif event && event['assessment']
                  assmnt = event['assessment']
                  assmnt = assmnt['assessment'] if assmnt['assessment'].is_a?(Hash)
                  params = {assessment: assmnt, timestamp: event['timestamp']}
                elsif event && event['profile']
                  prof = event['profile']
                  params = {profile: prof}
                elsif event && event['error']
                  AuditEvent.create!(event_type: 'log_error', summary: event['error']['type'], data: event['error'])
                  params = nil
                elsif event && event['eval']
                  evl = event['eval']
                  evl = evl['eval'] if evl['eval'].is_a?(Hash)
                  params = {eval: evl}
                  if evl['log_session_id'] || evl['ref_id']
                    s = nil
                    if evl['ref_id'] && evl['ref_id'].match(/^tmp/)
                      ref, ts, etc = evl['ref_id'].split(/\./)
                      cutoff = [Time.at(ts.to_i /  1000) - 24.hours, 72.hours.ago].min
                      if cutoff
                        s = LogSession.where(log_type: 'eval').where(['created_at > ?', cutoff]).detect do |ls|
                          ls.data['eval'] && ls.data['eval']['ref_id'] == evl['ref_id']
                        end
                      end
                    end
                    s ||= LogSession.find_by_global_id(evl['log_session_id'])
                    if s && s.log_type == 'eval' && s.user == user && s.author == self.author
                      s.process({eval: evl})
                      params = nil
                    end
                  end
                elsif event && event['share']
                  JobStash.remove_events_from(self, [event])
                  already_sent = false
                  utterance_user = User.find_by_path(event['user_id'])
                  utterance_user = nil if utterance_user && !utterance_user.allows?(user, 'supervise')
                  utterance_user ||= user
                  if event['share']['message_uid']
                    # if the message_uid was already used to create an utterance, don't do it again
                    already_sent = Utterance.where(user: utterance_user, nonce: GoSecure.sha512(event['share']['message_uid'], 'utterance_message_uid')).where(['created_at > ?', 7.days.ago]).count > 0
                  end
                  if !already_sent
                    utterance = Utterance.process_new({
                      button_list: event['share']['utterance'],
                      private_only: event['share']['private_only'],
                      timestamp: event['timestamp'],
                      message_uid: event['share']['message_uid'],
                      sentence: event['share']['sentence']
                    }, {:user => utterance_user})
                    utterance.schedule(:share_with, {'user_id' => event['share']['recipient_id'], 'reply_id' => event['share']['reply_id'], 'text_only' => event['share']['text_only']}, utterance_user.global_id)
                  end
                  params = nil
                elsif event && event['alert']
                  opts = {}.merge(event['alert'])
                  opts['author_id'] = self.author.global_id
                  JobStash.remove_events_from(self, [event])
                  LogSession.schedule_once(:handle_alert, opts)
                  params = nil
                end
                if params
                  log = LogSession.process_new(params, {
                    :ip_address => self.data['ip_address'], 
                    :device => self.device,
                    :author => self.author,
                    :user => user
                  })
                  JobStash.remove_events_from(self, session)
                  log.check_for_merger if log.log_type == 'session'
                end
              end
            end
            self.processed = true
            if self.data['events'].length == 0
              self.generate_defaults
              self.destroy if self.data['events'].length == 0
            else
              @skip_split_out_later_sessions = true
              self.save
              @skip_split_out_later_sessions = false
            end
          # end
        end
      end
    elsif !self.processed
      self.processed = true
      LogSession.where(:id => self.id).update_all(:processed => true)
    end
    true
  end

  def self.find_reply(reply_id, sender=nil, recipient=nil)
    prior_note = Webhook.find_record(reply_id) rescue nil
    prior_note = nil if prior_note.is_a?(LogSession) && prior_note.log_type != 'note'
    prior_note ||= LogSession.where(log_type: 'note').find_by_global_id(reply_id)
    prior_note ||= Utterance.find_by_global_id(reply_id)
    sender ||= prior_note.author if prior_note.is_a?(LogSession)
    sender ||= prior_note.user if prior_note.is_a?(Utterance)
    recipient ||= prior_note.user if prior_note.is_a?(LogSession)
    return nil unless sender
    return nil unless prior_note && (prior_note.user == sender || prior_note.user == recipient)
    prior_message = prior_note.data['note']['text'] if prior_note.is_a?(LogSession)
    prior_message = prior_note.data['sentence'] if prior_note.is_a?(Utterance)
    prior_contact = prior_note.data['author_contact']
    prior_contact ||= {
      'id' => sender.global_id,
      'name' => sender.user_name,
      'image_url' => sender.generated_avatar_url
    }
    {
      :message => prior_message,
      :contact => prior_contact,
      :record_code => Webhook.get_record_code(prior_note)
    }
  end

  def self.handle_alert(args)
    return false unless args
    user = User.find_by_global_id(args['user_id'])
    author = User.find_by_global_id(args['author_id'])
    return false unless user && author && user.allows?(author, 'supervise')
    alert = Webhook.find_record(args['alert_id']) rescue nil
    alert = nil unless alert.is_a?(LogSession)
    alert = nil if alert.is_a?(LogSession) && (alert.log_type != 'note' || !alert.data['notify_user'] || alert.user != user)
    return false unless alert
    if args['cleared']
      alert.data['cleared'] = true
      alert.data.delete('unread')
      alert.data.delete('read_receipt')
    elsif args['read']
      alert.data.delete('unread')
      alert.data['read_receipt'] = Time.now.to_i
    end
    alert.save
  end
  
  def alert_cleared?
    return true if self.data['cleared']
    return true if !self.data['unread'] && self.data['read_receipt'] && self.data['read_receipt'] < 5.days.ago.to_i
  end

  def self.message(opts)
    recipient = opts[:recipient]
    sender = opts[:sender]
    device = opts[:device] || (opts[:sender] && opts[:sender].devices[0])
    return false unless recipient && sender && device
    contact = sender.lookup_contact(opts[:sender_id]) if opts[:sender_id] != sender.global_id
    contact = contact.slice('id', 'name', 'image_url') if contact
    prior = nil
    prior_message = nil
    prior_contact = nil
    prior_note =  nil
    if opts[:reply_id]
      prior = LogSession.find_reply(opts[:reply_id], sender, recipient)
      return false unless prior && prior[:record_code]
    end
    prior ||= {}
    opts[:message]
    notify = opts[:notify] == nil ? true : opts[:notify]
    session = LogSession.process_new({
      'note' => {'text' => opts[:message], 'prior' => prior[:message], 'prior_contact' => prior[:contact], 'prior_record_code' => prior[:record_code]},
      'notify' => notify
    }, {'user' => recipient, 'contact' => contact, 'author' => sender, 'device' => device, 'message' => true})
    return session
  end

  def self.message_all(user_ids, opts)
    users = User.find_all_by_global_id(user_ids)
    sender = User.find_by_path(opts['sender_id'])
    device = sender && sender.devices.find_by_global_id(opts['device_id'])
    return false unless sender && device
    sessions = []
    users.each do |user|
      ses = {
        'note' => {'text' => opts['message'], 'timestamp' => Time.now.to_i},
        'notify' => opts['notify'] || 'true',
        'include_status_footer' => opts['include_footer'],
        'notify_exclude_ids' => opts['notify_exclude_ids'],
      }
      if opts['video']
        ses['note']['video'] = opts['video']
      end
      sessions << LogSession.process_new(ses, {'user' => user, 'author' => sender, 'device' => device, 'message' => true})
    end
    sessions.map(&:global_id)
  end

  def self.process_as_follow_on(params, non_user_params)
    raise "user required" if !non_user_params[:user]
    raise "author required" if !non_user_params[:author]
    raise "device required" if !non_user_params[:device]
    # TODO: marrying across devices could be really cool, i.e. teacher is using their phone to
    # track pass/fail while the student uses the device to communicate. WHAAAAT?!
    stash_params = nil
    result = nil
    if params['note']
      params['events'] = nil
      Rails.logger.warn('processing note creation in client request')
      if params['note']['log_events_string']
        # store events string as a new log session
        stash_params = {
          'events' => []
        }
        lines = params['note']['log_events_string'].split(/\n/)
        base_ts = params['note']['timestamp'] || Time.now.to_i
        ts = base_ts.to_i - (5 * lines.length) - 10
        lines.each do |line|
          if line.strip.length > 0
            stash_params['events'] << {
              'type' => 'button',
              'user_id' => non_user_params[:user].global_id,
              'timestamp' => ts,
              'button' => {
                'button_id' => "e#{ts}",
                'label' => line,
                'type' => 'speak',
                'spoken' => true,
              }
            }
            ts += 5
          end
        end
        params['note'].delete('log_events_string')
      end
      result = self.process_new(params, non_user_params)
    elsif params['assessment']
      params['events'] = nil
      Rails.logger.warn('processing assessment creation in client request')
      result = self.process_new(params, non_user_params)
    elsif params['type'] == 'daily_use'
      Rails.logger.warn('processing daily_use creation in client request')
      result = self.process_daily_use(params, non_user_params)
    elsif params['type'] == 'journal'
      Rails.logger.warn('processing journal creation in client request')
      result = self.process_new(params, non_user_params)
    else
      stash_params = params
    end

    if stash_params
      Rails.logger.warn('generating stash')
      res = LogSession.new(:data => {})
      # background-job it, too much processing for in-request!
      user = non_user_params.delete(:user)
      author = non_user_params.delete(:author)
      device = non_user_params.delete(:device)
      non_user_params[:user_id] = user.global_id
      non_user_params[:author_id] = author.global_id
      non_user_params[:device_id] = device.global_id
      Rails.logger.warn("posted_log_size=#{params.to_json.length} total_events=#{(stash_params['events'] || []).length}")
      stash_data = {
        'params' => stash_params.respond_to?(:to_unsafe_h) ? stash_params.to_unsafe_h : stash_params,
        'non_user_params' => non_user_params
      }
      stash = JobStash.create(data: stash_data)
      Rails.logger.warn('scheduling process')
      schedule(:process_delayed_follow_on, stash.global_id, non_user_params)
      Rails.logger.warn('done with process_as_follow_on')
      result ||= res
    end
    return result
  end
  
  def self.process_delayed_follow_on(params_data, non_user_params)
    params = params_data
    stash = nil
    if params_data.is_a?(String)
      stash = JobStash.find_by_global_id(params_data)
      raise "missing stash for #{params_data[0, 20]}" unless stash
      if stash.data && stash.data['params'] && stash.data['non_user_params']
        params = stash.data['params']
        non_user_params = stash.data['non_user_params']
      else
        params = stash.data
      end
    end
    non_user_params = non_user_params.with_indifferent_access
#    ApplicationRecord.using(:master) do
      non_user_params[:user] = User.find_by_global_id(non_user_params[:user_id])
      non_user_params[:author] = User.find_by_global_id(non_user_params[:author_id])
      non_user_params[:device] = Device.find_by_global_id(non_user_params[:device_id])
#    end
    raise "user required" if !non_user_params[:user]
    raise "author required" if !non_user_params[:author]
    raise "device required" if !non_user_params[:device]
    
    # filter to only those users and events the author has supervise permissions for
    valid_events = []
    user_ids = (params['events'] || []).map{|e| e['user_id'] }.compact.uniq
    users = User.find_all_by_global_id(user_ids)
    valid_users = {}
    users.each{|u| valid_users[u.global_id] = u if u.allows?(non_user_params[:author], 'model') }
    valid_events = (params['events'] || []).select{|e| valid_users[e['user_id']] }
    modeling_events = valid_events.select{|e| e['type'] == 'modeling_activity'}
    valid_events -= modeling_events
    modeling_events.each{|e| process_modeling_event(e, non_user_params) }
    return if modeling_events.length > 0 && valid_events.blank?
    raise "no valid events to process out of #{(params['events'] || []).length} #{user_ids.join(',')}" if valid_events.blank?
    non_user_params[:user] = valid_users[valid_events[0]['user_id']]
    
    active_session = LogSession.all.where(['log_type = ? AND device_id = ? AND author_id = ? AND user_id = ? AND ended_at > ?', 'session', non_user_params[:device].id, non_user_params[:author].id, non_user_params[:user].id, 1.hour.ago]).order('ended_at DESC').first
    if params['events']
      params['events'] = valid_events
      if active_session && !non_user_params['imported']
        ApplicationRecord.using(:master) do
          # active_session.with_lock do
            active_session.process(params, non_user_params)
            active_session.check_for_merger
          # end
        end
      else
        session = self.process_new(params, non_user_params)
        if (non_user_params[:user].settings['preferences'] || {})['allow_log_reports']
          session.data['allow_research'] = true
        end
        if (non_user_params[:user].settings['preferences'] || {})['allow_log_publishing']
          session.data['allow_publishing'] = true
        end
  
        session.check_for_merger
      end
      stash.destroy if stash
    else
      raise "only event-list logs can be delay-processed"
    end
  end
  
  def self.process_daily_use(params, non_user_params)
    raise "author required" unless non_user_params[:author]
    session = nil
    ApplicationRecord.using(:master) do
      session = LogSession.find_or_create_by(:log_type => 'daily_use', :user_id => non_user_params[:author].id)
#      session.with_lock do
        session.data ||= {}
        session.assert_extra_data
        session.author = non_user_params[:author]
        session.device = non_user_params[:device]
        session.data['events'] = []
        days = session.data['days'] || {}
        params['events'].each do |day|
          existing_day = days[day['date']]
          existing_day = nil unless existing_day.is_a?(Hash)
          day = day.to_unsafe_h if day.respond_to?(:to_unsafe_h)
          existing_day ||= day
          existing_day['active'] ||= day['active']
          DAILY_EVENT_TYPES.each do |type|
            existing_day[type] = day[type] if day[type]
          end
          existing_day['activity_level'] = [(existing_day || {})['activity_level'], (day || {})['activity_level']].compact.max
          days[day['date']] = existing_day
        end
        session.data['days'] = days
        session.save!
#      end
    end
    session
  end

  def self.process_modeling_event(event, non_user_params)
    session = nil
    ApplicationRecord.using(:master) do
      session = LogSession.find_or_create_by(log_type: 'modeling_activities', user_id: non_user_params[:user].id)
#      session.with_lock do
        session.data ||= {}
        session.assert_extra_data
        session.author ||= non_user_params[:user]
        session.device ||= non_user_params[:device]
        session.data['events'] ||= []
        if event['modeling_action'] == 'dismiss'
          repeats = session.data['events'].select{|a| a['modeling_action'] == event['modeling_action'] && a['modeling_activity_id'] == event['modeling_activity_id']}.length
          related = session.data['events'].select{|a| a['modeling_activity_id'] == event['activity_id'] }
          repeats = related.select{|a| a['modeling_action'] == event['modeling_action'] }.length
          event['repeats'] = repeats + 1
          cutoff = 6.months.ago.to_i
          event['related_user_ids'] = related.select{|a| (a['timestamp'] || 0) > cutoff || a['modeling_action'] == 'complete' }.map{|a| a['modeling_user_ids'] || [] }.flatten.uniq
        end
        session.data['events'] << event
        if session.data['events'].length > 100
          session.data['events'] = session.data['events'][-50, 50]
        end
        session.save!
        session.schedule(:process_external_callbacks)
#      end
    end
    session
  end

  def process_external_callbacks
    return unless self.log_type == 'modeling_activities'
    updates = []

    user_id = GoSecure.hmac("#{self.user.global_id}:#{self.user.created_at.iso8601}", Digest::MD5.hexdigest(self.global_id), 1)[0, 10]
    self.assert_extra_data
    (self.data['events'] || []).each do |event|
      if !event['external_processed']
        event['external_processed'] = true
        updates << {
          action: event['modeling_action'],
          word: event['modeling_word'],
          locale: event['modeling_locale'],
          activity_id: event['modeling_activity_id'],
          score: event['modeling_action_score']
        }
      end
    end
    if updates.length > 0
      ui = UserIntegration.find_by(integration_key: 'communication_workshop')
      if ui && ui.device && ui.device.developer_key_id
        key = ui.device.developer_key
        user_device = self.user.devices.find_by(developer_key_id: key.id)
        if user_device
          user_id = self.user.anonymized_identifier("external_for_#{ui.device.developer_key_id}")

          res = Typhoeus.post("https://workshop.openaac.org/api/v1/external", body: {
            integration_id: ui.device.developer_key.key,
            integration_secret: ui.device.developer_key.secret,
            user_id: user_id,
            updates: updates
          }, timeout: 10)
          json = JSON.parse(res.body) rescue nil
          if json && json['accepted']
            self.save!
            return true
          end
        else
          return true
        end
      end
      return false
    else
      return true
    end
  end

  def modeling_log
    raise "only valid for modeling_activities log types" unless self.log_type == 'modeling_activities'
    activities = {}
    skip_cutoff = 6.months.ago.to_i
    self.assert_extra_data
    self.data['events'].each do |event|
      if event['modeling_activity_id'] && ((event['timestamp'] || 0) > skip_cutoff || event['modeling_action'] == 'complete')
        activities[event['modeling_activity_id']] = event
      end
    end
    activities.to_a.map(&:last).sort_by{|a| a['timestamp'] }
  end

  # sql = ["SELECT user_id, COUNT(user_id) FROM boards GROUP BY user_id HAVING COUNT(user_id) > 10000"]
  # sql = ["SELECT id FROM boards WHERE LENGTH(settings) > 100000 ORDER BY LENGTH(settings) DESC LIMIT 50"]
  # Board.where(['updated_at > ?', cutoff]).where("LENGTH(settings) > 100000").map{|b| [b.key, b.settings.to_s.length] }
  # sql = ["SELECT r.id as row_id, PG_SIZE_PRETTY(sum(PG_COLUMN_SIZE(r.*))) as row_size FROM boards as r GROUP BY r.id ORDER BY sum(pg_column_size(r.*)) DESC LIMIT 10"]

  def self.check_possible_mergers
    sql = ["SELECT a.id as log_id, b.id as ref_id from log_sessions as a, log_sessions as b WHERE a.id != b.id AND a.user_id = b.user_id AND a.author_id = b.author_id AND a.device_id = b.device_id AND a.started_at = b.started_at AND a.ended_at = b.ended_at AND a.started_at > ? AND a.created_at < ? LIMIT 100", 6.hours.ago, 15.minutes.ago]
    res = ActiveRecord::Base.connection.execute(ActiveRecord::Base.send(:sanitize_sql_array, sql))
    # log_ids = res.map{|r| r['log_id'] }
    log_ids = []
    ref_ids = {}
    res.each{|r| 
      log_ids << r['log_id'] unless ref_ids[r['ref_id']]
      ref_ids[r['ref_id']] = true;
      ref_ids[r['log_id']] = true;
    }

    # This will clean up old mergers if the list gets behind
    # n = 1
    # merge_log_ids = {}
    # n.times do |i|
    #   puts "batch #{i}..."
    #   mergers = LogMerger.where(['merge_at < ? AND started != ?', 3.days.ago, true]).select('id, log_session_id').order('id DESC').limit(500); 0
    #   session_ids = mergers.map(&:log_session_id).uniq
    #   puts "found #{session_ids.length} results"
    #   session_ids.each_with_index do |id, idx|
    #     next if merge_log_ids[id]
    #     merge_log_ids[id] = true
    #     Worker.schedule_for(:whenever, LogSession, :perform_action, {
    #       'id' => id,
    #       'method' => 'check_for_merger',
    #       'arguments' => [true]
    #     })
    #   end.length
    #   LogMerger.where(log_session_id: session_ids).where(['merge_at < ?', 3.days.ago]).delete_all
    # end

#    ApplicationRecord.using(:master) do
      LogSession.where(id: log_ids).each do |session|
        session.schedule_once_for(:slow, :check_for_merger)
      end
      merged_ids = {}
      handled_ids = []
      ids = LogMerger.where(['merge_at < ? AND started != ?', Time.now, true]).select('id').order('id DESC').limit(500)
      LogMerger.where(id: ids).find_in_batches(batch_size: 50) do |batch|
        batch.each do |merger|
          merger.started = true
          merger.save
          handled_ids << merger.id
          next if merged_ids[merger.log_session_id]

          merged_ids[merger.log_session_id] = true
          log = nil
          ApplicationRecord.using(:master) do
            log = LogSession.find_by(id: merger.log_session_id)
          end
          if log
            log.schedule_once_for(:slow, :check_for_merger, true)
            log_ids << log.id
          end
        end
      end
      LogMerger.where(id: handled_ids).delete_all
      # LogMerger.where(['merge_at < ? AND started = ?', 24.hours.ago, true]).delete_all
#    end
    log_ids.length
  end

  def check_for_merger(frd=false)
    log = self
    ApplicationRecord.using(:master) do
      # log.with_lock do
        log.assert_extra_data
        cutoff = (log.user && log.user.log_session_duration) || User.default_log_session_duration
        matches = LogSession.where(log_type: 'session', user_id: log.user_id, author_id: log.author_id, device_id: log.device_id); matches.count
        mergers = []
        if cutoff && log.started_at
          mergers = matches.where(['id != ?', log.id]).where(['ended_at >= ? AND ended_at <= ?', log.started_at - cutoff, log.ended_at + cutoff]).order('id ASC')
        end
        stop_iterating = false
        mergers.each do |merger|
          next if merger.id == log.id || merger == log || stop_iterating
          # merger.with_lock do
            merger.assert_extra_data
            # always merge the newer log into the older log
            if log.id < merger.id
              ids = (log.data['events'] || []).map{|e| e['id'] }.compact
              merger.data['events'] ||= []
              max_precision = 0
              merger.data['events'].each do |e|
                max_precision = [max_precision, e['timestamp'].to_s.split(/\./)[1].length].max
              end
              # remove dups based on timestamp or (event data if timestamps aren't precise enough)
              kept_events = []
              transferred_events = []
              found_events = []
              merger_user_id = (log.data['events'] || []).map{|e| e['user_id'] }.first
              slices = ['type', 'percent_x', 'percent_y', 'timestamp', 'action', 'button', 'utterance']
              merger.data['events'].each do |e|
                json = e.slice(*slices).to_json if max_precision <= 1
                found = !!(log.data['events'] || []).detect do |me|
                  if max_precision > 1
                    me['timestamp'] == e['timestamp']
                  else
                    me.slice(*slices).to_json == json
                  end
                end
                # if not found in the existing events list, add it to the log or keep it
                if !found
                  if e['user_id'] == merger_user_id
                    # replace any colliding event ids
                    e['id'] = (ids.max || 0) + 1 if (merger.data['events'] || []).detect{|me| me['id'] == e['id'] }
                    ids << e['id']
                    transferred_events << e
                  else
                    kept_events << e
                  end
                else
                  found_events << e
                end
              end
              if frd
                JobStash.remove_events_from(merger, found_events) if found_events.length > 0
                if transferred_events.length > 0
                  log.data['events'] ||= []
                  log.data['events'] += transferred_events
                  log.save
                  # Save the transferred events to this log, remove them from any stashes in the old log
                  JobStash.add_events_to(log, transferred_events, 'transferred')
                  JobStash.remove_events_from(merger, transferred_events)
                  # If anything actually changed, let's check one more time
                  log.schedule_once(:check_for_merger)
                end
                if kept_events.length > 0
                  merger.data['events'] = kept_events
                  merger.instance_variable_set('@skip_split_out_later_sessions', true)
                  merger.save!
                else
                  # Check for any job_stashes kept events for merger before destroying
                  merger.data['events'] = []
                  merger.generate_defaults
                  events = []
                  merger.destroy if merger.data['events'].length == 0
                end
              elsif transferred_events.length > 0 || kept_events.length != merger.data['events'].length
                # If the merger is already scheduled, do nothing
                # If the merger is in progress, schedule a new one
                merger = LogMerger.find_or_create_by(log_session_id: log.id)
                merger = LogMerger.create(log_session_id: log.id, merge_at: 30.minutes.from_now) if merger && merger.started
              end
            else
              # Swap the root and try again, always go for the lower-id record
              merger.schedule_once(:check_for_merger)
              stop_iterating = true
            end
          # end
        end
      # end
    end
  end

  def process_params(params, non_user_params)
    raise "user required" if !self.user_id && !non_user_params[:user]
    raise "author required" if !self.author_id && !non_user_params[:author]
    raise "device required" if !self.device_id && !non_user_params[:device]
    user_id = self.user ? self.user.global_id : non_user_params[:user].global_id

    self.device = non_user_params[:device] if non_user_params[:device]
    self.user = non_user_params[:user] if non_user_params[:user]
    self.author = non_user_params[:author] if non_user_params[:author]
    
    self.data ||= {}
    self.data['imported'] = true if non_user_params[:imported]
    self.data['request_ids'] ||= [] if non_user_params[:request_id]
    self.data['request_ids'] << non_user_params[:request_id] if non_user_params[:request_id]
    self.data['author_contact'] = non_user_params[:contact] if non_user_params[:contact]
    if non_user_params[:update_only]
      self.highlighted = params['highlighted'] if params['highlighted'] != nil
      if params['events']
        self.data_will_change!
        self.assert_extra_data
        if self.user && self.created_at > 24.hours.ago
          if (self.user.settings['preferences'] || {})['allow_log_reports']
            self.data['allow_research'] = true
          end
          if (self.user.settings['preferences'] || {})['allow_log_publishing']
            self.data['allow_publishing'] = true
          end
        end

        self.data['events'].each do |e|
          pe = params['events'].detect{|ev| ev['id'] == e['id'] && ev['timestamp'].to_f == e['timestamp'] }
          if !e['id']
            pe ||= params['events'].detect{|ev| ev['type'] == e['type'] && ev['timestamp'].to_f == e['timestamp'] }
            e['id'] = pe && pe['id']
          end
          if pe
            new_notes = []
            (e['notes'] || []).each do |note|
              pnote = (pe['notes'] || []).detect{|n| n['id'] === note['id'] }
              deletable = self.user.allows?(non_user_params[:author], 'delete')
              if pnote || !deletable
                new_notes << note
              end
            end
            (pe['notes'] || []).each do |pnote|
              note = (e['notes'] || []).detect{|n| n['id'] === pnote['id'] }
              if !note
                new_notes << pnote
              end
            end
            ids = new_notes.map{|n| n['id'] }.compact
            new_notes.each do |note|
              note['author'] ||= {
                'id' => non_user_params[:author].global_id,
                'user_name' => non_user_params[:author].user_name
              }
              note['timestamp'] ||= Time.now.utc.to_f
              note['id'] ||= (ids.max || 0) + 1
              ids << note['id']
            end
            e['notes'] = new_notes
            e['highlighted'] = !!pe['highlighted']
          end
        end
      end
      if self.goal_id
        @goal_clustering_scheduled = true
      end
    else
      ids = (self.data['events'] || []).map{|e| e['id'] }.max || 0
      ip_address = non_user_params[:ip_address]
      if params['events']
        self.assert_extra_data
        self.data['events'] ||= []

        if self.user && (!self.id || self.created_at > 24.hours.ago)
          if ((self.user.settings || {})['preferences'] || {})['allow_log_reports']
            self.data['allow_research'] = true
          end
          if ((self.user.settings || {})['preferences'] || {})['allow_log_publishing']
            self.data['allow_publishing'] = true
          end
        end

        ref_user_ids = params['events'].map{|e| e['referenced_user_id'] }.compact.uniq
        valid_ref_user_ids = {}
        User.find_all_by_global_id(ref_user_ids).each do |u|
          valid_ref_user_ids[u.global_id] = true if u.allows?(self.author, 'model')
        end
        @just_added_events = []
        params['events'].each do |e|
          e['timestamp'] = e['timestamp'].to_f
          e.delete('referenced_user_id') unless valid_ref_user_ids[e['referenced_user_id']]
          e['ip_address'] ||= ip_address
          if !e['id']
            ids += 1
            e['id'] = ids
          end
          self.data['events'] << e
          @just_added_events << e
        end
      end
      if params['notify'] && params['notify'] != 'false' && params['note']
        @push_message = true
        self.data['notify_user'] = true if params['notify'] == 'user_only' || params['notify'] == 'include_user'
        self.data['notify_user_only'] = true if params['notify'] == 'user_only'
        self.data['notify_exclude_ids'] = params['notify_exclude_ids']
        self.data['include_status_footer'] = true if params['include_status_footer']
        self.data['message']= true if non_user_params['message']
        self.data['unread'] = true if self.data['unread'] == nil && self.data['notify_user']
      end
      self.data['note'] = params['note'] if params['note']
      if params['video_id']
        video = UserVideo.find_by_global_id(params['video_id'])
        if video
          self.data['note']['video'] = {
            'id' => params['video_id'],
            'duration' => video.settings['duration']
          }
        end
      end
      if params['goal_id'] || self.goal_id
        if params['goal_id'] == 'status'
          self.goal_id = 0
          self.data['goal'] = {
            'summary' => "",
            'global' => true
          }
          if params['goal_status'] && params['goal_status'].to_i > 0
            self.data['goal']['status'] = params['goal_status'].to_i
          end
        else
          log_goal = self.goal || UserGoal.find_by_global_id(params['goal_id'])
          if log_goal && log_goal.user_id == self.user_id
            self.goal = log_goal
            self.data['goal'] = {
              'id' => log_goal.global_id,
              'summary' => log_goal.summary
            }
            if params['goal_status'] && params['goal_status'].to_i > 0
              self.data['goal']['status'] = params['goal_status'].to_i
            end
          end
        end
      end
      @goal_clustering_scheduled = true if self.goal_id
      self.data['assessment'] = params['assessment'] if params['assessment']
      self.data['eval'] = params['eval'] if params['eval']
      self.data['profile'] = params['profile'] if params['profile']
      if self.data['assessment']
        if non_user_params[:automatic_assessment]
          self.data['assessment']['manual'] = false
          self.data['assessment']['automatic'] = true
        else
          self.data['assessment']['manual'] = true
          self.data['assessment']['automatic'] = false
        end
      end
      if params['type'] == 'journal'
        self.data['journal'] = {
          'type' => 'journal',
          'vocalization' => params['vocalization'],
          'sentence' => (params['vocalization'] || []).map{|l| l['label'] }.join(' '),
          'category' => params['category'],
          'timestamp' => params['timestamp'] || Time.now.to_i,
          'id' => params['id']
        }
      end
    end
    true
  end
  
  # TODO: this assumes clusters and sessions are on the same shard. It means
  # fewer lookups when generating stats summaries, though, which is probably worth it.
  def geo_cluster_global_id
    related_global_id(self.geo_cluster_id)
  end
  
  def ip_cluster_global_id
    related_global_id(self.ip_cluster_id)
  end
  
  def device_global_id
    related_global_id(self.device_id)
  end
  
  def process_raw_log
    # update user_board_connections table to show recency of usage
  end
  
  def push_notification
    if @push_message
      notify('push_message', {'priority' => true})
      @push_message = false
      @pushed_message = true
    end
    true
  end
  
  def self.push_logs_remotely
    remotes = LogSession.where(:needs_remote_push => true).where(['ended_at < ?', 2.hours.ago]).where(['ended_at > ?', 7.days.ago])
    remotes.find_in_batches(batch_size: 30) do |batch|
      batch.each do |session|
        session.notify('new_session', {'slow' => true})
      end
    end
    remotes.update_all(:needs_remote_push => false)
  end
  
  def additional_webhook_record_codes(notification_type, additional_args)
    res = []
    if notification_type == 'new_session'
      if self.user && self.user.record_code && !self.user.private_logging?
        res << "#{self.user.record_code}::*"
        res << "#{self.user.record_code}::log_session:*"
      end
      if self.data && self.data['allow_research'] && self.user && self.user.communicator_role?
        res << "research"
      end
    end
    res
  end
  
  def webhook_content(notification_type, content_type, args)
    content_type ||= 'lam'
    if content_type == 'lam'
      Stats.lam([self])
    elsif content_type == 'anonymized_summary' && args[:user_integration] && self.user
      user = self.user
      daily = LogSession.find_by(user_id: user.id, log_type: 'daily_use')
      weeks = daily && (daily.data['days'] || {}).keys.map{|k| Date.parse(k).strftime("%U-%Y") rescue nil }.compact.uniq.count
      {
        'uid' => args[:user_integration].user_token(self.user),
        'active_weeks' => weeks,
    }.to_json
    else
      nil
    end
  end
  
  def default_listeners(notification_type)
    if notification_type == 'push_message'
      return [] unless self.user
      users = [self.user]
      if self.data['notify_user_only'] != true
        users += self.user.supervisors
      end
      if self.data['notify_exclude_ids']
        users = users.select{|u| !self.data['notify_exclude_ids'].include?(u.global_id) }
      end
      users -= [self.author] unless self.user == self.author && self.data['notify_user']
      users.map(&:record_code)
    else
      []
    end
  end
  
  def self.needs_log_summary?(user)
    user_ids = []
    user_ids << user.global_id if user.any_premium_or_grace_period? && user.settings && user.settings['preferences'] && user.settings['preferences']['role'] == 'communicator'
    user_ids += user.supervised_user_ids
    # short-circuit in the case where the communicator is expired and has no supervisees
    return false if user_ids.length == 0
    # if notifications have been coming, don't cut them off immediately when logs stop
    threshold = 3.weeks.ago
    if user.settings && user.settings['preferences'] && user.settings['preferences']['notification_frequency'] == '2_weeks'
      threshold = 6.weeks.ago
    elsif user.settings && user.settings['preferences'] && user.settings['preferences']['notification_frequency'] == '1_month'
      threshold = 3.months.ago
    end
    # TODO: sharding
    counts = LogSession.where(:user_id => User.local_ids(user_ids.uniq), :log_type => 'session').where(['started_at > ?', threshold]).group('user_id').count('user_id')
    # only mark as true if there's reportable data for at least one connected user
    ids = counts.to_a.select{|key, cnt| cnt > 0 }.map(&:first)
    # TODO: sharding
    User.where(:id => ids).each do |u|
      return true if u.any_premium_or_grace_period? && u.settings && u.settings['preferences'] && u.settings['preferences']['role'] == 'communicator'
    end
    false
  end
  
  def self.generate_log_summaries
    possible_user_ids = []
    # find any users with a recent-enough session to trigger notifications (loose bounds)
    ids = LogSession.where(:log_type => 'session').where(['started_at > ?', 14.weeks.ago]).group('user_id').count('user_id').map(&:first)
    # find all users who might be need a notification about the change
    # TODO: sharding
    User.where(:id => ids).each do |user|
      possible_user_ids << user.global_id
      possible_user_ids += user.supervisor_user_ids
    end
    # find any users who are due for a notification
    users = User.where(['next_notification_at < ?', Time.now])
    res = {
      :notified => 0,
      :found => 0
    }
    users.find_in_batches(:batch_size => 100).each do |batch|
      batch.each do |user|
        res[:found] += 1
        # trigger a notification if it's time and 
        # they might have an update (loose bounds) and
        # the user has an update (tight bounds)
        if possible_user_ids.include?(user.global_id) && LogSession.needs_log_summary?(user)
          res[:notified] += 1
          user.notify('log_summary')
        # if nothing to report, postpone notification, so we don't keep checking for 
        # this user forever and notify at a random point in time when the tight bounds
        # finally fit
        else
          User.where(:id => user.id).update_all(:next_notification_at => user.next_notification_schedule)
        end
      end
    end
    res
  end

  def self.extra_data_public_transform(events)
    res = []
    (events || []).each do |event|
      entry = {}
      entry['id'] = event['id']
      entry['timestamp'] = event['timestamp']
      entry['highlighted'] = event['highlighted'] if event['highlighted']
      if event['button']
        entry['type'] = 'button'
        entry['spoken'] = !!event['button']['spoken']
        entry['summary'] = event['button']['label']
        if entry['summary'] == ':complete' && event['button']['completion']
          entry['summary'] += " (#{event['button']['completion']})"
        end
        entry['parts_of_speech'] = event['parts_of_speech']
        if event['button']['percent_x'] && event['button']['percent_y'] && event['button']['board']
          entry['touch_percent_x'] = event['button']['percent_x']
          entry['touch_percent_y'] = event['button']['percent_y']
          entry['board'] = event['button']['board']
        end
      elsif event['action']
        entry['type'] = 'action'
        entry['summary'] = "[#{event['action']['action']}]"
        if event['action']['action'] == 'open_board'
          entry['new_board'] = event['action']['new_id']
        end
      elsif event['utterance']
        entry['type'] = 'utterance'
        entry['summary'] = "[vocalize]"
        entry['utterance_text'] = event['utterance']['text']
      else
        entry['type'] = 'other'
        entry['summary'] = "unrecognized event"
      end
      if event['modeling']
        entry['modeling'] = true
      end
      if event['notes']
        entry['notes'] = event['notes'].map do |n|
          {
            'id' => n['id'],
            'note' => n['note'],
            'author' => {
              'id' => n['author']['id'],
              'user_name' => n['author']['user_name']
            }
          }
        end
      end
      res << entry
    end
    res
  end

  FILE_USER_LIMIT = 250
  # alightspeechtherapy
  def self.anonymous_logs(user_ids=nil, urls=nil, do_cache=true)
    # Collect all the user_ids who have a weekly_stats_summary from
    # summary.data['publishing_user_ids'], check the users to see if they
    # still have user.settings['preferences']['allow_log_reports'] and
    # user.settings['preferences']['allow_log_publishing'].
    # For all those users, Exporter.export_logs(user_id, true, zipper)
    # to package them into a zip file.
    date_start = (Date.today << 1).beginning_of_month
    date_end = date_start.end_of_month
    if !user_ids
      puts "retrieving users..."
      user_ids = []
      cutoffweekyear = WeeklyStatsSummary.date_to_weekyear(date_start)
      cutoffweekyear2 = WeeklyStatsSummary.date_to_weekyear(date_end)
      WeeklyStatsSummary.where(['weekyear >= ? AND weekyear <= ? AND user_id = ?', cutoffweekyear, cutoffweekyear2, 0]).find_in_batches(batch_size: 10) do |batch|
        batch.each do |sum|
          user_ids += sum.data['publishing_user_ids'] || []
        end
      end
      puts "done! #{user_ids.uniq.length}"
    elsif user_ids.is_a?(String)
      stash = JobStash.find_by_global_id(user_ids)
      user_ids = stash.data
    end
    user_ids.uniq!

    file = Tempfile.new(['user-data', '.zip'])
    file.close

    more_user_ids = nil
    if user_ids.length > FILE_USER_LIMIT
      more_user_ids = user_ids.drop(FILE_USER_LIMIT)
      user_ids = user_ids.take(FILE_USER_LIMIT)
    end
    slices = []
    OBF::Utils.build_zip(file.path) do |zipper|
      zipper.add('README.txt', %{Generated #{Time.now.iso8601}

More information about the file formats being used is available at https://www.openboardformat.org
})

      cnt = 0
      User.find_batches_by_global_id(user_ids) do |user|
        cnt += 1
        puts "exporting #{user.user_name} - #{user.global_id} #{cnt}/#{user_ids.length}..."
        if user.settings['preferences']['allow_log_reports'] && user.settings['preferences']['allow_log_publishing']
          Exporter.export_logs(user.global_id, true, zipper, [date_start, date_end])
        end
      end
    end
    hash = Digest::MD5.hexdigest(user_ids.join(','))
    res = Uploader.remote_upload("downloads/users/#{CGI.escape(Time.now.iso8601[0, 16].sub(/:/, '-'))}/global/lingolinq-obla-#{hash}-#{date_start.iso8601}-export.zip", file.path, "application/zip")
    urls ||= []
    urls << res[:url]
    response = {urls: urls}
    if more_user_ids
      puts "scheduling next batch"
      stash = JobStash.create(data: more_user_ids)
      progress = Progress.schedule(LogSession, :anonymous_logs, stash.global_id, urls, do_cache)
      Progress.chain(progress)

      pres = JsonApi::Progress.as_json(progress, :wrapper => true)
      pres[:message] = "Data is generating and could take a few more days, please check back soon..."
      Permissions.setex(Permissable.permissions_redis, 'global/anonymous/logs/url', 12.hours.to_i, pres.to_json)
      response[:still_working] = true
    elsif do_cache
      puts "done!"
      Permissions.setex(Permissable.permissions_redis, 'global/anonymous/logs/url', 14.days.to_i, urls.to_json)
    end
    response
  end
end

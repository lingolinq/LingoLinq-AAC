class UserBadge < ActiveRecord::Base
  include Permissions
  include Processable
  include Async
  include GlobalId
  include MetaRecord
  include SecureSerialize
  include Notifier
  include Replicate
  
  belongs_to :user
  belongs_to :user_goal, optional: true  # badges can exist without a goal

  before_save :generate_defaults
  after_save :notify_on_earned
  after_save :update_user
  after_save :update_highlighted_list

  add_permissions('view') { self.highlighted && self.user && self.user.settings['public'] }
  add_permissions('view') {|user| self.user && self.user.allows?(user, 'model') }
  add_permissions('view', 'edit', 'delete') {|user| self.user && self.user.allows?(user, 'edit') }

  secure_serialize :data
  
  def generate_defaults
    self.data ||= {}
    self.data['name'] ||= 'Unnamed Badge'
    self.level ||= 1
    self.superseded ||= false
    self.earned ||= false
    self.disabled ||= false
    if self.user_goal
      self.data['global_goal'] = self.user_goal.global
      self.data['global_goal_priority'] = self.user_goal.settings['global_priority']
    end
    self.data['max_level'] = true if self.user_goal && self.level && self.user_goal.settings['max_badge_level'] && self.level >= self.user_goal.settings['max_badge_level']
    if self.earned && !self.data['earn_recorded']
      @just_earned = true
      self.data['earn_recorded'] = Time.now.utc.iso8601
    end
  end
  
  def dismiss(user_id)
    if user_id
      self.data ||= {}
      self.data['dismissed_by'] ||= {}
      self.data['dismissed_by'][user_id] = true
      self.save
    end
  end
  
  def dismissed_by?(user_id)
    self.data ||= {}
    self.data['dismissed_by'] ||= {}
    return !!(self.data['dismissed_by'][user_id] || self.data['dismissed_by'][self.related_global_id(self.user_id)])
  end
  
  def update_user
    User.where(:id => self.user_id).update_all(:badges_updated_at => Time.now)
    true
  end
  
  def global
    !!(self.data && self.data['global_goal'])
  end
  
  def notify_on_earned(frd=false)
    if !frd && @just_earned
      schedule(:notify_on_earned, true)
    elsif frd
      notify('badge_awarded')
      # send out notifications to interested parties
      # mark the user as earning a new badge, so the frontend and query for it and tell the user
      # TODO: schedule the notifications instead of notifying them in the save process, and
      # don't actually notify anyone if by the time the job runs there's a higher-level earned
      # badges for the same goal
    end
    return true
  end
  
  def default_listeners(notification_type)
    if notification_type == 'badge_awarded'
      return [] if self.superseded
      res = []
      res << self.user if self.user
      res += self.user.supervisors if self.user
      res.select{|user|
        FeatureFlags.feature_enabled_for?('goals', user)
      }.map(&:record_code)
    else
      []
    end
  end
  
  def awarded_at
    return nil unless self.earned
    (self.data && self.data['earn_recorded'] && Time.parse(self.data['earn_recorded'])) || self.updated_at
  end

  def earned_during(start_at, end_at)
    awarded = self.awarded_at
    return !!(awarded && awarded >= start_at && awarded <= end_at)
  end  
  
  def template_goal
    goal = self.user_goal
    return goal if goal && goal.template
    return UserGoal.find_by_global_id(goal.settings['template_id']) if goal && goal.settings['template_id']
    return nil
  end
  
  def award!(earned, badge_level=nil)
    return if self.earned
    # {:started, :ended, :tally, :streak}
    self.earned = true
    self.data ||= {}
    [:started, :ended].each do |key|
      self.data[key.to_s] = earned[key]
      self.data[key.to_s] = self.data[key.to_s].iso8601 if self.data[key.to_s].respond_to?(:iso8601)
    end
    self.data['units'] = earned[:units]
    self.data['tally'] = earned[:tally] if earned[:tally]
    self.data['streak'] = earned[:streak] if earned[:streak]
    self.data['samples'] = earned[:samples] if earned[:samples]
    self.data['explanation'] = earned[:explanation] if earned[:explanation]
    self.data['percent'] = 1.0
    self.data['badge_level'] = badge_level
    self.update_badge_data
    self.save!
    UserBadge.where(:user_id => self.user_id, :user_goal_id => self.user_goal_id).where(['level < ?', self.level]).update_all(:superseded => true)
  end
  
  def update_highlighted_list
    if @highlight_changed
      highlights = UserBadge.where(:user_id => self.user_id, :highlighted => true)
      if highlights.count > 4
        all_ids = [self.id] + highlights.order('id DESC').all.map(&:id)
        good_ids = all_ids.uniq[0, 4]
        bad_ids = all_ids - good_ids
        highlights.where(:id => bad_ids).update_all(:highlighted => false)
      end
    end
    true
  end
  
  def process_params(params, non_user_params)
    if params['highlighted'] && params['highlighted'] != self.highlighted
      @highlight_changed = true
    end
    self.highlighted = !!params['highlighted'] if params['highlighted'] != nil
    self.disabled = !!params['disabled'] if params['disabled'] != nil
    true
  end
  
  def update_badge_data
    if self.user_goal
      self.data['name'] = self.user_goal.settings['badge_name'] || self.user_goal.settings['summary']
      level = self.user_goal.badge_level(self.level)
      self.data['image_url'] = level['image_url'] if level && level['image_url']
      self.data['sound_url'] = level['sound_url'] if level && level['sound_url']
      self.data['badge_level'] = level
    end
  end
  
  def mark_progress!(percent, progress_expires_at=nil, badge_level=nil)
    return if self.earned
    self.data ||= {}
    raise "invalid percent" if percent >= 1.0 || percent < 0.0
    self.data['percent'] = percent.to_f
    self.data['progress_expires'] = progress_expires_at.utc.iso8601 if progress_expires_at
    self.data['badge_level'] = badge_level
    self.update_badge_data
    self.save!
  end
  
  def current_progress
    percent = self.data && self.data['percent'].to_f
    if self.earned
      return 1.0
    elsif self.data && self.data['progress_expires'] && self.data['progress_expires'] < Time.now.utc.iso8601
      percent = nil
    end
    percent.to_f
  end
  
  def self.check_for(user_id, stats_id=nil, allow_forever_check=false, verbose=false)
    # TODO: this is sloooow, like 10 minutes to run for some users
    # and it's definitely getting scheduled multiple times per user
    user = User.find_by_path(user_id)
    stats = WeeklyStatsSummary.find_by_global_id(stats_id) if stats_id
    stats_start = WeeklyStatsSummary.weekyear_to_date(stats.weekyear) if stats
    # TODO: sharding
    badges = UserBadge.where(:user_id => user.id)
    globals = UserGoal.where(:global => true)
    # TODO: sharding
    user_goals = UserGoal.where(:user_id => user.id, :active => true)
    badged_goals = (globals + user_goals).select{|g| g.badged? }
    badged_goals.each do |goal|
      earned_goal_badges = badges.select{|b| b.earned && b.user_goal_id == goal.id }.sort_by(&:level)
      max_level = earned_goal_badges[-1] ? earned_goal_badges[-1].level : 0
      next if max_level >= goal.settings['max_badge_level'] && !goal.settings['assessment_badge']
      puts "\n\nCHECKING #{goal.settings['summary']}" if verbose
      check_goal_badges(user, goal, max_level, stats_start, allow_forever_check, verbose)
    end
  end

  def self.process_goal_badges(badges, assessment_badge=nil)
    res = []
    all_badges = []

    if assessment_badge
      assessment_badge['assessment'] = true
      all_badges << assessment_badge
    end
    if badges
      all_badges += badges
    end
    level = 0
    all_badges.each_with_index do |badge, idx|
      badge['simple_type'] ||= 'custom'
      if badge['simple_type'] && badge['simple_type'] != 'custom'
        if badge['simple_type'].match(/per_week/)
          badge['interval'] = 'weekyear'
        else
          badge['interval'] = 'date'
        end
        if badge['simple_type'].match(/words/)
          badge['watchlist'] = true
        elsif badge['simple_type'].match(/buttons/)
          badge['button_instances'] = badge['instance_count']
        elsif badge['simple_type'].match(/modeling/)
          if badge['modeled_words_list']
            badge['watchlist'] = true
            badge['watch_total'] ||= badge['instance_count']
          else
            badge['modeled_button_instances'] = badge['instance_count']
          end
        end
      end

      badge_level = {}
      badge_level['simple_type'] = badge['simple_type']
      if badge['assessment']
        badge_level['assessment'] = true
      else
        level += 1
        badge_level['level'] = level
      end
      interval_types = ['date', 'weekyear', 'biweekyear', 'monthyear']
      badge_level['interval'] = 'date'
      badge_level['interval'] = badge['interval'] if interval_types.include?(badge['interval'])
      badge_level['image_url'] = UserGoal.new.process_string(badge['image_url']) if badge['image_url']
      badge_level['sound_url'] = UserGoal.new.process_string(badge['sound_url']) if badge['sound_url']
      
      if badge['watchlist']
        badge_level['watchlist'] = true
        if badge['words_list']
          badge_level['words_list'] = badge['words_list']
          badge_level['words_list'] = badge_level['words_list'].split(',').compact.map(&:strip).select{|w| w.length > 0 } if badge_level['words_list'].is_a?(String)
        elsif badge['parts_of_speech_list']
          badge_level['parts_of_speech_list'] = badge['parts_of_speech_list']
          badge_level['parts_of_speech_list'] = badge_level['parts_of_speech_list'].split(',').compact.map(&:strip).select{|w| w.length > 0 } if badge_level['parts_of_speech_list'].is_a?(String)
        elsif badge['modeled_words_list']
          badge_level['modeled_words_list'] = badge['modeled_words_list']
          badge_level['modeled_words_list'] = badge_level['modeled_words_list'].split(',').compact.map(&:strip).select{|w| w.length > 0 } if badge_level['modeled_words_list'].is_a?(String)
        end
        
        ['watch_type_minimum', 'watch_total', 'watch_type_count'].each do |key|
          badge_level[key] = badge[key].to_f if badge[key]
        end
        
        if badge['watch_type_interval'] && badge['watch_type_interval_count'] && interval_types.include?(badge['watch_type_interval'])
          badge_level['watch_type_interval'] = badge['watch_type_interval']
          badge_level['watch_type_interval_count'] = badge['watch_type_interval_count'].to_f  
        end
      elsif badge['instance_count']
        badge_level['instance_count'] = badge['instance_count'].to_f
        ['word_instances', 'button_instances', 'session_instances', 'modeled_button_instances',
            'modeled_word_instances', 'modeled_session_instances', 'unique_word_instances', 
            'unique_button_instances',
            'repeat_word_instances', 'geolocation_instances'].each do |key|
          badge_level[key] = badge[key].to_f if badge[key]
        end
      end
      
      ['consecutive_units', 'matching_units', 'matching_instances', 'unit_range'].each do |key|
        badge_level[key] = badge[key].to_f if badge[key]
      end
      res << badge_level
    end
    res
  end
  
  def self.check_goal_badges(user, goal, max_level, stats_start=nil, allow_forever_check=false, verbose=false)
    return nil if !goal.badged?
    prior_earned = true
    assessment_badge = goal.settings['assessment_badge']
    day_start = Time.parse(goal.settings['started_at']).to_date.iso8601 if goal.settings['started_at']
    if assessment_badge
      level = 0
    else
      level = max_level + 1
    end
    earns = 0
    # the seven days after stats_start or the seven days before today
    # look for an assessment session with the goal id that is auto, not manual
    # create such an assessment session if it doesn't already exist
    # only if the date is after the start date and before the conclude date of the goal
    # if the level-0 requirement is met for the day, mark a positive
    # otherwise mark a negative. update the existing value if already set
    # save and move on to the next date
    while prior_earned
      badge_level = goal.badge_level(level)
      if level == 0
        badge_level = assessment_badge
      end

      return nil if earns == 0 && !badge_level
      break if !badge_level || !badge_level.is_a?(Hash)
      earned = false

      measure = :date
      measure_days = 1
      today = Date.today
      today_units = {}
      UserBadge.add_date_blocks(today_units, today.iso8601)
      if badge_level['interval'] == 'weekyear'
        measure = :weekyear 
        measure_days = 7
      elsif badge_level['interval'] == 'biweekyear'
        measure = :biweekyear 
        measure_days = 14
      elsif badge_level['interval'] == 'monthyear'
        measure = :monthyear 
        measure_days = 30
      end

      days_back = nil
      if badge_level['consecutive_units']
        days_back = (badge_level['consecutive_units'] + 3) * measure_days
      elsif badge_level['unit_range']
        days_back = (badge_level['unit_range'] + 3) * measure_days
      elsif level == 0
        days_back = 7
      end
      puts "  #{badge_level.to_json}" if verbose
      puts "  #{measure.to_s} #{measure_days} going back #{days_back}" if verbose
      
      # TODO: sharding
      summaries = WeeklyStatsSummary.where(:user_id => user.id)
      weekyear = nil
      if days_back && !allow_forever_check
        date = today - days_back
        later_date = today
        if stats_start
          date = stats_start - days_back
          later_date = [today, stats_start + days_back].max
        end
        startweekyear = WeeklyStatsSummary.date_to_weekyear(date)
        endweekyear = WeeklyStatsSummary.date_to_weekyear(later_date)
        summaries = summaries.where(['weekyear >= ? AND weekyear <= ?', startweekyear, endweekyear])
      end
      days = []
      # check each day for any applicable data
      summaries.find_in_batches(batch_size: 10).each do |batch|
        batch.each do |summary|
          next unless summary.data && summary.data['stats'] && summary.data['stats']['days']
          summary.data['stats']['days'].each do |day_string, data|
            next if day_start && day_string < day_start
            day_result = UserBadge.check_day_stats(badge_level, data)
            if day_result
              UserBadge.add_date_blocks(day_result, day_string) 
              days << day_result
            elsif level == 0
              day_result = {'empty' => true}
              UserBadge.add_date_blocks(day_result, day_string) 
              days << day_result
            end
          end
        end
      end
      days = days.sort_by{|d| d[:date] }

      # clump into days, weeks, months, or whatever the specified unit is
      units = UserBadge.cluster_days(measure, days)
      
      if level == 0
        # check each day and update the automated assessment for that day
        units.each do |unit|
          # TODO: sharding
          next if unit[:date] > today
          ApplicationRecord.using(:master) do
            sessions = LogSession.where(:user_id => user.id, :goal_id => goal.id, :log_type => 'assessment').where(['started_at >= ? AND started_at <= ? AND ended_at <= ?', unit[:date] - 1.0, unit[:date] + 1.0, unit[:date] + 1.0]).order('started_at ASC')
            session = sessions.detect{|s| s.started_at.to_date == unit[:date] && s.data['assessment'] && s.data['assessment']['automatic'] }
            if !session
              session = LogSession.process_new({
                'assessment' => {
                  'tallies' => [
                    {'timestamp' => unit[:date].to_time.to_i, 'correct' => false}
                  ],
                  'totals' => {
                    'correct' => 0,
                    'incorrect' => 0
                  },
                  'description' => "Automatic goal assessment for #{goal.settings['summary']}"
                },
                'goal_id' => goal.global_id
              }, {user: user, author: user, device: user.devices[0], automatic_assessment: true})
            end
            # session.with_lock do
              valid = valid_unit(unit, badge_level)
              puts "  invalid unit at #{unit.to_json}" if !valid && verbose
              session.data['assessment']['tallies'][0]['correct'] = !!valid
              session.data['assessment']['totals']['correct'] = !!valid ? 1 : 0
              session.data['assessment']['totals']['incorrect'] = !!valid ? 0 : 1
              session.data['assessment']['explanation'] = valid && valid[:explanation]
              session.data['assessment']['automatic'] = true
              session.instance_variable_set('@goal_clustering_scheduled', true)
              session.save
            # end
          end
        end
        units = []
      else
        # filter units to only those that meet the needed criteria
        units = units.select do |unit|
          va = UserBadge.valid_unit(unit, badge_level)
          unit[:explanation] = va[:explanation] if va.is_a?(Hash)
          puts "  invalid unit at #{unit.to_json}" if !va && verbose
          va
        end
      end
      start_date = nil
      end_date = nil
      streak = 0
      tally = 0
      last_percent = 0.0
      
      # for watch lists, additional option to say you need to use X of them at least
      # once per week/month
      date_blocks = {}
      if badge_level['watch_type_interval']
        units.each_with_index do |unit, idx|
          block_id = unit[badge_level['watch_type_interval'].to_sym]
          date_blocks[block_id] ||= {matches: {}}
          unit[:matches].each do |match|
            if match[:count] > 0
              date_blocks[block_id][:matches][match[:value]] ||= 0
              date_blocks[block_id][:matches][match[:value]] += match[:count]
            end
          end
          if date_blocks[block_id][:matches].keys.length >= badge_level['watch_type_interval_count']
            date_blocks[block_id][:valid] = true
          end
        end
      end
      date_blocks = UserBadge.clean_date_blocks(date_blocks)
      
      units.each_with_index do |unit, idx|
        samples = (unit[:matches] || []).map{|m| m[:samples] || []}.flatten.uniq
        valid = true
        if badge_level['watch_type_interval']
          block_id = unit[badge_level['watch_type_interval'].to_sym]
          valid = !!(date_blocks[block_id] && date_blocks[block_id][:valid])
        end
        next unless valid
        
        if badge_level['consecutive_units']
          if idx > 0 && unit[measure] == (units[idx - 1][:next][measure])
            streak += 1
          else
            puts "  streak broken after #{units[idx - 1][:next][measure]}" if verbose && idx > 0
            puts "  #{unit[idx - 1].to_json}" if verbose
            start_date = unit[measure]
            streak = 1
          end
          if streak > 0
            last_percent = streak.to_f / badge_level['consecutive_units'].to_f
          end
          if streak >= badge_level['consecutive_units']
            puts "streak complete!" if verbose
            earned = {
              :started => start_date,
              :ended => unit[measure],
              :streak => streak,
              :explanation => unit[:explanation],
              :samples => samples
            }
          end
        elsif badge_level['matching_units']
          start_date ||= unit[measure]
          tally += 1
          if tally > 0
            last_percent = tally.to_f / badge_level['matching_units'].to_f
          end
          if tally >= badge_level['matching_units']
            earned = {
              :started => start_date,
              :ended => unit[measure],
              :tally => tally,
              :explanation => unit[:explanation],
              :samples => samples
            }
          end
        elsif badge_level['matching_instances']
          start_date ||= unit[measure]
          tally += (unit[:total] || 0)
          if tally > 0
            last_percent = tally.to_f / badge_level['matching_instances'].to_f
          end
          if tally >= badge_level['matching_instances']
            earned = {
              :started => start_date,
              :ended => unit[measure],
              :tally => tally,
              :explanation => unit[:explanation],
              :samples => samples
            }
          end
        end
      end
      
      progress = nil
      if badge_level['consecutive_units'] && !earned && units.length > 0
        if units[-1][:next][measure] >= today_units[measure]
          progress = last_percent 
        else
          progress = 0.0
        end
      elsif !earned
        progress = last_percent
      end
      
      badge = nil
      if level != 0
        badge = UserBadge.find_or_initialize_by(:user_id => user.id, :level => level, :user_goal_id => goal.id)
      end
      if badge && !badge.earned
        if earned
          earns += 1
          badge.award!(earned, badge_level)
          level += 1
          prior_earned = true
        else
          badge.mark_progress!(progress, nil, badge_level) if progress > 0
          prior_earned = false
        end
      else
        level = max_level if level == 0
        level += 1
        prior_earned = true
      end
    end
    earns
  end
  
  def self.clean_date_blocks(date_blocks); return date_blocks; end
  
  def self.check_day_stats(badge_level, data)
    day_result = nil
    data = data['total']
    if badge_level['watchlist']
      matches = []
      if badge_level['words_list'] && data['all_word_counts']
        if data['all_word_sequences'] && data['all_word_sequences'].length > 0
          word_hits = {}
          data['all_word_sequences'].compact.each do |sequence|
            str = sequence.join(' ').gsub(/\s+/, "\s").downcase
            badge_level['words_list'].each do |word|
              index = -1
              while index
                index = str.index(Regexp.new("\\b#{word.downcase}\\b", 'i'), index + 1)
                if index
                  pre = [str.rindex(/\b\w+\b/, [index - 1, 0].max), 0].max
                  pre2 = str.rindex(/\b\w+\b/, [pre - 1, 0].max) if pre

                  post = str.index(/\b\w+\b/, index + 1)
                  post += word.length if post
                  post = str.length unless post
                  post2 = str.index(/\b\w+\b/, post + 1) if post
                  post2 += word.length if post2

                  substr = str[(pre2 || pre)..(post2 || post || str.length)]
                  word_hits[word] = (word_hits[word] || []) + [substr.strip]
                end
              end
#              words = str.scan(Regexp.new("\\b#{word}\\b", 'i'))
#              word_hits[word] = (word_hits[word] || 0) + words.length
            end
          end

          word_hits.each do |key, list|
            matches << {
              value: key,
              count: list.length,
              samples: list
            }
          end
        else
          words = data['all_word_counts'].select{|k, v| badge_level['words_list'].map(&:downcase).include?(k.downcase) }
          words.each do |word, val|
            matches << {
              value: word,
              count: val
            }
          end
        end
      elsif badge_level['modeled_words_list'] && data['modeled_word_counts']
        words = data['modeled_word_counts'].select{|k, v| badge_level['modeled_words_list'].map(&:downcase).include?(k.downcase) }
        words.each do |word, val|
          matches << {
            value: word,
            count: val
          }
        end
      elsif badge_level['parts_of_speech_list'] && data['parts_of_speech']
        parts = data['parts_of_speech'].each do |k, v| 
          if badge_level['parts_of_speech_list'].map(&:downcase).include?(k.downcase) 
            matches << {
              value: k,
              count: v
            }
          end
        end
      end
      if matches.length > 0
        day_result = {
          matches: matches,
          total: matches.map{|m| m[:count] }.sum
        }
      end
      
      # aggregate all the days that have any data, then in a separate
      # iteration do the checking against criteria, but first break
      # them into days/weeks/months depending on the range, then use
      # that same clustering for sequencing checks in a third iterative loop
    elsif badge_level['instance_count']
      instances = 0
      if badge_level['word_instances'] && data['all_word_counts']
        instances = data['all_word_counts'].map{|k, v| v }.sum
      elsif badge_level['button_instances'] && data['all_button_counts']
        instances = data['all_button_counts'].map{|k, v| v['count'] }.sum
      elsif badge_level['session_instances'] && data['total_sessions']
        instances = data['total_sessions']
      elsif badge_level['modeled_session_instances'] && data['modeled_session_events']
        cutoff = badge_level['modeled_session_minimum'] || 3
        instances = 0
        data['modeled_session_events'].each do |total, cnt|
          instance += cnt if total >= cutoff
        end
        instances = data['modeled_sessions']
      elsif badge_level['modeled_button_instances'] && data['modeled_button_counts']
        instances = data['modeled_button_counts'].map{|k, v| v['count'] }.sum
      elsif badge_level['modeled_word_instances'] && data['modeled_word_counts']
        instances = data['modeled_word_counts'].map{|k, v| v }.sum
      elsif badge_level['unique_word_instances'] && data['all_word_counts']
        instances = data['all_word_counts'].to_a.count
      elsif badge_level['unique_button_instances'] && data['all_button_counts']
        instances = data['all_button_counts'].to_a.count
      elsif badge_level['repeat_word_instances']
      elsif badge_level['geolocation_instances']
      end
      if instances > 0 #badge_level['instance_count']
        day_result = {
          :total => instances
        }
      end
    end
    day_result
  end
  
  def self.valid_unit(unit, badge_level)
    if badge_level['watchlist']
      matches = unit[:matches] || []
      # only track those watched types that happen at or above the minimum
      if badge_level['watch_type_minimum']
        matches = matches.select{|m| m[:count] >= badge_level['watch_type_minimum'] }
      end
      # only allow if the total across all types is at or above the cutoff
      if badge_level['watch_total']
        matches = [] unless matches.map{|m| m[:count] }.sum >= badge_level['watch_total']
      end
      # only allow if the number of types is at or above the cutoff
      if badge_level['watch_type_count']
        matches = [] unless matches.length >= badge_level['watch_type_count']
      end
      if matches.length > 0
        samples = matches.map{|m| m[:samples] || []}.flatten
        return {
          valid: true,
          samples: samples,
          explanation: samples.uniq.sort.join(', ')
        }
      else
        return false
      end
      return matches.length > 0
    elsif badge_level['instance_count']
      if unit[:total] && unit[:total] >= badge_level['instance_count']
        key = ""
        if badge_level['word_instances']
          key = 'words'
        elsif badge_level['button_instances']
          key = 'buttons'
        elsif badge_level['session_instances']
          key = 'sessions'
        elsif badge_level['modeled_button_instances']
          key = 'modeled buttons'
        elsif badge_level['modeled_word_instances']
          key = 'modeled words'
        elsif badge_level['unique_word_instances']
          key = 'unique words'
        elsif badge_level['unique_button_instances']
          key = 'unique buttons'
        end
        return {
          valid: true,
          count_key: key,
          explanation: "#{unit[:total]} #{key}"
        }
      else
        return false
      end
    end
    return false
  end
  
  def self.cluster_days(measure, days)
    units = days
    # clusterize all of them, since occasionally a duplicate day
    # record can cause problems with calculations
    if measure != :date || true
      unit_hash = {}
      days.each do |day|
        unit_id = day[measure]
        unit_hash[unit_id] ||= {}
        unit_hash[unit_id][measure] = unit_id
        unit_hash[unit_id][:next] = {}
        unit_hash[unit_id][:next][measure] = day[:next][measure]
        unit_hash[unit_id][:total] = (unit_hash[unit_id][:total] || 0) + (day[:total] || 0)
        unit_hash[unit_id][:explanation] ||= ""
        unit_hash[unit_id][:explanation] += ", " if unit_hash[unit_id][:explanation].length > 0
        unit_hash[unit_id][:explanation] += day[:explanation] if day[:explanation]
        matches = {}
        (unit_hash[unit_id][:matches] || []).each do |match|
          matches[match[:value]] ||= {:count => 0, :samples => [], :explanation => ""}
          matches[match[:value]][:count] += match[:count] || 0
          matches[match[:value]][:samples] += match[:samples] || []
        end
        (day[:matches] || []).each do |match|
          matches[match[:value]] ||= {:count => 0, :samples => [], :explanation => ""}
          matches[match[:value]][:count] += match[:count] || 0
          matches[match[:value]][:samples] += match[:samples] || []
        end
        if matches.keys.length > 0
          unit_hash[unit_id][:matches] = []
          matches.each do |k, m|
            unit_hash[unit_id][:matches] << {
              value: k,
              count: m[:count],
              samples: m[:samples]
            }
          end
        end
      end
      units = unit_hash.map{|k, u| u }
    end

    units.sort_by{|u| u[measure] }
  end
  
  def self.add_date_blocks(day_result, day_string)
    date = Date.parse(day_string)
    day_result[:date] = date
    day_result[:weekyear] = WeeklyStatsSummary.date_to_weekyear(date)
    next_weekyear = day_result[:weekyear] + 1
    d = Date.new(day_result[:weekyear].to_s[0, 4].to_i, 1, 1)
    max_week = 52
    max_week = 53 if d.wday == 4 || (d.leap? && d.wday == 3)
    if next_weekyear % 100 > max_week
      next_weekyear -= max_week
      next_weekyear += 100
    end
    wy = day_result[:weekyear].to_s
    day_result[:biweekyear] = (wy[0, 4].to_i * 100) + (((wy[4, 2].to_i / 2).floor * 2) + 1)
    if day_result[:biweekyear] % 100 > 52
      day_result[:biweekyear] -= 52
      day_result[:biweekyear] += 100
    end
    next_biweekyear = day_result[:biweekyear] + 2
    if next_biweekyear % 100 > max_week
      next_biweekyear -= max_week
      next_biweekyear += 100
    end
    day_result[:monthyear] = date.month + (date.year * 100)
    next_monthyear = day_result[:monthyear] + 1
    if next_monthyear % 100 > 12
      next_monthyear -= 12
      next_monthyear += 100
    end
    day_result[:next] = {
      date: date + 1,
      weekyear: next_weekyear,
      biweekyear: next_biweekyear,
      monthyear: next_monthyear
    }
  end
  
    # possible goals:
    # - speaking streak, consecutive days spoken in a row
    # - praactical goals, multiple levels
    # - sent a message to someone
    # - shared a message through a different app
    # - robust vocabulary, # of unique words/buttons
    # - word pairs, using the same word with multiple pairs
    # - using describing words, verbs, etc.
    # - multiple words in a small window of time

    # automated tracking:
    # - days in a row
    # - # of days in a given period (including forever)
    # - # of times in a given period (including forever)
    
    # - list of watchwords
    #   - using any of them counts as a check
    #   - using N of them on the same day counts as a check
    #   - using at least N of them, for a total of M times, with each match getting used at least L times, in a single day counts as a check
    #   - AND you need to use W of them at least once a week/month?
    # - list of parts of speech
    # - at least N different parts of speech, with each part being used at least M times during the day
    # - number of buttons/words
    # - number of sessions
    # - number of modeled buttons
    # - number of buttons in short sequence
    # - number of unqiue words
    # - number of times using the same word
    # - number of unique combinations using a watchword
    # - number of unique combinations using the same word (any word)
    
    # - N out of M events/words/phrases
    # - all of M events/words/phrases
    
    # - some way to say, used each of M words at least N times each in a given period
end

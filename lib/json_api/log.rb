module JsonApi::Log
  extend JsonApi::Json
  
  TYPE_KEY = 'log'
  DEFAULT_PAGE = 10
  MAX_PAGE = 25
    
  def self.build_json(log, args={})
    json = {}
    
    json['id'] = log.global_id
    json['id'] ||= 'fake-' + Time.now.to_f.to_s + "-" + rand(9999).to_s
    if log.data['stash_id'] && !log.global_id
      json['stash_id'] = log.data['stash_id']
    end
    json['pending'] = true if !log.global_id
    json['type'] = log.log_type
    json['message_type'] = true if log.log_type == 'note' && (log.data['message'] || log.data['author_contact'] || (log.data['note'] || {})['prior_contact'])
    json['started_at'] = log.started_at.iso8601 if log.started_at
    json['ended_at'] = log.ended_at.iso8601 if log.ended_at
    json['time_id'] = (log.started_at || 0).to_i
    json['imported'] = !!log.data['imported']
    if log.data['guid']
      json['guid'] = log.data['guid']
    end
    if log.author
      json['author'] = {
        'id' => log.author.global_id,
        'user_name' => log.author.user_name
      }
      if log.data['author_contact']
        json['author']['contact'] = log.data['author_contact']
      end
    else
      json['author'] = {
        'user_name' => 'unknown'
      }
    end
    if log.user
      json['user'] = {
        'id' => log.user.global_id,
        'user_name' => log.user.user_name
      }
    else
      json['user'] = {
        'user_name' => 'unknown'
      }
    end
    if log.data && log.data['goal']
      json['goal'] = {
        'id' => log.data['goal']['id'],
        'summary' => log.data['goal']['summary'],
        'status' => log.data['goal']['status']
      }
    end
    
    if log.data['note']
      json['note'] = log.data['note']
      if log.data['note']['video'] && args[:permissions]
        video = UserVideo.find_by_global_id(log.data['note']['video']['id'])
        if video && video.url
          json['video'] = video.summary_hash
        end
      end
    elsif log.data['assessment']
      json['percent'] = log.data['stats']['percent_correct']
      json['assessment'] = log.data['assessment']
    elsif log.data['profile']
      json['profile'] = log.data['profile']
    elsif log.data['journal']
      json['journal'] = log.data['journal'].slice('vocalization', 'sentence', 'timestamp', 'id')
    elsif log.data['eval']
      json['evaluation'] = log.data['eval']
      json['duration'] = log.data['duration']
      json['always_available'] = (log.data['prior_evals'] || 0) < 2
    else
      json['duration'] = log.data['duration']
      json['button_count'] = log.data['button_count']
      json['utterance_count'] = log.data['utterance_count']
      json['utterance_word_count'] = log.data['utterance_word_count']
    end

    json['event_note_count'] = log.data['event_note_count'] || 0
    json['summary'] = log.data['event_summary']
    json['highlight_summary'] = log.data['highlight_summary']
    json['highlighted'] = log.highlighted
    json
  end
  
  def self.extra_includes(log, json, args={})
    if log.data['geo'] && log.user && log.user.settings['preferences'] && log.user.settings['preferences']['geo_logging']
      json['log']['geo'] = {
        'latitude' => log.data['geo'][0],
        'longitude' => log.data['geo'][1]
      }
    end
    json['log']['geo_cluster_id'] = log.geo_cluster && log.geo_cluster.global_id
    json['log']['ip_cluster_id'] = log.ip_cluster && log.ip_cluster.global_id
    
    if log.data['readable_ip_address']
      json['log']['readable_ip_address'] = log.data['readable_ip_address']
    end
    if log.data['days']
      str = 6.months.ago.to_date.iso8601
      events = []
      log.data['days'].each do |key, day|
        if key >= str
          events << day
        end
      end
      json['log']['daily_use'] = events.sort_by{|e| e['date'] }
    end

    if args[:encryption_allowed] && log.data['extra_data_public'] && log.extra_data_public_url && log.data['extra_data_encryption']
      json['log']['encryption_settings'] = log.data['extra_data_encryption']
      json['log']['data_url'] = log.extra_data_public_url
    else
      log.assert_extra_data
      json['log']['events'] = LogSession.extra_data_public_transform(log.data['events'])
    end
    
    if json['log']['type'] == 'assessment'
      json['log']['assessment'] = {}.merge(log.data['assessment'] || {})
      json['log']['assessment']['stats'] = log.data['stats']
    elsif json['log']['type'] == 'eval'
      json['log']['evaluation']['stats'] = log.data['stats']
    elsif json['log']['type'] == 'profile'
      history = []
      priors = LogSession.where(user_id: log.user_id, log_type: 'profile', profile_id: log.profile_id).where(['started_at < ? AND started_at > ?', log.started_at, log.started_at - 3.years]).order('started_at')
      priors.find_in_batches(batch_size: 25) do |batch|
        batch.each do |session|
          next if session.id == log.id
          if session.data['profile']['id'] == log.data['profile']['id']
            prof = session.data['profile'].except('results', 'encrypted_results')
            prof['log_id'] = session.global_id
            history.push(prof)
          end
        end
      end
      json['log']['profile']['history'] = history.last(5)
    end
    
    if json['log']['goal'] && json['log']['goal']['id']
      goal = UserGoal.find_by_global_id(json['log']['goal']['id'])
      if goal
        json['log']['goal']['summary'] = goal.summary
      else
        json['log']['goal'] = nil
      end
    end
    
    if json['log']['type'] == 'session'
      device = {
        'name' => "Unknown device",
        'id' => nil
      }
      if log.device
        device['name'] = log.device.settings['name']
        device['id'] = log.device.global_id
      end
      json['log']['device'] = device
    end
    
    next_log = LogSession.where(['user_id = ? AND started_at >= ? AND id != ?', log.user_id, log.started_at, log.id]).order('started_at ASC, id').limit(1)[0]
    if next_log
      json['log']['next_log_id'] = next_log.global_id
    end
    previous_log = LogSession.where(['user_id = ? AND started_at <= ? AND id != ?', log.user_id, log.started_at, log.id]).order('started_at DESC, id').limit(1)[0]
    if previous_log
      json['log']['previous_log_id'] = previous_log.global_id
    end
    json['log']['nonce'] = log.require_nonce
    
    json
  end

  def self.paginate_meta(params, json)
    meta = {:user_id => params['user_id'], :type => params['type'], :start => params['start'], :end => params['end'], :device_id => params['device_id'], :location_id => params['location_id']}
    meta[:sort_order] = params['sort_order'] if params['sort_order'].present?
    meta
  end
end

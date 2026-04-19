class JobStash < ApplicationRecord
  include GlobalId
  include SecureSerialize
  include Notifier

  secure_serialize :data

  def self.flush_old_records
    JobStash.where(['created_at < ?', 2.weeks.ago]).delete_all
  end

  def self.events_for(log)
    res = []
    JobStash.where(user_id: log.user_id, log_session_id: log.id).each do |stash|
      (stash.data['events'] || []).each do |event|
        res << event
      end
    end
    res
  end

  def self.add_events_to(log, events, type='n/a')
    raise "Log need id and user id before stashing events" unless log && log.id && log.user_id
    JobStash.create(user_id: log.user_id, log_session_id: log.id, data: {
      'events' => events,
      'creation_type' => type
    })
  end

  def self.remove_events_from(log, events)
    to_remove = {}
    events.each{|e| 
      to_remove["#{e['id']}::#{e['timestamp']}"] = true 
      to_remove[e.except('id').to_json] = true
    }
    JobStash.where(user_id: log.user_id, log_session_id: log.id).each do |stash|
#      stash.with_lock do
        if stash.data && stash.data['events']
          orig_cnt = stash.data['events'].length
          stash.data['events'] = stash.data['events'].select{|e| !to_remove["#{e['id']}::#{e['timestamp']}"] && !to_remove[e.except('id').to_json] }
          stash.save if stash.data['events'] != orig_cnt
        end
#      end
    end
  end

  def additional_webhook_record_codes(notification_type, additional_args)
    res = []
    if notification_type == 'anonymized_user_details'
      res << "research"
    end
    res
  end


  def webhook_content(notification_type, content_type, args)
    if content_type == 'anonymized_summary' && args[:user_integration] && self.data['user_id']
      user = User.find_by_path(self.data['user_id'])
      if user
        return {
          'uid' => args[:user_integration].user_token(user),
          'anon_id' => user.anonymized_identifier,
          'details' => self.data['details'] || {},
          'host' => JsonApi::Json.current_host
        }.to_json
      end
    end
    return nil
  end
end

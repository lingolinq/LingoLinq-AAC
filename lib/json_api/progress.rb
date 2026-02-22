module JsonApi::Progress
  extend JsonApi::Json
  
  TYPE_KEY = 'progress'
  DEFAULT_PAGE = 10
  MAX_PAGE = 25
    
  def self.build_json(progress, args={})
    json = {}
    json['id'] = progress.global_id
    json['status_url'] = "#{JsonApi::Json.current_host}/api/v1/progress/#{json['id']}"
    last_progress = progress.last_in_chain || progress
    json['status'] = last_progress.settings['state']
    if last_progress.started_at && !last_progress.finished_at && last_progress.updated_at && last_progress.updated_at < 2.hours.ago
      json['status'] = 'errored' 
      json['result'] = {'error' => 'progress job is taking too long, possibly crashed'}
    elsif last_progress.started_at
      json['started_at'] = last_progress.started_at.iso8601
    end
    if last_progress.finished_at
      json['finished_at'] = last_progress.finished_at.iso8601
      json['result'] = last_progress.settings['result']
    end
    if json['status'] == 'errored'
      error_from_settings = last_progress.settings['error_result'] ||
        (last_progress.settings['error'] ? { 'error' => last_progress.settings['error'] } : nil)
      json['result'] = error_from_settings if error_from_settings
    end
    json['percent'] = progress.settings['percent'] if progress.settings['percent']
    json['sub_status'] = progress.settings['message_key'] if progress.settings['message_key']
    json['minutes_estimate'] = progress.settings['minutes_estimate'].round if progress.settings['minutes_estimate']
    json
  end
end

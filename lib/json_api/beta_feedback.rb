module JsonApi::BetaFeedback
  extend JsonApi::Json

  TYPE_KEY = 'beta_feedback'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50

  def self.paginate_meta(params, _json)
    meta = {}
    meta['q'] = params['q'] if params['q'].present?
    meta['sort_by'] = params['sort_by'] if params['sort_by'].present?
    meta['sort_order'] = params['sort_order'] if params['sort_order'].present?
    meta['filter_type'] = params['filter_type'] if params['filter_type'].present?
    meta['filter_severity'] = params['filter_severity'] if params['filter_severity'].present?
    meta['filter_priority'] = params['filter_priority'] if params['filter_priority'].present?
    meta
  end

  def self.build_json(msg, args={})
    s = msg.settings || {}
    detail = args[:detail] || args['detail']
    subject = msg.try(:beta_subject).presence || s['subject']
    ftype = msg.try(:beta_feedback_type).presence || s['feedback_type']
    sev = msg.try(:beta_severity).presence || s['severity']
    submitter = msg.try(:beta_submitter_name).presence || s['name']

    json = {
      'id' => msg.global_id,
      'created_at' => msg.created_at.utc.iso8601,
      'date_short' => msg.created_at.utc.strftime('%d %b %Y'),
      'subject' => subject,
      'feedback_type' => ftype,
      'severity' => sev,
      'reaction' => s['reaction'],
      'priority' => msg.try(:beta_priority),
      'name' => submitter,
      'email' => s['email'],
      'locale' => s['locale'],
      'user_id' => s['user_id'],
      'ip_address' => s['ip_address'],
      'version' => s['version'],
      'user_agent' => s['user_agent'],
      'has_screenshot' => s['screenshot_base64'].present?,
      'screenshot_filename' => s['screenshot_filename'],
      'has_recording' => msg.beta_feedback_recording.present?,
      'recording_saved_locally' => !!s['recording_saved_locally']
    }

    if detail
      json['device_context'] = s['device_context']
      json['steps_to_reproduce'] = s['steps_to_reproduce']
      json['expected_result'] = s['expected_result']
      json['actual_result'] = s['actual_result']
      json['general_feedback'] = s['general_feedback']
      json['workflow_context'] = s['workflow_context']
      json['message'] = s['message']
      json['recording_byte_size'] = s['recording_byte_size']
      if msg.beta_feedback_recording
        rec = msg.beta_feedback_recording
        json['recording'] = {
          'id' => rec.global_id,
          'content_type' => rec.content_type,
          'byte_size' => rec.byte_size,
          'expires_at' => rec.expires_at && rec.expires_at.utc.iso8601,
          'expired' => rec.expired?,
          'deleted' => rec.deleted?,
          'signed_url' => rec.signed_url
        }
      end
      if s['screenshot_base64'].present?
        ext = (s['screenshot_filename'].to_s.split('.').last || 'png').downcase
        mime = case ext
               when 'jpg', 'jpeg' then 'image/jpeg'
               when 'png' then 'image/png'
               when 'gif' then 'image/gif'
               when 'webp' then 'image/webp'
               else 'image/png'
               end
        json['screenshot_data_url'] = "data:#{mime};base64,#{s['screenshot_base64']}"
      end
    else
      gf = s['general_feedback'].to_s
      json['general_feedback_preview'] = gf.length > 240 ? "#{gf[0, 240]}…" : gf
    end

    json
  end
end

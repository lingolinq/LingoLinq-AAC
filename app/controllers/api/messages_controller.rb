class Api::MessagesController < ApplicationController
  def create
    # Public /contact submissions have no API user; production can opt in with
    # ALLOW_UNAUTHENTICATED_TICKETS. Development defaults to allowed so local
    # contact works without extra env (endpoint is still Rack::Attack throttled).
    allow_anonymous = ENV['ALLOW_UNAUTHENTICATED_TICKETS'].present? || Rails.env.development?
    if !@api_user && !allow_anonymous
      return api_error 400, {error: "API token required"}
    end


    # Beta feedback honeypot: must stay empty. Respond success without saving so bots cannot tune payloads.
    raw_message = params['message']
    if raw_message.is_a?(ActionController::Parameters)
      raw_message = raw_message.to_unsafe_h
    end
    if raw_message.is_a?(Hash) && raw_message['recipient'].to_s == 'beta_feedback' &&
        raw_message['beta_feedback_hp'].to_s.strip.present?
      return render json: {received: true}.to_json
    end


    msg_data = params['message']
    msg_data = msg_data.permit! if msg_data.is_a?(ActionController::Parameters)
    m = msg_data && ContactMessage.process_new(msg_data, {
      'ip_address' => request.remote_ip,
      'user_agent' => request.headers['User-Agent'],
      'version' => request.headers['X-LingoLinq-Version'],
      'api_user' => @api_user
    })
    if !m || m.errored?
      api_error(400, {error: "message creation failed", errors: m && m.processing_errors})
    else
      if m.settings['recipient'].to_s == 'beta_feedback'
        Rails.logger.info("Beta feedback stored as ContactMessage #{m.global_id}")
      end
      render json: {received: true, id: m.global_id}.to_json
    end
  end
end

class Api::MessagesController < ApplicationController
  def create
    if !@api_user && !ENV['ALLOW_UNAUTHENTICATED_TICKETS']
      return api_error 400, {error: "API token required"}
    end
    
    m = params['message'] && ContactMessage.process_new(params['message'], {
      'ip_address' => request.remote_ip,
      'user_agent' => request.headers['User-Agent'],
      'version' => request.headers['X-LingoLinq-Version'],
      'api_user' => @api_user
    })
    if !m || m.errored?
      api_error(400, {error: "message creation failed", errors: m && m.processing_errors})
    else
      render json: {received: true, id: m.global_id}.to_json
    end
  end
end

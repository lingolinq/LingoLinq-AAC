class Api::BetaFeedbackRecordingsController < ApplicationController
  def create
    raw = params['beta_feedback_recording'] || params[:beta_feedback_recording] || {}
    raw = raw.permit(:content_type, :byte_size, :consent_accepted, :consent_accepted_at) if raw.is_a?(ActionController::Parameters)
    data = raw.to_h.with_indifferent_access

    unless ActiveModel::Type::Boolean.new.cast(data[:consent_accepted])
      return api_error 400, {error: "Recording consent is required"}
    end

    rec = BetaFeedbackRecording.new(
      content_type: normalized_content_type(data[:content_type]),
      byte_size: data[:byte_size].to_i,
      settings: {
        'consent_accepted' => true,
        'consent_accepted_at' => data[:consent_accepted_at].presence || Time.now.utc.iso8601,
        'user_id' => @api_user && @api_user.global_id,
        'ip_address' => request.remote_ip,
        'user_agent' => request.headers['User-Agent']
      }
    )

    if rec.save
      render json: recording_json(rec, include_upload: true).to_json
    else
      api_error 400, {error: "recording creation failed", errors: rec.errors.full_messages}
    end
  end

  def confirm
    rec = BetaFeedbackRecording.find_by_global_id(params[:id])
    return api_error 404, {error: "Record not found"} unless rec
    return api_error 403, {error: "Invalid confirmation token"} unless rec.token == params[:token].to_s

    if rec.confirm!
      render json: recording_json(rec).to_json
    else
      api_error 400, {error: "Recording upload was not found"}
    end
  end

  def upload
    rec = BetaFeedbackRecording.find_by_global_id(params[:id])
    return api_error 404, {error: "Record not found"} unless rec
    return api_error 403, {error: "Invalid confirmation token"} unless rec.token == params[:token].to_s
    return api_error 400, {error: "Recording upload already confirmed"} if rec.status == 'confirmed'

    file = params[:file] || params['file']
    unless file && file.respond_to?(:tempfile)
      return api_error 400, {error: "Recording file is required"}
    end
    if file.size.to_i <= 0 || file.size.to_i > BetaFeedbackRecording::MAX_BYTES
      return api_error 400, {error: "Recording must be between 1 byte and 100 MB"}
    end

    rec.byte_size = file.size.to_i
    rec.save!
    begin
      Uploader.remote_upload(rec.upload_key, file.tempfile.path, rec.content_type)
      rec.status = 'confirmed'
      rec.confirmed_at ||= Time.now
      rec.save!
    rescue => e
      Rails.logger.warn("Beta feedback recording S3 fallback storing locally id=#{params[:id]} #{e.class}: #{e.message}")
      rec.store_local_upload!(file.tempfile.path)
    end
    render json: recording_json(rec).to_json
  rescue => e
    Rails.logger.warn("Beta feedback recording server upload failed id=#{params[:id]} #{e.class}: #{e.message}")
    api_error 400, {error: "Recording upload failed"}
  end

  def download
    rec = BetaFeedbackRecording.find_by_global_id(params[:id])
    return api_error 404, {error: "Record not found"} unless rec
    return api_error 403, {error: "Invalid confirmation token"} unless rec.token == params[:token].to_s
    return api_error 404, {error: "Recording not available"} unless rec.settings && rec.settings['local_path'].present?
    return api_error 404, {error: "Recording not available"} unless File.exist?(rec.settings['local_path'])

    send_file rec.settings['local_path'],
      type: rec.content_type,
      disposition: 'inline',
      filename: "beta-feedback-recording.#{rec.file_extension}"
  end

  private

  def normalized_content_type(value)
    value.to_s.split(';').first.presence || 'video/webm'
  end

  def recording_json(rec, include_upload: false)
    json = {
      beta_feedback_recording: {
        id: rec.global_id,
        token: rec.token,
        status: rec.status,
        content_type: rec.content_type,
        byte_size: rec.byte_size,
        upload_url: "/api/v1/beta_feedback_recordings/#{rec.global_id}/upload",
        confirm_url: "/api/v1/beta_feedback_recordings/#{rec.global_id}/confirm"
      }
    }
    json[:beta_feedback_recording][:remote_upload] = rec.remote_upload if include_upload
    json
  end
end

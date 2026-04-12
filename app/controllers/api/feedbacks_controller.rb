class Api::FeedbacksController < ApplicationController
  before_action :require_api_token

  def create
    user = @api_user
    unless FeatureFlags.feature_enabled_for?('help_feedback_v2', user)
      return api_error(404, { error: I18n.t("feedback.feature_disabled") })
    end

    rate_key = 'feedback_rate_limit:' + user.id.to_s + ':' + Time.current.strftime('%Y%m%d%H')
    count = (Rails.cache.read(rate_key) || 0).to_i + 1
    Rails.cache.write(rate_key, count, expires_in: 1.hour)
    if count > 5
      return api_error(429, { error: I18n.t("feedback.rate_limited") })
    end

    permitted = params.permit(:category, :description, :email, :screenshot, :current_url)

    org_id = nil
    if user.respond_to?(:managing_organization)
      mo = user.managing_organization
      org_id = mo.id if mo
    end

    device_info = {
      'user_agent'  => request.user_agent,
      'current_url' => permitted[:current_url],
      'ip'          => request.remote_ip
    }.compact

    screenshot_url = nil
    if permitted[:screenshot].present?
      screenshot_url = strip_exif_and_upload(permitted[:screenshot])
    end

    feedback = Feedback.new(
      user_id: user.id,
      organization_id: org_id,
      category: permitted[:category],
      description: permitted[:description],
      email: permitted[:email],
      device_info: device_info,
      screenshot_url: screenshot_url,
      priority: 'normal',
      status: 'open'
    )

    if feedback.save
      FeedbackRouter.route(feedback)
      render json: {
        feedback: {
          id: feedback.id,
          category: feedback.category,
          priority: feedback.priority,
          status: feedback.status
        },
        message: sla_message_for(feedback)
      }, status: 201
    else
      api_error(400, { errors: feedback.errors.full_messages })
    end
  end

  private

  def sla_message_for(feedback)
    case feedback.priority
    when 'urgent'
      I18n.t("feedback.sla.urgent")
    else
      case feedback.category
      when 'feature_request'
        I18n.t("feedback.sla.feature_request")
      else
        I18n.t("feedback.sla.standard")
      end
    end
  end

  def strip_exif_and_upload(file)
    return nil unless file.respond_to?(:original_filename) && file.respond_to?(:tempfile)
    ext = File.extname(file.original_filename.to_s)
    remote_path = 'feedback/' + SecureRandom.uuid + ext
    content_type = file.respond_to?(:content_type) ? file.content_type : 'application/octet-stream'

    upload_path = file.tempfile.path
    stripped_tempfile = nil

    begin
      image = MiniMagick::Image.open(file.tempfile.path)
      image.strip
      stripped_tempfile = Tempfile.new(['feedback_stripped', ext])
      stripped_tempfile.binmode
      stripped_tempfile.close
      image.write(stripped_tempfile.path)
      upload_path = stripped_tempfile.path
    rescue MiniMagick::Error, StandardError => e
      Rails.logger.warn("Feedback EXIF strip failed, uploading original: #{e.class}: #{e.message}")
      upload_path = file.tempfile.path
    end

    result = Uploader.remote_upload(remote_path, upload_path, content_type)
    result && result[:url]
  ensure
    if stripped_tempfile
      stripped_tempfile.close unless stripped_tempfile.closed?
      stripped_tempfile.unlink rescue nil
    end
  end
end

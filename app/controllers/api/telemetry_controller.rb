class Api::TelemetryController < ApplicationController
  before_action :require_api_token
  before_action :require_telemetry_admin, only: [:index]
  before_action :require_telemetry_admin_panel, only: [:organization]

  def index
    scope = params[:scope].to_s
    scope = 'global' unless %w[global none].include?(scope)
    render json: TelemetryStats.dashboard(
      scope: scope,
      start_at: params[:start_at],
      end_at: params[:end_at]
    )
  end

  def organization
    org = Organization.find_by_path(params[:organization_id])
    return unless exists?(org, params[:organization_id])

    if params[:scope].to_s == 'none'
      return api_error 403, {error: 'Not authorized'} unless @api_user&.admin?

      return render json: TelemetryStats.dashboard(
        scope: 'none',
        start_at: params[:start_at],
        end_at: params[:end_at]
      )
    end

    if params[:scope].to_s == 'global'
      return api_error 403, {error: 'Not authorized'} unless @api_user&.admin?

      return render json: TelemetryStats.dashboard(
        scope: 'global',
        start_at: params[:start_at],
        end_at: params[:end_at]
      )
    end

    return unless allowed?(org, 'edit')

    fu = telemetry_filter_user(org, params[:filter_user_id])
    fd = telemetry_filter_device(org, fu, params[:filter_device_id])

    render json: TelemetryStats.dashboard(
      scope: 'organization',
      organization: org,
      start_at: params[:start_at],
      end_at: params[:end_at],
      filter_user: fu,
      filter_device: fd
    )
  end

  private

  def require_telemetry_admin
    return if @api_user&.admin?

    api_error 403, {error: 'Not authorized'}
  end

  def telemetry_filter_user(org, global_id)
    return nil if global_id.blank?

    user = User.find_by_path(global_id.to_s)
    return nil unless user
    return nil unless org.approved_users(true).where(id: user.id).exists?

    user
  end

  def telemetry_filter_device(org, filter_user, device_global_id)
    return nil if device_global_id.blank?

    device = Device.find_by_global_id(device_global_id.to_s)
    return nil unless device

    eligible =
      if filter_user
        device.user_id == filter_user.id
      else
        org.approved_users(true).where(id: device.user_id).exists?
      end
    return nil unless eligible

    device
  end

  def require_telemetry_admin_panel
    return if @api_user&.admin?
    return if FeatureFlags.feature_enabled_for?('telemetry_admin_panel', @api_user)

    api_error 403, {error: 'Not authorized'}
  end
end

class Api::TelemetryEventsController < ApplicationController
  before_action :require_api_token
  before_action :require_product_telemetry

  MAX_EVENTS = 50

  def create
    events = event_params
    if events.length > MAX_EVENTS
      return api_error 400, {error: 'Too many telemetry events'}
    end

    saved = []
    errors = []
    device = Device.find_by_global_id(@api_device_id)
    org = telemetry_organization

    events.each do |event_data|
      event = TelemetryEvent.process_new(event_data, user: @api_user, device: device, organization: org)
      if event.persisted?
        saved << event
      else
        errors << event.errors.full_messages
      end
    end

    if errors.length > 0
      api_error 400, {error: 'telemetry event creation failed', errors: errors}
    else
      render json: {telemetry_events: {count: saved.length}}
    end
  end

  private

  def event_params
    raw = params[:telemetry_events] || params['telemetry_events']
    raw ||= [params[:telemetry_event] || params['telemetry_event']]
    raw = raw.values if raw.is_a?(Hash)
    raw = [raw] unless raw.is_a?(Array)
    raw.compact.map do |event|
      event = event.permit! if event.is_a?(ActionController::Parameters)
      event.respond_to?(:to_unsafe_h) ? event.to_unsafe_h : event.to_h
    end
  end

  def telemetry_organization
    org_id = TelemetryEvent.organization_id_for(@api_user)
    Organization.find_by(id: org_id) if org_id
  end

  def require_product_telemetry
    return if @api_user&.admin?
    return if FeatureFlags.feature_enabled_for?('product_telemetry', @api_user)

    api_error 403, {error: 'Not authorized'}
  end
end

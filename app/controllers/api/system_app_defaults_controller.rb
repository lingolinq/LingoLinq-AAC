class Api::SystemAppDefaultsController < ApplicationController
  include Api::SystemSettingsAccess

  before_action :require_api_token
  before_action :require_system_settings_access
  before_action :require_site_admin!, only: [:update]

  # GET /api/v1/system_app_defaults
  def show
    stored = SystemAppDefaults.get
    effective = SystemAppDefaults.effective_settings
    fields = SystemAppDefaults::EDITABLE_FIELDS.map do |field|
      {
        key: field,
        value: effective[field],
        stored_value: stored[field],
        is_customized: stored[field].present?
      }
    end

    render json: {
      fields: fields,
      settings: effective.slice(*SystemAppDefaults::EDITABLE_FIELDS)
    }.to_json
  end

  # PUT /api/v1/system_app_defaults
  def update
    attrs = params[:settings] || params[:app_defaults] || params
    attrs = attrs.permit(*SystemAppDefaults::EDITABLE_FIELDS) if attrs.respond_to?(:permit)
    saved = SystemAppDefaults.set!(attrs)
    effective = SystemAppDefaults.effective_settings
    render json: {
      settings: effective.slice(*SystemAppDefaults::EDITABLE_FIELDS),
      updated_at: saved['updated_at']
    }.to_json
  rescue ArgumentError => e
    api_error 400, {error: e.message}
  end
end

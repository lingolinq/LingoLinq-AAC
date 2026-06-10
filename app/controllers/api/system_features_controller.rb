class Api::SystemFeaturesController < ApplicationController
  include Api::SystemSettingsAccess

  before_action :require_api_token
  before_action :require_system_settings_access

  # GET /api/v1/system_features?org_id=default|group:canary|group:beta|#global_id#
  def index
    scope = SystemFeatureSettings.resolve_scope(params[:org_id])
    return api_error 404, {error: 'Organization not found'} if params[:org_id].present? && params[:org_id] != 'default' && scope.nil?

    scope ||= SystemFeatureSettings.resolve_scope('default')
    enabled = SystemFeatureSettings.effective_enabled_for_scope(scope[:scope_id])
    inherited = SystemFeatureSettings.inherited_from_scope(scope[:scope_id])

    features = SystemFeatureRegistry.all.map do |entry|
      entry.merge(
        enabled: enabled.include?(entry[:key]),
        org_customized: scope[:type] == :org && !SystemFeatureSettings.org_enabled_features(scope[:org]).nil?
      )
    end

    render json: {
      org_id: scope[:scope_id],
      scope_type: scope_type_for(scope[:type]),
      scope_id: scope_response_id(scope),
      inherited_from: inherited,
      enabled_features: enabled,
      features: features,
      categories: SystemFeatureRegistry.categories,
      feature_groups: SystemFeatureGroupRegistry.all
    }.to_json
  end

  # PUT /api/v1/system_features
  # { org_id: "default"|group:canary|group:beta|global_id, enabled_features: ["goals", ...] }
  def update
    org_id = params[:org_id] || params.dig(:system_features, :org_id)
    features = params[:enabled_features] || params.dig(:system_features, :enabled_features)
    return api_error 400, {error: 'enabled_features required'} if features.nil?

    scope = SystemFeatureSettings.resolve_scope(org_id.presence || 'default')
    return api_error 404, {error: 'Organization not found'} unless scope

    list = SystemFeatureSettings.set_enabled_for_scope!(scope[:scope_id], features)
    render json: {
      org_id: scope[:scope_id],
      scope_type: scope_type_for(scope[:type]),
      scope_id: scope_response_id(scope),
      enabled_features: list
    }.to_json
  end

  # DELETE /api/v1/system_features?org_id=...
  def destroy
    scope = SystemFeatureSettings.resolve_scope(params[:org_id])
    return api_error 404, {error: 'Organization not found'} unless scope

    list = SystemFeatureSettings.clear_scope!(scope[:scope_id])
    render json: {
      org_id: scope[:scope_id],
      scope_type: scope_type_for(scope[:type]),
      scope_id: scope_response_id(scope),
      enabled_features: list,
      inherited_from: SystemFeatureSettings.inherited_from_scope(scope[:scope_id])
    }.to_json
  end

  private

  def scope_type_for(type)
    type.to_s
  end

  def scope_response_id(scope)
    case scope[:type]
    when :group
      scope[:group_id]
    when :org
      scope[:org].global_id
    else
      'default'
    end
  end
end

module Api::SystemSettingsAccess
  extend ActiveSupport::Concern

  private

  def system_settings_actor
    @true_user || @api_user
  end

  def site_admin?(actor=system_settings_actor)
    actor&.settings&.[]('admin') == true
  end

  def require_system_settings_access
    actor = system_settings_actor
    return if actor&.admin?
    return if admin_support_actions_allowed?(actor)

    api_error 403, {error: 'Not authorized'}
  end

  def require_site_admin!
    return true if site_admin?

    api_error 403, {error: 'Site admin required'}
    false
  end

  def require_system_settings_read_scope!(org_id_param=nil)
    scope_id = normalize_scope_id(org_id_param || params[:org_id])
    return true if site_wide_scope?(scope_id)

    org = Organization.find_by_global_id(scope_id)
    unless org
      api_error 404, {error: 'Organization not found'}
      return false
    end
    return true if authorized_for_org_scope?(org)

    api_error 403, {error: 'Not authorized for this organization'}
    false
  end

  def require_system_settings_write_scope!(org_id_param=nil)
    scope_id = normalize_scope_id(org_id_param || params[:org_id])

    if site_wide_scope?(scope_id)
      return require_site_admin!
    end

    org = Organization.find_by_global_id(scope_id)
    unless org
      api_error 404, {error: 'Organization not found'}
      return false
    end
    return true if authorized_for_org_scope?(org)

    api_error 403, {error: 'Not authorized for this organization'}
    false
  end

  def site_wide_scope?(scope_id)
    scope_id.blank? || scope_id == 'default' || SystemFeatureGroupRegistry.valid_scope?(scope_id)
  end

  def authorized_for_org_scope?(org)
    actor = system_settings_actor
    return false unless actor && org

    return true if site_admin?(actor)
    return true if admin_support_actions_allowed?(actor)

    org.manager?(actor) || org.upstream_manager?(actor)
  end

  def normalize_scope_id(org_id_param)
    if org_id_param.blank? || org_id_param == 'default'
      'default'
    else
      org_id_param.to_s
    end
  end

  def resolve_org_scope(org_id_param)
    if org_id_param.blank? || org_id_param == 'default'
      return [nil, 'default']
    end
    org = Organization.find_by_global_id(org_id_param)
    return [nil, nil] unless org

    [org, org.global_id]
  end
end

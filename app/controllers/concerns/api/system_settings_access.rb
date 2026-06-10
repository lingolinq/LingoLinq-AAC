module Api::SystemSettingsAccess
  extend ActiveSupport::Concern

  private

  def require_system_settings_access
    actor = @true_user || @api_user
    return if actor&.admin?
    return if admin_support_actions_allowed?(actor)

    api_error 403, {error: 'Not authorized'}
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

module SystemFeatureSettings
  DEFAULT_KEY = 'default_enabled_features'
  CANARY_KEY = 'canary_enabled_features'
  BETA_KEY = 'beta_opt_in_features'

  def self.default_enabled_features
    stored = Setting.get(DEFAULT_KEY)
    if stored.is_a?(Array)
      return stored & FeatureFlags::AVAILABLE_FRONTEND_FEATURES
    end
    FeatureFlags::ENABLED_FRONTEND_FEATURES
  end

  def self.set_default_enabled_features!(features)
    list = Array(features).map(&:to_s) & FeatureFlags::AVAILABLE_FRONTEND_FEATURES
    Setting.set(DEFAULT_KEY, list, true)
    list
  end

  def self.clear_default!
    clear_setting!(DEFAULT_KEY)
  end

  def self.canary_enabled_features
    stored = Setting.get(CANARY_KEY)
    if stored.is_a?(Array)
      return (stored & FeatureFlags::AVAILABLE_FRONTEND_FEATURES) - FeatureFlags::DISABLED_CANARY_FEATURES
    end
    FeatureFlags::AVAILABLE_FRONTEND_FEATURES - FeatureFlags::DISABLED_CANARY_FEATURES
  end

  def self.set_canary_enabled_features!(features)
    list = sanitize_canary_list(features)
    Setting.set(CANARY_KEY, list, true)
    list
  end

  def self.clear_canary!
    clear_setting!(CANARY_KEY)
  end

  def self.beta_opt_in_features
    stored = Setting.get(BETA_KEY)
    if stored.is_a?(Array)
      return stored & FeatureFlags::AVAILABLE_FRONTEND_FEATURES
    end
    FeatureFlags::AVAILABLE_FRONTEND_FEATURES
  end

  def self.set_beta_opt_in_features!(features)
    list = Array(features).map(&:to_s) & FeatureFlags::AVAILABLE_FRONTEND_FEATURES
    Setting.set(BETA_KEY, list, true)
    list
  end

  def self.clear_beta!
    clear_setting!(BETA_KEY)
  end

  def self.org_enabled_features(org)
    return nil unless org

    raw = org.settings && org.settings['enabled_features']
    return nil if raw.nil?

    Array(raw).map(&:to_s) & FeatureFlags::AVAILABLE_FRONTEND_FEATURES
  end

  def self.set_org_enabled_features!(org, features)
    org.settings ||= {}
    list = Array(features).map(&:to_s) & FeatureFlags::AVAILABLE_FRONTEND_FEATURES
    org.settings['enabled_features'] = list
    org.save!
    list
  end

  def self.clear_org!(org)
    return unless org&.settings

    org.settings.delete('enabled_features')
    org.save!
  end

  def self.effective_enabled_for(user)
    org = user && user.respond_to?(:managing_organization) ? user.managing_organization : nil
    org_list = org_enabled_features(org)
    org_list || default_enabled_features
  end

  def self.resolve_scope(org_id)
    if org_id.blank? || org_id == 'default'
      return {type: :default, scope_id: 'default', org: nil, group_id: nil}
    end

    group_id = SystemFeatureGroupRegistry.group_id_from_scope(org_id)
    if group_id
      return {type: :group, scope_id: org_id, org: nil, group_id: group_id}
    end

    org = Organization.find_by_global_id(org_id)
    if org
      return {type: :org, scope_id: org.global_id, org: org, group_id: nil}
    end

    nil
  end

  def self.effective_enabled_for_scope(org_id)
    scope = resolve_scope(org_id)
    return default_enabled_features unless scope

    case scope[:type]
    when :default
      default_enabled_features
    when :group
      enabled_for_group(scope[:group_id])
    when :org
      org_enabled_features(scope[:org]) || default_enabled_features
    end
  end

  def self.enabled_for_group(group_id)
    case group_id.to_s
    when 'canary'
      canary_enabled_features
    when 'beta'
      beta_opt_in_features
    else
      []
    end
  end

  def self.set_enabled_for_scope!(org_id, features)
    scope = resolve_scope(org_id)
    return nil unless scope

    case scope[:type]
    when :default
      set_default_enabled_features!(features)
    when :group
      set_enabled_for_group!(scope[:group_id], features)
    when :org
      set_org_enabled_features!(scope[:org], features)
    end
  end

  def self.set_enabled_for_group!(group_id, features)
    case group_id.to_s
    when 'canary'
      set_canary_enabled_features!(features)
    when 'beta'
      set_beta_opt_in_features!(features)
    end
  end

  def self.clear_scope!(org_id)
    scope = resolve_scope(org_id)
    return nil unless scope

    case scope[:type]
    when :default
      clear_default!
      default_enabled_features
    when :group
      clear_group!(scope[:group_id])
      enabled_for_group(scope[:group_id])
    when :org
      clear_org!(scope[:org])
      default_enabled_features
    end
  end

  def self.clear_group!(group_id)
    case group_id.to_s
    when 'canary'
      clear_canary!
    when 'beta'
      clear_beta!
    end
  end

  def self.inherited_from_scope(org_id)
    scope = resolve_scope(org_id)
    return 'code_default' unless scope

    case scope[:type]
    when :default
      Setting.find_by(key: DEFAULT_KEY) ? 'site_default' : 'code_default'
    when :group
      group_inherited_from(scope[:group_id])
    when :org
      inherited_from(scope[:org])
    end
  end

  def self.inherited_from(org)
    return 'code_default' unless org

    org_list = org_enabled_features(org)
    return 'org_custom' if org_list

    stored = Setting.get(DEFAULT_KEY)
    stored.is_a?(Array) ? 'site_default' : 'code_default'
  end

  def self.group_inherited_from(group_id)
    key = case group_id.to_s
          when 'canary' then CANARY_KEY
          when 'beta' then BETA_KEY
          end
    return 'code_default' unless key

    Setting.find_by(key: key) ? 'site_custom' : 'code_default'
  end

  def self.group_customized?(group_id)
    group_inherited_from(group_id) == 'site_custom'
  end

  def self.sanitize_canary_list(features)
    (Array(features).map(&:to_s) & FeatureFlags::AVAILABLE_FRONTEND_FEATURES) - FeatureFlags::DISABLED_CANARY_FEATURES
  end

  def self.clear_setting!(key)
    setting = Setting.find_by(key: key)
    setting&.destroy
    RedisInit.default.del("setting/#{key}")
    nil
  end
  private_class_method :clear_setting!
end

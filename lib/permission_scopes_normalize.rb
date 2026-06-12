# frozen_string_literal: true

# Permissable permission rules intersect API token scopes with fixed lists such as
# ['full', 'basic_supervision']. A literal '*' never intersects 'full', and empty lists
# from integrations become ['*'] inside Permissable — both block legitimate API calls.
module PermissionScopesNormalize
  module_function

  def for_api(raw)
    list = Array(raw).flatten.map { |s| s.to_s.strip }.reject(&:blank?)
    return ['none'] if list.include?('none')
    return ['full'] if list.blank?
    return ['full'] if list == ['*'] || (list.length == 1 && list[0] == '*')

    list
  end
end

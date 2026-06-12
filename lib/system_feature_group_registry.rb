module SystemFeatureGroupRegistry
  GROUPS = {
    'canary' => {
      name: 'Canary',
      description: 'Features granted to users with the canary flag'
    },
    'beta' => {
      name: 'Beta opt-in',
      description: 'Features users can enable via per-user beta opt-in'
    }
  }.freeze

  def self.all
    GROUPS.map do |id, meta|
      {
        id: id,
        scope_id: scope_id_for(id),
        name: meta[:name],
        description: meta[:description]
      }
    end
  end

  def self.find(id)
    meta = GROUPS[id.to_s]
    return nil unless meta

    {
      id: id.to_s,
      scope_id: scope_id_for(id),
      name: meta[:name],
      description: meta[:description]
    }
  end

  def self.scope_id_for(id)
    "group:#{id}"
  end

  def self.group_id_from_scope(scope_id)
    return nil unless scope_id.to_s.start_with?('group:')

    id = scope_id.to_s.sub(/\Agroup:/, '')
    GROUPS.key?(id) ? id : nil
  end

  def self.valid_scope?(scope_id)
    !!group_id_from_scope(scope_id)
  end
end

module SystemEmailI18n
  def self.resolve(template_key, i18n_key, interpolations = {})
    text = lookup_override(template_key, i18n_key)
    text = I18n.t(i18n_key, default: i18n_key) if text.blank?

    return text if interpolations.blank?

    I18n.interpolate(text, interpolations.symbolize_keys)
  end

  def self.lookup_override(template_key, i18n_key)
    return nil if template_key.blank?

    override = SystemEmailTemplates.lookup(template_key)
    return nil unless override.is_a?(Hash) && override['i18n_overrides'].is_a?(Hash)

    override['i18n_overrides'][i18n_key].presence
  end

  def self.effective_i18n_overrides(template_key, org)
    store = if org
              SystemEmailTemplates.templates_for_org(org)&.dig(template_key)
            else
              Setting.get(SystemEmailTemplates::DEFAULT_KEY)&.dig(template_key)
            end
    return {} unless store.is_a?(Hash) && store['i18n_overrides'].is_a?(Hash)

    store['i18n_overrides']
  end

  def self.blocks_for(template_key, org, entry)
    blocks = entry[:i18n_blocks] || []
    overrides = effective_i18n_overrides(template_key, org)
    blocks.map do |block|
      key = block[:key] || block['key']
      label = block[:label] || block['label'] || key.to_s.split('.').last.tr('_', ' ').capitalize
      default = I18n.t(key, default: '')
      {
        key: key,
        label: label,
        default: default,
        value: overrides[key].presence || default,
        placeholders: block[:placeholders] || block['placeholders'] || [],
        is_customized: overrides[key].present?
      }
    end
  end

  def self.subject_key_for(entry)
    blocks = entry[:i18n_blocks] || []
    subject_block = blocks.find { |b| (b[:key] || b['key']).to_s.end_with?('.subject') }
    subject_block && (subject_block[:key] || subject_block['key'])
  end

  def self.resolved_subject(template_key, org, entry, interpolations = {})
    key = subject_key_for(entry)
    return nil unless key

    overrides = effective_i18n_overrides(template_key, org)
    text = overrides[key].presence || I18n.t(key, default: entry[:default_subject])
    return text if interpolations.blank?

    I18n.interpolate(text, interpolations.symbolize_keys)
  end
end

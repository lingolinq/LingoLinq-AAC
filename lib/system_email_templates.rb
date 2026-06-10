module SystemEmailTemplates
  DEFAULT_KEY = 'default_email_templates'

  def self.lookup(key)
    settings = JsonApi::Json.current_domain['settings'] || {}
    if settings['email_templates'].is_a?(Hash) && settings['email_templates'][key]
      return settings['email_templates'][key]
    end
    default_store = Setting.get(DEFAULT_KEY)
    default_store.is_a?(Hash) ? default_store[key] : nil
  end

  def self.templates_for_org(org)
    return Setting.get(DEFAULT_KEY) || {} if org.nil?

    org.settings && org.settings['email_templates']
  end

  def self.set_template!(org, key, attrs)
    entry = SystemEmailRegistry.find(key)
    raise ArgumentError, 'Unknown template' unless entry

    attrs = attrs.with_indifferent_access
    data = (lookup_stored_entry(org, key) || {}).dup
    data['updated_at'] = Time.now.iso8601

    %w[subject html_body text_body].each do |field|
      next unless attrs.key?(field)

      val = attrs[field].to_s.strip.presence
      if val && !default_field_value?(key, entry, field, val, org)
        data[field] = val
      else
        data.delete(field)
      end
    end

    if attrs.key?(:i18n_overrides)
      i18n = normalize_i18n_overrides(attrs[:i18n_overrides], entry)
      if i18n.present?
        data['i18n_overrides'] = i18n
      else
        data.delete('i18n_overrides')
      end
    end

    data = data.compact
    meaningful = data.except('updated_at')
    if meaningful.empty?
      clear_template!(org, key)
      return {}
    end

    if org.nil?
      store = Setting.get(DEFAULT_KEY) || {}
      store = store.dup
      store[key] = data
      Setting.set(DEFAULT_KEY, store, true)
      return data
    end

    org.settings ||= {}
    org.settings['email_templates'] ||= {}
    org.settings['email_templates'][key] = data
    org.save!
    Organization.load_domains(true)
    data
  end

  def self.clear_template!(org, key)
    if org.nil?
      store = Setting.get(DEFAULT_KEY)
      return unless store.is_a?(Hash) && store[key]

      store = store.dup
      store.delete(key)
      if store.empty?
        Setting.find_by(key: DEFAULT_KEY)&.destroy
        RedisInit.default.del("setting/#{DEFAULT_KEY}")
      else
        Setting.set(DEFAULT_KEY, store, true)
      end
      return
    end

    return unless org.settings && org.settings['email_templates']

    org.settings['email_templates'].delete(key)
    org.save!
    Organization.load_domains(true)
  end

  def self.default_body(key, format)
    entry = SystemEmailRegistry.find(key)
    return nil unless entry

    path = Rails.root.join('app', 'views', entry[:mailer], "#{entry[:action]}.#{format}.erb")
    return nil unless path.exist?

    File.read(path)
  end

  def self.effective_content(key, org)
    entry = SystemEmailRegistry.find(key)
    override = lookup_stored_entry(org, key)
    subject = override&.dig('subject')
    if subject.blank? && entry && entry[:uses_i18n_subject]
      subject = SystemEmailI18n.resolved_subject(key, org, entry, 'app_name' => branding_value('app_name', org))
    end
    subject ||= entry&.dig(:default_subject)
    i18n_customized = override.is_a?(Hash) && override['i18n_overrides'].is_a?(Hash) && override['i18n_overrides'].any?
    {
      key: key,
      subject: subject,
      html_body: override&.dig('html_body') || default_body(key, 'html'),
      text_body: override&.dig('text_body') || default_body(key, 'text'),
      i18n_overrides: override&.dig('i18n_overrides') || {},
      is_customized: !!override,
      i18n_is_customized: i18n_customized,
      html_is_default: override&.dig('html_body').blank?,
      text_is_default: override&.dig('text_body').blank?,
      subject_is_default: override&.dig('subject').blank? && !i18n_customized
    }
  end

  def self.lookup_stored_entry(org, key)
    org ? templates_for_org(org)&.dig(key) : Setting.get(DEFAULT_KEY)&.dig(key)
  end

  def self.branding_value(name, org)
    if org && org.settings && org.settings['host_settings']
      val = org.settings['host_settings'][name]
      return val if val.present?
    end
    defaults = SystemAppDefaults.effective_settings
    defaults[name] || JsonApi::Json.default_domain.dig('settings', name)
  end

  def self.default_field_value?(key, entry, field, val, org)
    case field
    when 'html_body'
      val.to_s.strip == default_body(key, 'html').to_s.strip
    when 'text_body'
      val.to_s.strip == default_body(key, 'text').to_s.strip
    when 'subject'
      if entry && entry[:uses_i18n_subject]
        val == SystemEmailI18n.resolved_subject(key, org, entry, 'app_name' => branding_value('app_name', org))
      else
        val == entry&.dig(:default_subject)
      end
    else
      false
    end
  end

  def self.normalize_i18n_overrides(raw, entry = nil)
    return {} unless raw.is_a?(Hash)

    raw.each_with_object({}) do |(key, value), memo|
      stripped = value.to_s.strip
      next if stripped.blank?

      default = I18n.t(key, default: '')
      next if stripped == default

      memo[key.to_s] = stripped
    end
  end

  def self.render_string(template_string, mailer_binding)
    return '' if template_string.blank?

    ERB.new(template_string).result(mailer_binding)
  end
end

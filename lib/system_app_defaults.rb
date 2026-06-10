module SystemAppDefaults
  DEFAULT_KEY = 'default_app_settings'

  EDITABLE_FIELDS = %w[
    app_name
    company_name
    support_url
    admin_email
    email_signature
  ].freeze

  def self.get
    stored = Setting.get(DEFAULT_KEY)
    stored.is_a?(Hash) ? stored.dup : {}
  end

  def self.set!(attrs)
    attrs = attrs.with_indifferent_access
    data = {}
    EDITABLE_FIELDS.each do |field|
      next unless attrs.key?(field)

      val = attrs[field].to_s.strip
      data[field] = val if val.present?
    end
    data['updated_at'] = Time.now.iso8601
    Setting.set(DEFAULT_KEY, data, true)
    data
  end

  def self.effective_settings
    base = JsonApi::Json.base_default_domain_settings
    stored = get
    merged = base.merge(stored.slice(*EDITABLE_FIELDS))
    merged['email_signature'] = stored['email_signature'] if stored['email_signature'].present?
    merged
  end

  def self.branding_for_org(org)
    settings = effective_settings.dup
    if org && org.settings && org.settings['host_settings'].is_a?(Hash)
      org.settings['host_settings'].each do |key, value|
        settings[key] = value if value.present? && EDITABLE_FIELDS.include?(key.to_s)
      end
      if org.settings['host_settings']['email_signature'].present?
        settings['email_signature'] = org.settings['host_settings']['email_signature']
      end
    end
    settings['email_signature'] ||= "The #{settings['company_name'] || 'LingoLinq'} Team"
    settings
  end
end

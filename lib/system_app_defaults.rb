module SystemAppDefaults
  DEFAULT_KEY = 'default_app_settings'

  EDITABLE_FIELDS = %w[
    app_name
    company_name
    support_url
    admin_email
    email_signature
  ].freeze

  FIELD_RULES = {
    'app_name' => {max_length: 100},
    'company_name' => {max_length: 100},
    'support_url' => {url: true, max_length: 500},
    'admin_email' => {email: true, max_length: 254},
    'email_signature' => {max_length: 500}
  }.freeze

  def self.get
    stored = Setting.get(DEFAULT_KEY)
    stored.is_a?(Hash) ? stored.dup : {}
  end

  def self.set!(attrs)
    attrs = normalize_attrs(attrs)
    data = {}
    EDITABLE_FIELDS.each do |field|
      next unless attrs.key?(field)

      val = attrs[field].to_s.strip
      next if val.blank?

      validate_field!(field, val)
      data[field] = val
    end
    data['updated_at'] = Time.now.iso8601
    Setting.set(DEFAULT_KEY, data, true)
    data
  end

  def self.validate_field!(field, val)
    rules = FIELD_RULES[field.to_s]
    return val unless rules

    if rules[:max_length] && val.length > rules[:max_length]
      raise ArgumentError, "#{field} is too long (max #{rules[:max_length]} characters)"
    end
    if rules[:url]
      uri = URI.parse(val)
      unless uri.is_a?(URI::HTTP) && uri.host.present?
        raise ArgumentError, "#{field} must be a valid http or https URL"
      end
    end
    if rules[:email] && val !~ URI::MailTo::EMAIL_REGEXP
      raise ArgumentError, "#{field} must be a valid email address"
    end
    val
  rescue URI::InvalidURIError
    raise ArgumentError, "#{field} must be a valid http or https URL"
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

  def self.normalize_attrs(attrs)
    hash = attrs.respond_to?(:to_unsafe_h) ? attrs.to_unsafe_h : attrs.to_h
    hash.with_indifferent_access
  end
  private_class_method :normalize_attrs
end

module MailerHelper
  def long_ordinal_date(date)
    return '' unless date
    "#{date.strftime('%B')} #{date.day.ordinalize}, #{date.strftime('%Y')}"
  end

  def email_signature
    settings = domain_settings
    return settings['email_signature'] if settings['email_signature'].present?

    "The #{company_name} Team"
  end

  def app_name
    domain_settings['app_name'] || 'LingoLinq'
  end

  def company_name
    domain_settings['company_name'] || 'LingoLinq'
  end

  def support_url
    domain_settings['support_url'] || ""
  end

  def mailer_t(key, interpolations = {})
    template_key = if respond_to?(:mailer) && mailer
                     "#{mailer.mailer_name}/#{mailer.action_name}"
                   end
    SystemEmailI18n.resolve(template_key, key, interpolations)
  end

  def domain_settings
    JsonApi::Json.current_domain['settings'] || {}
  end
end
module MailerHelper
  def long_ordinal_date(date)
    return '' unless date
    "#{date.strftime('%B')} #{date.day.ordinalize}, #{date.strftime('%Y')}"
  end

  def email_signature
    "-The #{JsonApi::Json.current_domain['settings']['company_name']} Team"
  end

  def app_name
    JsonApi::Json.current_domain['settings']['app_name'] || 'LingoLinq'
  end

  def company_name
    JsonApi::Json.current_domain['settings']['company_name'] || 'LingoLinq'
  end

  def support_url
    JsonApi::Json.current_domain['settings']['support_url'] || ""
  end

  def domain_settings
    JsonApi::Json.current_domain['settings'] || {}
  end
end
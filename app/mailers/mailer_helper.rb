module MailerHelper
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
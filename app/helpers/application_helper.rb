module ApplicationHelper
  def pretty_loader
    request.path == '/' && ((@domain_overrides || {})['settings'] || {})['full_domain']
  end

  def app_name
    ((@domain_overrides || {})['settings'] || {})['app_name'] || ENV['APP_NAME'] || 'LingoLinq'
  end
  
  def crawler?
    pattern = /(googlebot|bingbot|baidu|msnbot)/
    !!(request.user_agent && request.user_agent.match(pattern))
  end
end

class DeveloperKey < ApplicationRecord
  before_save :generate_defaults
  include Replicate
  
  def generate_defaults
    self.key ||= GoSecure.nonce('developer_client_id')[0, 10]
    self.secret ||= GoSecure.sha512(Time.now.to_i.to_s, 'developer_client_secret') 
    true
  end

  def user_integration
    devices = Device.where(developer_key_id: self.id).order('id ASC')
    ui_id = devices.map{|d| d.user_integration_id }.compact.first
    ui_id && UserIntegration.find_by(id: ui_id)
  end
  
  def valid_uri?(url)
    if !self.redirect_uri || !url
      false
    elsif self.redirect_uri == DeveloperKey.oob_uri
      url == DeveloperKey.oob_uri
    else
      ref = URI.parse(self.redirect_uri)
      uri = URI.parse(url)
      re = Regexp.new("#{ref.host}$")
      !!(uri.host && uri.host.match(re))
    end
  end
  
  def self.oob_uri
    'urn:ietf:wg:oauth:2.0:oob'
  end
end

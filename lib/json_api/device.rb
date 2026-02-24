module JsonApi::Device
  extend JsonApi::Json
  
  TYPE_KEY = 'device'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50
  
  def self.readable_timeout(num)
    if num < 1.day.to_i
      "#{(num / 60.0 / 60.0).round(1)} hours"
    elsif num < 1.week.to_i
      "#{(num / 1.day.to_i.to_f).round(1)} days"
    elsif num < 2.months.to_i
      "#{(num / 1.week.to_i.to_f).round(1)} weeks"
    elsif num < 1.year.to_i
      "#{(num / 1.month.to_i.to_f).round(1)} months"
    else
      "#{(num / 1.year.to_i.to_f).round(1)} years"
    end
  end

  def self.build_json(device, args={})
    json = {}
    json['id'] = device.global_id
    json['name'] = device.settings['name']
    json['ref_id'] = (device.device_key || '').split(/\s/)[0]
    json.delete('ref_id') unless json['ref_id']
    json['ip_address'] = device.settings['ip_address']
    json['app_version'] = device.settings['app_version']
    json['user_agent'] = device.settings['user_agent']
    json['mobile'] = true if device.settings['mobile']
    json['token_type'] = device.token_type
    json['token_timeout'] = readable_timeout(device.token_timeout)
    json['inactivity_timeout'] = readable_timeout(device.inactivity_timeout)
    json['last_used'] = (device.last_used_at || device.created_at)&.iso8601
    json['hidden'] = true if device.hidden?
    if args[:current_device] && args[:current_device] == device
      json['current_device'] = true
    end
    json
  end
end
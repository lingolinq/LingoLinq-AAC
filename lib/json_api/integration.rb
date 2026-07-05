module JsonApi::Integration
  extend JsonApi::Json
  
  TYPE_KEY = 'integration'
  DEFAULT_PAGE = 10
  MAX_PAGE = 25
    
  def self.build_json(obj, args={})
    json = {}
    # TODO: include devices
    
    json['id'] = obj.global_id
    json['name'] = obj.settings['name']
    json['custom_integration'] = !!obj.settings['custom_integration']
    json['webhook'] = !!obj.settings['button_webhook_url']
    if json['webhook']
      json['button_webhook_url'] = obj.settings['button_webhook_url']
      json['button_webhook_local'] = true if obj.settings['button_webhook_local']
    end
    json['render'] = !!obj.settings['board_render_url']
    json['board_render_url'] = obj.settings['board_render_url'] if json['render']
    

    if args[:permissions]
      json['permissions'] = obj.permissions_for(args[:permissions])
    end

    if obj.integration_key
      json['integration_key'] = obj.integration_key
      json['template'] = true if obj.template
    elsif obj.template
      json['integration_key'] = obj.integration_key
      json['template'] = true
    elsif obj.settings['template_key']
      json['added'] = obj.created_at.iso8601
      json['template_key'] = obj.settings['template_key']
    end

    if json['permissions'] && json['permissions']['view']
      if obj.template
        # TODO: sharding
        json['uses'] = UserIntegration.where(:template_integration_id => obj.id).count
        if obj.settings['user_parameters']
          params = []
          obj.settings['user_parameters'].each do |param|
            param['type'] ||= 'text'
            params << param.slice('name', 'label', 'default_value', 'type', 'hint')
          end
          json['user_parameters'] = params
        end
      elsif json['permissions'] && json['permissions']['edit'] 
        if obj.settings['user_settings']
          settings = []
          obj.settings['user_settings'].each do |key, data|
            setting = nil
            if data['type'] == 'password'
              setting = {'name' => key, 'label' => data['label'], 'protected' => true}
            else
              setting = {'name' => key, 'label' => data['label'], 'value' => data['value']}
            end
            settings << setting if setting
          end
          json['user_settings'] = settings
        end
      end
    end
    if obj.settings['custom_integration']
      device_token, refresh_token = obj.device.tokens
      if obj.device && json['permissions'] && json['permissions']['edit']
        if obj.created_at > 24.hours.ago 
          json['access_token'] = device_token
          json['refresh_token'] = refresh_token
          json['token'] = obj.settings['token']
        end
        json['truncated_access_token'] = "...#{device_token[-5, 5]}"
        json['truncated_token'] = "...#{obj.settings['token'][-5, 5]}"
      end
    end
    
    ['icon_url', 'description'].each do |key|
      json[key] = obj.settings[key] if obj.settings[key]
    end

    json
  end
  
  def self.extra_includes(obj, json, args={})
    json['integration']['render_url'] = obj.settings['board_render_url']
    if args[:permissions]
      json['integration']['user_token'] = obj.user_token(args[:permissions])
    end
    json
  end
end

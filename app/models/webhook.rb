require 'timeout'

class Webhook < ActiveRecord::Base
  include Async
  include SecureSerialize
  include Processable
  include Permissions
  include GlobalId

  secure_serialize :settings
  include Replicate
  belongs_to :user
  belongs_to :user_integration, optional: true  # webhooks can exist without integration (e.g. register)
  before_save :generate_defaults
  after_destroy :delete_user_integration
  
  USER_WEBHOOKS = [
    'new_session', 'new_utterance'
  ]

  add_permissions('view', ['read_profile']) {|user| self.user_id == user.id }
  add_permissions('view', 'edit', 'delete') {|user| self.user_id == user.id }
  add_permissions('view', ['read_profile']) {|user| self.user && self.user.allows?(user, 'edit') }
  add_permissions('view', 'edit', 'delete') {|user| self.user && self.user.allows?(user, 'edit') }
  cache_permissions

  def generate_defaults
    self.settings ||= {}
    self.settings['notifications'] ||= {}
    self.settings['callback_token'] ||= UserIntegration.security_token
    true
  end
    
  def self.get_record_code(record)
    raise "record must be saved" unless record.id
    record_code = record.class.to_s + ":" + (record.respond_to?(:global_id) ? record.global_id : record.id)
  end
  
  def self.register(user, record, options)
    if !options[:callback] ||!options[:callback].match(/^http/)
      # callback provided by user must be a valid url
      return nil
    end
    register_internal(user, record, options)
  end
  
  def self.register_internal(user, record, options)
    record_code = get_record_code(record)
    webhook = Webhook.find_or_initialize_by(:user_id => user.id, :record_code => record_code)
    webhook.generate_defaults
    notifications = webhook.settings['notifications'][options[:notification_type]] || []
    callback = notifications.detect{|n| n['callback'] == options[:callback] }
    if !callback
      callback = {
        'callback' => options[:callback]
      }
      notifications << callback
    end
    webhook.settings['notifications'][options[:notification_type]] = notifications
    webhook.save
    webhook.settings['callback_token']
  end
  
  def self.notify_all(record, notification_type, additional_args=nil)
    record_code = get_record_code(record)
    self.schedule(:notify_all_with_code, record_code, notification_type, additional_args)
  end
  
  def self.notify_all_with_code(record_code, notification_type, additional_args)
    # TODO: this can run really long (like 20 minutes) if there are a lot of recipients
    record = find_record(record_code)
    res = []
    if record
      record.default_listeners(notification_type).each do |notifiable_code|
        notifiable = find_record(notifiable_code)
        if notifiable && notifiable.respond_to?(:handle_notification)
          notifiable.handle_notification(notification_type, record, additional_args) 
          res << {'default' => true, 'code' => notifiable_code}
        end
      end
      if record.respond_to?(:additional_listeners)
        record.additional_listeners(notification_type, additional_args).each do |notifiable_code|
          notifiable = find_record(notifiable_code)
          if notifiable && notifiable.respond_to?(:handle_notification)
            notifiable.handle_notification(notification_type, record, additional_args) 
            res << {'additional' => true, 'code' => notifiable_code}
          end
        end
      end
    end
    Webhook.for_record(notification_type, record_code, record, additional_args).each do |h|
      res += h.notify(notification_type, record, additional_args)
    end
    res
  end
  
  def self.for_record(notification_type, record_code, record, additional_args)
    res = Webhook.where(:record_code => record_code)
    if record && record.respond_to?(:additional_webhook_record_codes)
      res = res.to_a
      record.additional_webhook_record_codes(notification_type, additional_args).each do |code|
        res += Webhook.where(:record_code => code).to_a
      end
      res = res.uniq
    end
    res
  end
  
  def test_notification
    notify('test', self)
  end
  
  def webhook_content(notification_type, content_type, args)
    {
      id: self.global_id
    }.to_json
  end
  
  def notify(notification_type, record, additional_args)
    results = []
    callbacks = self.settings['notifications'][notification_type] || []
    callbacks += self.settings['notifications']['*'] || []
    if notification_type == 'test'
      callbacks = []
      self.settings['notifications'].each do |key, list|
        callbacks += list
      end
    end
    callbacks.each do |callback|
      if (callback['callback'] || "").match(/^http/)
        url = callback['callback'].split(/#/)[0]
        body = {
          token: self.settings['callback_token'],
          notification: notification_type,
          record: record.record_code
        }
        if record.respond_to?(:api_url)
          body[:url] = record.api_url
        end
        if self.user_integration
          body[:token] = self.user_integration.settings['token']
          additional_args ||= {}
          additional_args[:user_integration] = self.user_integration
        end
        if callback['include_content'] && record && record.respond_to?(:webhook_content)
          body[:content] = record.webhook_content(notification_type, callback['content_type'], additional_args)
        end
        if body[:content] && url.match(/\{code\}/)
          json = JSON.parse(body[:content]) rescue nil
          if json && json['action']
            url = url.gsub(/\{code\}/, URI.encode_www_form_component(json['action']))
          end
        end
        res = nil
        s = 10
        begin
          Timeout::timeout(s + 1) do
            url = Uploader.sanitize_url(url)
            res = Typhoeus.post(url, body: body, timeout: s)
          end
        rescue Timeout::Error => e
          res = OpenStruct.new(:code => 0, :body => "Timeout, request took more than #{s} seconds")
        end
        results << {
          url: url,
          response_code: res.code,
          response_body: res.body
        }
        self.settings['callback_attempts'] ||= []
        self.settings['callback_attempts'] << {
          'timestamp' => Time.now.to_i,
          'code' => res.code,
          'url' => url
        }
        self.settings['callback_attempts'] = self.settings['callback_attempts'].last(20)
        self.save
      elsif callback['callback']
        results << {
          internal: true
        }
        self.internal_notify(callback['callback'], notification_type)
      end
    end
    results
    # if matching notification_type, then notify
    # if callback_url, post to it
    # if internal callback, send method
    #    for example, when board's downstream changes, it should be
    #    updating all the users who have that board as their home board,
    #    this mechanism seems like a clean place to do that.
    # if user has push notification, use whatever service we pick
  end
  
  def self.find_record(record_code)
    return nil unless record_code
    return nil if record_code.match(/^ext:/)
    klass, global_id = record_code.split(/:/)
    klass = klass.constantize
    klass.respond_to?(:find_by_global_id) ? klass.find_by_global_id(global_id) : klass.find_by(:id => global_id)
  end

  def generate_message(notification_type)
    "alert"
  end
  
  def internal_notify(callback, notification_type)
    if callback == 'push_notification'
      # self.user.increment_counter(self.notification_type)
      # push to whatever service we use (include Google Cloud Notify for Chrome extension)
      self.user.devices.each do |device|
        message = generate_message(notification_type)
        #if device.mobile?
          # push to notification service
        #elsif device.chrome?
          # http://developer.chrome.com/apps/pushMessaging
          # http://developer.chrome.com/apps/gcm_server
          # limited to 256 bytes (yeesh)
          
          # http://developer.android.com/google/gcm/gs.html
          # http://developer.chrome.com/apps/cloudMessagingV2
        #end
      end
    end
  end

  def self.update_external_prefs(stash_id)
    stash = JobStash.find_by_global_id(stash_id)
    if stash
      notify_all_with_code(Webhook.get_record_code(stash), 'anonymized_user_details', {})
      stash.destroy
    end
  end
  
  def process_params(params, non_user_params)
    user_param = non_user_params[:user] || non_user_params['user']
    raise "user required" unless self.user || user_param
    self.user = user_param
    self.settings ||= {}
    self.settings['notifications'] ||= {}
    if params['user_integration_id']
      ui = UserIntegration.where(:user_id => self.user_id).find_by_global_id(params['user_integration_id'])
    end
    self.settings['name'] = process_string(params['name']) if params['name']
    self.settings['include_content'] = params['include_content'] if params['include_content'] != nil
    self.settings['content_types'] = params['content_types'] if params['content_types']
    self.settings['url'] = params['url'] if params['url'] && params['url'].match(/^http/)
    self.settings['webhook_type'] = params['webhook_type'] if params['webhook_type']

    if params['webhook_type'] == 'user'
      notifications_param = non_user_params[:notifications] || non_user_params['notifications']
      if notifications_param
        self.settings['advanced_configuration'] = true
        notifications_param.each do |key, opts|
          if key == '*' || USER_WEBHOOKS.include?(key)
            self.settings['notifications'][key] ||= []
            if opts['callback'] && opts['callback'].match(/^http/)
              self.settings['notifications'][key] = self.settings['notifications'][key].select{|n| n['callback'] != opts['callback'] }
              self.settings['notifications'][key] << {
                'callback' => opts['callback'],
                'include_content' => opts['include_content'],
                'content_type' => opts['content_type']
              }
            end
          end
        end
      elsif params['webhooks']
        self.settings['advanced_configuration'] = false
        params['webhooks'].each do |webhook|
          if webhook == '*' || USER_WEBHOOKS.include?(webhook)
            self.settings['notifications'][webhook] = [{
              'callback' => self.settings['url'],
              'include_content' => self.settings['include_content'],
              'content_type' => (self.settings['content_types'] || {})[webhook]
            }]
          end
        end
      end
      self.record_code = "User:#{self.user.global_id}::*"
    end
    true
  end
  
  def delete_user_integration
    if self.user_integration
      self.user_integration.destroy
    end
    true
  end

  # EXTERNAL RESEARCH SETUP
  # ui = UserIntegration.create
  # ui.settings['allow_trends'] = true
  # ui.save
  # h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
  # h.settings['notifications'] ||= {}
  # h.settings['include_content'] = true
  # h.settings['url'] = 'http://www.example.com/callback2'
  # h.settings['webhook_type'] = 'research'
  # h.settings['content_types'] = ['anonymized_summary']
  # h.settings['notifications']['anonymized_user_details'] = [{
  #   'callback' => 'http://www.example.com/callback',
  #   'include_content' => true,
  #   'content_type' => 'anonymized_summary'
  # }]
  # h.settings['notifications']['new_session'] = [{
  #   'callback' => 'http://www.example.com/callback',
  #   'include_content' => true,
  #   'content_type' => 'anonymized_summary'
  # }]
  # h.save
  # dk = DeveloperKey.create
  # d = Device.create(user_integration_id: ui.id, developer_key_id: dk.id)
  # api_get '/api/v1/logs/trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: 'a,b,c'}
  # api_receive_post '/callback', params[:token] == ui.settings['token'] params[:notification] == 'new_session', JSON.parse(params[:data])['user_id']
  # api_receive_post '/callback', params[:notification] == 'anonymized_user_details', JSON.parse(params[:data])['user_id'], , JSON.parse(params[:data])['details']

end

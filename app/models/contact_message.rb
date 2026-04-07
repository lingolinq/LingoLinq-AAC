class ContactMessage < ActiveRecord::Base
  include GlobalId
  include Processable
  include SecureSerialize
  include Async
  secure_serialize :settings
  include Replicate
  
  after_create :deliver_message
  
  def deliver_message
    if @deliver_remotely
      @deliver_remotely = false
      self.schedule(:deliver_remotely)
    else
      AdminMailer.schedule_delivery(:message_sent, self.global_id)
    end
    true
  end
  
  def process_params(params, non_user_params)
    self.settings ||= {}
    ['name', 'email', 'subject', 'message', 'recipient', 'locale'].each do |key|
      self.settings[key] = process_string(params[key]) if params[key]
    end
    ['ip_address', 'user_agent', 'version'].each do |key|
      self.settings[key] = non_user_params[key] if non_user_params[key]
    end
    if non_user_params['api_user']
      if params['author_id'] == 'custom'
        self.settings['name'] ||= non_user_params['api_user'].settings['name']
        self.settings['email'] ||= non_user_params['api_user'].settings['email']
      else
        self.settings['name'] = non_user_params['api_user'].settings['name']
        self.settings['email'] = non_user_params['api_user'].settings['email']
      end
      self.settings['user_id'] = non_user_params['api_user'].global_id
      if params['author_id']
        sup = non_user_params['api_user'].supervisors.detect{|s| s.global_id == params['author_id'] }
        if sup
          self.settings['supervisor_id'] = sup.global_id
          self.settings['name'] = sup.settings['name']
          self.settings['email'] = sup.settings['email']
        end
      end
    end
    if params['recipient'] && params['recipient'].match(/support/) && ENV['ZENDESK_DOMAIN']
      if !self.settings['email']
        add_processing_error("Email required for support tickets")
        return false
      end
      @deliver_remotely = true
    end
    true
  end
  
  def deliver_remotely
    body = "<i>Source App: #{(JsonApi::Json.current_domain['settings'] || {})['app_name'] || "CoughDroop"}</i><br/>"
    body += "Name: #{self.settings['name']}<br/><br/>" if self.settings['name']
    body += (self.settings['message'] || 'no message') + "<br/><br/><span style='font-style: italic;'>"
    user = User.find_by_path(self.settings['user_id']) if self.settings['user_id']
    if user
      body += (user.user_name) + '<br/>'
      if self.settings['supervisor_id']
        body += "* REPLY WILL GO TO SUPERVISOR, NOT USER"
      end
    end
    body += "locale: #{self.settings['locale']}" + '<br/>' if self.settings['locale']
    body += (self.settings['ip_address'] ? "ip address: #{self.settings['ip_address']}" : 'no IP address found') + '<br/>'
    body += (self.settings['version'] ? "app version: #{self.settings['version']}" : 'no app version found') + '<br/>'
    body += (self.settings['user_agent'] ? "browser: #{self.settings['user_agent']}" : 'no user agent found') + "</span>"
    basic_auth = "#{ENV['ZENDESK_USER']}/token:#{ENV['ZENDESK_TOKEN']}"
    endpoint = "https://#{ENV['ZENDESK_DOMAIN']}/api/v2/tickets.json"

    # Check for org-level setting to add user account 
    # to all tickets for that org (and parent orgs)
    users = []
    users = [User.find_by_global_id(self.settings['user_id']), User.find_by_global_id(self.settings['supervisor_id'])].compact if self.settings['user_id']
    users = User.find_by_email(self.settings['email']) if users.empty?
    org_targets = {}
    org_list = []
    users.each do |user|
      Organization.attached_orgs(user, true).each do |org|
        if org['org'] && !org['pending']
          str = org['org'].settings['name']
          str += " (premium)" if org['premium']
          org_list << str
        end
        if !org['pending'] && org['org'] && org['premium']
          if org['org'].settings['support_target']
            org_targets[org['org'].settings['support_target']['email']] ||= org['org'].settings['support_target']['name']
          end
          org['org'].upstream_orgs.each do |o|
            if o.settings['premium'] && o.settings['support_target']
              org_targets[o.settings['support_target']['email']] ||= o.settings['support_target']['name']
            end
          end
        end
      end
    end
    if org_list.length > 0
      body += "<br/>" + org_list.join(', ')
    end

    json = {
      'ticket' => {
        'requester' => {
          'name' => self.settings['name'] || self.settings['email'],
          'email' => self.settings['email']
        },
        'subject' => (self.settings['subject'].blank? ? "Ticket #{Date.today.iso8601}" : self.settings['subject']),
        'comment' => {
          'html_body' => body
        }
      }
    }

    org_targets.each do |email, name|
      json['ticket']['email_ccs'] ||= []
      json['ticket']['email_ccs'] << {'user_email' => email, 'user_name' => name, 'action' => 'put'}
    end
    res = Typhoeus.post(endpoint, {body: json.to_json, userpwd: basic_auth, headers: {'Content-Type' => 'application/json'}})
    if res.code == 201
      true
    else
      self.settings['error'] = res.body
      self.save
      AdminMailer.schedule_delivery(:message_sent, self.global_id)
      false
    end
  end
end

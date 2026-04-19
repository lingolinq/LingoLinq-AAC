class ContactMessage < ActiveRecord::Base
  include GlobalId
  include Processable
  include SecureSerialize
  include Async
  secure_serialize :settings
  include Replicate

  BETA_FEEDBACK_ALLOWED_TYPES = %w[crash speak_mode boards sync account performance accessibility feature other].freeze
  BETA_FEEDBACK_ALLOWED_SEVERITIES = %w[blocker major minor suggestion].freeze
  BETA_FIELD_MAX_LENGTHS = {
    'subject' => 500,
    'name' => 255,
    'steps_to_reproduce' => 10_000,
    'expected_result' => 10_000,
    'actual_result' => 10_000,
    'general_feedback' => 20_000,
    'device_context' => 2_000
  }.freeze
  
  after_create :deliver_message
  
  def deliver_message
    if @deliver_remotely
      @deliver_remotely = false
      self.schedule(:deliver_remotely)
    elsif self.settings['recipient'].to_s == 'beta_feedback'
      # Beta feedback is stored for review via GET /api/v1/beta_feedback; do not email.
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
    if params['recipient'].to_s == 'beta_feedback'
      ['feedback_type', 'severity', 'steps_to_reproduce', 'expected_result', 'actual_result', 'general_feedback', 'device_context'].each do |key|
        self.settings[key] = process_string(params[key]) if params[key].present?
      end
      unless process_beta_feedback_screenshot(params['screenshot_data'])
        return false
      end
      if self.settings['subject'].blank?
        add_processing_error("Summary is required for beta feedback")
        return false
      end
      if self.settings['email'].present?
        email = self.settings['email'].to_s.strip
        if email.length > 254 || !email.match?(URI::MailTo::EMAIL_REGEXP)
          add_processing_error("Invalid email address")
          return false
        end
      end
      ft = self.settings['feedback_type'].to_s
      unless BETA_FEEDBACK_ALLOWED_TYPES.include?(ft)
        add_processing_error("Invalid feedback type")
        return false
      end
      sev = self.settings['severity'].to_s
      unless BETA_FEEDBACK_ALLOWED_SEVERITIES.include?(sev)
        add_processing_error("Invalid severity")
        return false
      end
      BETA_FIELD_MAX_LENGTHS.each do |key, max|
        next if self.settings[key].blank?
        if self.settings[key].length > max
          add_processing_error("One or more fields are too long")
          return false
        end
      end
      self.beta_subject = self.settings['subject']
      self.beta_submitter_name = self.settings['name'].presence
      self.beta_feedback_type = self.settings['feedback_type']
      self.beta_severity = self.settings['severity']
      self.recipient = 'beta_feedback'
    end
    true
  end

  def process_beta_feedback_screenshot(data)
    return true if data.blank?
    s = data.to_s.strip
    m = s.match(/\Adata:(image\/(?:png|jpeg|jpg|gif|webp));base64,([\sA-Za-z0-9+\/]+=*)\z/i)
    unless m
      add_processing_error("Invalid screenshot format")
      return false
    end
    raw_b64 = m[2].gsub(/\s/, '')
    max_b64 = 2_200_000
    if raw_b64.length > max_b64
      add_processing_error("Screenshot too large (max about 1.5 MB)")
      return false
    end
    ext = case m[1].downcase
          when 'image/jpeg', 'image/jpg' then 'jpg'
          when 'image/png' then 'png'
          when 'image/gif' then 'gif'
          when 'image/webp' then 'webp'
          else 'png'
          end
    self.settings['screenshot_filename'] = "screenshot.#{ext}"
    self.settings['screenshot_base64'] = raw_b64
    true
  end
  private :process_beta_feedback_screenshot
  
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

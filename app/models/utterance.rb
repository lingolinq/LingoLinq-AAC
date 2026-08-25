class Utterance < ApplicationRecord
  include GlobalId
  include Processable
  include Permissions
  include MetaRecord
  include SecureSerialize
  include Async
  include Notifier
  protect_global_id
  include Replicate
  
  belongs_to :user
  before_save :generate_defaults
  after_save :generate_preview_later
  
  add_permissions('view', ['*']) { true }
  add_permissions('view', 'edit') {|user| self.user_id == user.id || (self.user && self.user.allows?(user, 'edit')) }
  secure_serialize :data

  def generate_defaults
    self.data ||= {}
    if self.data['button_list']
      if !self.data['image_url']
        self.data['image_url'] ||= self.data['button_list'].map{|b| b['image'] }.compact.first
        self.data['default_image_url'] = true
      end
      if !self.data['sentence'] || self.data['sentence'].blank?
        self.data['sentence'] = self.data['button_list'].map{|b| b['vocalization'] || b['label'] }.compact.join(' ')
      end
    end
    tmp_nonce = nil
    attempts = 0
    while !self.reply_nonce && (!tmp_nonce || Utterance.find_by(reply_nonce: tmp_nonce))
      size = self.data['private_only'] ? 30 : 10
      tmp_nonce = GoSecure.sha512('utterance_reply_long', GoSecure.nonce('utterance_reply_code'))[0, size]
      attempts += 1
      raise "can't generate nonce" if attempts > 10
    end
    self.reply_nonce = tmp_nonce if tmp_nonce
    self.data['image_url'] ||= "https://opensymbols.s3.amazonaws.com/libraries/noun-project/Person-08e6d794b0.svg"
    self.data['show_user'] ||= false
    true
  end

  def self.clear_old_nonces
    Utterance.where(['reply_nonce IS NOT NULL AND LENGTH(reply_nonce) < 20 AND created_at < ?', 14.days.ago]).update_all(reply_nonce: nil)
  end
  
  def generate_preview
    url = SentencePic.generate(self)
#    ApplicationRecord.using(:master) do
      self.reload
#    end
    self.data ||= {}
    self.data['large_image_url_attempted'] = true
    self.data['large_image_url'] = url
    if self.data['default_image_url']
      self.data['image_url'] = self.data['large_image_url']
    end
    self.save
  end
  
  def generate_preview_later
    if self.data && !self.data['large_image_url_attempted']
      self.schedule(:generate_preview)
    end
    true
  end

  def accessible_for?(reply_code, allow_public)
    return true if !self.data['private_only'] && allow_public
    if reply_code
      match = reply_code.match(/^([0-9a-f]+)([A-Z]+)$/)
      reply_nonce = match && match[1]
      if !self.reply_nonce || self.reply_nonce != reply_nonce
        reply_code = nil
      end
    end
    if !reply_code
      return false
    end
    return true
  end
  
  def share_with(params, sharer, author_id=nil)
    sharer = User.find_by_path(sharer) if sharer.is_a?(String)
    author_id ||= sharer.global_id if sharer
    return false unless sharer
    user_id = params['user_id'] || params['supervisor_id']
    self.data['author_ids'] = (self.data['author_ids'] || []) + [author_id]
    self.data['share_user_ids'] = (self.data['share_user_ids'] || []) + [user_id]
    share_index = self.data['share_user_ids'].length - 1
    if params['reply_id']
      self.data['reply_ids'] ||= {}
      self.data['reply_ids'][share_index.to_s] = params['reply_id']
    end
    self.save
    if user_id
      message = params['message'] || params['sentence'] || self.data['sentence']
      my_supervisor_ids = sharer.supervisor_user_ids
      my_supervisee_ids = sharer.supervised_user_ids
      my_supervisees_contact_ids = sharer.supervisees.map{|sup| sup.supervisor_user_ids }.flatten
      allowed_ids = (my_supervisor_ids + my_supervisee_ids + my_supervisees_contact_ids).uniq
      allowed_ids << sharer.global_id
      if allowed_ids.include?(user_id.split(/x/)[0])
        sup = User.find_by_path(user_id.split(/x/)[0])
        return false unless sup
        contact = sup.lookup_contact(user_id)
        if contact || user_id == sharer.global_id || (my_supervisor_ids + my_supervisees_contact_ids).include?(user_id)
          # message from a communicator to a supervisor
          Worker.schedule_for(:priority, Utterance, :perform_action, {
            'id' => self.id,
            'method' => 'deliver_to',
            'arguments' => [{'user_id' => user_id, 'sharer_id' => sharer.global_id, 'share_index' => share_index, 'text_only' => params['text_only']}]
          })
        elsif my_supervisee_ids.include?(user_id)
          # message from a supervisor to a communicator
          return false unless LogSession.message({
            recipient: sup,
            sender: sharer,
            notify: 'user_only',
            device: sharer.devices[0],
            message: message,
            reply_id: params['reply_id']
          })
        end
        if !self.data['private_only']
          LogSession.process_new({
            type: 'note',
            note: {
              timestamp: self.data['timestamp'],
              recipient_string: contact ? contact['name'] : sup.user_name,
              text: message,
              reply_id: params['reply_id']      
            }
          }, {user: sharer, device: sharer.devices[0], author: sharer})
        end
        return {to: user_id, from: sharer.global_id, type: 'utterance'}
      end
    elsif params['email']
      Worker.schedule_for(:priority, Utterance, :perform_action, {
        'id' => self.id,
        'method' => 'deliver_to',
        'arguments' => [{
          'sharer_id' => sharer.global_id,
          'email' => params['email'],
          'share_index' => self.data['share_user_ids'].length - 1,
          'subject' => params['subject'] || params['message'] || params['sentence'],
          'message' => params['message'] || params['sentence'] || self.data['sentence']
        }]
      })
      LogSession.process_new({
        type: 'note',
        data: {
          note: {
            timestamp: self.data['timestamp'],
            recipient_string: 'email',
            message: params['message'] || params['sentence'] || self.data['sentence'],
            subject: params['subject'] || params['message'] || params['sentence'],
            reply_id: params['reply_id']      
          }
        }
      }, {user: sharer, device: sharer.devices[0], author: sharer})
      return {to: params['email'], from: sharer.global_id, type: 'email'}
    end
    return false
  end

  def self.from_alpha_code(str)
    return nil unless str && str.match(/^[A-Z]+$/)
    num = 0
    str.to_s.each_char do |chr|
      mod = chr.ord - 'A'.ord
      num = (num * 26) + mod
    end
    num
  end

  def self.to_alpha_code(num)
    code = ""
    return nil unless num && num.is_a?(Numeric)
    while num > 0
      mod = num % 26
      num = (num - mod) / 26
      code = ('A'.ord + mod).chr + code
    end
    code = "A" if code.length == 0
    code
  end

  def deliver_to(args)
    sharer = User.find_by_path(args['sharer_id'])
    raise "sharer required" unless sharer
    # TODO: record this message somewhere so we can track history of 
    # communicator's outgoing messages
    text = args['message'] || self.data['sentence']
    subject = args['subject'] || self.data['sentence']
    idx = args['share_index'] || 0
    reply_id = args['share_index'] && self.data['reply_ids'] && self.data['reply_ids'][args['share_index'].to_s]
    share_code = Utterance.to_alpha_code(args['share_index'] || 0)
    reply_url = "#{JsonApi::Json.absolute_host}/u/#{self.reply_nonce}#{share_code}"
    if args['email']
      # Utterance.deliver_message
      self.deliver_message('email', nil, args, User.find_by_path(args['user_id']))
      return true
    elsif args['user_id']
      user = User.find_by_path(args['user_id'])
      if user
        contact = user.lookup_contact(args['user_id'])
        if contact
          # Utterance.deliver_message
          self.deliver_message(contact['contact_type'], nil, {
            'sharer' => {'user_name' => sharer.user_name, 'user_id' => sharer.global_id, 'name' => sharer.settings['name']},
            'recipient_id' => args['user_id'],
            'email' => contact['email'],
            'cell_phone' => contact['cell_phone'],
            'reply_id' => reply_id,
            'text_only' => args['text_only'],
            'share_index' => args['share_index'],
            'utterance_id' => self.global_id,
            'reply_url' => reply_url,
            'text' => text
          }, user)
        else
          notify('utterance_shared', {
            'sharer' => {'user_name' => sharer.user_name, 'user_id' => sharer.global_id, 'name' => sharer.settings['name']},
            'user_id' => user.global_id,
            'reply_id' => reply_id,
            'share_index' => args['share_index'],
            'utterance_id' => self.global_id,
            'reply_url' => reply_url,
            'text' => text
          })
        end
      end
      return true
    end
    raise "share failed"
  end

  def deliver_message(pref, recipient_user, args, ref_user=nil)
    record = self
    args['sharer'] ||= {}
    if !args['sharer']['user_name'] && (args['sharer_id'] || args['sharer']['user_id'])
      sharer = User.find_by_path(args['sharer_id'] || args['sharer']['user_id'])
      if sharer
        args['sharer']['user_id'] = sharer.global_id
        args['sharer']['user_name'] = sharer.user_name
        args['sharer']['name'] = sharer.settings['name']
      end
    end
    ref_user ||= User.find_by_path(args['sharer_id'] || args['sharer']['user_id'])
    if (!args['reply_url'] || !args['reply_id']) && args['share_index']
      share_code = Utterance.to_alpha_code(args['share_index'] || 0)
      args['reply_url'] ||= "#{JsonApi::Json.absolute_host}/u/#{self.reply_nonce}#{share_code}"
      args['reply_id'] ||= (self.data['reply_ids'] || {})[args['share_index'].to_s]
    end
    if pref == 'email'
      UserMailer.schedule_delivery(:utterance_share, {
        'subject' => args['subject'] || args['text'] || self.data['sentence'],
        'sharer_id' => args['sharer_id'] || args['sharer']['user_id'],
        'recipient_id' => args['recipient_id'] || (recipient_user && recipient_user.global_id),
        'sharer_name' => args['sharer']['name'] || args['sharer']['user_name'],
        'message' => args['text'] || args['message'] || self.data['sentence'],
        'utterance_id' => args['utterance_id'] || self.global_id,
        'to' => args['email'] || (recipient_user && recipient_user.settings['email']),
        'reply_id' => args['reply_id'],
        'reply_url' => args['reply_url']
      })
    elsif pref == 'text' || pref == 'sms'
      from = args['sharer']['name'] || args['sharer']['user_name'] || 'someone'
      text = args['text'] || self.data['sentence']
      if args['cell_phone'] || (recipient_user && recipient_user.settings && recipient_user.settings['cell_phone'])
        cell = args['cell_phone'] || (recipient_user && recipient_user.settings && recipient_user.settings['cell_phone'])
        if args['text_only']
          msg = text
          if args['reply_url']
            msg += "\n\nreply to #{from}: #{args['reply_url']}"
          end
        else
          msg = "from #{from} - #{text}"
          if args['reply_url']
            msg += "\n\nreply: #{args['reply_url']}"
          end
        end
        origination = nil
        if ref_user
          target = RemoteTarget.find_or_assert('sms', cell, ref_user)
          source = target && target.current_source
          if source && source[:id]
            origination = source[:id]
            target.last_outbound_at = Time.now
            contact_id = (self.data['share_user_ids'] || [])[args['share_index']] if args['share_index']
            contact_id ||= args['recipient_id']
            contact_id ||= recipient_user.global_id if recipient_user
            contact_id ||= args['sharer']['user_id'] if args['sharer']
            target.contact_id = contact_id
            target.save
          end
        end
        Worker.schedule_for(:priority, Pusher, :sms, cell, msg, origination)
    
        if record && record.data
          record.reload
          record.data['sms_attempts'] ||= []
          record.data['sms_attempts'] << {
            cell: cell,
            timestamp: Time.now.to_i,
            pushed: true,
            text: msg
          }
          record.save
        end
      end
    end
  end
  
  def additional_listeners(type, args)
    if type == 'utterance_shared'
      u = User.find_by_global_id(args['user_id'])
      res = []
      res << u.record_code if u
      res
    end
  end
  
  def process_params(params, non_user_params)
    raise "user required" unless self.user || non_user_params[:user]
    self.user = non_user_params[:user] if non_user_params[:user]
    self.data ||= {}
    self.data['button_list'] = params['button_list'] if params['button_list']
    self.data['private_only'] = !!params['private_only'] if params['private_only'] != nil
    (self.data['button_list'] || []).each do |button|
      # Don't use local URLs for saving the utterance to show to others
      if button['original_image'] && !button['image'].match(/^http/)
        button['image'] = button['original_image']
        button.delete('original_image')
      end
    end
    self.data['sentence'] = params['sentence'] if params['sentence']
    self.nonce = GoSecure.sha512(params['message_uid'], 'utterance_message_uid') if params['message_uid']
    self.data['timestamp'] = params['timestamp'].to_i if params['timestamp']
    if params['image_url'] && params['image_url'] != self.data['image_url']
      self.data['image_url'] = params['image_url'] 
      self.data['default_image_url'] = false
    end
    self.data['show_user'] = process_boolean(params['show_user']) if params['show_user']
    return true
  end
end

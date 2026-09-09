class RemoteTarget < ApplicationRecord
  include GlobalId
  belongs_to :user
  before_save :generate_defaults

  # https://en.wikipedia.org/wiki/List_of_country_calling_codes
  SHORT_COUNTRY_PREFIXES = [
    1, 20, 27, 30, 31, 32, 33, 34, 36, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49,
    51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66, 7,
    81, 82, 84, 86, 90, 91, 92, 93, 94, 95, 98
  ]

  def generate_defaults
    throw(:abort) unless self.target_type && self.target_hash && (self.target_id || self.target)
    self.target_id ||= RemoteTarget.id_for(self.target_type, self.target)
    self.salt ||= GoSecure.nonce('remote_target_salted_hash')
    self.target_index ||= (RemoteTarget.all_for(self.target_type, self.target).map(&:target_index).max || -1) + 1
    if !self.source_hash && self.target
      self.current_source
    end
    true
  end

  def target
    @target
  end

  def target=(val)
    @target = val
    self.target_hash = self.salted_hash(RemoteTarget.canonical_target(self.target_type, val))
    val
  end

  def current_source
    # Should try to use existing source if possible,
    # otherwise take whatever source is indexed for
    sources = RemoteTarget.sources_for(self.target_type, self.target)
    source = sources.detect{|s| s[:hash] == self.source_hash }
    if !source && self.target
      idx = (self.target_id + self.target_index) % [sources.length, 1].max
      source = sources[idx]
    end
    if source
      self.source_hash = RemoteTarget.salted_hash(source[:id])
    end
    source
  end

  def salted_hash(str)
    raise "missing user" unless self.user_id
    self.salt ||= GoSecure.nonce('remote_target_salted_hash')
    RemoteTarget.salted_hash(str, self.salt, self.related_global_id(self.user_id))
  end

  def self.salted_hash(str, salt=nil, ref=nil)
    salt ||= ENV['SMS_ENCRYPTION_KEY']
    ref ||= 'global'
    GoSecure.sha512([salt, str, ref].join(':'), salt)[0, 64]
  end

  def self.canonical_target(type, target_str)
    if type.to_s == 'sms'
      target_str = target_str.gsub(/[^\+\d]/, '')
      if !target_str.match(/^\+/)
        if target_str.length == 10
          "+1" + target_str
        else
          "+" + target_str
        end
      else
        target_str
      end
    else
      target_str
    end
  end

  def self.sources_for(type, target_str)
    if type.to_s == 'sms'
      target_str = RemoteTarget.canonical_target(type, target_str) if target_str
      list = (ENV['SMS_ORIGINATORS'] || "").split(/,/)
      prefix = nil
      if target_str
        prefix = target_str[0, 4] 
        SHORT_COUNTRY_PREFIXES.each do |p|
          if target_str[0, p.to_s.length + 1] == "+#{p}"
            prefix = p
          end
        end
      end
      matching_sources = list.select{|num| !prefix || num.match(/^\+#{prefix}/) }
      matching_sources.map{|s| {id: s, hash: RemoteTarget.salted_hash(s) } }
    else
      []
    end
  end

  def self.find_or_assert(type, target_str, user)
    # Retrieve or create a target record for the user and target string
    # i.e. a mapping of what source to use when texting to and from
    #      the current user to a remote phone number
    target = all_for(type, target_str).detect{|t| t.related_global_id(t.user_id) == user.global_id }
    if target
      pre_hash = target.target_hash
      target.target = target_str if target_str
      target.save if target.target_hash != pre_hash
    elsif type.to_s == 'sms'
      target = RemoteTarget.new(target_type: type, user_id: user.id)
      target.target = target_str
      target.save!
    end
    target
  end

  def self.id_for(type, target_str)
    if type.to_s == 'sms'
      RemoteTarget.canonical_target(type, target_str)[-4, 4].to_i
    end
  end

  def self.all_for(type, target_str)
    id = id_for(type, target_str)
    RemoteTarget.where(target_id: id).select{|t| t.target_hash == t.salted_hash(RemoteTarget.canonical_target(type, target_str)) }
  end

  def self.latest_for(type, target_str, source_str)
    source_hash = RemoteTarget.salted_hash(RemoteTarget.canonical_target(type, source_str))
    all_for(type, target_str).select{|t| t.source_hash == source_hash }.sort_by{|t| t.last_outbound_at || t.updated_at }[-1]
  end

  def self.process_inbound(opts)
    target_str = opts['originationNumber'] # (from AWS) The phone number that sent the incoming message to you (in other words, your customer's phone number).
    source_str = opts['destinationNumber'] # (from AWS) The phone number that the customer sent the message to (your dedicated phone number).
    return false unless target_str && source_str
    message = opts['messageBody'] || 'no message'
    target = RemoteTarget.latest_for('sms', target_str, source_str)
    if target && target.user
      sharer = (target.contact_id && User.find_by_path(target.contact_id)) || target.user
      last_utterance = target.contact_id && Utterance.where(user: sharer).order('id DESC').limit(20).detect{|u| (u.data['share_user_ids'] || []).include?(target.contact_id) }
      res = LogSession.message({
        recipient: target.user,
        sender: sharer,
        sender_id: target.contact_id,
        notify: 'user_only',
        device: sharer.devices[0],
        message: message,
        reply_id: last_utterance && last_utterance.global_id
      })
      return true
    else
      return false
    end
    # Inbound SMS Example
    # {
    #   "originationNumber":"+14255550182",
    #   "destinationNumber":"+12125550101",
    #   "messageKeyword":"JOIN",
    #   "messageBody":"EXAMPLE",
    #   "inboundMessageId":"cae173d2-66b9-564c-8309-21f858e9fb84",
    #   "previousPublishedMessageId":"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    # }        
  end
end

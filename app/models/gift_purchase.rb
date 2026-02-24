class GiftPurchase < ActiveRecord::Base
  include Permissions
  include GlobalId
  include SecureSerialize
  include Processable
  secure_serialize :settings
  before_save :generate_defaults
  include Replicate
  
  add_permissions('view', ['*']) { self.active == true }
  add_permissions('manage') {|user| Organization.admin_manager?(user) }
  add_permissions('manage') {|user| (self.settings['admin_user_ids'] || []).include?(user.global_id) }

  def self.find_by_code(code, allow_inactive=false)
    code = (code || '').strip.downcase
    gifts = GiftPurchase
    gifts = gifts.where(active: true) unless allow_inactive
    gift = gifts.find_by(code: code)
    if !gift
      code = code.gsub(/o/, '0')
      parts = code.split(/x/)
      if parts.length > 1
        gifts = gifts.where(["code LIKE ?", "#{ActiveRecord::Base.sanitize_sql_like(parts[0])}%"])
        gift = gifts.detect{|g| g.settings['total_codes'] && g.settings['codes'].has_key?(code) }
      else
        gift = gifts.where(:code => code).first
      end
    end
    gift
  end
  
  def generate_defaults
    self.settings ||= {}
    self.active = true if self.active == nil
    self.active = false if self.settings['purchase_id'] && self.settings['licenses']
    self.settings['code_length'] = 20 if self.settings['licenses']
    self.settings['code_length'] = 40 if self.settings['total_codes']
    if !self.code
      code = nil
      length = self.settings['code_length'] || 8
      while !code || GiftPurchase.where(:active => true, :code => code).count > 0
        code = (GoSecure.nonce('gift_code') + GoSecure.nonce('gift_code'))[0, length.floor]
        length += 0.5
      end
      self.code = code
      if self.settings['total_codes'] && !self.settings['codes']
        self.settings['codes'] = {}
        while self.settings['codes'].keys.length < self.settings['total_codes']
          code = "#{self.code[0, 4]}x#{GoSecure.nonce('gift_code_sub')[0, 4]}"
          self.settings['codes'][code] ||= nil
        end
      end
    end
    true
  end

  def code_verifier
    GoSecure.sha512(self.code, 'gift_code_verifier')[0, 30]
  end
  
  def gift_type
    self.settings ||= {}
    if self.settings['total_codes']
      'multi_code'
    elsif self.settings['licenses']
      'bulk_purchase'
    elsif self.settings['discount']
      'discount'
    else
      'user_gift'
    end
  end
  
  def notify_of_creation
    SubscriptionMailer.schedule_delivery(:gift_created, self.global_id)
    SubscriptionMailer.schedule_delivery(:gift_updated, self.global_id, 'purchase')
    true
  end
  
  def duration
    time = {}
    left = self.settings && self.settings['seconds_to_add']
    return "no time specified" unless left && left > 0
    units = [[1.year.to_i, 'year'], [1.day.to_i, 'day'], [1.hour.to_i, 'hour'], [1.minute.to_i, 'minute']]
    units.each do |seconds, unit|
      while left >= seconds
        time[unit] = (time[unit] || 0) + 1
        left -= seconds
      end
    end
    res = []
    units.each do |seconds, unit|
      if time[unit] && time[unit] > 0
        str = "#{time[unit]} #{unit}"
        str += "s" if time[unit] > 1
        res << str
      end
    end
    res.join(", ")
  end
  
  def receiver
    id = self.settings && self.settings['receiver_id']
    User.find_by_global_id(id)
  end
  
  def giver
    id = self.settings && self.settings['giver_id']
    User.find_by_global_id(id)
  end
  
  def bulk_purchase?
    !!(self.settings && self.settings['licenses'])
  end
  
  def purchased?
    !!(self.settings && self.settings['purchase_id'])
  end
  
  def process_params(params, non_user_params)
    self.settings ||= {}
    self.settings['giver_email'] = params['email'] if params['email']
    self.settings['giver_email'] = non_user_params['email'] if non_user_params['email']
    if non_user_params['giver']
      self.settings['giver_id'] = non_user_params['giver'].global_id
      self.settings['giver_email'] ||= non_user_params['giver'].settings['email'] if non_user_params['giver'].settings['email']
    end

    ['licenses', 'total_codes', 'limit', 'discount', 'amount', 
            'memo', 'email', 'organization', 'gift_name'].each do |arg|
      self.settings[arg] = params[arg] if params[arg] && !params[arg].blank?
    end
    # only allow including extras on bulk purchases unless as non_user_params
    self.settings['include_extras'] = params['include_extras'] if !params['include_extras'].blank? && self.settings['licenses']
    self.settings['include_supporters'] = params['include_supporters'].to_i if !params['include_supporters'].blank? && self.settings['licenses']
    ['include_extras', 'extra_donation', 'include_supporters'].each do |arg|
      self.settings[arg] = non_user_params[arg] if non_user_params[arg] && !non_user_params[arg].blank?
    end

    if params['discount'] && params['code']
      self.code = params['code'].to_s.downcase
    end

    if params['expires'] && !params['expires'].blank?
      self.settings['expires'] = Date.parse(params['expires'])
    end
    if params['org_id']
      org = Organization.find_by_global_id(params['org_id'])
      self.settings['org_id'] = org.global_id
    end

    if non_user_params['giver'] && self.settings['licenses']
      self.settings['giver_email'] = non_user_params['giver'].settings['email'] if non_user_params['giver'].settings['email']
    end

    ['customer_id', 'token_summary', 'plan_id', 'purchase_id', 'source_id'].each do |arg|
      self.settings[arg] = non_user_params[arg] if non_user_params[arg]
    end
    self.settings['seconds_to_add'] = non_user_params['seconds'].to_i if non_user_params['seconds']
  end
  
  def self.process_subscription_token(token, opts)
    Purchasing.purchase_gift(token, opts)
  end
  
#  def self.redeem(code, user)
#    Purchasing.redeem_gift(code, user)
#  end

  def redemption_state(code)
    if self.gift_type == 'multi_code'
      parts = code.split(/x/)
      return {error: "invalid code"} unless self.code[0, 4] == parts[0] && self.settings['codes'].has_key?(code)
      return {error: "code already redeemed"} if !self.active || self.settings['codes'][code] != nil
      return {valid: true}
    elsif self.gift_type == 'discount'
      return {error: "invalid code"} unless self.code == code
      return {error: "discount limit passed"} if self.settings['limit'] && (self.settings['activations'] || []).length >= self.settings['limit']
      if self.settings['expires'] && self.settings['expires'] <= Date.today.iso8601
        if self.active
          self.active = false
          self.save
        end
        return {error: "discount expired"} 
      end
      return {error: "all codes redeemed"} if !self.active
      return {valid: true}
    elsif self.gift_type == 'user_gift'
      return {error: "invalid code"} unless self.code == code
      return {error: 'already redeemed'} if !self.active
      return {valid: true}
    else
      return {error: "invalid code"}
    end
  end

  def discount_percent
    if self.settings['discount']
      [[1.0, self.settings['discount'].to_f].min, 0.0].max
    else
      1.0
    end
  end
  
  def redeem_code!(code, user)
    redeem = redemption_state(code)
    raise redeem[:error] if !redeem[:valid]
    if self.gift_type == 'multi_code'
      parts = code.split(/x/)
      self.settings['codes'][code] = {
        'redeemed_at' => Time.now.iso8601,
        'receiver_id' => user.global_id
      }
      self.active = false if self.settings['codes'].to_a.map(&:last).all?{|v| v != nil }
    elsif self.gift_type == 'discount'
      self.settings['activations'] ||= []
      self.settings['activations'] << {
        'receiver_id' => user.global_id,
        'activated_at' => Time.now.utc.iso8601
      }
      self.active = false if self.settings['limit'] && self.settings['activations'].length >= self.settings['limit']
    elsif self.gift_type == 'user_gift'
      self.active = false
      self.settings['receiver_id'] = user.global_id
      self.settings['redeemed_at'] = Time.now.utc.iso8601
    else
      raise "invalid code"
    end
    if self.settings['org_id']
      org = Organization.find_by_global_id(self.settings['org_id'])
      org.add_user(user.global_id, false, false, false)
    end
    self.save
  end
end

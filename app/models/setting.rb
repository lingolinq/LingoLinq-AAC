class Setting < ApplicationRecord
  include SecureSerialize
  secure_serialize :data

  include Replicate

  def self.set(key, value, set_as_data=false)
    setting = self.find_or_initialize_by(:key => key)
    if set_as_data
      setting.data = value
    else
      setting.value = value
    end
    setting.save
    cache_key = "setting/#{key}"
    RedisInit.default.del(cache_key)
    value
  end

  def self.get_cached(key)
    cache_key = "setting/#{key}"
    str = RedisInit.default.get(cache_key)
    return JSON.parse(str) if str
    res = get(key)
    RedisInit.default.setex(cache_key, 60.minutes.to_i, res.to_json) if res
    res
  end
  
  def self.get(key)
    setting = self.find_by(:key => key)
    setting && (setting.data || setting.value)
  end
  
  def self.blocked_email?(email)
    email = email.downcase
    hash = self.get('blocked_emails') || {}
    hash[email] == true
  end
  
  def self.blocked_emails
    hash = self.get('blocked_emails') || {}
    hash.map{|k, v| k }.sort
  end
  
  def self.block_email!(email)
    email = email.downcase
    setting = self.find_or_create_by(:key => 'blocked_emails')
    setting.data ||= {}
    setting.data[email] = true
    setting.save!
  end

  def self.blocked_cell?(cell)
    hash = self.get('blocked_cells') || {}
    hash[cell] == true
  end
  
  def self.blocked_cells
    hash = self.get('blocked_cells') || {}
    hash.map{|k, v| k }.sort
  end
  
  def self.block_cell!(cell)
    setting = self.find_or_create_by(:key => 'blocked_cells')
    setting.data ||= {}
    setting.data[cell] = true
    setting.save!
  end
end

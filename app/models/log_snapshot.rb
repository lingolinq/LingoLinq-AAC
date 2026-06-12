class LogSnapshot < ApplicationRecord
  include Permissions
  include Processable
  include GlobalId
  include Async
  include SecureSerialize
  secure_serialize :settings
  before_save :generate_defaults
  include Replicate

  belongs_to :user
  
  add_permissions('view', ['read_logs']) {|user| self.user && self.user.allows?(user, 'supervise') }
  add_permissions('view', ['read_logs']) {|user| self.user && self.user == user }
  add_permissions('view', 'edit', 'delete') {|user| self.user && self.user == user }
  add_permissions('view', ['read_logs']) {|user| self.user && self.user.allows?(user, 'edit') }
  add_permissions('view', 'edit', 'delete') {|user| self.user && self.user.allows?(user, 'edit') }
  
  def generate_defaults
    self.settings ||= {}
  end
  
  def process_params(params, non_user_params)
    self.user ||= non_user_params[:user]
    raise "user required" unless self.user
    self.settings ||= {}
    ['name', 'start', 'end', 'device_id', 'location_id'].each do |key|
      self.settings[key] = params[key] if params[key]
    end
    true
  end
end

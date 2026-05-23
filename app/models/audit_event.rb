class AuditEvent < ApplicationRecord
  include SecureSerialize
  before_save :generate_summary
  secure_serialize :data
  attr_readonly :user_key, :summary, :data
  
  def generate_summary
    self.data ||= {}
    self.user_key ||= "unknown"
    self.summary ||= self.user_key + ": " + (self.data['type'] || "") + " " + (self.data['command'] || "")
  end
  
  def self.log_command(user_key, opts)
    comment = self.new(:user_key => user_key, :data => opts)
    comment.save
    comment
  end
end

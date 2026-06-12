class AuditEvent < ApplicationRecord
  include SecureSerialize
  before_save :generate_summary
  secure_serialize :data
  attr_readonly :user_key, :summary, :data
  
  def generate_summary
    self.data ||= {}
    self.user_key ||= 'unknown'
    self.summary ||= self.user_key + ': ' + (self.data['type'] || '') + ' ' + (self.data['command'] || '')
  end
  
  def self.log_command(user_key, opts)
    event = self.new(user_key: user_key, data: opts)
    begin
      event.save!
    rescue => e
      # Best-effort audit: never break the authorized read/action the caller is
      # performing, but log loudly so a missed accounting-of-disclosure row is
      # caught. Logs e.class/e.message only; the secure_serialized payload is
      # never interpolated, so no PHI/PII reaches the log line.
      Rails.logger.error("[AuditEvent] failed to persist audit record for #{user_key}: #{e.class}: #{e.message}")
    end
    event
  end
end

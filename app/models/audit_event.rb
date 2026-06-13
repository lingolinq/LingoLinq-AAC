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
      # caught. The secure_serialized `data`/`summary` are never interpolated and
      # `user_key` is an opaque global_id. `e.message` is the one field that can
      # echo input (DB/encoding errors), so it is PII-scrubbed and length-capped.
      # The scrub is guarded so a missing constant (e.g. lib/ not autoloaded in a
      # Resque worker) can never raise here and defeat fail-open.
      detail = (PiiScrubber.scrub_log_line(e.message.to_s) rescue e.message.to_s).truncate(300)
      message = '[AuditEvent] failed to persist audit record for ' + user_key.to_s + ': ' + e.class.to_s + ': ' + detail
      Rails.logger.error(message)
      # Alert so fail-open gaps surface in monitoring. Send the already-scrubbed
      # message, NOT the raw exception: CoppaSentryScrub#before_send does not
      # scrub exception messages for non-child users, so capture_exception could
      # ship `e.message` PII. Guarded so alerting can never raise and defeat
      # fail-open (Sentry undefined under Resque, or a capture error).
      begin
        if defined?(Sentry) && Sentry.respond_to?(:initialized?) && Sentry.initialized?
          Sentry.capture_message(message, level: 'error', tags: { audit: 'log_command_persist_failed' })
        end
      rescue StandardError
        nil
      end
    end
    event
  end
end

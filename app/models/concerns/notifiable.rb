module Notifiable
  extend ActiveSupport::Concern
  
  def record_code
    "#{self.class.to_s}:#{self.global_id}"
  end
  
  def handle_notification(notification_type, record, args=nil)
  end
  
  # Whether the account has an address General#mail_message will send to at all.
  def mail_address?
    email = (self.settings || {})['email']
    !email.blank? && !!email.match(/\@/)
  end

  # Why General#mail_message would send nothing for this notification, or nil when it sends:
  # 'no_address' (no usable address) or 'email_disabled' (channels_for returns no channel).
  def mail_skip_reason(notification_type)
    return 'no_address' unless mail_address?
    return 'email_disabled' if channels_for(notification_type).empty?
    nil
  end

  def channels_for(notification_type)
    if notification_type == 'email_changed_prior_address'
      [self.prior_named_email].compact
    elsif ['password_changed', 'email_changed', 'forgot_password'].include?(notification_type)
      [self.named_email]
    else
      if self.settings['email_disabled']
        []
      else
        [self.named_email]
      end
    end
  end

end
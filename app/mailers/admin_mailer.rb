class AdminMailer < ActionMailer::Base
  include General
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'email'
  
  def message_sent(message_id)
    @message = ContactMessage.find_by_global_id(message_id)
    recipient = JsonApi::Json.current_domain['settings']['admin_email'] || ENV['NEW_REGISTRATION_EMAIL']
    if recipient && @message
      mail(to: recipient, subject: "#{app_name} - \"Contact Us\" Message Received", reply_to: @message.settings['email'])
    end
  end
  
  def opt_out(user_id, reason)
    return unless full_domain_enabled
    @user = User.find_by_global_id(user_id)
    @reason = reason || 'unspecified'
    recipient = JsonApi::Json.current_domain['settings']['admin_email'] || ENV['NEW_REGISTRATION_EMAIL']
    if recipient && @user
      mail(to: recipient, subject: "#{app_name} - \"Opt-Out\" Requested")
    end
  end
end

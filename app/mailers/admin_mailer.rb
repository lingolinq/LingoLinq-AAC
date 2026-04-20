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

  def beta_feedback_sent(message_id)
    @message = ContactMessage.find_by_global_id(message_id)
    recipient = ENV['BETA_FEEDBACK_EMAIL'].presence || 'support@lingolinq.com'
    return unless @message && recipient.present?
    if @message.settings['screenshot_base64'].present? && @message.settings['screenshot_filename'].present?
      attachments[@message.settings['screenshot_filename']] = Base64.decode64(@message.settings['screenshot_base64'])
    end
    opts = {
      to: recipient,
      subject: "#{app_name} - Beta Feedback: #{@message.settings['subject']}"
    }
    reply = @message.settings['email'].to_s.strip
    if reply.present? && reply.length <= 254 && reply.match?(URI::MailTo::EMAIL_REGEXP)
      opts[:reply_to] = reply
    end
    mail(opts)
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

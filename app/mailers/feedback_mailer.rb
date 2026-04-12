class FeedbackMailer < ActionMailer::Base
  default from: ENV['FROM_ADDRESS'] || 'no-reply@lingolinq.com'

  def notify(feedback, to_address)
    @feedback = feedback
    subject = if feedback.priority == 'urgent'
                "[URGENT] LingoLinq feedback: #{feedback.category}"
              else
                "LingoLinq feedback: #{feedback.category}"
              end
    headers = { to: to_address, subject: subject }
    headers[:reply_to] = feedback.email if feedback.email.present?
    mail(headers)
  end
end

# Classifies one message from the SES events queue (lingolinq-ses-events) into what the app
# should do about it. Pure parsing: no database, no network. SesEventsWorker does the I/O.
#
# Shape, per the AWS SES Developer Guide "Contents of event data that Amazon SES publishes to
# Amazon SNS": a top-level eventType (notificationType for identity notifications), a mail
# object, and one per-type object (bounce, complaint, ...). The queue subscribes to the SNS
# topic WITHOUT raw message delivery (scripts/gcp/phase5-ses-config-set-setup.sh step 5), so
# the SQS body is an SNS envelope whose Message field is the SES event as a JSON string. A raw
# body is accepted too, so turning raw delivery on later does not break this.
#
# Decisions (docs/task-management/2026-10-14_ses-bounce-handling.md):
# - Permanent bounce, every subtype including OnAccountSuppressionList: disable.
# - Complaint: counted, NOT acted on. Disabling on a complaint would also block self-serve
#   password reset (Api::UsersController#forgot_password skips email_disabled users) for every
#   account sharing that address, and anyone can register an account with someone else's
#   address. That is an account-recovery policy call for the owner. If the SES account-level
#   suppression list covers complaints, the next send to that address comes back as an
#   OnAccountSuppressionList bounce and is handled as a permanent bounce.
# - Transient and Undetermined bounces, Send, Delivery, DeliveryDelay, Reject and anything
#   else: ignore.
#
# PII: Result#addresses holds email addresses. Callers must never log them. Result#label is
# drawn from a fixed list, never copied from the payload, so it is safe to log.
class SesEvent
  class Malformed < StandardError; end

  Result = Struct.new(:action, :label, :addresses, keyword_init: true)

  KNOWN_TYPES = %w[Bounce Complaint Delivery Send Reject Open Click DeliveryDelay Subscription].freeze

  def self.classify(body)
    event = unwrap(parse_object(body))
    type = event['eventType'] || event['notificationType']
    raise Malformed, 'no event type' unless type.is_a?(String) && !type.empty?

    case type
    when 'Bounce' then classify_bounce(event['bounce'])
    when 'Complaint' then classify_complaint(event['complaint'])
    else Result.new(action: :ignore, label: KNOWN_TYPES.include?(type) ? type : 'Other', addresses: [])
    end
  end

  def self.parse_object(text)
    raise Malformed, 'body is not a string' unless text.is_a?(String)
    obj = JSON.parse(text)
    raise Malformed, 'body is not a JSON object' unless obj.is_a?(Hash)
    obj
  rescue JSON::ParserError
    raise Malformed, 'body is not JSON'
  end
  private_class_method :parse_object

  # An SNS notification carries the event in Message. Anything else is taken as the raw event.
  def self.unwrap(obj)
    return obj unless obj['Type'] == 'Notification' && obj.key?('Message')
    parse_object(obj['Message'])
  end
  private_class_method :unwrap

  def self.classify_bounce(bounce)
    raise Malformed, 'bounce without a bounce object' unless bounce.is_a?(Hash)
    if bounce['bounceType'] == 'Permanent'
      Result.new(action: :disable, label: 'Bounce:Permanent', addresses: addresses(bounce['bouncedRecipients']))
    else
      label = bounce['bounceType'] == 'Transient' ? 'Bounce:Transient' : 'Bounce:Other'
      Result.new(action: :ignore, label: label, addresses: [])
    end
  end
  private_class_method :classify_bounce

  def self.classify_complaint(complaint)
    raise Malformed, 'complaint without a complaint object' unless complaint.is_a?(Hash)
    label = complaint['complaintFeedbackType'] == 'not-spam' ? 'Complaint:not-spam' : 'Complaint'
    Result.new(action: :ignore, label: label, addresses: [])
  end
  private_class_method :classify_complaint

  # Bare addresses only. A blank address must never reach UserMailer.bounce_email:
  # it hashes "none" or "" and would match every user without an email (User.generate_email_hash).
  def self.addresses(recipients)
    Array(recipients).filter_map do |r|
      raw = r.is_a?(Hash) ? r['emailAddress'] : nil
      next unless raw.is_a?(String)
      address = begin
        Mail::Address.new(raw.strip).address
      rescue Mail::Field::ParseError
        nil
      end
      address if address.is_a?(String) && address.match?(/\A[^@\s]+@[^@\s]+\z/)
    end.uniq
  end
  private_class_method :addresses
end

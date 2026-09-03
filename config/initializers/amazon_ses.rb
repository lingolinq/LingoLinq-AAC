# require 'aws-sdk-ses'
# ActionMailer::Base.add_delivery_method :ses, AWS::SES::Base,
#   :access_key_id     => ENV['SES_KEY'] || ENV['AWS_KEY'],
#   :secret_access_key => ENV['SES_SECRET'] || ENV['AWS_SECRET']

# ActionMailer::Base.add_delivery_method :ses, Mail::SES,
# region: ENV['SES_REGION'],
# access_key_id: ENV['SES_KEY'] || ENV['AWS_KEY'],
# secret_access_key: ENV['SES_SECRET'] || ENV['AWS_SECRET'],
# error_handler: ->(error, raw_email) do
#   # Sentry.capture_exception(error, extra: { email: raw_email })
#   raise error    
# end    

Aws::Rails.add_action_mailer_delivery_method(
  :ses,
  credentials: Aws::Credentials.new(
    ENV['SES_KEY'] || ENV['AWS_KEY'],
    ENV['SES_SECRET'] || ENV['AWS_SECRET']
  ),
  region: ENV['SES_REGION'] || ENV['AWS_REGION'] || ENV['AWS_DEFAULT_REGION']
)

# LL-42a24ee911: the lingolinq-transactional configuration set DOES exist now (provisioned
# 2026-07-11), with an SNS event destination on SEND/REJECT/BOUNCE/COMPLAINT/DELIVERY/
# DELIVERY_DELAY feeding the lingolinq-ses-events SQS queue. Without it, the only signal is
# account-wide 15-minute aggregates, which cannot explain any one message's fate. This
# interceptor tags every outgoing message with the SES-documented X-SES-CONFIGURATION-SET header
# (SendRawEmail-specific; SES strips it before the message leaves) so sends opt into the
# lingolinq-transactional configuration set's SNS event destination
# (scripts/gcp/phase5-ses-config-set-setup.sh provisions that set + SNS/SQS pipeline).
#
# Env-gated like WRITE_FREEZE, not a lib/feature_flags.rb entry: this is operator-controlled
# infra observability, not user-facing product behavior. No-op (message unchanged) if
# SES_CONFIGURATION_SET is unset, so it is safe to deploy before the configuration set exists.
class SesConfigurationSetInterceptor
  def self.delivering_email(message)
    config_set = ENV['SES_CONFIGURATION_SET']
    return if config_set.blank?

    # Mail::Header#[]= appends rather than replaces, so guard against a duplicate header if
    # this ever runs twice on the same message object (e.g. a manual delivery retry).
    message.header['X-SES-CONFIGURATION-SET'] = config_set unless message.header['X-SES-CONFIGURATION-SET']
  end
end

ActionMailer::Base.register_interceptor(SesConfigurationSetInterceptor)

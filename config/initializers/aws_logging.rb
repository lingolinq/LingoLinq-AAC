# aws-sdk-rails sends the AWS SDK's request log to Rails.logger (railtie.rb, log_to_rails_logger),
# and the SDK's default formatter prints every request's parameters at info: S3 keys (working
# links on the public-read upload buckets), raw emails from the SES mailer (reset codes, note
# text), SMS message text. This is the SDK's own default pattern without :request_params and
# :error_message. Clients read Aws.config when they are built, so this covers every client
# created after boot; a client that passes its own :log_formatter is not covered.
Aws.config[:log_formatter] = Aws::Log::Formatter.new(
  "[:client_class :http_response_status_code :time :retries retries] :operation :error_class\n"
)

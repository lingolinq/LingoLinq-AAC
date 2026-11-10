# A Rails log line for every failed background job. Resque runs each `on_failure*` class method
# of the job class when a job fails (Resque::Job#fail -> run_failure_hooks), then records the
# failure in Redis; its own failure output goes through Resque's logger, which is quiet unless
# VERBOSE is set and bypasses PiiScrubbingFormatter. Without this, a failed job (password reset
# and consent mail included) leaves no line for a log-based alert to match
# (scripts/gcp/prod-mail-failure-alert.json matches "[job failed] ...Mailer . deliver_message").
#
# The line carries the job class, its method, for mail the mailer method (the mail type), and the
# error class. Never the error message or any other argument: those can hold addresses, ids or
# content. Values not shaped like a class or method name are logged as "unknown".
#
# Extended by Worker and SlowWorker, the two job classes BoyBand enqueues. Loaded with
# require_relative from both, like lib/legacy_links.rb, so it is present where lib/ autoload is
# skipped (RESQUE_WORKER=='true', config/application.rb).
module JobFailureLog
  CLASS_NAME = /\A[A-Z][A-Za-z0-9]*(::[A-Z][A-Za-z0-9]*)*\z/
  METHOD_NAME = /\A[a-z_][A-Za-z0-9_]*[!?]?\z/

  def on_failure_log(exception, *args)
    klass = args[0].to_s.match?(CLASS_NAME) ? args[0].to_s : 'unknown'
    method = args[1].to_s.match?(METHOD_NAME) ? args[1].to_s : 'unknown'
    mail_type = klass.end_with?('Mailer') && method == 'deliver_message' && args[2].to_s.match?(METHOD_NAME) ? " (#{args[2]})" : ''
    Rails.logger.error("[job failed] #{klass} . #{method}#{mail_type} #{exception.class.name}")
  rescue StandardError
    # Logging must never change how Resque records the failure.
    nil
  end
end

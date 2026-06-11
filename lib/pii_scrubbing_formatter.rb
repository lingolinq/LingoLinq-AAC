# frozen_string_literal: true

require 'logger'
require_relative 'pii_scrubber'

# Log formatter that runs PiiScrubber.scrub_log_line over every fully-formatted
# log line as a defense-in-depth backstop against PHI/PII reaching stdout (and,
# under Cloud Run, GCP Cloud Logging).
#
# It subclasses ::Logger::Formatter and scrubs the result of the parent format,
# so it composes correctly with ActiveSupport::TaggedLogging: TaggedLogging
# clones this formatter and extends the clone with its own Formatter module,
# whose #call prepends the request-id tags and then calls super -- landing here,
# which formats the line (timestamp/severity/tags/message) via the parent and
# then scrubs the whole string before it is written.
#
# The scrub targets email, phone (separator-required), SSN, and IPv4 patterns;
# see PiiScrubber.scrub_log_line for full scope/caveats. Names/utterances are
# not regex-scrubbable -- per-call-site log hygiene remains the primary control.
# Coverage is limited to lines flowing through config.log_formatter (production
# Rails/Resque stdout); gems that bypass the formatter are out of scope.
class PiiScrubbingFormatter < ::Logger::Formatter
  def call(severity, timestamp, progname, msg)
    PiiScrubber.scrub_log_line(super)
  end
end

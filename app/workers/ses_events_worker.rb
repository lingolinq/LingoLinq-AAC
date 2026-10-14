# Drains the SES events queue (lingolinq-ses-events, fed by the lingolinq-transactional
# configuration set; scripts/gcp/phase5-ses-config-set-setup.sh) and turns permanent bounces
# and complaints into UserMailer.bounce_email, which sets email_disabled on matching users.
#
# Called hourly from `scheduler:dispatch` (lib/tasks/scheduler.rake), the same way as
# SupervisorConsentExpirationWorker. No-op when SES_EVENTS_QUEUE_URL is unset, so it is safe
# to deploy before the IAM grant and the env var exist. Set the URL in ONE environment only
# (production): staging sends use the same configuration set and land on the same queue, and
# two consumers would split it.
#
# Delivery rules:
# - A message is deleted only after it was handled (or found malformed).
# - Malformed messages are counted and deleted so they cannot loop until retention expires.
# - A message whose handling raised is NOT deleted. It becomes visible again after
#   VISIBILITY_TIMEOUT and is retried on a later run; bounce_email is idempotent.
#
# PII: logs carry counts and event-type labels only (SesEvent::Result#label). Never an
# address, a user id or the payload. The settings change itself is versioned by PaperTrail
# (app/models/user.rb has_paper_trail on settings).
module SesEventsWorker
  @queue = :default

  MAX_BATCHES = 100        # 10 messages per receive, so at most 1000 messages per run
  BATCH_SIZE = 10          # the SQS maximum for ReceiveMessage
  WAIT_TIME_SECONDS = 1    # long poll, so an empty answer means the queue is really empty
  VISIBILITY_TIMEOUT = 300 # longer than one run spends on a batch

  def self.perform(max_batches: MAX_BATCHES)
    queue_url = ENV['SES_EVENTS_QUEUE_URL'].to_s.strip
    return {skipped: true} if queue_url.empty?

    client = sqs_client
    counts = {received: 0, disabled_addresses: 0, ignored: 0, malformed: 0, failed: 0,
              deleted: 0, delete_failed: 0, by_type: Hash.new(0)}
    max_batches.times do
      messages = client.receive_message(queue_url: queue_url, max_number_of_messages: BATCH_SIZE,
        wait_time_seconds: WAIT_TIME_SECONDS, visibility_timeout: VISIBILITY_TIMEOUT).messages
      break if messages.empty?
      counts[:received] += messages.length
      done = messages.select { |m| handle(m, counts) }
      delete(client, queue_url, done, counts)
    end
    counts[:by_type] = counts[:by_type].to_h
    Rails.logger.info("[SES events] received=#{counts[:received]} disabled_addresses=#{counts[:disabled_addresses]} " \
      "ignored=#{counts[:ignored]} malformed=#{counts[:malformed]} failed=#{counts[:failed]} " \
      "deleted=#{counts[:deleted]} delete_failed=#{counts[:delete_failed]} by_type=#{counts[:by_type].to_json}")
    counts
  end

  # Returns true when the message may be deleted.
  def self.handle(message, counts)
    result = SesEvent.classify(message.body)
    counts[:by_type][result.label] += 1
    if result.action == :disable
      result.addresses.each { |address| UserMailer.bounce_email(address) }
      counts[:disabled_addresses] += result.addresses.length
    else
      counts[:ignored] += 1
    end
    true
  rescue SesEvent::Malformed
    counts[:malformed] += 1
    true
  rescue StandardError => e
    # Class name only: an exception message could quote the payload or an address.
    counts[:failed] += 1
    Rails.logger.error("[SES events] handling failed: #{e.class}")
    false
  end

  def self.delete(client, queue_url, messages, counts)
    return if messages.empty?
    entries = messages.each_with_index.map { |m, i| {id: i.to_s, receipt_handle: m.receipt_handle} }
    resp = client.delete_message_batch(queue_url: queue_url, entries: entries)
    counts[:deleted] += resp.successful.length
    counts[:delete_failed] += resp.failed.length
  end

  # Same credential and region chain as the :ses delivery method (config/initializers/amazon_ses.rb).
  def self.sqs_client
    require 'aws-sdk-sqs'
    Aws::SQS::Client.new(
      credentials: Aws::Credentials.new(ENV['SES_KEY'] || ENV['AWS_KEY'], ENV['SES_SECRET'] || ENV['AWS_SECRET']),
      region: ENV['SES_REGION'] || ENV['AWS_REGION'] || ENV['AWS_DEFAULT_REGION']
    )
  end
end

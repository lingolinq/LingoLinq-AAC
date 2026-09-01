# Sweeps offboarding COPPA consents that were declined or that ran past their
# deadline, exporting the account and then scheduling its deletion.
#
# WHY THIS IS OFF BY DEFAULT. The sweep is retroactive: it scans
# User::OFFBOARDING_SWEEP_LOOKBACK of `parental_consent_offboarding_started`
# AuditEvents, and production has been WRITING those events since well before
# the sweeper shipped. So the first real run in an environment does not process
# "today's expiries" -- it processes an accumulated backlog, and every match gets
# schedule_deletion_at 36 hours out. That is irreversible after the fact and
# there is no un-delete, so the first run has to be a deliberate act by an
# operator who has already looked at the count, not a side effect of restoring a
# cron.
#
# Three states, read from COPPA_OFFBOARDING_SWEEP_ENABLED:
#
#   unset / anything else  -> :disabled. Logs and returns. Does not scan, does
#                             not touch the database, does not mutate.
#   'report'               -> :report. Resolves the SAME candidate set the real
#                             run would, logs the count, the per-account
#                             global_ids and the declined/expired split, and
#                             mutates nothing. This is how you get the backlog
#                             count without prod database access.
#   'true'                 -> :run. Full sweep.
#
# Log identifiers are global_id only -- never names, emails, or birth data. The
# whole point of the report is that it can be read out of ordinary application
# logs, and those are not a place for student or patient identifiers. The
# per-account lines are capped at MAX_REPORT_LINES for the same reason; the
# count is never capped.
module OffboardingCoppaExpirationWorker
  @queue = :default

  ENABLED_ENV = 'COPPA_OFFBOARDING_SWEEP_ENABLED'
  LOG_TAG = '[OffboardingCoppaExpiration]'
  # Cap on the per-account report lines only; the COUNT is always complete. A
  # backlog of thousands would otherwise write thousands of lines pairing a
  # global_id with reason=declined, which is a COPPA-adjacent inference sitting
  # in an ordinary retained log sink.
  MAX_REPORT_LINES = 200

  def self.mode
    case ENV[ENABLED_ENV].to_s.strip.downcase
    when 'true' then :run
    when 'report' then :report
    else :disabled
    end
  end

  # Returns the number of accounts for which a deletion was actually scheduled.
  # :disabled and :report both return 0 by construction -- they schedule nothing
  # -- so a caller that reports "N scheduled" stays truthful in every mode.
  def self.perform
    case mode
    when :run then perform_run
    when :report then perform_report
    else perform_disabled
    end
  end

  def self.perform_disabled
    Rails.logger.info(
      "#{LOG_TAG} mode=disabled #{ENABLED_ENV} is not set to 'true' or 'report'; " \
      'skipping without scanning or mutating. 0 accounts processed.'
    )
    0
  end

  def self.perform_report
    # Accumulate the two fields we log, NOT the User records. The candidate
    # stream yields one decrypted account at a time precisely so a large backlog
    # does not have to be resident all at once.
    rows = []
    User.each_expired_offboarding_consent_candidate do |user|
      rows << [user.global_id, user.offboarding_export_reason]
    end
    declined = rows.count { |(_, reason)| reason == 'declined' }
    Rails.logger.info(
      "#{LOG_TAG} mode=report DRY RUN: #{rows.length} account(s) WOULD be exported and " \
      "scheduled for deletion (declined=#{declined} expired=#{rows.length - declined}). " \
      'Nothing was changed.'
    )
    rows.first(MAX_REPORT_LINES).each do |(global_id, reason)|
      Rails.logger.info("#{LOG_TAG} mode=report would sweep user_global_id=#{global_id} reason=#{reason}")
    end
    if rows.length > MAX_REPORT_LINES
      Rails.logger.info(
        "#{LOG_TAG} mode=report ...and #{rows.length - MAX_REPORT_LINES} more, not listed. " \
        'The COUNT above is complete; only the per-account lines are capped.'
      )
    end
    Rails.logger.info(
      "#{LOG_TAG} mode=report set #{ENABLED_ENV}=true to perform the sweep above. 0 accounts processed."
    )
    0
  end

  def self.perform_run
    expired_count = User.process_expired_offboarding_consents!
    Rails.logger.info(
      "#{LOG_TAG} mode=run Processed #{expired_count} expired/declined offboarding consents"
    )
    expired_count
  end
end

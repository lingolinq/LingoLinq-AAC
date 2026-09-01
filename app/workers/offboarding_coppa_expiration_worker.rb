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
# logs, and those are not a place for student or patient identifiers.
module OffboardingCoppaExpirationWorker
  @queue = :default

  ENABLED_ENV = 'COPPA_OFFBOARDING_SWEEP_ENABLED'
  LOG_TAG = '[OffboardingCoppaExpiration]'

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
    candidates = User.expired_offboarding_consent_candidates
    reasons = candidates.map(&:offboarding_export_reason)
    Rails.logger.info(
      "#{LOG_TAG} mode=report DRY RUN: #{candidates.length} account(s) WOULD be exported and " \
      "scheduled for deletion (declined=#{reasons.count('declined')} expired=#{reasons.count('expired')}). " \
      'Nothing was changed.'
    )
    candidates.each do |user|
      Rails.logger.info(
        "#{LOG_TAG} mode=report would sweep user_global_id=#{user.global_id} " \
        "reason=#{user.offboarding_export_reason}"
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

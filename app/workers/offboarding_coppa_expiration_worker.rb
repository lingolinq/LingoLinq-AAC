module OffboardingCoppaExpirationWorker
  @queue = :default

  def self.perform
    expired_count = User.process_expired_offboarding_consents!
    Rails.logger.info("[OffboardingCoppaExpiration] Processed #{expired_count} expired/declined offboarding consents")
    expired_count
  end
end

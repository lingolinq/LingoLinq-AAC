module SupervisorConsentExpirationWorker
  @queue = :default

  def self.perform
    expired_count = SupervisorRelationship.expire_stale_requests!
    Rails.logger.info("[SupervisorConsentExpiration] Expired #{expired_count} stale consent requests")
    expired_count
  end
end

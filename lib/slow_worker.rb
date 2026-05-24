module SlowWorker
  @queue = :slow

  # Slow-queue jobs execute via SlowWorker.perform -> Worker.perform_at, which
  # bypasses Worker.perform, so the request-scoped Thread.current caches must be
  # cleared here too. Otherwise they accumulate across jobs in a long-lived
  # worker process (board copies, exports, BoardDownstreamButtonSet.update_for).
  def self.perform(*args)
    Worker.perform_at(:slow, *args)
  ensure
    Worker.clear_request_thread_caches
  end
end
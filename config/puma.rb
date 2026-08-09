# Use 1 worker in development to rule out multi-worker token validation race (POST /token vs GET /api/*)
workers Integer(ENV['WEB_CONCURRENCY'] || (ENV['RACK_ENV'] == 'development' ? 1 : 3))
threads_count = Integer(ENV['MAX_THREADS'] || 5)
threads threads_count, threads_count

preload_app!

rackup  DefaultRackup if defined?(DefaultRackup)
port        ENV['PORT']     || 3000
# for intranet testing, comment out port command and use this instead:
# bind "tcp://0.0.0.0:3000"
environment ENV['RACK_ENV'] || 'development'

on_worker_boot do
  # Worker specific setup for Rails 4.1+
  # See: https://devcenter.heroku.com/articles/deploying-rails-applications-with-the-puma-web-server#on-worker-boot
  defined?(ActiveRecord::Base) and
    ActiveRecord::Base.establish_connection
  RedisInit.init

  # Warm the Bedrock BAA account assertion off the request path.
  #
  # AiClient.account_verified? probes sts:GetCallerIdentity once per process and
  # caches the result, but it runs INLINE on whichever request reaches it first,
  # with every sibling thread in the worker queued behind its mutex. Doing it
  # here moves that cost to boot, where nothing is waiting on it.
  #
  # Deliberately in on_worker_boot rather than before the fork under
  # preload_app!: the cache is guarded by a Mutex, and holding one across fork
  # leaves it locked forever in the child. Each worker warms its own copy.
  #
  # Best-effort. A failure here must not stop a worker from booting -- the check
  # still runs (and still fails closed) on first use, so the worst case is the
  # latency this is avoiding, not a lost worker. It no-ops when no expected
  # account is configured.
  begin
    AiClient.account_verified? if defined?(AiClient)
  rescue StandardError => e
    warn "[puma] Bedrock account assertion warm-up skipped: #{e.class}: #{e.message}"
  end
end

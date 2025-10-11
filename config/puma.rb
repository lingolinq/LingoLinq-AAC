workers Integer(ENV['WEB_CONCURRENCY'] || 3)
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
end

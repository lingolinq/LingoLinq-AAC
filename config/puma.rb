# Puma configuration for Fly.io deployment
# Optimized for containerized environments with explicit binding

# Number of worker processes (set via WEB_CONCURRENCY env var)
workers Integer(ENV.fetch('WEB_CONCURRENCY', 2))

# Number of threads per worker (set via MAX_THREADS env var)
threads_count = Integer(ENV.fetch('MAX_THREADS', 5))
threads threads_count, threads_count

# Preload the application before forking workers
preload_app!

# Explicitly set the environment
environment ENV.fetch('RAILS_ENV', 'production')

# Bind to 0.0.0.0 to accept connections from Fly.io's proxy
# Fly.io sets PORT automatically, default to 3000 for local testing
port = ENV.fetch('PORT', 3000)
bind "tcp://0.0.0.0:#{port}"

# Log binding information for debugging
puts "=" * 80
puts "Puma starting with configuration:"
puts "  Environment: #{ENV.fetch('RAILS_ENV', 'production')}"
puts "  Workers: #{ENV.fetch('WEB_CONCURRENCY', 2)}"
puts "  Threads: #{threads_count}"
puts "  Binding to: 0.0.0.0:#{port}"
puts "  PORT env var: #{ENV['PORT'] || 'not set (using default 3000)'}"
puts "=" * 80

# Allow puma to be restarted by `rails restart` command
plugin :tmp_restart

on_worker_boot do
  # Worker specific setup for Rails 4.1+
  # Reconnect to database and Redis after forking
  puts "Worker #{Process.pid} booting..."
  
  if defined?(ActiveRecord::Base)
    ActiveRecord::Base.establish_connection
    puts "Worker #{Process.pid}: Database connection established"
  end
  
  if defined?(RedisInit)
    RedisInit.init
    puts "Worker #{Process.pid}: Redis connection established"
  end
  
  puts "Worker #{Process.pid}: Ready to serve requests"
end

# Log when workers are being shut down
on_worker_shutdown do
  puts "Worker #{Process.pid} shutting down..."
end

# Ensure workers are terminated gracefully
worker_timeout 30
worker_shutdown_timeout 10

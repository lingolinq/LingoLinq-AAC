# Check if Redis is available before initializing
# This allows the app to start without Redis for initial deployment
# Background jobs will be disabled until Redis is configured

# Wrap entire initializer in begin/rescue to catch ALL Redis connection errors
begin
  # Skip Redis initialization during asset precompilation (buildpack build phase)
  # Check if we're in asset precompilation by looking for ASSETS_PRECOMPILE or RAILS_GROUPS
  # or if REDIS_URL is not set
  skip_redis = ENV['ASSETS_PRECOMPILE'] == 'true' ||
                ENV['RAILS_GROUPS'] == 'assets' ||
                !( ENV['REDIS_URL'].present? || ENV['REDISCLOUD_URL'].present() ||
                   ENV['OPENREDIS_URL'].present? || ENV['REDISGREEN_URL'].present() ||
                   ENV['REDISTOGO_URL'].present? || ENV['SKIP_VALIDATIONS'] )

  if skip_redis
    puts "⏭️  Skipping Redis initialization (ASSETS_PRECOMPILE: #{ENV['ASSETS_PRECOMPILE']}, RAILS_GROUPS: #{ENV['RAILS_GROUPS']}, REDIS_URL: #{ENV['REDIS_URL'].present? ? 'present' : 'missing'})"

    # Define stub module to prevent method errors
    module RedisInit
      def self.default
        nil
      end

      def self.permissions
        nil
      end

      def self.redis_uri
        nil
      end

      def self.memory
        nil
      end

      def self.cache_token
        'build'
      end

      def self.init
        # No-op during build
      end
    end

    # Also stub Permissable to prevent errors
    require 'permissable' rescue nil
    if defined?(Permissable)
      begin
        [ 'read_logs', 'full', 'modeling', 'read_boards', 'read_profile' ].each{|s| Permissable.add_scope(s) }
        Permissable.set_redis(nil, 'build')
      rescue => e
        puts "⚠️  Permissable initialization skipped: #{e.message}"
      end
    end
  else
    # Normal Redis initialization
    module RedisInit
      cattr_accessor :cache_token

      def self.redis_uri
        redis_url = ENV["REDISCLOUD_URL"] || ENV["OPENREDIS_URL"] || ENV["REDISGREEN_URL"] || ENV["REDISTOGO_URL"] || ENV["REDIS_URL"]
        return nil unless redis_url
        URI.parse(redis_url)
      end

      def self.init
        uri = redis_uri
        # Return early if no Redis URI is available (build phase or Redis not configured)
        unless uri
          puts "⏭️  RedisInit.init: No Redis URI available, skipping initialization"
          return
        end

        ns_suffix = ""
        if !Rails.env.production?
          ns_suffix = "-#{Rails.env}"
        end

        # Wrap Redis connections in begin/rescue to handle connection failures gracefully
        begin
          if defined?(Resque)
            Resque.redis = Redis.new(:host => uri.host, :port => uri.port, :password => uri.password, :timeout => 2, :connect_timeout => 2)
            Resque.redis.namespace = "coughdrop#{ns_suffix}"
          end
          @redis_inst = Redis.new(:host => uri.host, :port => uri.port, :password => uri.password, :timeout => 5, :connect_timeout => 2)
          @default = Redis::Namespace.new("coughdrop-stash#{ns_suffix}", :redis => @redis_inst)
          @permissions = Redis::Namespace.new("coughdrop-permissions#{ns_suffix}", :redis => @redis_inst)
          self.cache_token = 'abc'
        rescue Redis::CannotConnectError, Errno::ECONNREFUSED, SocketError => e
          # Redis connection failed - likely during asset precompilation or initial deployment
          Rails.logger.warn "⚠️  Redis connection failed: #{e.message}"
          Rails.logger.warn "   Continuing without Redis (background jobs disabled)"
          @redis_inst = nil
          @default = nil
          @permissions = nil
          self.cache_token = 'no-redis'
        end
      end

      def self.memory
        return nil unless @redis_inst
        @redis_inst.info(:memory)
      end

      def self.flush_resque_errors
        return unless @redis_inst
        redis = @redis_inst
        key = 'coughdrop:failed'
        redis.type(key)
        len = redis.llen(key)
        if len > 500
          redis.ltrim(key, -500, -1)
        end
        redis = @default
        ['missing_words', 'missing_symbols', 'overridden_parts_of_speech'].each do |key|
          if redis.hlen(key) > 1000
            full = redis.hgetall(key)
            cutoff = full.values.map{|v| v.to_i }.sort.reverse[0, 1000][-1]
            full.each do |k, v|
              redis.hdel(key, k) if v.to_i < cutoff
            end
          end
        end
      end

      def self.errors
        return unless @redis_inst
        uri = RedisInit.redis_uri
        redis = Redis.new(:host => uri.host, :port => uri.port, :password => uri.password)
        key = 'coughdrop:failed'
        redis.type(key)
        len = redis.llen(key)
        puts JSON.pretty_generate(redis.lrange(key, 0, len))
      end

      def self.queue_size(queue)
        return 0 unless defined?(Resque) && Resque.redis
        key = "#{queue}_queue_size"
        size = Resque.redis.get(key)
        if !size
          size = Resque.redis.llen("queue:#{queue}") rescue 0
          Resque.redis.setex(key, size > 30000 ? 1.minute.to_i : 5.minutes.to_i, size.to_s)
        end
        size.to_i
      end

      def self.any_queue_pressure?
        return false unless defined?(Resque) && Resque.redis
        return @any_queue_pressure['res'] if @any_queue_pressure != nil && @any_queue_pressure['ts'] > 1.minute.ago.to_i
        @any_queue_pressure = {
          'res' => (queue_size('slow') > (ENV['QUEUE_SLOW_BOG'] || 20000)) ||
                (queue_size('default') > (ENV['QUEUE_DEFAULT_BOG'] || 10000)) ||
                queue_pressure?,
          'ts' => Time.now.to_i
        }
        !!@any_queue_pressure['res']
      end

      def self.queue_pressure?
        return false unless defined?(Resque) && Resque.redis
        slow_size = queue_size('slow')
        if ENV['QUEUE_MAX'] && slow_size > (ENV['QUEUE_MAX'].to_i / 2)
          slow_ts = ((Resque.redis.get('slow_bog_started') rescue 0) || 0).to_i
          if slow_ts == 0
            Resque.redis.setex('slow_bog_started', 48.hours.to_i, Time.now.to_i)
          elsif slow_ts < 24.hours.ago.to_i
            return true
          end
        end
        !!(ENV['STOP_CACHING'] ||
            ENV['QUEUE_PRESSURE'] ||
            (ENV['QUEUE_MAX'] && slow_size > ENV['QUEUE_MAX'].to_i))
      end

      def self.size_check(verbose=false)
        return unless @redis_inst
        uri = redis_uri
        redis = Redis.new(:host => uri.host, :port => uri.port, :password => uri.password)
        total =  0
        prefixes = {}
        redis.keys.each do |key|
          type = redis.type(key)
          size = 0
          if type == 'list'
            len = redis.llen(key)
            size = redis.lrange(key, 0, len).to_json.length
          elsif type == 'string'
            size = redis.get(key).length
          elsif type == 'none'
          elsif type == 'set'
            size = redis.smembers(key).to_json.length
          elsif type == 'hash'
            size = redis.hgetall(key).to_json.length
          else
            raise "unknown type: #{type}"
          end
          total += size
          key = key.sub(/jobs_from_/, 'jobs_from/')
          key = key.sub(/coughdrop:stat:/, 'coughdrop:stat/')
          prefix = key.split(/\//)[0]
          prefixes[prefix] = (prefixes[prefix] || 0) + size
          if size > 500000
            puts "#{key}\t#{size}"
          elsif verbose
            puts key
          end
        end
        puts JSON.pretty_generate(prefixes)
        prefixes.to_a.sort{|k, v| v.to_i }.each{|k, v| puts "#{k}\t\t#{v}" }
        puts "total size\t#{total}"
      end

      def self.default
        @default
      end

      def self.permissions
        @permissions
      end
    end

    RedisInit.init

    require 'permissable'
    [ 'read_logs', 'full', 'modeling', 'read_boards', 'read_profile' ].each{|s| Permissable.add_scope(s) }
    Permissable.set_redis(RedisInit.permissions, RedisInit.cache_token)

    Rails.logger.info "✅ Redis initialized successfully"
  end

rescue Redis::CannotConnectError, Errno::ECONNREFUSED, SocketError, StandardError => e
  # Redis connection or initialization failed
  puts "=" * 80
  puts "⚠️  Redis initialization failed: #{e.class} - #{e.message}"
  puts "   Continuing without Redis (background jobs disabled)"
  puts "   This is expected during asset precompilation"
  puts "=" * 80

  # Define fallback stub module
  module RedisInit
    def self.default
      nil
    end

    def self.permissions
      nil
    end

    def self.redis_uri
      nil
    end

    def self.memory
      nil
    end

    def self.cache_token
      'error-fallback'
    end
  end

  # Stub Permissable if it's defined
  if defined?(Permissable)
    begin
      [ 'read_logs', 'full', 'modeling', 'read_boards', 'read_profile' ].each{|s| Permissable.add_scope(s) rescue nil }
      Permissable.set_redis(nil, 'error-fallback') rescue nil
    rescue => perm_error
      puts "⚠️  Permissable stub failed: #{perm_error.message}"
    end
  end
end

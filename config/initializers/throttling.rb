require 'rack/attack'

module Throttling
  NORMAL_CUTOFF = 150
  # Relax limits in development to avoid 429 during login testing; test env keeps strict limits for specs
  TOKEN_CUTOFF = Rails.env.development? ? 200 : 20
  PROTECTED_CUTOFF = Rails.env.development? ? 100 : 10
  class LingoLinq::Application < Rails::Application
    uri = RedisInit.redis_uri
    unless ENV['SKIP_VALIDATIONS']
      raise "redis URI needed for throttling" unless uri
      redis = Redis.new(:host => uri.host, :port => uri.port, :password => uri.password)
      redis = Redis::Namespace.new("throttling", :redis => redis)
      Rack::Attack.cache.store = Rack::Attack::StoreProxy::RedisProxy.new(redis)
    end

    # Always register throttle rules (specs override cache store to test throttling)
    protected_paths = ['oauth2/token', '^/token', 'api/v1/forgot_password', 'api/v1/gifts/code_check',
          'api/v1/boards/.+/imports', 'api/v1/boards/.+/download', 'api/v1/boards/.+/rename',
          'api/v1/users/\w+/replace_board', 'api/v1/users/\w+/rename', 'auth/lookup', 'saml/tmp_token',
          'api/v1/purchase_gift', 'api/v1/messages', 'api/v1/logs/code_check']
    re = /#{protected_paths.join('|')}/

    limit_proc = proc {|req|
      if req.path.match(/^\/token/)
        TOKEN_CUTOFF
      elsif req.path.match(re)
        PROTECTED_CUTOFF
      else
        NORMAL_CUTOFF
      end
    }
    period_proc = proc {|req| req.path.match(re) ? 3.seconds : 3.seconds}
    Rack::Attack.throttle('general', :limit => limit_proc, :period => period_proc) do |req|
      req.ip
    end

    config.middleware.use Rack::Attack
  end
end
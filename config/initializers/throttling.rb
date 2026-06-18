require 'rack/attack'

module Throttling
  NORMAL_CUTOFF = 150
  # Relax limits in development to avoid 429 during login testing; test env keeps strict limits for specs
  TOKEN_CUTOFF = Rails.env.development? ? 200 : 20
  PROTECTED_CUTOFF = Rails.env.development? ? 100 : 10

  # Paths that get the stricter PROTECTED_CUTOFF rate limit. Each entry is an
  # unanchored regex fragment matched against req.path, so 'api/v1/messages'
  # also covers '/api/v1/messages/...'. Exposed as a module constant (instead of
  # a local in the Application body) so the path classification is unit-testable
  # without booting Rack::Attack; the Application body builds the same regex from
  # this list, so runtime behavior is unchanged.
  PROTECTED_PATHS = [
    'oauth2/token', '^/token', 'api/v1/forgot_password', 'api/v1/gifts/code_check',
    'api/v1/boards/.+/imports', 'api/v1/boards/.+/download', 'api/v1/boards/.+/rename',
    'api/v1/users/\w+/replace_board', 'api/v1/users/\w+/rename', 'auth/lookup', 'saml/tmp_token',
    'api/v1/purchase_gift', 'api/v1/messages', 'api/v1/beta_feedback_recordings', 'api/v1/logs/code_check',
    # Supervisor/parent consent decisions: brute-forceable consent-token and
    # approval endpoints (LL-ca38d4d99e). Covers the collection consent_response,
    # the per-relationship consent_response, and the approve/deny actions.
    'api/v1/supervisor_relationships/consent_response',
    'api/v1/supervisor_relationships/.+/consent_response',
    'api/v1/supervisor_relationships/.+/approve',
    'api/v1/supervisor_relationships/.+/deny',
    # Org bulk user-claim: abusable account-claim/enumeration surface (LL-e65d34f109).
    'api/v1/organizations/.+/claim_user'
  ].freeze
  PROTECTED_RE = /#{PROTECTED_PATHS.join('|')}/

  class LingoLinq::Application < Rails::Application
    uri = RedisInit.redis_uri
    unless ENV['SKIP_VALIDATIONS']
      raise "redis URI needed for throttling" unless uri
      redis = Redis.new(RedisInit.redis_options(uri))
      redis = Redis::Namespace.new("throttling", :redis => redis)
      Rack::Attack.cache.store = Rack::Attack::StoreProxy::RedisProxy.new(redis)
    end

    # Always register throttle rules (specs override cache store to test throttling)
    re = Throttling::PROTECTED_RE

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
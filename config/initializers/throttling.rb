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
    'api/v1/organizations/.+/claim_user',
    # Registration, 2FA enrollment, and SAML assertion consumption: account
    # creation/auth surfaces that were unthrottled (LL-56f0f19fca). The
    # 'api/v1/users' entry is anchored to the collection (create/index) ONLY so
    # the many per-user member endpoints keep their normal NORMAL_CUTOFF limit.
    'api/v1/users(\.json)?$',
    'api/v1/users/.+/confirm_registration',
    'api/v1/users/.+/2fa',
    'saml/consume',
    # Password-reset code verification: exchanges a reset code for a reset token
    # (users#password_reset), so an unthrottled endpoint invites reset-code
    # brute-forcing. Follow-up to the audit rate-limit pass; sibling of the
    # already-protected forgot_password.
    'api/v1/users/.+/password_reset',
    # Unauthenticated start-code lookup (organizations#start_code_lookup, routed
    # at api/v1/start_code). Verifier lengthened to 16 chars, but legacy 5-char
    # links are still accepted; throttling keeps that short prefix from being
    # brute-forced during the transition (LL-4e243f3e16).
    'api/v1/start_code'
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
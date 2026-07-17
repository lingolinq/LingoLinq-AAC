# Cutover write-freeze (Render -> GCP Cloud Run migration, Phase 5).
#
# When the ops env var WRITE_FREEZE is set, the Rack middleware below rejects
# data-mutating requests with HTTP 503 + Retry-After so that no late or
# stale-DNS write lands on the soon-to-be-abandoned Render database during the
# cutover freeze and soak. Reads pass through untouched (users can still view
# and speak their boards), and a minimal auth allowlist keeps sign-in working so
# users are not locked out for the duration of the soak.
#
# This is an operator-controlled infrastructure maintenance mode, not a
# user-facing product feature, so it is gated by an ENV var rather than an
# AVAILABLE_FRONTEND_FEATURES flag (analogous to other env-gated infra behavior
# in this app). The only user-facing surface is the maintenance response, whose
# human-readable copy is routed through i18n (config/locales/en.yml).
#
# Default (WRITE_FREEZE unset): zero behavior change. The middleware is always
# in the stack but is inert until the operator sets WRITE_FREEZE at freeze start
# and unsets it on rollback. See scripts/gcp/PHASE5-CUTOVER-RUNBOOK.md step 1.
module WriteFreeze
  # Mutating HTTP verbs. GET / HEAD / OPTIONS always pass through.
  MUTATING_METHODS = %w[POST PUT PATCH DELETE].freeze

  # Seconds to advertise in the Retry-After header. The offline/sync client
  # should treat 503 + Retry-After as "retry later" (against current DNS, which
  # the 60s TTL points at GCP), not "drop the write".
  RETRY_AFTER_SECONDS = 120

  # Auth/session routes that MUST stay writable during the freeze, so existing
  # EXISTING users can still sign in. Each entry is an unanchored regex fragment
  # matched against the request path (mirrors Throttling::PROTECTED_PATHS), so
  # 'oauth2/token' also covers 'oauth2/token/login'.
  #
  # IMPORTANT - accepted data loss: these auth routes DO perform DB writes at
  # login (a Device row + token via generate_token!, and for SSO an external-auth
  # linkage). Those writes land on the abandoned Render DB and are LOST at cutover,
  # so a user who signs in during the soak must sign in again afterward. That is
  # the accepted trade for not locking existing users out for the whole soak.
  # Enumerate the accepted-loss set in the runbook (step 1).
  #
  # NEW-ACCOUNT creation is deliberately NOT allowlisted, so no brand-new
  # persisted user/boards are written to the soon-to-be-abandoned DB:
  #   - auth/google/signup (session#google_signup_complete -> User.create_from_google_signup!
  #     + UserBoardProvisioner.provision_for) is omitted; a new Google user gets a
  #     503 during the soak and signs up against GCP afterward.
  #   - forgot_password / password_reset are omitted (write a reset token lost on
  #     the abandoned DB; not needed to sign in with existing credentials).
  # saml/consume is kept (it both logs in EXISTING SAML users and can provision new
  # ones; on this single route we favor not locking out existing SSO users, and
  # accept that a brand-new SAML user provisioned mid-soak is lost - documented).
  #
  # All other data mutations (board saves, button/image uploads, LogSession
  # creation, profile/goal/settings writes) are rejected by design - those are
  # exactly the writes that must not diverge from Cloud SQL.
  ALLOWLIST_PATHS = [
    'oauth2/token',          # session#oauth_token / oauth_login / oauth_logout
    '^/token',               # session#token (browser password grant)
    'wait/token',            # session#token_wait
    'api/v1/token/refresh',  # session#oauth_token_refresh
    'api/v1/auth/admin',     # session#auth_admin
    'auth/lookup',           # session#auth_lookup
    'auth/google/link',      # session#google_link_complete (links SSO to EXISTING user)
    'saml/tmp_token',        # session#saml_tmp_token (SSO sign-in)
    'saml/consume'           # session#saml_consume (SSO assertion; see note above)
  ].freeze
  ALLOWLIST_RE = /#{ALLOWLIST_PATHS.join('|')}/

  # GET routes that mutate state despite being GET, so a verb-only denylist would
  # let them write to the abandoned DB during the freeze. Found via a routes audit
  # (dual-review, PR #472); each is an unanchored regex fragment like ALLOWLIST_PATHS.
  # NOTE: this is an explicit, maintained list - a GET-with-side-effects is an
  # anti-pattern, so a new one added later would NOT be covered until listed here.
  # A DB-level read-only safeguard would be the robust defense-in-depth (follow-up).
  SIDE_EFFECT_GET_PATHS = [
    'upload_success',               # api/{images,sounds,videos}/:id/upload_success -> record.save
    '^/goal_status/',               # boards#log_goal_status -> UserGoal.process_status_from_code (log write)
    '^/parental_consent/complete',   # parental_consents#complete -> grant_parental_consent! + Device writes (COPPA)
    '^/parental_consent/revoke'      # parental_consents#revoke -> revoke_parental_consent! (COPPA)
  ].freeze
  SIDE_EFFECT_GET_RE = /#{SIDE_EFFECT_GET_PATHS.join('|')}/

  # True when the operator has switched the freeze on. Read at request time so
  # the mode follows the env var without a code change.
  def self.enabled?
    ENV['WRITE_FREEZE'].to_s.strip.match?(/\A(1|true|yes|on)\z/i)
  end

  def self.mutating?(method)
    MUTATING_METHODS.include?(method.to_s.upcase)
  end

  def self.allowlisted?(path)
    !path.to_s.match(ALLOWLIST_RE).nil?
  end

  # A GET (or other non-mutating verb) that nonetheless writes to the DB.
  def self.side_effect_get?(path)
    !path.to_s.match(SIDE_EFFECT_GET_RE).nil?
  end

  # Whether this request should be rejected given the current freeze state.
  # Rejects standard mutating verbs AND known side-effect GETs, except the auth
  # allowlist. The allowlist is checked first so an auth route is never blocked.
  def self.reject?(method, path)
    return false unless enabled?
    return false if allowlisted?(path)

    mutating?(method) || side_effect_get?(path)
  end

  # Rack middleware enforcing the write-freeze. Placed in the Rack stack (not a
  # controller before_action) so it uniformly covers the lib/json_api write
  # paths and any non-controller endpoints before routing.
  class Middleware
    def initialize(app)
      @app = app
    end

    def call(env)
      return @app.call(env) unless WriteFreeze.reject?(env['REQUEST_METHOD'], env['PATH_INFO'])

      rejection(env)
    end

    private

    def rejection(env)
      if wants_json?(env)
        body = { 'error' => message, 'retry_after' => WriteFreeze::RETRY_AFTER_SECONDS }.to_json
        [503, headers('application/json', body), [body]]
      else
        body = html_body
        [503, headers('text/html; charset=utf-8', body), [body]]
      end
    end

    def headers(content_type, body)
      {
        'Content-Type' => content_type,
        'Retry-After' => WriteFreeze::RETRY_AFTER_SECONDS.to_s,
        'Content-Length' => body.bytesize.to_s
      }
    end

    # JSON for API/sync clients; HTML maintenance page only for ordinary browser
    # requests. Mutating verbs (POST/PUT/PATCH/DELETE) are API/sync traffic and
    # default to JSON even when Accept is */* or absent, so a sync client never
    # gets an HTML body where it expects JSON (dual-review, PR #472). The HTML
    # page is reached only by browser navigations, which are GETs - e.g. the
    # side-effect GET /parental_consent/complete, which correctly renders HTML.
    def wants_json?(env)
      return true if WriteFreeze.mutating?(env['REQUEST_METHOD'])

      path = env['PATH_INFO'].to_s
      accept = env['HTTP_ACCEPT'].to_s
      path.start_with?('/api/') || path.end_with?('.json') || accept.include?('application/json')
    end

    def message
      I18n.t('write_freeze.body')
    end

    def html_body
      title = I18n.t('write_freeze.title')
      "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" \
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" \
        "<title>#{ERB::Util.html_escape(title)}</title></head>" \
        "<body style=\"font-family: sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem;\">" \
        "<h1>#{ERB::Util.html_escape(title)}</h1>" \
        "<p>#{ERB::Util.html_escape(message)}</p></body></html>"
    end
  end
end

class LingoLinq::Application < Rails::Application
  # Always in the stack; inert unless WRITE_FREEZE is set (see above). Appended
  # so it runs after the standard middleware but still before the router, which
  # is the point - it must precede routing and JSON-API handling.
  config.middleware.use WriteFreeze::Middleware
end

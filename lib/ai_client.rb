# frozen_string_literal: true

require 'anthropic'
require 'aws-sdk-core'
require 'digest'

# Central construction point for the runtime AI (Claude) client.
#
# Every in-app AI feature (Tier 1 -- word prediction, board generation,
# prediction seeding, eval narration) that may process student/patient data
# routes to Anthropic models on AWS Bedrock, signed with dedicated AWS
# credentials, so payloads stay on the BAA/HIPAA-appropriate path described in
# CLAUDE.md ("runtime AAC AI ... uses dedicated ... BAA/HIPAA-appropriate API
# credentials, currently being set up through Claude via AWS").
#
# The prior direct api.anthropic.com route (ANTHROPIC_API_KEY) is intentionally
# NOT constructed at runtime. There is no fallback to it: if Bedrock is not
# configured, `build` returns nil and callers degrade to their existing
# "AI is not configured" path rather than silently egressing on a non-BAA route.
#
# TWO BEDROCK PLANES
# ------------------
# AWS exposes Anthropic models over two separate planes, with SEPARATE model
# catalogs and SEPARATE entitlements. Both stay inside the AWS account BAA
# boundary (docs/legal/AWS_BAA_ACCEPTED.md); the choice is about what the
# account can actually invoke, not about data protection.
#
#   classic (default) -- bedrock-runtime.<region>.amazonaws.com, SigV4.
#     Verified working in account 239044785114 on 2026-08-01 for Haiku 4.5.
#     Model ids MUST be cross-region INFERENCE PROFILE ids (the `us.` form);
#     the bare foundation-model id returns ValidationException ("on-demand
#     throughput isn't supported").
#
#   mantle -- bedrock-mantle.<region>.api.aws/anthropic/v1/messages.
#     Carries models classic does not (notably Opus 4.7). As of 2026-08-01 this
#     account is NOT entitled: every model returns 403 "not available for this
#     account", even with admin credentials and `bedrock-mantle:CreateInference`
#     on Resource "*", so the blocker is entitlement, not IAM. An access request
#     is open with AWS. When it is granted, set BEDROCK_PLANE=mantle -- no code
#     change required.
#
# Select with BEDROCK_PLANE=classic|mantle. Default is classic because that is
# the plane this account can actually invoke today.
module AiClient
  module_function

  CLASSIC_PLANE = 'classic'
  MANTLE_PLANE = 'mantle'

  # Cross-region inference-profile prefixes. An id already carrying one of these
  # is a fully-resolved profile id and must be passed through untouched.
  PROFILE_PREFIXES = %w[us. eu. apac.].freeze

  # Maps the plane-neutral logical alias (the form used by the eval-narrator
  # allowlist, the Article 50 disclosures, and the DEFAULT_MODEL constants) to
  # the classic-plane inference-profile id that actually invokes.
  #
  # Only VERIFIED-invokable models belong here. Add a row only after confirming
  # the profile id returns 200 for this account, e.g.
  #   aws bedrock-runtime invoke-model --model-id <profile-id> ...
  # An alias with no row falls through unchanged and will fail loudly with
  # ValidationException rather than silently invoking something else.
  CLASSIC_PROFILE_IDS = {
    'anthropic.claude-haiku-4-5' => 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
  }.freeze

  # Trailing date and/or version suffix on a model id, e.g. the `-20251001` in
  # `claude-haiku-4-5-20251001` (the exact value the old .env.example documented
  # for ANTHROPIC_MODEL) or the `-v1:0` in a full foundation-model id.
  LEGACY_VERSION_SUFFIX = /(?:-\d{8})?(?:-v\d+(?::\d+)?)?\z/

  # Tier 1 runtime model allowlist. ANTHROPIC_MODEL is an operator override read by
  # ai_word_predictor, ai_board_generator and ai_prediction_generator -- all three
  # carry student/patient data and, unlike EvalNarrator, had NO model gate of their
  # own. Without this, an env var could point them at any model Bedrock will serve,
  # including a Covered Model (Fable 5 / Mythos 5, which CLAUDE.md bars from Tier 1
  # because they carry mandatory 30-day retention) or a non-Anthropic vendor, which
  # would also falsify the "Anthropic-only runtime" claim in the capability ledger
  # and the Article 50 disclosures.
  #
  # Entries are plane-neutral aliases. Extend ONLY after confirming a model is
  # HIPAA-eligible on the BAA'd path and is not a mandatory-retention Covered Model.
  ALLOWED_RUNTIME_MODELS = %w[
    anthropic.claude-haiku-4-5
  ].freeze

  # AWS account the Bedrock credential MUST resolve to. See account_verified?.
  # Deliberately a variable rather than a literal so an account migration is a
  # config change, not a code change (finding LL-1b0d78dbe6).
  EXPECTED_ACCOUNT_ENV = 'BEDROCK_EXPECTED_AWS_ACCOUNT'

  # How long a FAILED account check is remembered before it is retried. A
  # SUCCESS is cached for the life of the process, because a credential's
  # account binding cannot change without the credential changing (and the
  # cache is keyed on the credential). A failure must expire, or one transient
  # STS error would darken AI for that whole process.
  ACCOUNT_CHECK_RETRY_AFTER = 60

  # Bounds how long a request thread can block on the STS probe. The check runs
  # once per process per credential, but it runs inline on whichever request
  # gets there first, so it must not hang.
  ACCOUNT_CHECK_TIMEOUT = 5

  @account_check_mutex = Mutex.new
  @account_checks = {}

  # Reduces any id form to the plane-neutral alias used by ALLOWED_RUNTIME_MODELS.
  #
  # This is what closes the injection path: a regional inference-profile id such as
  # `us.anthropic.claude-fable-5-20260101-v1:0` is passed through untouched by
  # bedrock_model (by design -- it is already wire-resolved), so an allowlist that
  # only understood bare aliases would never see it. Stripping the region prefix and
  # the date/version suffix first means the profile form and the alias form collapse
  # to the same key and are checked identically.
  def canonical_alias(model_id)
    id = model_id.to_s.strip
    PROFILE_PREFIXES.each { |prefix| id = id.delete_prefix(prefix) }
    id = "anthropic.#{id}" unless id.start_with?('anthropic.')
    id.sub(LEGACY_VERSION_SUFFIX, '')
  end

  def allowed_runtime_model?(model_id)
    ALLOWED_RUNTIME_MODELS.include?(canonical_alias(model_id))
  end

  # Resolves the ANTHROPIC_MODEL override for a Tier 1 seam and returns the WIRE id.
  #
  # Fail-closed: an override outside ALLOWED_RUNTIME_MODELS is REFUSED and the vetted
  # default is used instead, so runtime data can never egress to an unvetted model.
  # Refusing-and-defaulting (rather than raising) is deliberate: raising would take
  # the whole AI feature down over a typo in an env var, while still not making the
  # unvetted call. The refusal is logged so a bad override is visible rather than
  # silently ignored.
  def runtime_model(default_alias)
    override = ENV['ANTHROPIC_MODEL'].to_s.strip
    return bedrock_model(default_alias) if override.empty?

    return bedrock_model(override) if allowed_runtime_model?(override)

    emit_log(
      :warn,
      "[AiClient] ANTHROPIC_MODEL=#{override.inspect} is not in ALLOWED_RUNTIME_MODELS " \
      "(#{ALLOWED_RUNTIME_MODELS.join(', ')}); refusing the override and using " \
      "#{default_alias.inspect} instead."
    )
    bedrock_model(default_alias)
  end

  # Which Bedrock plane to construct. Anything other than an explicit "mantle"
  # resolves to classic, so a typo degrades to the working plane rather than to
  # an unentitled one.
  def bedrock_plane
    ENV['BEDROCK_PLANE'].to_s.strip.downcase == MANTLE_PLANE ? MANTLE_PLANE : CLASSIC_PLANE
  end

  # AWS region for the Bedrock endpoint. Prefers a Bedrock-specific override so
  # the AI route can live in a different region than S3/SES if needed, then
  # falls back to the app's existing AWS_REGION convention (see Uploader) and the
  # standard AWS SDK env var.
  def bedrock_region
    (ENV['BEDROCK_AWS_REGION'].presence ||
     ENV['AWS_REGION'].presence ||
     ENV['AWS_DEFAULT_REGION'].presence).to_s.strip
  end

  # Resolves a complete AWS credential pair for Bedrock SigV4 signing.
  #
  # Pairs are selected atomically so a partial secret rollout cannot mix a
  # dedicated Bedrock access key with a generic S3/SES secret (or vice versa).
  # Preference order:
  #   1. BEDROCK_AWS_KEY + BEDROCK_AWS_SECRET (dedicated AI principal)
  #   2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (standard SDK names for local)
  #
  # Intentionally does NOT fall back to AWS_KEY / AWS_SECRET. Those are the
  # Cloud Run S3/SES least-privilege credentials
  # (`scripts/gcp/iam/lingolinq-cloudrun-s3-ses-policy.json`) and lack Bedrock
  # invoke permissions. Falling back to them made `configured?` true while every
  # AI request was AccessDenied.
  def aws_credentials
    dedicated = credential_pair(ENV['BEDROCK_AWS_KEY'], ENV['BEDROCK_AWS_SECRET'])
    return dedicated if dedicated

    credential_pair(ENV['AWS_ACCESS_KEY_ID'], ENV['AWS_SECRET_ACCESS_KEY'])
  end

  def aws_key
    aws_credentials&.fetch(:access_key).to_s
  end

  def aws_secret
    aws_credentials&.fetch(:secret_access_key).to_s
  end

  # True when enough AWS configuration is present to construct a Bedrock client.
  def configured?
    bedrock_region.present? && aws_credentials.present?
  end

  # Resolves a model id to the form the ACTIVE plane actually accepts, and
  # returns it. This is the wire id: callers pass it straight to
  # `client.messages.create(model:)`.
  #
  # 1. An id already carrying a regional inference-profile prefix (`us.` etc.)
  #    is fully resolved and passes through untouched. The previous version
  #    prefixed unconditionally when the id did not start with `anthropic.`,
  #    which mangled `us.anthropic.claude-haiku-4-5-20251001-v1:0` into
  #    `anthropic.us.anthropic.claude-...`.
  # 2. Otherwise the id is normalized to the `anthropic.`-prefixed alias, so an
  #    operator override that forgets the prefix still resolves.
  # 3. On the classic plane the alias is then mapped to its inference-profile id
  #    (classic rejects bare foundation-model ids for these models). On mantle
  #    the alias IS the wire form, so it is returned as-is.
  def bedrock_model(model_id)
    id = model_id.to_s.strip
    return id if id.empty?
    return id if PROFILE_PREFIXES.any? { |prefix| id.start_with?(prefix) }

    alias_id = id.start_with?('anthropic.') ? id : "anthropic.#{id}"
    return alias_id unless bedrock_plane == CLASSIC_PLANE

    mapped = CLASSIC_PROFILE_IDS[alias_id]
    return mapped if mapped

    # 4. A dated/versioned override still resolves. Deployments configured off the
    #    previous docs carry ANTHROPIC_MODEL=claude-haiku-4-5-20251001, which
    #    normalizes to an alias with no map row and would otherwise be sent to
    #    classic as a bare id and rejected. Retry the lookup against the base name.
    #    This can never substitute a DIFFERENT model: the base name is preserved,
    #    so an unrelated id simply misses the map again. On a miss the operator's
    #    ORIGINAL id is returned, not the stripped one, so the failure names what
    #    they actually configured.
    base = alias_id.sub(LEGACY_VERSION_SUFFIX, '')
    CLASSIC_PROFILE_IDS.fetch(base, alias_id)
  end

  # Builds the Bedrock client for the active plane, or nil when AWS is not
  # configured (callers treat nil as "AI is not configured").
  #
  # Keyword note -- the two clients do NOT share a secret-key keyword, and
  # passing the wrong one raises ArgumentError:
  #   Anthropic::BedrockMantleClient => aws_secret_access_key
  #   Anthropic::BedrockClient       => aws_secret_key
  # Both sign with SigV4 via aws-sdk-core. BedrockClient additionally hard
  # `require`s aws-sdk-bedrockruntime at construction (a guard; it uses only
  # Aws::Sigv4::Signer and Aws::EventStream::Decoder), which is why that gem is
  # in the Gemfile.
  def build
    return nil unless configured?
    return nil unless account_verified?

    creds = aws_credentials
    if bedrock_plane == MANTLE_PLANE
      Anthropic::BedrockMantleClient.new(
        aws_region: bedrock_region,
        aws_access_key: creds[:access_key],
        aws_secret_access_key: creds[:secret_access_key],
        base_url: mantle_base_url
      )
    else
      Anthropic::BedrockClient.new(
        aws_region: bedrock_region,
        aws_access_key: creds[:access_key],
        aws_secret_key: creds[:secret_access_key],
        base_url: classic_base_url
      )
    end
  end

  # Endpoint for the active plane, derived from the region and passed EXPLICITLY to
  # the client.
  #
  # This is a Tier 1 egress control, not a convenience. Both gem clients resolve
  # their endpoint as `base_url ||= ENV.fetch("ANTHROPIC_BEDROCK_BASE_URL", ...)`
  # (Mantle: ANTHROPIC_BEDROCK_MANTLE_BASE_URL). Because that is `||=`, leaving
  # base_url nil hands an environment variable the power to silently redirect every
  # runtime AI request -- still SigV4-signed -- to an arbitrary host, off the BAA'd
  # AWS path and out of scope of scripts/ai-endpoint-guard.sh, which only inspects
  # construction sites in source. Passing the value explicitly wins over the `||=`
  # and makes the destination a property of the code rather than the environment.
  def classic_base_url
    "https://bedrock-runtime.#{bedrock_region}.amazonaws.com"
  end

  # Mirrors the gem's own Mantle derivation, including the /anthropic path segment.
  def mantle_base_url
    "https://bedrock-mantle.#{bedrock_region}.api.aws/anthropic"
  end

  # True when the client class for the active plane is loaded. Seams use this
  # (rather than naming one plane's constant) to decide whether an AI call is
  # even constructible.
  def client_defined?
    if bedrock_plane == MANTLE_PLANE
      defined?(::Anthropic::BedrockMantleClient) ? true : false
    else
      defined?(::Anthropic::BedrockClient) ? true : false
    end
  end

  # The account id the Bedrock credential must belong to, digits only.
  #
  # Normalized because the compliance corpus writes this id both ways: AWS
  # returns `239044785114`, while docs/legal/AWS_BAA_ACCEPTED.md and the
  # capability ledger also quote the grouped form `2390-4478-5114`. Comparing
  # raw strings would make a correctly-configured deployment fail closed over
  # punctuation.
  def expected_aws_account
    ENV[EXPECTED_ACCOUNT_ENV].to_s.gsub(/\D/, '')
  end

  # True when the Bedrock credential provably belongs to the BAA'd AWS account.
  #
  # WHY THIS EXISTS (finding LL-1b0d78dbe6, high, HIPAA)
  # ----------------------------------------------------
  # docs/legal/AWS_BAA_ACCEPTED.md is scoped to a SINGLE AWS account, and its
  # stated operative condition is that Bedrock calls run under that account.
  # Nothing enforced it. `build` signed with whichever pair happened to be in
  # the environment and asserted nothing about whose account it was, so a
  # credential from any other account would have put PHI-bearing inference
  # outside BAA coverage while every check in this repo stayed green. That is
  # the exact gap that let an unverifiable verification claim stand in an
  # attested compliance document from 2026-07-27 to 2026-08-01, and it was
  # live for ~22 hours on revision 00013-76w with no automated check present.
  #
  # WHERE THIS LIVES, AND WHY IT IS NOT IN CI
  # -----------------------------------------
  # The finding proposes a post-deploy step in .github/workflows/deploy-cloudrun.yml.
  # That step would run as the CI service account, NOT under BEDROCK_AWS_KEY, so
  # it would first have to READ that secret -- which means granting the deploy SA
  # `secretmanager.secretAccessor`. The workflow deliberately refuses that grant:
  # its presence probe uses `gcloud secrets versions list` rather than
  # `versions access` specifically so the deploy SA cannot read every app secret.
  # Asserting here instead runs under the exact credential `build` is about to
  # use, by construction, and needs no new privilege. CI keeps the narrower half
  # of the control: assert the expected-account variable is SET (a deploy that
  # forgets it must fail, not silently skip the check below).
  #
  # FAIL DIRECTIONS, each chosen deliberately
  # -----------------------------------------
  #   expected account unset -> SKIP, return true. This deployment asserts no BAA
  #     coverage (local dev, CI, test). Production sets it in APP_ENV_VARS_STATIC
  #     and the deploy fails without it, so "unset" cannot quietly happen there.
  #   account mismatch       -> REFUSE. `build` returns nil, and every caller
  #     already treats nil as "AI is not configured" and degrades. No inference
  #     call is made off the BAA'd account.
  #   STS itself fails       -> REFUSE. An UNVERIFIABLE credential must not be
  #     used. Failing open here would mean a transient network error silently
  #     disables the control instead of the feature, which is the failure mode
  #     this finding is about. Remembered only briefly so it self-heals.
  #
  # Note `sts:GetCallerIdentity` requires no IAM permission of its own, so a
  # denial here means the credential itself is bad, not under-privileged.
  def account_verified?
    expected = expected_aws_account
    return true if expected.empty?

    creds = aws_credentials
    return false unless creds

    # Keyed on the credential AND the expectation, so rotating either forces a
    # fresh check. Digested rather than stored plainly: this hash outlives the
    # call, and secret material should not sit in a long-lived key.
    fingerprint = Digest::SHA256.hexdigest(
      [creds[:access_key], creds[:secret_access_key], bedrock_region, expected].join("\x00")
    )

    @account_check_mutex.synchronize do
      cached = @account_checks[fingerprint]
      if cached && (cached[:ok] || (Time.now - cached[:at]) < ACCOUNT_CHECK_RETRY_AFTER)
        return cached[:ok]
      end

      ok = verify_account(creds, expected)
      @account_checks[fingerprint] = { ok: ok, at: Time.now }
      ok
    end
  end

  # Forgets every cached account verification. For credential rotation and for
  # tests; not needed on the normal path.
  def reset_account_verification!
    @account_check_mutex.synchronize { @account_checks = {} }
    nil
  end

  # One STS probe under the exact Bedrock credential. Never logs credential
  # material; an AWS account id is an identifier, not a secret, and is already
  # quoted throughout docs/legal.
  def verify_account(creds, expected)
    sts = Aws::STS::Client.new(
      region: bedrock_region,
      access_key_id: creds[:access_key],
      secret_access_key: creds[:secret_access_key],
      retry_limit: 1,
      http_open_timeout: ACCOUNT_CHECK_TIMEOUT,
      http_read_timeout: ACCOUNT_CHECK_TIMEOUT
    )
    actual = sts.get_caller_identity.account.to_s.gsub(/\D/, '')
    return true if actual == expected

    emit_log(
      :error,
      "[AiClient] REFUSING to build a Bedrock client: the configured credential resolves to " \
      "AWS account #{actual.inspect}, but #{EXPECTED_ACCOUNT_ENV} requires #{expected.inspect}. " \
      'Inference under a different account is outside the AWS BAA boundary ' \
      '(docs/legal/AWS_BAA_ACCEPTED.md). AI features will fail closed until this is corrected.'
    )
    false
  rescue StandardError => e
    emit_log(
      :error,
      "[AiClient] REFUSING to build a Bedrock client: could not verify the credential's AWS " \
      "account via sts:GetCallerIdentity (#{e.class}: #{e.message}). An unverified credential " \
      'is not used, so AI features fail closed rather than risk egress outside the BAA boundary.'
    )
    false
  end
  private_class_method :verify_account

  # Rails may not be loaded (rake, standalone lib use), and Rails.logger is nil
  # early in boot.
  def emit_log(level, message)
    return unless defined?(Rails) && Rails.respond_to?(:logger) && Rails.logger

    Rails.logger.public_send(level, message)
  end
  private_class_method :emit_log

  # Returns {access_key:, secret_access_key:} only when BOTH halves are present
  # and non-blank after strip; otherwise nil.
  def credential_pair(access_key, secret_access_key)
    key = access_key.to_s.strip
    secret = secret_access_key.to_s.strip
    return nil if key.empty? || secret.empty?

    { access_key: key, secret_access_key: secret }
  end
  private_class_method :credential_pair
end

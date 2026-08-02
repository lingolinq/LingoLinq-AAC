# frozen_string_literal: true

require 'anthropic'

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

    CLASSIC_PROFILE_IDS.fetch(alias_id, alias_id)
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

    creds = aws_credentials
    if bedrock_plane == MANTLE_PLANE
      Anthropic::BedrockMantleClient.new(
        aws_region: bedrock_region,
        aws_access_key: creds[:access_key],
        aws_secret_access_key: creds[:secret_access_key]
      )
    else
      Anthropic::BedrockClient.new(
        aws_region: bedrock_region,
        aws_access_key: creds[:access_key],
        aws_secret_key: creds[:secret_access_key]
      )
    end
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

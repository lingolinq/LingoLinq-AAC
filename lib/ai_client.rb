# frozen_string_literal: true

require 'anthropic'

# Central construction point for the runtime AI (Claude) client.
#
# Every in-app AI feature (Tier 1 -- word prediction, board generation,
# prediction seeding, eval narration) that may process student/patient data
# routes to Anthropic models on AWS Bedrock via the Mantle client, signed with
# dedicated AWS credentials, so payloads stay on the BAA/HIPAA-appropriate path
# described in CLAUDE.md ("runtime AAC AI ... uses dedicated ... BAA/HIPAA-
# appropriate API credentials, currently being set up through Claude via AWS").
#
# The prior direct api.anthropic.com route (ANTHROPIC_API_KEY) is intentionally
# NOT constructed at runtime. There is no fallback to it: if Bedrock is not
# configured, `build` returns nil and callers degrade to their existing
# "AI is not configured" path rather than silently egressing on a non-BAA route.
#
# Bedrock model IDs carry the `anthropic.` provider prefix and use bare (undated)
# aliases -- e.g. `anthropic.claude-haiku-4-5`, `anthropic.claude-opus-4-7`.
module AiClient
  module_function

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
  # Mantle invoke permissions. Falling back to them made `configured?` true
  # while every AI request was AccessDenied.
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

  # Normalizes a model id to Bedrock form by prefixing `anthropic.` when it is
  # missing, so an operator override that forgets the prefix still resolves.
  # Does not alter an id that already carries the prefix.
  def bedrock_model(model_id)
    id = model_id.to_s.strip
    return id if id.empty? || id.start_with?('anthropic.')

    "anthropic.#{id}"
  end

  # Builds a Bedrock Mantle client, or nil when AWS is not configured (callers
  # treat nil as "AI is not configured"). The Mantle client signs requests with
  # SigV4 via aws-sdk-core (already a transitive dependency of aws-sdk-s3); it
  # does not require aws-sdk-bedrockruntime.
  #
  # Keyword note: Anthropic::BedrockMantleClient (anthropic >= 1.36 Mantle path)
  # takes `aws_secret_access_key`. The older Anthropic::Helpers::Bedrock::Client
  # takes `aws_secret_key` — do not rename this arg to match that older client.
  def build
    return nil unless configured?

    creds = aws_credentials
    Anthropic::BedrockMantleClient.new(
      aws_region: bedrock_region,
      aws_access_key: creds[:access_key],
      aws_secret_access_key: creds[:secret_access_key]
    )
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

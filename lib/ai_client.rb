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

  # AWS access key id for SigV4 signing. Prefers a Bedrock-specific credential
  # (the AI route uses dedicated creds, provisioned separately from the S3/SES
  # keys per the two-tier policy) but accepts the app's standard names so local
  # dev and existing deploys work without extra wiring.
  def aws_key
    (ENV['BEDROCK_AWS_KEY'].presence ||
     ENV['AWS_KEY'].presence ||
     ENV['AWS_ACCESS_KEY_ID'].presence).to_s.strip
  end

  def aws_secret
    (ENV['BEDROCK_AWS_SECRET'].presence ||
     ENV['AWS_SECRET'].presence ||
     ENV['AWS_SECRET_ACCESS_KEY'].presence).to_s.strip
  end

  # True when enough AWS configuration is present to construct a Bedrock client.
  def configured?
    bedrock_region.present? && aws_key.present? && aws_secret.present?
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
  def build
    return nil unless configured?

    Anthropic::BedrockMantleClient.new(
      aws_region: bedrock_region,
      aws_access_key: aws_key,
      aws_secret_access_key: aws_secret
    )
  end
end

# frozen_string_literal: true

require 'spec_helper'

describe AiClient do
  def with_env(overrides)
    previous = {}
    keys = %w[
      BEDROCK_AWS_REGION BEDROCK_AWS_KEY BEDROCK_AWS_SECRET
      AWS_REGION AWS_DEFAULT_REGION
      AWS_KEY AWS_SECRET
      AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
    ]
    keys.each do |key|
      previous[key] = ENV[key]
      ENV.delete(key)
    end
    overrides.each { |key, value| ENV[key] = value }
    yield
  ensure
    keys.each do |key|
      if previous[key].nil?
        ENV.delete(key)
      else
        ENV[key] = previous[key]
      end
    end
  end

  describe '.aws_credentials' do
    it 'selects the dedicated Bedrock pair only when both halves are present' do
      with_env(
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret',
        'AWS_ACCESS_KEY_ID' => 'sdk-key',
        'AWS_SECRET_ACCESS_KEY' => 'sdk-secret'
      ) do
        expect(described_class.aws_credentials).to eq(
          access_key: 'bedrock-key',
          secret_access_key: 'bedrock-secret'
        )
      end
    end

    it 'does not mix a dedicated key with a generic secret during partial rollout' do
      with_env(
        'BEDROCK_AWS_KEY' => 'bedrock-key-only',
        'AWS_SECRET' => 's3-ses-secret',
        'AWS_ACCESS_KEY_ID' => 'sdk-key',
        'AWS_SECRET_ACCESS_KEY' => 'sdk-secret'
      ) do
        expect(described_class.aws_credentials).to eq(
          access_key: 'sdk-key',
          secret_access_key: 'sdk-secret'
        )
        expect(described_class.aws_key).to eq('sdk-key')
        expect(described_class.aws_secret).to eq('sdk-secret')
      end
    end

    it 'does not treat Cloud Run AWS_KEY/AWS_SECRET as Bedrock-ready' do
      with_env(
        'AWS_REGION' => 'us-west-2',
        'AWS_KEY' => 'cloudrun-s3-key',
        'AWS_SECRET' => 'cloudrun-s3-secret'
      ) do
        expect(described_class.aws_credentials).to be_nil
        expect(described_class.configured?).to eq(false)
      end
    end

    it 'accepts a complete standard SDK credential pair for local use' do
      with_env(
        'AWS_REGION' => 'us-west-2',
        'AWS_ACCESS_KEY_ID' => 'sdk-key',
        'AWS_SECRET_ACCESS_KEY' => 'sdk-secret'
      ) do
        expect(described_class.configured?).to eq(true)
        expect(described_class.aws_credentials).to eq(
          access_key: 'sdk-key',
          secret_access_key: 'sdk-secret'
        )
      end
    end
  end

  describe '.build' do
    it 'returns nil when Bedrock is not configured' do
      with_env('AWS_REGION' => 'us-west-2') do
        expect(described_class.build).to be_nil
      end
    end

    it 'constructs BedrockMantleClient with aws_secret_access_key (Mantle keyword)' do
      with_env(
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret'
      ) do
        client = double('bedrock_mantle_client')
        expect(Anthropic::BedrockMantleClient).to receive(:new).with(
          aws_region: 'us-west-2',
          aws_access_key: 'bedrock-key',
          aws_secret_access_key: 'bedrock-secret'
        ).and_return(client)

        expect(described_class.build).to eq(client)
      end
    end
  end

  describe '.bedrock_model' do
    it 'prefixes anthropic. when missing' do
      expect(described_class.bedrock_model('claude-haiku-4-5')).to eq('anthropic.claude-haiku-4-5')
    end

    it 'leaves an already-prefixed id alone' do
      expect(described_class.bedrock_model('anthropic.claude-opus-4-7')).to eq('anthropic.claude-opus-4-7')
    end
  end
end

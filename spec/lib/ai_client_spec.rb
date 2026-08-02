# frozen_string_literal: true

require 'spec_helper'

describe AiClient do
  def with_env(overrides)
    previous = {}
    keys = %w[
      BEDROCK_AWS_REGION BEDROCK_AWS_KEY BEDROCK_AWS_SECRET BEDROCK_PLANE
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

  describe '.bedrock_plane' do
    it 'defaults to classic, the plane this account can actually invoke' do
      with_env({}) { expect(described_class.bedrock_plane).to eq('classic') }
    end

    it 'selects mantle only on an explicit, case-insensitive opt-in' do
      with_env('BEDROCK_PLANE' => 'Mantle') { expect(described_class.bedrock_plane).to eq('mantle') }
      with_env('BEDROCK_PLANE' => ' mantle ') { expect(described_class.bedrock_plane).to eq('mantle') }
    end

    it 'degrades an unrecognized value to classic rather than an unentitled plane' do
      with_env('BEDROCK_PLANE' => 'mantel') { expect(described_class.bedrock_plane).to eq('classic') }
      with_env('BEDROCK_PLANE' => '') { expect(described_class.bedrock_plane).to eq('classic') }
    end
  end

  describe '.build' do
    it 'returns nil when Bedrock is not configured' do
      with_env('AWS_REGION' => 'us-west-2') do
        expect(described_class.build).to be_nil
      end
    end

    it 'constructs BedrockClient with aws_secret_key (classic keyword) by default' do
      with_env(
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret'
      ) do
        client = double('bedrock_client')
        expect(Anthropic::BedrockClient).to receive(:new).with(
          aws_region: 'us-west-2',
          aws_access_key: 'bedrock-key',
          aws_secret_key: 'bedrock-secret'
        ).and_return(client)

        expect(described_class.build).to eq(client)
      end
    end

    it 'constructs BedrockMantleClient with aws_secret_access_key (Mantle keyword) when opted in' do
      with_env(
        'BEDROCK_PLANE' => 'mantle',
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

    # The two clients take DIFFERENT secret keywords; passing the wrong one
    # raises ArgumentError at construction. Assert the real signatures accept
    # what build actually sends, so a gem upgrade that renames either keyword
    # fails here rather than at the first live AI call in production.
    it 'sends keywords the real client signatures accept' do
      classic = Anthropic::BedrockClient.instance_method(:initialize).parameters.map(&:last)
      mantle = Anthropic::BedrockMantleClient.instance_method(:initialize).parameters.map(&:last)

      expect(classic).to include(:aws_region, :aws_access_key, :aws_secret_key)
      expect(mantle).to include(:aws_region, :aws_access_key, :aws_secret_access_key)
    end
  end

  describe '.bedrock_model' do
    context 'on the classic plane (default)' do
      it 'maps the logical alias to the inference-profile id that actually invokes' do
        with_env({}) do
          expect(described_class.bedrock_model('anthropic.claude-haiku-4-5'))
            .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0')
        end
      end

      it 'normalizes a missing anthropic. prefix before mapping' do
        with_env({}) do
          expect(described_class.bedrock_model('claude-haiku-4-5'))
            .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0')
        end
      end

      # Regression: the previous implementation tested start_with?('anthropic.')
      # and so turned an already-resolved profile id into
      # 'anthropic.us.anthropic.claude-...', which Bedrock rejects.
      it 'passes an already-resolved inference-profile id through untouched' do
        with_env({}) do
          %w[
            us.anthropic.claude-haiku-4-5-20251001-v1:0
            eu.anthropic.claude-haiku-4-5-20251001-v1:0
            apac.anthropic.claude-haiku-4-5-20251001-v1:0
          ].each do |id|
            expect(described_class.bedrock_model(id)).to eq(id)
          end
        end
      end

      it 'leaves an unmapped alias alone so it fails loudly instead of silently invoking another model' do
        with_env({}) do
          expect(described_class.bedrock_model('anthropic.claude-opus-4-7'))
            .to eq('anthropic.claude-opus-4-7')
        end
      end

      # A deployment configured off the PREVIOUS .env.example carries
      # ANTHROPIC_MODEL=claude-haiku-4-5-20251001. Without suffix-stripping that
      # normalizes to an unmapped alias and every AI call fails on classic, so the
      # plane switch would appear to work while that deployment stayed broken.
      it 'resolves legacy dated and versioned override forms to the profile id' do
        with_env({}) do
          %w[
            claude-haiku-4-5-20251001
            anthropic.claude-haiku-4-5-20251001
            anthropic.claude-haiku-4-5-20251001-v1:0
            anthropic.claude-haiku-4-5-v1:0
          ].each do |legacy|
            expect(described_class.bedrock_model(legacy))
              .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0'), "failed for #{legacy}"
          end
        end
      end

      it 'does not let suffix-stripping substitute a different model' do
        with_env({}) do
          # Base name is preserved, so an unrelated dated id misses the map twice
          # and comes back as the operator's ORIGINAL id, not a Haiku profile.
          expect(described_class.bedrock_model('anthropic.claude-opus-4-7-20260115'))
            .to eq('anthropic.claude-opus-4-7-20260115')
          expect(described_class.bedrock_model('anthropic.claude-sonnet-4-5-20250929-v1:0'))
            .to eq('anthropic.claude-sonnet-4-5-20250929-v1:0')
        end
      end
    end

    context 'on the mantle plane' do
      it 'returns the bare alias, which is Mantle wire form' do
        with_env('BEDROCK_PLANE' => 'mantle') do
          expect(described_class.bedrock_model('anthropic.claude-haiku-4-5'))
            .to eq('anthropic.claude-haiku-4-5')
          expect(described_class.bedrock_model('claude-haiku-4-5'))
            .to eq('anthropic.claude-haiku-4-5')
        end
      end
    end

    it 'returns an empty id unchanged' do
      with_env({}) do
        expect(described_class.bedrock_model('')).to eq('')
        expect(described_class.bedrock_model(nil)).to eq('')
      end
    end
  end

  describe '.client_defined?' do
    it 'reports on the active plane rather than one hardcoded constant' do
      with_env({}) { expect(described_class.client_defined?).to eq(true) }
      with_env('BEDROCK_PLANE' => 'mantle') { expect(described_class.client_defined?).to eq(true) }
    end
  end
end

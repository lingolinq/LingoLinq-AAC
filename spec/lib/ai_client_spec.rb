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
      BEDROCK_EXPECTED_AWS_ACCOUNT
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

  # Finding LL-1b0d78dbe6. The AWS BAA is scoped to a single account and its operative
  # condition is that Bedrock calls run under that account; nothing enforced it.
  describe '.account_verified? (AWS BAA account assertion)' do
    # A method rather than a constant: assigning a constant inside a describe block
    # leaks it to Object.
    def bedrock_env(extra = {})
      {
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret'
      }.merge(extra)
    end

    before { described_class.reset_account_verification! }
    after { described_class.reset_account_verification! }

    def stub_sts(account)
      sts = double('sts')
      allow(sts).to receive(:get_caller_identity).and_return(double('identity', account: account))
      allow(Aws::STS::Client).to receive(:new).and_return(sts)
      sts
    end

    context 'when no expected account is configured' do
      it 'skips the check entirely rather than blocking, and makes no STS call' do
        expect(Aws::STS::Client).not_to receive(:new)
        with_env(bedrock_env) do
          expect(described_class.account_verified?).to eq(true)
        end
      end
    end

    context 'when an expected account is configured' do
      it 'passes when the credential resolves to that account' do
        stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(true)
        end
      end

      # docs/legal quotes this id both as 239044785114 and as 2390-4478-5114. Comparing raw
      # strings would fail a correctly-configured deployment over punctuation.
      it 'normalizes the grouped form used in the compliance corpus' do
        stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '2390-4478-5114')) do
          expect(described_class.account_verified?).to eq(true)
        end
      end

      it 'fails when the credential belongs to a different account' do
        stub_sts('111122223333')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(false)
        end
      end

      # Fail CLOSED, not open. Failing open would mean a transient network error silently
      # disables the control instead of the feature, which is the whole finding.
      it 'fails closed when STS itself cannot be reached' do
        allow(Aws::STS::Client).to receive(:new).and_raise(StandardError, 'connection refused')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(false)
        end
      end

      it 'fails closed when no credential pair is present' do
        with_env('BEDROCK_AWS_REGION' => 'us-west-2',
                 'BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114') do
          expect(described_class.account_verified?).to eq(false)
        end
      end

      # Verifying the AMBIENT credential instead of the Bedrock one would assert the wrong
      # thing and still pass, which is worse than no check at all.
      it 'probes with the exact Bedrock credential, not the ambient AWS chain' do
        sts = double('sts')
        allow(sts).to receive(:get_caller_identity).and_return(double('identity', account: '239044785114'))
        expect(Aws::STS::Client).to receive(:new).with(
          hash_including(
            region: 'us-west-2',
            access_key_id: 'bedrock-key',
            secret_access_key: 'bedrock-secret'
          )
        ).and_return(sts)

        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(true)
        end
      end
    end

    describe 'caching' do
      it 'probes STS once per credential, not once per AI call' do
        sts = stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          3.times { expect(described_class.account_verified?).to eq(true) }
        end
        expect(sts).to have_received(:get_caller_identity).once
      end

      it 're-probes when the credential changes' do
        sts = stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          described_class.account_verified?
        end
        with_env(bedrock_env('BEDROCK_AWS_KEY' => 'rotated-key',
                                   'BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          described_class.account_verified?
        end
        expect(sts).to have_received(:get_caller_identity).twice
      end

      # A permanently-cached failure would darken AI for the life of the process after one
      # transient blip, so the failure entry must expire while a success need not.
      it 'retries a failed check after the retry window, without re-probing inside it' do
        now = Time.now
        allow(Time).to receive(:now) { now }

        sts = double('sts')
        allow(sts).to receive(:get_caller_identity).and_raise(StandardError, 'timeout')
        allow(Aws::STS::Client).to receive(:new).and_return(sts)

        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(false)
          expect(described_class.account_verified?).to eq(false)
          expect(sts).to have_received(:get_caller_identity).once

          now += AiClient::ACCOUNT_CHECK_RETRY_AFTER + 1
          expect(described_class.account_verified?).to eq(false)
          expect(sts).to have_received(:get_caller_identity).twice
        end
      end
    end

    # The control only matters if it actually stops the call.
    describe 'effect on .build' do
      it 'refuses to construct a client when the account does not match' do
        stub_sts('111122223333')
        expect(Anthropic::BedrockClient).not_to receive(:new)
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.build).to be_nil
        end
      end

      it 'constructs a client when the account matches' do
        stub_sts('239044785114')
        client = double('bedrock_client')
        allow(Anthropic::BedrockClient).to receive(:new).and_return(client)
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.build).to eq(client)
        end
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

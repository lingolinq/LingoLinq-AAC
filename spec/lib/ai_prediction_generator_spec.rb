# frozen_string_literal: true

require 'spec_helper'

# AiPredictionGenerator had no spec file. It is the fourth Tier 1 seam and its
# gating changed with the BAA account assertion (finding LL-1b0d78dbe6), so the
# "all four seams" claim was only actually tested for three.
describe AiPredictionGenerator do
  def with_env(overrides)
    keys = %w[
      BEDROCK_AWS_REGION BEDROCK_AWS_KEY BEDROCK_AWS_SECRET BEDROCK_PLANE
      AWS_REGION AWS_DEFAULT_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
      BEDROCK_EXPECTED_AWS_ACCOUNT
    ]
    previous = keys.to_h { |k| [k, ENV[k]] }
    keys.each { |k| ENV.delete(k) }
    overrides.each { |k, v| ENV[k] = v }
    yield
  ensure
    keys.each { |k| previous[k].nil? ? ENV.delete(k) : ENV[k] = previous[k] }
  end

  def bedrock_env(extra = {})
    {
      'BEDROCK_AWS_REGION' => 'us-west-2',
      'BEDROCK_AWS_KEY' => 'bedrock-key',
      'BEDROCK_AWS_SECRET' => 'bedrock-secret'
    }.merge(extra)
  end

  def stub_sts(account)
    sts = double('sts')
    allow(sts).to receive(:get_caller_identity).and_return(double('identity', account: account))
    allow(Aws::STS::Client).to receive(:new).and_return(sts)
  end

  before { AiClient.reset_account_verification! }
  after { AiClient.reset_account_verification! }

  describe 'availability gating' do
    it 'declines to build a config when AWS is unconfigured' do
      with_env({}) do
        expect(described_class.send(:resolve_api_config)).to be_nil
      end
    end

    it 'declines to build a config when the credential is not the BAA account' do
      stub_sts('111122223333')
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        expect(AiClient.configured?).to eq(true)
        expect(described_class.send(:resolve_api_config)).to be_nil
      end
    end

    it 'builds a config when the credential is the BAA account' do
      stub_sts('239044785114')
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        config = described_class.send(:resolve_api_config)
        expect(config).to be_present
        expect(config[:provider]).to eq(:claude)
      end
    end
  end

  describe 'the nil-client belt' do
    # Before the account assertion, `configured? => build != nil` held, so this
    # seam carried no nil guard and would have raised NoMethodError on nil.
    it 'raises a legible error rather than dereferencing nil' do
      stub_sts('111122223333')
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        expect { described_class.send(:call_anthropic, { model: 'm' }, 'prompt') }
          .to raise_error(AiClient::NotAvailableError)
      end
    end
  end
end

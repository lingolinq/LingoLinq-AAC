# frozen_string_literal: true

require 'spec_helper'

# Cross-seam specs for two controls that existed in code but were unreachable at
# runtime. Both defects were invisible to the per-file specs because each seam's
# spec asserted the seam's own behaviour and nothing asserted that the shared
# control was actually wired to it. So these live in one cross-seam file on
# purpose: the question "is this control reachable from every Tier 1 seam?" has
# no home in a per-seam spec, which is exactly why it went unasked.
#
# 1. ALLOWED_RUNTIME_MODELS was dead code. AiClient.runtime_model -- the method
#    that enforces it -- had zero callers. All three seams read ANTHROPIC_MODEL
#    and passed it to AiClient.bedrock_model, which resolves an id to its wire
#    form and asks no questions, passing an already-resolved inference-profile id
#    through untouched. An operator could therefore point a Tier 1 seam at any
#    Bedrock model, including a mandatory-retention Covered Model that student
#    utterances must never reach.
#
# 2. The sts:GetCallerIdentity account assertion ran BEFORE the consent gates, so
#    a COPPA-blocked or org-opted-out request paid a network probe (up to 5s
#    behind a process-global mutex on a failing credential) before being refused.
describe 'Tier 1 runtime AI controls' do
  # A disallowed model in REGIONAL INFERENCE-PROFILE form. This exact shape is the
  # bypass: bedrock_model passes it through untouched because it is already
  # wire-resolved, so an allowlist that only understood bare aliases would never
  # see it. canonical_alias is what collapses the two forms to one key.
  DISALLOWED_PROFILE_ID = 'us.anthropic.claude-fable-5-20260101-v1:0'
  VETTED_WIRE_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

  def with_env(overrides)
    keys = %w[
      BEDROCK_AWS_REGION BEDROCK_AWS_KEY BEDROCK_AWS_SECRET BEDROCK_PLANE
      AWS_REGION AWS_DEFAULT_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
      BEDROCK_EXPECTED_AWS_ACCOUNT ANTHROPIC_MODEL
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

  describe 'the ANTHROPIC_MODEL override is filtered by ALLOWED_RUNTIME_MODELS' do
    # The predictor gates resolve_api_config on configured? (a pure ENV read)
    # rather than available?, deliberately, so it needs no STS stub.
    SEAMS = [
      { klass: -> { AiBoardGenerator }, name: 'AiBoardGenerator', needs_sts: true },
      { klass: -> { AiWordPredictor }, name: 'AiWordPredictor', needs_sts: false },
      { klass: -> { AiPredictionGenerator }, name: 'AiPredictionGenerator', needs_sts: true }
    ].freeze

    SEAMS.each do |seam|
      context seam[:name] do
        let(:described) { seam[:klass].call }

        before { stub_sts('239044785114') if seam[:needs_sts] }

        def env_for(seam, extra = {})
          base = seam[:needs_sts] ? { 'BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114' } : {}
          bedrock_env(base.merge(extra))
        end

        it 'uses the vetted default when no override is set' do
          with_env(env_for(seam)) do
            expect(described.send(:resolve_api_config)[:model]).to eq(VETTED_WIRE_ID)
          end
        end

        it 'REFUSES a disallowed override, falls back, and logs the refusal' do
          allow(Rails.logger).to receive(:warn)
          with_env(env_for(seam, 'ANTHROPIC_MODEL' => DISALLOWED_PROFILE_ID)) do
            model = described.send(:resolve_api_config)[:model]
            expect(model).not_to eq(DISALLOWED_PROFILE_ID)
            expect(model).not_to include('fable')
            expect(model).to eq(VETTED_WIRE_ID)
          end
          # A silent fallback would be indistinguishable from a typo'd env var.
          expect(Rails.logger).to have_received(:warn)
            .with(/is not in ALLOWED_RUNTIME_MODELS/)
        end

        it 'refuses a bare alias outside the allowlist too, not only the profile form' do
          with_env(env_for(seam, 'ANTHROPIC_MODEL' => 'anthropic.claude-fable-5')) do
            expect(described.send(:resolve_api_config)[:model]).to eq(VETTED_WIRE_ID)
          end
        end

        # SAME-FAMILY variants are the subtle bypass. These all canonicalize to
        # the vetted alias `anthropic.claude-haiku-4-5`, so a gate that checked
        # the canonical family accepted every one of them while bedrock_model
        # passed the operator's ORIGINAL profile id through untouched. The date
        # case selects an unvetted future revision; the eu./apac. cases move
        # inference to another geography, which is a data-residency change the
        # BAA and Article 50 analysis never contemplated.
        {
          'us.anthropic.claude-haiku-4-5-20990101-v1:0' => 'an unvetted future revision',
          'eu.anthropic.claude-haiku-4-5-20251001-v1:0' => 'EU geography',
          'apac.anthropic.claude-haiku-4-5-20251001-v1:0' => 'APAC geography'
        }.each do |variant, why|
          it "refuses a same-family variant selecting #{why}" do
            with_env(env_for(seam, 'ANTHROPIC_MODEL' => variant)) do
              model = described.send(:resolve_api_config)[:model]
              expect(model).not_to eq(variant)
              expect(model).to eq(VETTED_WIRE_ID)
            end
          end
        end

        # The tightening must not reject the forms it is meant to accept. The
        # legacy dated value is what the old .env.example documented, so real
        # deployments still carry it.
        ['anthropic.claude-haiku-4-5', 'claude-haiku-4-5-20251001', VETTED_WIRE_ID].each do |good|
          it "still resolves the supported form #{good.inspect}" do
            with_env(env_for(seam, 'ANTHROPIC_MODEL' => good)) do
              expect(described.send(:resolve_api_config)[:model]).to eq(VETTED_WIRE_ID)
            end
          end
        end

        # ALLOWED_RUNTIME_MODELS currently holds exactly one entry, and it is the
        # default at all three seams. So asserting that an allowed override
        # produces the default wire id proves NOTHING -- refusing it produces the
        # same string. Widening the allowlist for this example is what makes
        # "honoured" and "refused" distinguishable at all.
        # Approving a model takes BOTH a place on the allowlist AND a verified
        # inference-profile row. That is not ceremony: the gate now compares the
        # id that will actually be sent, so an alias with no profile row resolves
        # to something Bedrock would reject and is correctly refused. Stubbing
        # only ALLOWED_RUNTIME_MODELS here would fail, which is the design
        # working -- "approved in principle" is not "verified invokable".
        it 'honours an allowlisted override that differs from the default' do
          stub_const('AiClient::ALLOWED_RUNTIME_MODELS',
                     %w[anthropic.claude-haiku-4-5 anthropic.claude-opus-4-7].freeze)
          stub_const('AiClient::CLASSIC_PROFILE_IDS', {
            'anthropic.claude-haiku-4-5' => VETTED_WIRE_ID,
            'anthropic.claude-opus-4-7' => 'us.anthropic.claude-opus-4-7-20260115-v1:0'
          }.freeze)
          with_env(env_for(seam, 'ANTHROPIC_MODEL' => 'anthropic.claude-opus-4-7')) do
            model = described.send(:resolve_api_config)[:model]
            expect(model).to eq('us.anthropic.claude-opus-4-7-20260115-v1:0')
            expect(model).not_to eq(VETTED_WIRE_ID)
          end
        end

        it 'refuses an allowlisted alias that has no verified profile row' do
          stub_const('AiClient::ALLOWED_RUNTIME_MODELS',
                     %w[anthropic.claude-haiku-4-5 anthropic.claude-opus-4-7].freeze)
          with_env(env_for(seam, 'ANTHROPIC_MODEL' => 'anthropic.claude-opus-4-7')) do
            expect(described.send(:resolve_api_config)[:model]).to eq(VETTED_WIRE_ID)
          end
        end

        it 'does not log a refusal when the override is allowed' do
          allow(Rails.logger).to receive(:warn)
          with_env(env_for(seam, 'ANTHROPIC_MODEL' => 'anthropic.claude-haiku-4-5')) do
            expect(described.send(:resolve_api_config)[:model]).to eq(VETTED_WIRE_ID)
          end
          expect(Rails.logger).not_to have_received(:warn)
            .with(/is not in ALLOWED_RUNTIME_MODELS/)
        end
      end
    end

    it 'routes every seam through runtime_model rather than bedrock_model' do
      # The behavioural specs above would still pass if a seam reimplemented the
      # allowlist itself. This asserts the single shared control is the one doing
      # the work, which is the property that actually failed: runtime_model
      # existed and nothing called it.
      stub_sts('239044785114')
      expect(AiClient).to receive(:runtime_model).exactly(3).times.and_return(VETTED_WIRE_ID)
      expect(AiClient).not_to receive(:bedrock_model)

      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114',
                           'ANTHROPIC_MODEL' => DISALLOWED_PROFILE_ID)) do
        AiBoardGenerator.send(:resolve_api_config)
        AiWordPredictor.send(:resolve_api_config)
        AiPredictionGenerator.send(:resolve_api_config)
      end
    end
  end

  describe 'consent gates are evaluated before the STS account assertion' do
    # Each of these fails on the pre-fix ordering: resolve_api_config (or
    # anthropic_configured?) ran first, and with an expected account configured
    # that constructs an Aws::STS::Client before the refusal is reached.

    it 'refuses an org-opted-out board generation without probing STS' do
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?)
        .with('ai_board_generation', nil).and_return(false)
      expect(Aws::STS::Client).not_to receive(:new)

      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        res = AiBoardGenerator.generate_words(prompt: 'animals', rows: 2, columns: 2)
        expect(res[:error]).to eq('AI features are disabled for this organization')
      end
    end

    it 'refuses an org-opted-out focus-word generation without probing STS' do
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?)
        .with('ai_board_generation', nil).and_return(false)
      expect(Aws::STS::Client).not_to receive(:new)

      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        res = AiBoardGenerator.generate_focus_words(prompt: 'animals', word_count: 5)
        expect(res[:error]).to eq('AI features are disabled for this organization')
      end
    end

    it 'refuses a COPPA-blocked board generation without probing STS' do
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?)
        .with('ai_board_generation', nil).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(true)
      expect(Aws::STS::Client).not_to receive(:new)

      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        res = AiBoardGenerator.generate_words(prompt: 'animals', rows: 2, columns: 2)
        expect(res[:error]).to eq('AI features require parental consent for this account')
      end
    end

    it 'drafts an eval narrative from the template without probing STS' do
      expect(Aws::STS::Client).not_to receive(:new)

      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        res = EvalNarrator.draft_narrative({ 'use_anthropic' => false })
        expect(res['ai_generated']).to be_nil
        expect(res['narrative']).to be_present
      end
    end
  end
end

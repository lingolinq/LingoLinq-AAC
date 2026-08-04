# frozen_string_literal: true

require 'spec_helper'

describe EvalNarrator do
  def anthropic_response(text)
    usage = double('usage', input_tokens: 10, output_tokens: 20)
    block = double('text_block', type: 'text', text: text)
    double('anthropic_response', content: [block], usage: usage)
  end

  let(:payload) do
    {
      'eval_mode' => 'comprehensive',
      'intake' => { 'age_band' => '6-12' },
      'recommendation' => { 'access_method' => 'touch' },
      'sett' => { 'student' => 'Janie Doe', 'environment' => 'classroom' },
      'slp_notes' => 'Met with Janie Doe; email mom at jane@example.com.',
      'duration_s' => 600,
      # External-model narration is opt-in; the AI-path specs below assert the
      # gate fires only when this flag is explicitly true.
      'use_anthropic' => true
    }
  end

  describe '.ai_allowed_for?' do
    it 'is false without a resolved user (never send eval data ungated)' do
      expect(described_class.ai_allowed_for?(nil)).to eq(false)
    end

    it 'is false when COPPA parental consent is pending' do
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(true)
      expect(described_class.ai_allowed_for?(u)).to eq(false)
    end

    it 'is false when the org has opted out of AI processing' do
      u = User.new(settings: {})
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(false)
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(false)
      expect(described_class.ai_allowed_for?(u)).to eq(false)
    end

    it 'is true for a consented user in an AI-enabled org' do
      u = User.new(settings: {})
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(false)
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      expect(described_class.ai_allowed_for?(u)).to eq(true)
    end
  end

  describe 'EVAL_NARRATOR_MODEL allowlist' do
    around(:each) do |example|
      old = ENV['EVAL_NARRATOR_MODEL']
      example.run
    ensure
      if old.nil?
        ENV.delete('EVAL_NARRATOR_MODEL')
      else
        ENV['EVAL_NARRATOR_MODEL'] = old
      end
    end

    describe '.allowed_model?' do
      it 'accepts only the exact vetted in-scope Bedrock model IDs' do
        expect(described_class.allowed_model?('anthropic.claude-opus-4-7')).to eq(true)
        expect(described_class.allowed_model?('anthropic.claude-haiku-4-5')).to eq(true)
      end

      it 'refuses an unknown / future id even within an in-scope family (exact-ID, not prefix)' do
        expect(described_class.allowed_model?('anthropic.claude-opus-4-8-experimental')).to eq(false)
        expect(described_class.allowed_model?('anthropic.claude-opus-5')).to eq(false)
        expect(described_class.allowed_model?('anthropic.claude-sonnet-4-6')).to eq(false)
      end

      it 'refuses direct-Anthropic (non-Bedrock) id forms that do not egress on the Bedrock route' do
        expect(described_class.allowed_model?('claude-opus-4-7')).to eq(false)
        expect(described_class.allowed_model?('claude-haiku-4-5-20251001')).to eq(false)
      end

      it 'rejects Covered Models (Fable / Mythos), unknown, and non-string ids' do
        expect(described_class.allowed_model?('anthropic.claude-fable-5')).to eq(false)
        expect(described_class.allowed_model?('anthropic.claude-mythos-5')).to eq(false)
        expect(described_class.allowed_model?('not-a-real-model')).to eq(false)
        expect(described_class.allowed_model?('')).to eq(false)
        expect(described_class.allowed_model?(nil)).to eq(false)
      end
    end

    describe '.resolved_model' do
      it 'defaults to the in-scope Opus model when unset' do
        ENV.delete('EVAL_NARRATOR_MODEL')
        expect(described_class.resolved_model).to eq(EvalNarrator::DEFAULT_MODEL)
      end

      it 'returns an allowed override unchanged' do
        ENV['EVAL_NARRATOR_MODEL'] = 'anthropic.claude-haiku-4-5'
        expect(described_class.resolved_model).to eq('anthropic.claude-haiku-4-5')
      end

      it 'raises (fails closed) on a disallowed override' do
        ENV['EVAL_NARRATOR_MODEL'] = 'anthropic.claude-fable-5'
        expect { described_class.resolved_model }
          .to raise_error(EvalNarrator::NarrationError, /not a vetted in-scope Claude model/)
      end
    end

    it 'falls back to the deterministic template (no egress) when the override is disallowed' do
      ENV['EVAL_NARRATOR_MODEL'] = 'anthropic.claude-fable-5'
      u = User.new(settings: {})
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(false)
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      allow(described_class).to receive(:anthropic_configured?).and_return(true)
      allow(described_class).to receive(:call_anthropic)
      allow(AiApiLog).to receive(:log_ai_call)
      out = described_class.draft_narrative(payload, user: u)
      expect(described_class).not_to have_received(:call_anthropic)
      expect(out['narrative']).to include('Evaluation Summary')
      expect(out['ai_generated']).to be_nil
    end
  end

  describe '.payload_for_prompt data minimization' do
    it 'drops the intake etiology (medical cause) from the egress payload' do
      out = described_class.payload_for_prompt(
        'eval_mode' => 'comprehensive',
        'intake' => { 'age_band' => '6-12', 'etiology' => 'cerebral palsy', 'suspected_access' => 'touch' }
      )
      expect(out['intake']).to include('age_band' => '6-12', 'suspected_access' => 'touch')
      expect(out['intake']).not_to have_key('etiology')
    end

    it 'drops the etiology under any key casing' do
      out = described_class.payload_for_prompt('intake' => { 'Etiology' => 'ALS', 'age_band' => '13-18' })
      expect(out['intake'].keys.map(&:downcase)).not_to include('etiology')
      expect(out['intake']).to include('age_band' => '13-18')
    end

    it 'still drops the free-text student name from sett' do
      out = described_class.payload_for_prompt('sett' => { 'student' => 'Janie Doe', 'environment' => 'classroom' })
      expect(out['sett']).to eq('environment' => 'classroom')
    end
  end

  describe '.draft_narrative gating' do
    before do
      allow(described_class).to receive(:anthropic_configured?).and_return(true)
      allow(described_class).to receive(:call_anthropic)
      allow(AiApiLog).to receive(:log_ai_call)
    end

    it 'never calls the AI when no user is resolved (returns template)' do
      out = described_class.draft_narrative(payload, user: nil)
      expect(described_class).not_to have_received(:call_anthropic)
      expect(out['narrative']).to be_a(String)
      expect(out['narrative']).to include('Evaluation Summary')
      expect(out['ai_generated']).to be_nil
    end

    it 'never calls the AI for a COPPA-consent-pending student' do
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(true)
      out = described_class.draft_narrative(payload, user: u)
      expect(described_class).not_to have_received(:call_anthropic)
      expect(AiApiLog).not_to have_received(:log_ai_call)
      expect(out['narrative']).to include('Evaluation Summary')
      expect(out['ai_generated']).to be_nil
    end

    it 'never calls the AI when the student org has opted out of AI' do
      u = User.new(settings: {})
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(false)
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(false)
      described_class.draft_narrative(payload, user: u)
      expect(described_class).not_to have_received(:call_anthropic)
      expect(AiApiLog).not_to have_received(:log_ai_call)
    end
  end

  describe '.draft_narrative for a consented student' do
    let(:user) do
      u = User.create
      u.settings ||= {}
      u.settings['full_name'] = 'Janie Doe'
      u.save
      u
    end

    around(:each) do |example|
      # Runtime AI routes via AWS Bedrock (AiClient); enable it with the dedicated
      # Bedrock AWS creds rather than a direct ANTHROPIC_API_KEY.
      old_region = ENV['BEDROCK_AWS_REGION']
      old_key = ENV['BEDROCK_AWS_KEY']
      old_secret = ENV['BEDROCK_AWS_SECRET']
      ENV['BEDROCK_AWS_REGION'] = 'us-west-2'
      ENV['BEDROCK_AWS_KEY'] = 'test-bedrock-key'
      ENV['BEDROCK_AWS_SECRET'] = 'test-bedrock-secret'
      example.run
    ensure
      ENV['BEDROCK_AWS_REGION'] = old_region
      ENV['BEDROCK_AWS_KEY'] = old_key
      ENV['BEDROCK_AWS_SECRET'] = old_secret
    end

    before do
      allow(described_class).to receive(:anthropic_configured?).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(user).and_return(false)
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(user).and_return(true)
    end

    it 'scrubs the student name and email out of the payload before egress' do
      captured = {}
      allow(described_class).to receive(:call_anthropic) do |model:, system_prompt:, user_content:|
        captured[:user_content] = user_content
        anthropic_response('Drafted narrative.')
      end
      allow(AiApiLog).to receive(:log_ai_call)

      described_class.draft_narrative(payload, user: user)

      expect(captured[:user_content]).to be_present
      expect(captured[:user_content]).not_to include('Janie Doe')
      expect(captured[:user_content]).not_to include('jane@example.com')
      expect(captured[:user_content]).to include('[REDACTED_NAME]')
      expect(captured[:user_content]).to include('[REDACTED_EMAIL]')
    end

    it 'does not call the AI unless the request explicitly opts in (use_anthropic == true)' do
      allow(described_class).to receive(:call_anthropic)
      allow(AiApiLog).to receive(:log_ai_call)

      # Flag false, and flag absent, both keep eval data local (template).
      out_false = described_class.draft_narrative(payload.merge('use_anthropic' => false), user: user)
      out_absent = described_class.draft_narrative(payload.reject { |k, _| k == 'use_anthropic' }, user: user)

      expect(described_class).not_to have_received(:call_anthropic)
      expect(out_false['narrative']).to include('Evaluation Summary')
      expect(out_absent['narrative']).to include('Evaluation Summary')
      expect(out_false['ai_generated']).to be_nil
      expect(out_absent['ai_generated']).to be_nil
    end

    it 'does not forward the client-asserted SETT student name to the AI (subject derived from resolved user)' do
      # Mismatch case: the request resolves to user A (full_name "Janie Doe")
      # but the payload SETT names a different child. The client-asserted name
      # must not reach the model through the structured identity field, while
      # the rest of the SETT context still does.
      payload['sett'] = { 'student' => 'Some Other Child', 'environment' => 'resource room' }
      payload['slp_notes'] = 'Session went well.'
      captured = {}
      allow(described_class).to receive(:call_anthropic) do |model:, system_prompt:, user_content:|
        captured[:user_content] = user_content
        anthropic_response('ok')
      end
      allow(AiApiLog).to receive(:log_ai_call)

      described_class.draft_narrative(payload, user: user)

      expect(captured[:user_content]).to be_present
      expect(captured[:user_content]).not_to include('Some Other Child')
      expect(captured[:user_content]).to include('resource room')
    end

    it 'drops the student name under any key casing (Student/STUDENT)' do
      payload['sett'] = { 'Student' => 'Capitalized Childname', 'task' => 'requesting' }
      payload['slp_notes'] = 'Session went well.'
      captured = {}
      allow(described_class).to receive(:call_anthropic) do |model:, system_prompt:, user_content:|
        captured[:user_content] = user_content
        anthropic_response('ok')
      end
      allow(AiApiLog).to receive(:log_ai_call)

      described_class.draft_narrative(payload, user: user)

      expect(captured[:user_content]).not_to include('Capitalized Childname')
      expect(captured[:user_content]).to include('requesting')
    end

    it 'redacts a known name token even when only one part appears (tokenized blocklist)' do
      # SETT student is a first name only; the surname appears alone in
      # slp_notes. The user full_name "Janie Doe" tokenizes to include "Doe".
      payload['sett']['student'] = 'Janie'
      payload['slp_notes'] = 'Met with the Doe family about IEP goals.'
      captured = {}
      allow(described_class).to receive(:call_anthropic) do |model:, system_prompt:, user_content:|
        captured[:user_content] = user_content
        anthropic_response('ok')
      end
      allow(AiApiLog).to receive(:log_ai_call)

      described_class.draft_narrative(payload, user: user)

      expect(captured[:user_content]).not_to match(/\bDoe\b/)
      expect(captured[:user_content]).not_to match(/\bJanie\b/)
    end

    it 'records the AI call in AiApiLog with an audit trail' do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('Drafted narrative.'))

      expect {
        described_class.draft_narrative(payload, user: user)
      }.to change(AiApiLog, :count).by(1)

      log = AiApiLog.order(:created_at).last
      expect(log.ai_provider).to eq('claude')
      expect(log.request_type).to eq('eval_narration')
      expect(log.feature_flag).to eq('comprehensive_eval_ai')
      expect(log.success).to eq(true)
      # EU AI Act Article 50(2): a successful AI-drafted narrative is content-marked,
      # and the audit row links to the marker's content_id.
      expect(log.ai_content_marked).to eq(true)
      expect(log.ai_generated_content_id).to be_present
    end

    it 'returns the AI-drafted narrative' do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('Drafted narrative.'))
      allow(AiApiLog).to receive(:log_ai_call)
      expect(described_class.draft_narrative(payload, user: user)['narrative']).to eq('Drafted narrative.')
    end

    it 'mints a valid, verifiable Article 50(2) marker for the AI-drafted narrative' do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('Drafted narrative.'))
      allow(AiApiLog).to receive(:log_ai_call)

      out = described_class.draft_narrative(payload, user: user)

      marker = out['ai_generated']
      expect(marker).to be_a(Hash)
      expect(marker['provider']).to eq('claude')
      expect(Art50Marker.verify(marker)).to eq(true)
    end

    it 'never marks the deterministic template fallback, even for a consented student' do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('Drafted narrative.'))
      allow(AiApiLog).to receive(:log_ai_call)

      out = described_class.draft_narrative(payload.merge('use_anthropic' => false), user: user)

      expect(described_class).not_to have_received(:call_anthropic)
      expect(out['ai_generated']).to be_nil
    end

    it 'falls back to the template (and logs failure) when the AI call raises' do
      allow(described_class).to receive(:call_anthropic).and_raise(StandardError, 'boom')

      expect {
        out = described_class.draft_narrative(payload, user: user)
        expect(out['narrative']).to include('Evaluation Summary')
        expect(out['ai_generated']).to be_nil
      }.to change(AiApiLog, :count).by(1)

      failed_log = AiApiLog.order(:created_at).last
      expect(failed_log.success).to eq(false)
      # A failed AI call mints no marker -- there is no AI output to attribute one to.
      expect(failed_log.ai_content_marked).to eq(false)
      expect(failed_log.ai_generated_content_id).to be_nil
    end
  end

  describe '.draft_narrative Article 50 jurisdiction + disclosure stamping' do
    around(:each) do |example|
      # Runtime AI routes via AWS Bedrock (AiClient); enable it with the dedicated
      # Bedrock AWS creds rather than a direct ANTHROPIC_API_KEY.
      old_region = ENV['BEDROCK_AWS_REGION']
      old_key = ENV['BEDROCK_AWS_KEY']
      old_secret = ENV['BEDROCK_AWS_SECRET']
      ENV['BEDROCK_AWS_REGION'] = 'us-west-2'
      ENV['BEDROCK_AWS_KEY'] = 'test-bedrock-key'
      ENV['BEDROCK_AWS_SECRET'] = 'test-bedrock-secret'
      example.run
    ensure
      ENV['BEDROCK_AWS_REGION'] = old_region
      ENV['BEDROCK_AWS_KEY'] = old_key
      ENV['BEDROCK_AWS_SECRET'] = old_secret
    end

    before do
      allow(described_class).to receive(:anthropic_configured?).and_return(true)
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('Drafted narrative.'))
      allow(AiApiLog).to receive(:log_ai_call)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
      allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(true)
    end

    def eu_student
      u = User.create
      u.settings ||= {}
      u.settings['preferences'] = { 'jurisdiction' => 'FR' }
      u.save
      u
    end

    def non_eu_student
      u = User.create
      u.settings ||= {}
      u.settings['preferences'] = { 'jurisdiction' => 'US' }
      u.save
      u
    end

    it "stamps jurisdiction 'EU' + article_50_disclosure_shown false for a confirmed EU student" do
      described_class.draft_narrative(payload, user: eu_student)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        jurisdiction: 'EU', article_50_disclosure_shown: false
      ))
    end

    it "leaves jurisdiction nil for a non-EU/unknown student (D-01 retention fail-safe)" do
      described_class.draft_narrative(payload, user: non_eu_student)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        jurisdiction: nil, article_50_disclosure_shown: false
      ))
    end

    # PN-01 (MODULE level): proves the WRAPPER threads the `user` it is GIVEN into the sink.
    # A non-EU clinician is never passed into EvalNarrator, so it cannot influence this layer.
    # The controller-level regression (spec/controllers/api/eval_sessions_controller_spec.rb)
    # is the layer that proves the CONTROLLER selects the student subject, not the caller.
    it "threads the given student user into the stamp (the wrapper follows its `user` argument)" do
      described_class.draft_narrative(payload, user: eu_student)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(jurisdiction: 'EU'))
    end
  end
end

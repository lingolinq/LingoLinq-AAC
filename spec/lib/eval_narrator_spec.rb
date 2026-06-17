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

  describe '.draft_narrative gating' do
    before do
      allow(described_class).to receive(:anthropic_configured?).and_return(true)
      allow(described_class).to receive(:call_anthropic)
      allow(AiApiLog).to receive(:log_ai_call)
    end

    it 'never calls the AI when no user is resolved (returns template)' do
      out = described_class.draft_narrative(payload, user: nil)
      expect(described_class).not_to have_received(:call_anthropic)
      expect(out).to be_a(String)
      expect(out).to include('Evaluation Summary')
    end

    it 'never calls the AI for a COPPA-consent-pending student' do
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(true)
      out = described_class.draft_narrative(payload, user: u)
      expect(described_class).not_to have_received(:call_anthropic)
      expect(AiApiLog).not_to have_received(:log_ai_call)
      expect(out).to include('Evaluation Summary')
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
      old = ENV['ANTHROPIC_API_KEY']
      ENV['ANTHROPIC_API_KEY'] = 'test-anthropic-key'
      example.run
    ensure
      ENV['ANTHROPIC_API_KEY'] = old
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
      expect(out_false).to include('Evaluation Summary')
      expect(out_absent).to include('Evaluation Summary')
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
    end

    it 'returns the AI-drafted narrative' do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('Drafted narrative.'))
      allow(AiApiLog).to receive(:log_ai_call)
      expect(described_class.draft_narrative(payload, user: user)).to eq('Drafted narrative.')
    end

    it 'falls back to the template (and logs failure) when the AI call raises' do
      allow(described_class).to receive(:call_anthropic).and_raise(StandardError, 'boom')

      expect {
        out = described_class.draft_narrative(payload, user: user)
        expect(out).to include('Evaluation Summary')
      }.to change(AiApiLog, :count).by(1)

      expect(AiApiLog.order(:created_at).last.success).to eq(false)
    end
  end
end

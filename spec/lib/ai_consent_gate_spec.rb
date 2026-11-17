# frozen_string_literal: true

require 'spec_helper'

# AI data-sharing consent (#1136) at the three AI libraries. Each example runs the
# real FeatureFlags.ai_consent_blocks_ai_for? (this file does NOT include the
# 'ai data-sharing consent given' context) and asserts that an account with no
# current consent makes no model call, while the same account with a consent does.
describe 'AI data-sharing consent at the AI libraries (#1136)' do
  def anthropic_response(text)
    usage = double('usage', input_tokens: 10, output_tokens: 20)
    block = double('text_block', type: 'text', text: text)
    double('anthropic_response', content: [block], usage: usage)
  end

  restore_env_after_each('BEDROCK_AWS_REGION', 'BEDROCK_AWS_KEY', 'BEDROCK_AWS_SECRET', 'GEMINI_API_KEY', 'AI_CONSENT_HARD_GATE')

  before(:each) do
    ENV['BEDROCK_AWS_REGION'] = 'us-west-2'
    ENV['BEDROCK_AWS_KEY'] = 'test-bedrock-key'
    ENV['BEDROCK_AWS_SECRET'] = 'test-bedrock-secret'
    ENV.delete('GEMINI_API_KEY')
    ENV.delete('AI_CONSENT_HARD_GATE')
    allow(AiApiLog).to receive(:log_ai_call)
    # Every other gate is open, so the consent check is the only thing that can refuse.
    allow(FeatureFlags).to receive(:ai_feature_enabled_for?).and_return(true)
    allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
    allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
    allow(AiClient).to receive(:available?).and_return(true)
    AiWordPredictor::CACHE.clear
    PiiScrubber.reset_blocklist!
  end

  after(:each) do
    AiWordPredictor::CACHE.clear
    PiiScrubber.reset_blocklist!
  end

  let(:no_consent) { User.create }
  let(:consented) { grant_test_ai_consent!(User.create) }
  let(:stale) do
    u = grant_test_ai_consent!(User.create)
    u.settings['ai_consent']['disclosures_version'] = LingoLinq::AiConsentDisclosures::CURRENT_VERSION - 1
    u.save!
    u
  end
  let(:revoked) do
    u = grant_test_ai_consent!(User.create)
    u.settings['ai_consent']['revoked_at'] = Time.now.utc.iso8601
    u.save!
    u
  end

  describe AiWordPredictor do
    before(:each) do
      allow(AiWordPredictor).to receive(:call_anthropic).and_return(anthropic_response('play, go, eat, help'))
    end

    it 'makes the model call for an account with a current consent (control)' do
      expect(AiWordPredictor.predict(sentence: 'i want to', user: consented)).to eq(%w[play go eat help])
      expect(AiWordPredictor).to have_received(:call_anthropic).once
    end

    it 'returns no predictions and makes no model call with no consent, a stale-version consent or a revoked consent' do
      [no_consent, stale, revoked].each do |u|
        expect(AiWordPredictor.predict(sentence: 'i want to', user: u)).to eq([])
        expect(AiWordPredictor.predict_from_tokens(words: %w[i want to], user: u)).to eq([])
      end
      expect(AiWordPredictor).not_to have_received(:call_anthropic)
      expect(AiApiLog).not_to have_received(:log_ai_call)
    end

    it 'does not serve a cached AI result to an account whose consent was withdrawn after the result was cached' do
      u = consented
      expect(AiWordPredictor.predict(sentence: 'i want to', user: u)).to eq(%w[play go eat help])
      expect(AiWordPredictor::CACHE.size).to eq(1)
      u.settings['ai_consent']['revoked_at'] = Time.now.utc.iso8601
      u.save!
      expect(AiWordPredictor.predict(sentence: 'i want to', user: u)).to eq([])
      expect(AiWordPredictor).to have_received(:call_anthropic).once
    end

    it 'calls the model again when AI_CONSENT_HARD_GATE=false (emergency rollback)' do
      ENV['AI_CONSENT_HARD_GATE'] = 'false'
      expect(AiWordPredictor.predict(sentence: 'i want to', user: no_consent)).to eq(%w[play go eat help])
    end
  end

  describe AiBoardGenerator do
    let(:complete) { "WORDS: apple, banana, carrot, drink\nNAME: Snacks\nDESCRIPTION: Snack words." }

    before(:each) do
      allow(AiBoardGenerator).to receive(:call_anthropic).and_return(anthropic_response(complete))
    end

    it 'generate_words makes the model call for an account with a current consent (control)' do
      result = AiBoardGenerator.generate_words(prompt: 'snacks', rows: 2, columns: 2, user: consented)
      expect(result[:error]).to eq(nil)
      expect(result[:words]).to eq(%w[apple banana carrot drink])
    end

    it 'generate_words returns an error and makes no model call without a current consent' do
      [no_consent, stale, revoked].each do |u|
        result = AiBoardGenerator.generate_words(prompt: 'snacks', rows: 2, columns: 2, user: u)
        expect(result[:words]).to eq(nil)
        expect(result[:error]).to include('consent')
      end
      expect(AiBoardGenerator).not_to have_received(:call_anthropic)
      expect(AiApiLog).not_to have_received(:log_ai_call)
    end

    it 'generate_focus_words makes the model call for an account with a current consent (control)' do
      allow(AiBoardGenerator).to receive(:call_anthropic).and_return(anthropic_response("WORDS: go, stop, more, help, read\nTITLE: Story"))
      result = AiBoardGenerator.generate_focus_words(prompt: 'story time', word_count: 5, user: consented)
      expect(result[:error]).to eq(nil)
      expect(AiBoardGenerator).to have_received(:call_anthropic).at_least(:once)
    end

    it 'generate_focus_words returns an error and makes no model call without a current consent' do
      [no_consent, stale, revoked].each do |u|
        result = AiBoardGenerator.generate_focus_words(prompt: 'story time', word_count: 5, user: u)
        expect(result[:words]).to eq(nil)
        expect(result[:error]).to include('consent')
      end
      expect(AiBoardGenerator).not_to have_received(:call_anthropic)
    end
  end

  describe EvalNarrator do
    let(:payload) do
      { 'eval_mode' => 'comprehensive', 'intake' => {}, 'recommendation' => {}, 'sett' => {}, 'slp_notes' => 'notes', 'use_anthropic' => true }
    end

    before(:each) do
      allow(EvalNarrator).to receive(:anthropic_configured?).and_return(true)
      allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(true)
      allow(EvalNarrator).to receive(:call_anthropic).and_return(anthropic_response('Drafted narrative.'))
    end

    it 'drafts through the model for a student with a current consent (control)' do
      result = EvalNarrator.draft_narrative(payload, user: consented)
      expect(result['narrative']).to eq('Drafted narrative.')
      expect(EvalNarrator).to have_received(:call_anthropic).once
    end

    it 'returns the local template and makes no model call when the STUDENT has no current consent' do
      [no_consent, stale, revoked].each do |u|
        result = EvalNarrator.draft_narrative(payload, user: u)
        expect(result['narrative']).to be_present
        expect(result['narrative']).not_to eq('Drafted narrative.')
        expect(result['ai_generated']).to eq(nil)
      end
      expect(EvalNarrator).not_to have_received(:call_anthropic)
      expect(AiApiLog).not_to have_received(:log_ai_call)
    end

    # Withdrawal: "Allow AI features" turned off on the student's own account. Nothing else
    # at this call site reads that setting for the student.
    it 'returns the local template when the consented student has turned "Allow AI features" off' do
      [false, 'false', 0, '0', '', 'maybe'].each do |off|
        u = grant_test_ai_consent!(User.create)
        u.settings['preferences'] ||= {}
        u.settings['preferences']['ai_features_enabled'] = off
        u.save!
        expect(EvalNarrator.draft_narrative(payload, user: u)['ai_generated']).to eq(nil)
      end
      expect(EvalNarrator).not_to have_received(:call_anthropic)
    end

    it 'still drafts for a consented student who never set the preference, or set it on' do
      never = grant_test_ai_consent!(User.create)
      never.settings['preferences'].delete('ai_features_enabled') if never.settings['preferences']
      never.save!
      on = grant_test_ai_consent!(User.create)
      on.settings['preferences'] ||= {}
      on.settings['preferences']['ai_features_enabled'] = true
      on.save!
      expect(EvalNarrator.draft_narrative(payload, user: never)['narrative']).to eq('Drafted narrative.')
      expect(EvalNarrator.draft_narrative(payload, user: on)['narrative']).to eq('Drafted narrative.')
    end
  end

  describe 'a district-managed account' do
    let(:org) { Organization.create(settings: { 'total_licenses' => 3 }) }
    let(:manager) { User.create }

    before(:each) do
      allow(AiWordPredictor).to receive(:call_anthropic).and_return(anthropic_response('play, go, eat, help'))
    end

    it 'is covered by the district authorization and not by its own record' do
      managed = grant_test_ai_consent!(User.create)
      org.add_user(managed.user_name, false)
      managed.reload
      expect(AiWordPredictor.predict(sentence: 'i want to', user: managed)).to eq([])
      org.authorize_ai!(authorized_by: manager)
      expect(AiWordPredictor.predict(sentence: 'i want to', user: managed.reload)).to eq(%w[play go eat help])
    end

    it 'is not covered by a district that has only invited the account (pending attachment)' do
      org.authorize_ai!(authorized_by: manager)
      invited = User.create
      org.add_user(invited.user_name, true)
      invited.reload
      expect(Organization.ai_consent_orgs_for(invited)).to eq([])
      expect(AiWordPredictor.predict(sentence: 'i want to', user: invited)).to eq([])
      # ...and the invitation does not take away the consent the account gave for itself.
      grant_test_ai_consent!(invited)
      expect(AiWordPredictor.predict(sentence: 'i want to', user: invited)).to eq(%w[play go eat help])
    end

    it 'needs every district that manages the account to have authorized AI' do
      other = Organization.create(settings: { 'total_licenses' => 3 })
      managed = User.create
      org.add_user(managed.user_name, false)
      other.add_user(managed.user_name, false, false)
      managed.reload
      expect(Organization.ai_consent_orgs_for(managed).map(&:global_id).sort).to eq([org.global_id, other.global_id].sort)
      org.authorize_ai!(authorized_by: manager)
      expect(FeatureFlags.ai_consent_blocks_ai_for?(managed.reload)).to eq(true)
      other.authorize_ai!(authorized_by: manager)
      expect(FeatureFlags.ai_consent_blocks_ai_for?(managed.reload)).to eq(false)
    end

    it 'records who authorized, when and at which disclosure version, with one audit event each way' do
      expect { expect(org.authorize_ai!(authorized_by: manager)).to eq(true) }
        .to change { AuditEvent.where(event_type: 'org_ai_authorization_grant').count }.by(1)
      a = org.reload.settings['ai_authorization']
      expect(a['authorized_by']).to eq(manager.global_id)
      expect(a['authorized_at']).to be_present
      expect(a['disclosures_version']).to eq(LingoLinq::AiConsentDisclosures::CURRENT_VERSION)
      expect(org.authorize_ai!(authorized_by: manager)).to eq(false)
      expect { expect(org.revoke_ai_authorization!(revoked_by: manager)).to eq(true) }
        .to change { AuditEvent.where(event_type: 'org_ai_authorization_revoke').count }.by(1)
      expect(org.reload.ai_authorized?).to eq(false)
      expect(org.revoke_ai_authorization!(revoked_by: manager)).to eq(false)
      expect { org.authorize_ai!(authorized_by: nil) }.to raise_error(ArgumentError, 'invalid_authorized_by')
    end
  end
end

# frozen_string_literal: true

require 'spec_helper'

# AI data-sharing consent (#1136) at the five AI endpoints. The real
# FeatureFlags.ai_consent_blocks_ai_for? runs here (this file does NOT include the
# 'ai data-sharing consent given' context). Every other gate is opened so that the
# consent check is the only thing that can refuse.
shared_context 'every other AI gate open' do
  before(:each) do
    allow(FeatureFlags).to receive(:ai_feature_enabled_for?).and_return(true)
    allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
    allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
    allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
    allow(FeatureFlags).to receive(:feature_enabled_for?).with('article_50_disclosure', anything).and_return(false)
  end

  def expect_consent_required
    expect(response).to have_http_status(403)
    json = JSON.parse(response.body)
    expect(json['error']).to eq('ai_consent_required')
    expect(json['disclosures_version']).to eq(LingoLinq::AiConsentDisclosures::CURRENT_VERSION)
    json
  end
end

describe Api::WordsController, type: :controller do
  include_context 'every other AI gate open'

  it 'predict: 403 ai_consent_required and no predictor call without a consent' do
    token_user
    expect(AiWordPredictor).not_to receive(:predict)
    post :predict, params: { 'sentence' => 'I want to' }
    expect_consent_required
  end

  it 'predict: reaches the predictor once the account has a current consent' do
    token_user
    grant_test_ai_consent!(@user)
    expect(AiWordPredictor).to receive(:predict).and_return(%w[play go])
    post :predict, params: { 'sentence' => 'I want to' }
    expect(assert_success_json).to eq({ 'words' => %w[play go] })
  end

  it 'predict: an account with AI not enabled still gets the existing answer, not the consent one' do
    allow(FeatureFlags).to receive(:ai_feature_enabled_for?).and_return(false)
    token_user
    post :predict, params: { 'sentence' => 'I want to' }
    expect(response).to have_http_status(400)
    expect(JSON.parse(response.body)['error']).to eq('ai_word_prediction is not enabled for this user')
  end
end

describe Api::WordSuggestionsController, type: :controller do
  include_context 'every other AI gate open'

  it 'create: 403 ai_consent_required with the words: [] shape and no predictor call without a consent' do
    token_user
    expect(AiWordPredictor).not_to receive(:predict_from_tokens)
    post :create, params: { words: ['when'] }
    expect(expect_consent_required['words']).to eq([])
  end

  it 'create: reaches the predictor once the account has a current consent' do
    token_user
    grant_test_ai_consent!(@user)
    expect(AiWordPredictor).to receive(:predict_from_tokens).and_return(%w[do you])
    post :create, params: { words: ['when'] }
    expect(JSON.parse(response.body)['words']).to eq(%w[do you])
  end
end

describe Api::BoardsController, type: :controller do
  include_context 'every other AI gate open'

  def post_generate
    request.headers['Content-Type'] = 'application/json'
    post :generate_labels, params: {}, body: { prompt: 'snacks', rows: 2, columns: 2 }.to_json
  end

  it 'generate_labels: 403 ai_consent_required and no generator call without a consent' do
    token_user
    expect(AiBoardGenerator).not_to receive(:generate_words)
    post_generate
    expect_consent_required
  end

  it 'generate_labels: reaches the generator once the account has a current consent' do
    token_user
    grant_test_ai_consent!(@user)
    expect(AiBoardGenerator).to receive(:generate_words)
      .and_return({ words: %w[apple banana carrot drink], name: 'Snacks', description: 'Snack words', error: nil })
    post_generate
    expect(response).to be_successful
  end
end

describe Api::IntegrationsController, type: :controller do
  include_context 'every other AI gate open'

  before(:each) do
    allow(PiiScrubber).to receive(:redact_for_ai).and_return({ payload: 'grinch lesson', pii_found: false, findings: [] })
  end

  let!(:focus_set) do
    AiFocusWordSet.create!(scrubbed_prompt: 'grinch lesson', locale: 'en', include_core_words: true,
                           title: 'Grinch Words', words: %w[go stop more help read])
  end

  def post_focus
    post :focus_generate_words, params: { prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true }
  end

  # The stored set would answer this request without calling the generator at all, so
  # only a check in the controller, above the lookup, can refuse it.
  it 'focus_generate_words: 403 ai_consent_required on a stored-set hit, and the hit is not counted' do
    token_user
    expect(AiBoardGenerator).not_to receive(:generate_focus_words)
    post_focus
    expect_consent_required
    expect(focus_set.reload.cache_hit_count.to_i).to eq(0)
  end

  it 'focus_generate_words: serves the stored set once the account has a current consent' do
    token_user
    grant_test_ai_consent!(@user)
    post_focus
    expect(assert_success_json['words']).to eq('go, stop, more, help, read')
  end
end

describe Api::EvalSessionsController, type: :controller do
  include_context 'every other AI gate open'
  restore_env_after_each('BEDROCK_AWS_REGION', 'BEDROCK_AWS_KEY', 'BEDROCK_AWS_SECRET')

  let(:eval_payload) { { eval_mode: 'comprehensive', intake: {}, recommendation: {}, sett: {}, slp_notes: '' } }

  before(:each) do
    allow(EvalNarrator).to receive(:anthropic_configured?).and_return(true)
    allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(true)
    allow(AiApiLog).to receive(:log_ai_call)
    usage = double('usage', input_tokens: 10, output_tokens: 20)
    block = double('text_block', type: 'text', text: 'AI drafted narrative.')
    allow(EvalNarrator).to receive(:call_anthropic).and_return(double('anthropic_response', content: [block], usage: usage))
  end

  # The clinician (@user) has a consent; the student does not. The student is the data subject.
  it 'narrate: returns the local template with ai_consent_required when the STUDENT has no consent' do
    token_user
    grant_test_ai_consent!(@user)
    student = User.create
    User.link_supervisor_to_user(@user, student, nil, true)
    post :narrate, params: { eval_session: eval_payload, user_id: student.global_id, use_anthropic: true }
    json = assert_success_json
    expect(json['narrative']).to be_present
    expect(json['narrative']).not_to eq('AI drafted narrative.')
    expect(json['ai_generated']).to eq(nil)
    expect(json['ai_consent_required']).to eq(true)
    expect(EvalNarrator).not_to have_received(:call_anthropic)
  end

  it 'narrate: drafts through the model when the student has a current consent and AI turned on, even if the clinician has none' do
    token_user
    student = grant_test_ai_consent_with_ai_on!(User.create)
    User.link_supervisor_to_user(@user, student, nil, true)
    post :narrate, params: { eval_session: eval_payload, user_id: student.global_id, use_anthropic: true }
    json = assert_success_json
    expect(json['narrative']).to eq('AI drafted narrative.')
    expect(json).not_to have_key('ai_consent_required')
  end

  it 'narrate: does not report ai_consent_required when no AI draft was asked for' do
    token_user
    student = User.create
    User.link_supervisor_to_user(@user, student, nil, true)
    post :narrate, params: { eval_session: eval_payload, user_id: student.global_id }
    json = assert_success_json
    expect(json['narrative']).to be_present
    expect(json).not_to have_key('ai_consent_required')
  end
end

# frozen_string_literal: true

require 'spec_helper'

# Claude Haiku 5.5 runs adaptive thinking by default. Every Tier 1 seam must turn
# it off explicitly, or thinking tokens eat max_tokens (60 for word prediction)
# and a thinking block can precede the text block the seams read. See
# AiClient::RUNTIME_THINKING.
describe 'Tier 1 runtime seams: model and thinking settings' do
  let(:messages) { double('messages') }
  let(:client) { double('client', messages: messages) }

  before do
    allow(AiClient).to receive(:build!).and_return(client)
    allow(messages).to receive(:create).and_return({ 'content' => [{ 'type' => 'text', 'text' => 'ok' }] })
  end

  it 'disables thinking as an explicit setting' do
    expect(AiClient::RUNTIME_THINKING).to eq({ type: :disabled })
  end

  it 'AiWordPredictor defaults to Haiku 5.5 and sends thinking disabled' do
    expect(AiWordPredictor::DEFAULT_ANTHROPIC_MODEL).to eq('anthropic.claude-haiku-5-5')
    AiWordPredictor.send(:call_anthropic, { model: 'm' }, 'I want', 'en', 3, {})
    expect(messages).to have_received(:create).with(hash_including(thinking: { type: :disabled }, max_tokens: 60))
  end

  it 'AiBoardGenerator defaults to Haiku 5.5 and sends thinking disabled' do
    expect(AiBoardGenerator::DEFAULT_MODEL).to eq('anthropic.claude-haiku-5-5')
    AiBoardGenerator.send(:call_anthropic, region: 'us-west-2', model: 'm', system_prompt: 's',
                                           user_prompt: 'u', cell_count: 4)
    expect(messages).to have_received(:create).with(hash_including(thinking: { type: :disabled }))
  end

  it 'AiPredictionGenerator sends thinking disabled' do
    AiPredictionGenerator.send(:call_anthropic, { model: 'm' }, 'prompt')
    expect(messages).to have_received(:create).with(hash_including(thinking: { type: :disabled }))
  end

  it 'AiPredictionGenerator resolves the Haiku 5.5 default' do
    allow(AiClient).to receive(:available?).and_return(true)
    allow(AiClient).to receive(:bedrock_region).and_return('us-west-2')
    config = AiPredictionGenerator.send(:resolve_api_config)
    expect(config[:model]).to eq(AiClient.runtime_model('anthropic.claude-haiku-5-5'))
    expect(AiClient.canonical_alias(config[:model])).to eq('anthropic.claude-haiku-5-5')
  end
end

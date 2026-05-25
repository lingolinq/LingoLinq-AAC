# frozen_string_literal: true

require 'spec_helper'

describe Api::WordSuggestionsController, type: :controller do
  describe 'POST create' do
    it 'requires an api token' do
      post :create, params: { words: ['when'] }
      assert_missing_token
    end

    it 'returns 400 when words are empty' do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      post :create, params: { words: [] }
      expect(response.status).to eq(400)
      json = JSON.parse(response.body)
      expect(json['words']).to eq([])
    end

    it 'returns 403 when ai_word_prediction is disabled' do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(false)
      post :create, params: { words: ['when'] }
      expect(response.status).to eq(403)
    end

    it 'returns 503 when ANTHROPIC_API_KEY is missing' do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('ANTHROPIC_API_KEY').and_return('')
      post :create, params: { words: ['when'], context: { time_of_day: 'morning', topic: '' } }
      expect(response.status).to eq(503)
      json = JSON.parse(response.body)
      expect(json['words']).to eq([])
    end

    it 'returns words from Claude on success' do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('ANTHROPIC_API_KEY').and_return('test-key')
      expect_any_instance_of(Api::WordSuggestionsController).to receive(:call_anthropic!).and_return(%w[do you can I will is it])

      post :create, params: { words: ['when'], context: { time_of_day: 'morning', topic: '' } }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['words']).to eq(%w[do you can I will is it])
    end
  end
end

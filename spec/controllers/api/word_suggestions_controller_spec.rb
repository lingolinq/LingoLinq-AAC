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

    it 'returns empty words when no API key is configured' do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('ANTHROPIC_API_KEY').and_return('')
      allow(ENV).to receive(:[]).with('GEMINI_API_KEY').and_return('')
      post :create, params: { words: ['when'], context: { time_of_day: 'morning', topic: '' } }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['words']).to eq([])
    end

    it 'returns words from AiWordPredictor on success' do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      expect(AiWordPredictor).to receive(:predict_from_tokens).and_return(%w[do you can I will is it])

      post :create, params: { words: ['when'], context: { time_of_day: 'morning', topic: '' } }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['words']).to eq(%w[do you can I will])
    end

    describe "article_50_disclosure backstop (LL-6723438462)" do
      it "proceeds normally with the flag NOT enabled, regardless of jurisdiction or acknowledgement" do
        token_user
        allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
        allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
        allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
        expect(AiWordPredictor).to receive(:predict_from_tokens).and_return(%w[do you can])

        post :create, params: { words: ['when'], context: { time_of_day: 'morning', topic: '' } }
        expect(response).to be_successful
      end

      it "returns 403 with the words: [] shape and never calls the predictor when the flag is enabled, in scope, and unacknowledged" do
        token_user
        allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
        allow(FeatureFlags).to receive(:feature_enabled_for?).with('article_50_disclosure', anything).and_return(true)
        allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
        allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
        expect(AiWordPredictor).not_to receive(:predict_from_tokens)

        post :create, params: { words: ['when'], context: { time_of_day: 'morning', topic: '' } }
        expect(response.status).to eq(403)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('article_50_disclosure_required')
        expect(json['words']).to eq([])
      end
    end
  end
end

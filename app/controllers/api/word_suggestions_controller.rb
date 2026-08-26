# frozen_string_literal: true

require 'timeout'

# AI-assisted next-word suggestions for the AAC prediction bar.
# Requires a valid API token. Delegates to AiWordPredictor.
class Api::WordSuggestionsController < ApplicationController
  before_action :require_api_token

  REQUEST_TIMEOUT_S = 8

  def create
    unless FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', @api_user)
      return render json: { error: 'ai_word_prediction is not enabled for this user', words: [] }, status: 403
    end
    if FeatureFlags.coppa_blocks_ai_for?(@api_user)
      return render json: { error: 'parental consent required', words: [] }, status: 403
    end
    if FeatureFlags.eu_under16_blocks_ai_for?(@api_user)
      return render json: { error: 'parental consent required', words: [] }, status: 403
    end
    # EU AI Act Article 50(1) server-side backstop (shared helper LL-6723438462):
    # a client that skips the ai-disclosure modal and calls this endpoint directly
    # must still be refused. See ApplicationController#article_50_disclosure_missing?.
    # Rendered locally (not via require_article_50_disclosure!) to keep this
    # controller's `words: []` response shape on every refusal, matching its siblings
    # above.
    if article_50_disclosure_missing?
      return render json: { error: 'article_50_disclosure_required', words: [] }, status: 403
    end

    token_words = Array.wrap(word_suggestion_params[:words]).map(&:to_s).map(&:strip).reject(&:blank?).first(12)
    if token_words.empty?
      return render json: { error: 'words required', words: [] }, status: 400
    end

    ctx = (word_suggestion_params[:context] || {}).stringify_keys
    locale = word_suggestion_params[:locale].presence || @api_user&.settings&.dig('locale')&.split(/[-_]/)&.first || 'en'

    predicted = begin
      Timeout.timeout(REQUEST_TIMEOUT_S) do
        AiWordPredictor.predict_from_tokens(
          words: token_words,
          locale: locale,
          count: 5,
          user: @api_user,
          context: {
            time_of_day: ctx['time_of_day'].to_s.presence || 'unspecified',
            topic: ctx['topic'].to_s
          }
        )
      end
    rescue Timeout::Error
      Rails.logger.warn('[WordSuggestionsController] AI request timed out')
      return render json: { words: [], error: 'timeout' }, status: 504
    rescue StandardError => e
      Rails.logger.error("[WordSuggestionsController] #{e.class}: #{e.message}")
      return render json: { words: [], error: 'upstream_error' }, status: 502
    end

    predicted = Array.wrap(predicted).map(&:to_s).map(&:strip).reject(&:blank?).first(5)
    render json: { words: predicted }
  end

  private

  def word_suggestion_params
    ctx = params[:context]
    ctx_h = if ctx.is_a?(ActionController::Parameters)
              ctx.permit(:time_of_day, :topic).to_h
            elsif ctx.is_a?(Hash)
              ctx.stringify_keys.slice('time_of_day', 'topic')
            else
              {}
            end
    {
      words: Array.wrap(params[:words]),
      context: ctx_h,
      locale: params[:locale]
    }
  end
end

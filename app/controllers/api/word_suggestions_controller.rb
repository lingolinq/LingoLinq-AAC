# frozen_string_literal: true

require 'timeout'

# AI-assisted next-word suggestions for the AAC prediction bar.
# Requires a valid API token. Uses Anthropic when ANTHROPIC_API_KEY is set.
class Api::WordSuggestionsController < ApplicationController
  before_action :require_api_token

  MODEL = 'claude-sonnet-4-20250514'
  REQUEST_TIMEOUT_S = 8

  SYSTEM_PROMPT = <<~PROMPT.freeze
    You are a word prediction engine for an AAC (Augmentative and Alternative Communication)
    app. Given the last word or phrase a user selected, return the 5 most useful next word
    predictions. These should feel like natural AAC communication — practical,
    conversational, and complete-thought-oriented. Consider the time of day and topic
    context if provided. Return ONLY a JSON array of 5 strings, nothing else.
    Example: ["do you", "can I", "will you", "is it", "I need"]
  PROMPT

  def create
    unless FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', @api_user)
      return render json: { error: 'ai_word_prediction is not enabled for this user', words: [] }, status: 403
    end
    if FeatureFlags.coppa_blocks_ai_for?(@api_user)
      return render json: { error: 'parental consent required', words: [] }, status: 403
    end

    token_words = Array.wrap(word_suggestion_params[:words]).map(&:to_s).map(&:strip).reject(&:blank?).first(12)
    if token_words.empty?
      return render json: { error: 'words required', words: [] }, status: 400
    end

    ctx = (word_suggestion_params[:context] || {}).stringify_keys
    time_of_day = ctx['time_of_day'].to_s.presence || 'unspecified'
    topic = ctx['topic'].to_s

    api_key = ENV['ANTHROPIC_API_KEY'].to_s.strip
    if api_key.blank?
      return render json: { words: [], error: 'ai_unavailable' }, status: 503
    end

    user_payload = { words: token_words, context: { time_of_day: time_of_day, topic: topic } }.to_json
    scrubbed = scrub_for_ai(user_payload)
    predicted = begin
      Timeout.timeout(REQUEST_TIMEOUT_S) do
        call_anthropic!(api_key, scrubbed)
      end
    rescue Timeout::Error
      Rails.logger.warn('[WordSuggestionsController] Anthropic request timed out')
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
    { words: Array.wrap(params[:words]), context: ctx_h }
  end

  def scrub_for_ai(text)
    require_relative '../../../lib/pii_scrubber' unless defined?(PiiScrubber)
    if @api_user
      names = []
      names << @api_user.user_name if @api_user.respond_to?(:user_name) && @api_user.user_name.present?
      if @api_user.respond_to?(:settings) && @api_user.settings.is_a?(Hash) && @api_user.settings['full_name'].present?
        names << @api_user.settings['full_name']
      end
      PiiScrubber.configure_blocklist(names)
    end
    PiiScrubber.redact_for_ai(text)[:payload]
  end

  def call_anthropic!(api_key, user_json_string)
    require 'anthropic'
    client = Anthropic::Client.new(api_key: api_key)
    response = client.messages.create(
      model: MODEL,
      max_tokens: 256,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user_json_string }]
    )
    raw = extract_anthropic_text(response)
    parse_json_word_array(raw)
  end

  def extract_anthropic_text(response)
    return '' unless response&.respond_to?(:content) && response.content.is_a?(Array)
    text_blocks = response.content.select { |b| b.respond_to?(:type) && b.type.to_s == 'text' }
    text_blocks.map { |b| b.respond_to?(:text) ? b.text : b.to_s }.join("\n").strip
  end

  def parse_json_word_array(raw)
    text = raw.to_s.strip
    if text.start_with?('```')
      text = text.sub(/\A```(?:json)?\s*/i, '').sub(/\s*```\z/, '')
    end
    arr = JSON.parse(text)
    return [] unless arr.is_a?(Array)
    arr
  rescue JSON::ParserError
    # Last resort: split on commas if model returned prose-ish list
    text.split(',').map(&:strip).reject(&:blank?)
  end
end

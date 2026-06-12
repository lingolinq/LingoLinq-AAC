# frozen_string_literal: true

class Api::PredictionEntriesController < ApplicationController
  before_action :require_api_token

  MAX_SYNC_BATCH = 100

  def index
    locale = (params[:locale] || 'en').to_s.split(/[-_]/).first
    prefix = PredictionEntry.normalize_prefix(params[:prefix])
    entries = PredictionEntry.for_prefix(@api_user, locale, prefix)
    render json: {
      entries: entries.map do |entry|
        {
          next_word: entry.next_word,
          score: entry.score,
          source: entry.source
        }
      end
    }
  end

  def sync
    entries = sync_params
    if entries.length > MAX_SYNC_BATCH
      return api_error(400, { error: 'Too many prediction entries' })
    end

    result = PredictionEntry.sync_for_user(@api_user, entries)
    if result[:errors].any?
      api_error(400, { error: 'prediction entry sync failed', errors: result[:errors] })
    else
      render json: { prediction_entries: { count: result[:saved] } }
    end
  end

  private

  def sync_params
    raw = params[:prediction_entries] || params['prediction_entries']
    raw ||= [params[:prediction_entry] || params['prediction_entry']]
    raw = raw.values if raw.is_a?(Hash)
    raw = [raw] unless raw.is_a?(Array)
    raw.compact.map do |entry|
      entry = entry.permit(:locale, :prefix, :next_word, :delta, :source) if entry.is_a?(ActionController::Parameters)
      entry.respond_to?(:to_unsafe_h) ? entry.to_unsafe_h : entry.to_h
    end
  end
end

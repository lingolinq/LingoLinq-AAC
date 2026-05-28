# frozen_string_literal: true

class PredictionEntry < ApplicationRecord
  belongs_to :user

  validates :locale, :prefix, :next_word, presence: true
  validates :score, numericality: { greater_than: 0 }

  MAX_SYNC_BATCH = 100
  DEFAULT_LIMIT = 8

  def self.normalize_prefix(value)
    value.to_s.strip.downcase.gsub(/\s+/, ' ')
  end

  def self.normalize_word(value)
    value.to_s.strip.downcase.gsub(/\s+/, ' ')
  end

  def self.for_prefix(user, locale, prefix, limit: DEFAULT_LIMIT)
    return [] unless user

    where(user_id: user.id, locale: locale, prefix: normalize_prefix(prefix))
      .order(score: :desc, updated_at: :desc)
      .limit(limit)
  end

  def self.sync_for_user(user, entries)
    return { saved: 0, errors: [] } unless user

    saved = 0
    errors = []
    Array.wrap(entries).first(MAX_SYNC_BATCH).each do |raw|
      data = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h
      locale = (data['locale'] || data[:locale] || 'en').to_s.split(/[-_]/).first
      prefix = normalize_prefix(data['prefix'] || data[:prefix])
      next_word = normalize_word(data['next_word'] || data[:next_word])
      delta = (data['delta'] || data[:delta] || 1).to_f
      source = (data['source'] || data[:source] || 'selection').to_s

      if next_word.blank?
        errors << 'next_word required'
        next
      end

      entry = find_or_initialize_by(
        user_id: user.id,
        locale: locale,
        prefix: prefix,
        next_word: next_word
      )
      entry.score = (entry.persisted? ? entry.score : 0) + [delta, 0.1].max
      entry.source = source if entry.new_record? || source != 'selection'
      if entry.save
        saved += 1
      else
        errors.concat(entry.errors.full_messages)
      end
    end

    { saved: saved, errors: errors.uniq }
  end
end

require 'digest'
require 'json'
# Art50Marker is require_relative'd (not autoloaded) so it is defined even on the
# Resque-worker path where lib/ autoload is skipped, matching app/models/board.rb.
require_relative '../../lib/art50_marker'

class AiFocusWordSet < ApplicationRecord
  include GlobalId

  MAX_STORED_WORDS = 200
  STATUSES = %w[generated reviewed curated hidden].freeze
  SOURCES = %w[ai curated workshop].freeze

  before_validation :normalize_defaults

  validates :scrubbed_prompt, presence: true
  validates :normalized_prompt, presence: true
  validates :prompt_hash, presence: true, uniqueness: true
  validates :locale, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :source, inclusion: { in: SOURCES }

  scope :visible, -> { where.not(status: 'hidden') }
  scope :low_value, -> {
    where('cache_hit_count = 0 AND applied_count = 0 AND created_at < ?', 90.days.ago)
  }

  def self.normalize_prompt(prompt)
    prompt.to_s.downcase.gsub(/\s+/, ' ').strip
  end

  def self.normalize_locale(locale)
    locale.to_s.presence || 'en'
  end

  def self.hash_for(scrubbed_prompt:, locale:, include_core_words:)
    normalized = normalize_prompt(scrubbed_prompt)
    locale_key = normalize_locale(locale)
    core_key = include_core_words ? 'core' : 'topic'
    Digest::SHA256.hexdigest([normalized, locale_key, core_key].join('|'))
  end

  def self.find_for(scrubbed_prompt:, locale:, include_core_words:)
    visible.find_by(prompt_hash: hash_for(
      scrubbed_prompt: scrubbed_prompt,
      locale: locale,
      include_core_words: include_core_words
    ))
  end

  def words
    decode_word_list(self[:words])
  end

  def words=(list)
    encoded = normalize_word_list(list)
    self[:words] = encoded.to_json
    self.word_count = encoded.length
  end

  def applied_words
    decode_word_list(self[:applied_words])
  end

  def applied_words=(list)
    self[:applied_words] = normalize_word_list(list).to_json
  end

  def add_generated_words(new_words)
    self.words = words + normalize_word_list(new_words)
  end

  def record_generation!(new_words:, title: nil, user: nil, marker: nil)
    self.title = title.to_s.strip.presence || self.title
    self.seed_user_global_id ||= user.global_id if user && user.respond_to?(:global_id)
    org = user && user.respond_to?(:managing_organization) ? user.managing_organization : nil
    self.seed_organization_global_id ||= org.global_id if org && org.respond_to?(:global_id)
    add_generated_words(new_words)
    self.generated_count = generated_count.to_i + 1
    self.last_generated_at = Time.now
    # EU AI Act Article 50(2): mark the AI-generated word list. Guarded on `marker` so a
    # nil (e.g. a cache-hit re-record) never wipes an existing valid marker; the setter
    # re-verifies, so only a freshly signed marker replaces the stored one.
    self.ai_generated_marker = marker if marker
    save!
  end

  # EU AI Act Article 50(2) marker for the AI-generated word list, stored as a JSON blob
  # in the `ai_generated` text column (mirrors board.settings['ai_generated']). Every read
  # re-verifies via Art50Marker, so a forged or key-rotation-invalidated marker reads as
  # unmarked (nil), never as "verified AI-generated".
  def ai_generated_marker
    Art50Marker.normalized(parsed_ai_generated)
  end

  # Non-secret provenance view for API exposure (withholds signature + content_id).
  def ai_generated_public_view
    Art50Marker.public_view(parsed_ai_generated)
  end

  def ai_generated_marker=(marker)
    normalized = marker && Art50Marker.normalized(marker)
    self[:ai_generated] = normalized ? normalized.to_json : nil
  end

  def record_cache_hit!
    self.cache_hit_count = cache_hit_count.to_i + 1
    save!
  end

  def record_usage!(final_words:, action:)
    self.applied_words = applied_words + normalize_word_list(final_words)
    if action.to_s == 'analyze_focus_words'
      self.analysis_count = analysis_count.to_i + 1
      self.last_analyzed_at = Time.now
    else
      self.applied_count = applied_count.to_i + 1
      self.last_applied_at = Time.now
    end
    self.status = 'reviewed' if status == 'generated' && applied_words.any?
    save!
  end

  private

  # Parses the stored ai_generated JSON blob into a hash for Art50Marker to verify.
  # Returns nil for a blank column or unparseable content (treated as unmarked).
  def parsed_ai_generated
    raw = self[:ai_generated]
    return nil if raw.blank?
    JSON.parse(raw)
  rescue JSON::ParserError
    nil
  end

  def normalize_defaults
    self.scrubbed_prompt = scrubbed_prompt.to_s.strip
    self.normalized_prompt = self.class.normalize_prompt(scrubbed_prompt)
    self.locale = self.class.normalize_locale(locale)
    self.source = source.presence || 'ai'
    self.status = status.presence || 'generated'
    self.include_core_words = true if include_core_words.nil?
    self.prompt_hash = self.class.hash_for(
      scrubbed_prompt: scrubbed_prompt,
      locale: locale,
      include_core_words: include_core_words
    )
    self.words = words if self[:words].blank?
    self.applied_words = applied_words if self[:applied_words].blank?
  end

  def decode_word_list(raw)
    parsed = JSON.parse(raw.to_s) rescue []
    normalize_word_list(parsed)
  end

  def normalize_word_list(list)
    Array(list)
      .flat_map { |item| item.to_s.split(/[,;\s]+/) }
      .map { |word| word.strip }
      .reject(&:blank?)
      .uniq { |word| word.downcase }
      .first(MAX_STORED_WORDS)
  end
end

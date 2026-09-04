# Pure classification for the special-vocalization damage scan. No Rails, no DB — every
# input is a plain Hash/Array, so the shapes can be exercised against fixtures instead of
# against real boards (see special_vocalization_scan_check.rb).
#
# `scripts/scan-lost-special-vocalizations.rb` supplies the traversal and the repair; this
# file owns the question "did this button lose a special vocalization, and where can the
# original be read back from".
module SpecialVocalizationScan
  # A vocalization beginning ':' or '+' is an ACTION, not a word: ':suggestion' marks a
  # word-prediction slot, '+q' appends a letter, ':shift'/':space' do what they say, '+n't'
  # inflects. `specialty_actions` dispatches purely on this string.
  SPECIAL = /^[:+]/

  # Keys of settings['translations'] that are not button ids.
  TRANS_RESERVED = ['default', 'current_label', 'current_vocalization', 'board_name'].freeze

  # Shapes with a definite source value on the record itself, ordered by confidence.
  REPAIRABLE = ['override_nil', 'content_drop', 'label_swap', 'translations'].freeze
  # Shapes where the value has to come from somewhere else, or is only inferred.
  REPORT_ONLY = ['baked_ancestor', 'keyboard_shape'].freeze

  KEYBOARD_WORDS = ['space', 'shift', 'delete', 'backspace'].freeze

  module_function

  def special?(value)
    !!(value.to_s =~ SPECIAL)
  end

  # The translations map is a witness in its own right: a vocalization entry starting ':' or
  # '+' only ever got there by being copied off the button's own special.
  # `update_default_locale!` writes exactly that (relinking.rb:176) BEFORE overwriting the
  # button, so for the relinking shape the witness IS the repair source.
  def translation_witness(translations, button_id)
    entry = translations[button_id.to_s]
    return nil unless entry.is_a?(Hash)
    entry.each do |locale, fields|
      next if TRANS_RESERVED.include?(locale)
      next unless fields.is_a?(Hash)
      return fields['vocalization'] if special?(fields['vocalization'])
    end
    nil
  end

  # => { shape => [[button_id, value_to_restore], ...] }
  #
  # `effective` is what load_content serves (content + overrides, or the board's own array).
  # `base` is the shared BoardContent's buttons. `own_buttons` is settings['buttons'], which
  # load_content PREFERS when present — so a board can serve damaged buttons while its
  # content row is intact.
  def classify(effective:, base: [], overrides: {}, own_buttons: nil, translations: {})
    base_by_id = {}
    (base || []).each { |b| base_by_id[b['id'].to_s] = b }
    found = Hash.new { |h, k| h[k] = [] }
    has_own = !(own_buttons.nil? || own_buttons.empty?)

    (effective || []).each do |btn|
      next if special?(btn['vocalization'])
      id = btn['id'].to_s
      base_val = (base_by_id[id] || {})['vocalization']
      witness = translation_witness(translations || {}, id)
      override = (overrides || {})[id]
      nulled = override.is_a?(Hash) && override.key?('vocalization') && override['vocalization'].nil?

      if nulled && special?(base_val)
        found['override_nil'] << [id, base_val]
      elsif special?(base_val) && has_own
        found['content_drop'] << [id, base_val]
      elsif !btn['vocalization'].to_s.empty? && btn['vocalization'] == btn['label'] &&
            (special?(base_val) || witness)
        found['label_swap'] << [id, special?(base_val) ? base_val : witness]
      elsif witness
        found['translations'] << [id, witness]
      end
    end
    found
  end

  # Board-level fallbacks, used only when `classify` found nothing to repair.
  # => [shape, count, detail] or nil
  def board_level(effective:, ancestor_specials: 0, ancestor_key: nil)
    effective ||= []
    live = effective.count { |b| special?(b['vocalization']) }

    # Partial loss counts. Requiring ZERO specials misses a board that kept some, which
    # `update_default_locale!` can produce: it only rewrites buttons that have an entry for
    # the new locale.
    if ancestor_specials > live
      return ['baked_ancestor', ancestor_specials - live,
              "ancestor #{ancestor_key} has #{ancestor_specials}, this has #{live}"]
    end
    return nil unless live.zero?

    letters = effective.count { |b| b['label'].to_s.strip.length == 1 && b['label'].to_s =~ /[[:alpha:]]/ }
    named = effective.any? { |b| KEYBOARD_WORDS.include?(b['label'].to_s.strip.downcase) }
    if letters >= 15 || (letters >= 5 && named)
      return ['keyboard_shape', letters, named ? 'has a space/shift/delete button' : nil]
    end
    nil
  end
end

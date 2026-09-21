require 'spec_helper'

# Guards the source shape that makes i18n_generator.rb file a string under the WRONG key.
#
# THE DEFECT THIS ENCODES
#   i18n_generator.rb reads a key, then scans forward for the next DOUBLE quote to find
#   that key's default (i18n_generator.rb:136-140). It accepts only a double-quoted
#   default, by the CLAUDE.md convention that user-facing strings are double-quoted and
#   everything else is single-quoted. So when one source line holds
#
#     i18n.t('name_key', 'Short Name')   ...   i18n.t('desc_key', "A long description")
#      ^ single-quoted default (convention violation)        ^ the next double quote
#
#   the scanner reads `name_key`, walks straight past 'Short Name' because the quote type
#   is wrong, and captures the DESCRIPTION instead. `name_key` is then written to
#   en.json holding the description's text, and `desc_key` is skipped entirely.
#
#   This shipped: all nine evaluation-tool section names in app/frontend/app/utils/eval.js
#   held their own descriptions in en.json, and those nine wrong values were then machine
#   translated into all twelve non-English locales. English was unaffected and so nobody
#   noticed -- initializers/attempt_lang.js:38 returns early for `en` and never loads
#   en.json, so English renders the inline defaults from the source.
#
# WHY THE CHECK IS SHAPED THIS WAY
#   It is NOT "the en.json value equals the source default". 68 keys legitimately differ,
#   because record_string (i18n_generator.rb:86-95) deliberately preserves an existing
#   English value over the inline default. Those are intentional rewordings, not bugs.
#   The corrupting SHAPE is what is unambiguous, so that is what is pinned.
#
#   A line whose i18n.t calls are ALL single-quoted is a different (and much larger)
#   problem -- those keys are invisible to the generator and never reach any locale file
#   at all, e.g. `i18n.t('am', 'am')` in components/sidebar-button-settings.js:118. That
#   class is ~115 keys and is out of scope here; this spec pins only the shape that
#   silently writes a WRONG value.
describe 'i18n mixed-quote key/value desync' do
  # An i18n.t( call whose default is SINGLE-quoted.
  SINGLE_DEFAULT_CALL = /i18n\.t\(\s*'([^']+)'\s*,\s*'(?:[^'\\]|\\.)*'/

  let(:offenders) do
    found = []
    Dir.glob(Rails.root.join('app/frontend/app/**/*.js')).sort.each do |path|
      rel = path.sub(Rails.root.to_s + '/', '')
      File.readlines(path).each_with_index do |line, idx|
        line.scan(SINGLE_DEFAULT_CALL) do |(key)|
          # Corruption only happens if a double-quoted string follows on the SAME line:
          # that is what the scanner will grab and misfile under `key`.
          tail = Regexp.last_match.post_match
          next unless tail.include?('"')
          found << "#{rel}:#{idx + 1}  key '#{key}' would capture a later double-quoted string"
        end
      end
    end
    found
  end

  it 'has no i18n.t call with a single-quoted default followed by a double-quoted string' do
    expect(offenders).to be_empty,
      "These lines make i18n_generator.rb write the WRONG value into en.json. Give the " \
      "user-facing default double quotes (the CLAUDE.md convention) so each key captures " \
      "its own string:\n  " + offenders.join("\n  ")
  end
end

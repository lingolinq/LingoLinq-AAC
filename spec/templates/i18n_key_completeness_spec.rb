require 'spec_helper'
require 'json'

# Every translatable key in the Ember JS must exist in en.json.
#
# WHY THIS EXISTS
#   `display_style_save_changes` (components/display-style.js) shipped with no entry in
#   any of the 13 locale files, and nothing caught it. The generator's own "TOTAL
#   MISSING" counter does not: i18n_generator.rb:150 increments that for a malformed
#   `i18n.t(` call with no parseable default, never for a key that failed to reach
#   en.json. A key absent from the locale files can never be translated -- it renders
#   its English default in every language, silently, forever.
#
# WHY BOTH QUOTE STYLES ARE SCANNED
#   i18n_generator.rb:136-140 reads a default ONLY when it is double-quoted, which is
#   the CLAUDE.md convention for user-facing strings. A single-quoted default is
#   therefore invisible to the generator and its key never reaches any locale file.
#   When this spec was first written it scanned only the double-quoted form, because
#   117 keys were then passing a single-quoted default and a wider scan could not have
#   gone green. Those were fixed, so the scan is now total: any NEW single-quoted
#   default fails here rather than quietly costing a key its translations.
#
#   If this spec fails on a key you just added, the fix is almost always to give the
#   user-facing default double quotes -- not to add the key to en.json by hand.
#
# WHAT IT DOES NOT ASSERT
#   It does not check the other 12 locale files. utils/i18n.js:447-448 skips any value
#   beginning with '*** ' and renders the inline English default, and a locale MISSING
#   the key renders that same default, so the two are indistinguishable at runtime.
#   Asserting the '*** ' shape would pin the untranslated state and rot on the first
#   real translation.
#
#   It does not assert that en.json's value equals the inline default. 68 keys
#   legitimately differ, because record_string (i18n_generator.rb:86-95) deliberately
#   preserves an existing English value over the source default.
describe 'i18n key completeness' do
  # `i18n.t('some_key', "Default")` or `i18n.t('some_key', 'Default')`, with or without
  # a receiver prefix such as `evaluation.i18n.t(`.
  CALL_RE = /i18n\.t\(\s*'([^']+)'\s*,\s*["']/

  let(:en_json) { JSON.parse(File.read(Rails.root.join('public/locales/en.json'))) }

  let(:found_keys) do
    keys = {}
    Dir.glob(Rails.root.join('app/frontend/app/**/*.js')).sort.each do |path|
      rel = path.sub(Rails.root.to_s + '/', '')
      File.readlines(path).each_with_index do |line, idx|
        line.scan(CALL_RE).each do |(key)|
          keys[key] ||= "#{rel}:#{idx + 1}"
        end
      end
    end
    keys
  end

  it 'finds a plausible number of translatable calls (guards an empty scan)' do
    expect(found_keys.length).to be > 1000
  end

  it 'has an en.json entry for every translatable key in the Ember JS' do
    missing = found_keys.reject { |key, _site| en_json.key?(key) }

    expect(missing).to be_empty,
      "These keys are passed to i18n.t but are absent from public/locales/en.json, so " \
      "they can never be translated. If the default is single-quoted, give it double " \
      "quotes so i18n_generator.rb can see it:\n" +
      missing.map { |key, site| "  #{key}  (#{site})" }.join("\n")
  end
end

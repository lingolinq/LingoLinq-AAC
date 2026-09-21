require 'spec_helper'
require 'json'

# Every translatable key the i18n generator CAN see must actually exist in en.json.
#
# WHY THIS EXISTS
#   `display_style_save_changes` (app/frontend/app/components/display-style.js) shipped
#   with no entry in any of the 13 locale files. Nothing caught it. The generator's own
#   "TOTAL MISSING" counter does not: i18n_generator.rb:150 increments that for a
#   malformed i18n.t( call with no parseable default, never for a key that failed to
#   reach en.json. So the repo had no detector for this class at all.
#
# WHY ONLY THE DOUBLE-QUOTED FORM
#   CLAUDE.md's quoting convention (user-facing strings double-quoted, everything else
#   single) is load-bearing for the generator: i18n_generator.rb:136-140 reads a default
#   ONLY when it is double-quoted. ~115 JS keys currently pass a single-quoted default
#   (e.g. controllers/system-settings/app-defaults.js:75) and are therefore invisible to
#   the generator and absent from en.json. That is a real and separate defect class, far
#   too large to fix here; scanning for it would make this spec red on ~117 keys and it
#   could never land. This spec pins the keys the generator CAN see, which is the set
#   that is supposed to work today.
#
# WHAT IT DOES NOT ASSERT
#   It does not check the other 12 locale files. utils/i18n.js:447-448 skips any value
#   beginning with '*** ' and renders the inline English default, and a locale MISSING
#   the key renders that same default, so the two states are indistinguishable at
#   runtime. Asserting the '*** ' shape would only pin the untranslated state and would
#   turn red the first time a real translation lands.
describe 'i18n key completeness' do
  # Matches `i18n.t('some_key', "Default text"` — key single-quoted (the generator's
  # own shape, i18n_generator.rb:122-131) and the default double-quoted immediately
  # after the comma. Also matches a receiver prefix such as `evaluation.i18n.t(`.
  CALL_RE = /i18n\.t\(\s*'([^']+)'\s*,\s*"/

  let(:en_json) { JSON.parse(File.read(Rails.root.join('public/locales/en.json'))) }

  let(:found_keys) do
    keys = {}
    Dir.glob(Rails.root.join('app/frontend/app/**/*.js')).each do |path|
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

  it 'has an en.json entry for every key the generator can see' do
    missing = found_keys.reject { |key, _site| en_json.key?(key) }

    expect(missing).to be_empty,
      "These keys are passed to i18n.t with a double-quoted default but are absent " \
      "from public/locales/en.json, so they can never be translated:\n" +
      missing.map { |key, site| "  #{key}  (#{site})" }.join("\n")
  end
end

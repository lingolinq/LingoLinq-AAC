# frozen_string_literal: true

require 'spec_helper'
require 'json'

# Pins privacy-policy keys whose non-English values must stay the `*** ` English
# fallback until a human-reviewed translation replaces them.
#
# WHY THIS EXISTS
#   PR #922 (2026-09-03) retracted the claim that children's data is deleted
#   automatically at 18 and set the 12 non-English values of
#   `privacy_security_retention_children` to `*** ` + the corrected English.
#   On 2026-09-13 the merge commit of PR #963 took a long-lived branch's copies of
#   those 12 files and silently put the machine translations of the RETRACTED claim
#   back on develop, staging and main. No test noticed: the disclosure guard in
#   spec/lib/lingo_linq/ai_disclosure_surfaces_spec.rb matches English phrases,
#   and a translated claim matches none of them.
#
# HOW THE VALUE IS READ
#   app/frontend/app/utils/i18n.js:448 ignores any locale value that starts with
#   `*** ` and renders the template's inline English default instead. For this key
#   that default lives in app/frontend/app/templates/privacy.hbs:105. So the only
#   safe non-English shape is exactly `*** ` + the English value, and the English
#   value must match the template default, because that default is what
#   non-English visitors actually see.
#
# i18n_generator.rb never overwrites an existing value (`json[key] || "*** ..."`),
# so a stale translation survives every regenerate. This spec is the only thing
# that forces a change to the English sentence to reach the other 12 files.
#
# To ship a reviewed translation of a pinned key, remove the key from
# PINNED_KEYS in the same PR and say who reviewed the translation.
describe 'privacy locale English pins' do
  repo_root = File.expand_path('../..', __dir__)
  locale_dir = File.join(repo_root, 'public/locales')
  privacy_template_path = File.join(repo_root, 'app/frontend/app/templates/privacy.hbs')

  PINNED_KEYS = {
    'privacy_security_retention_children' =>
      'children\'s retention: the automatic purge at 18 was retracted by PR #922',
  }.freeze

  english = JSON.parse(File.read(File.join(locale_dir, 'en.json')))
  other_locale_paths = Dir[File.join(locale_dir, '*.json')]
                       .reject { |path| File.basename(path) == 'en.json' }
                       .sort
                       .freeze

  it 'has non-English locale files to check' do
    expect(other_locale_paths).not_to be_empty
  end

  PINNED_KEYS.each do |key, why|
    describe key do
      let(:english_value) { english.fetch(key) }

      it 'has an English value' do
        expect(english_value).to be_a(String)
        expect(english_value).not_to start_with('*** ')
      end

      it 'matches the inline default in privacy.hbs that non-English visitors see' do
        template = File.read(privacy_template_path)
        default = template[/\{\{t\s+"((?:[^"\\]|\\.)*)"\s+key=['"]#{Regexp.escape(key)}['"]/, 1]
        expect(default).not_to be_nil, "no {{t ... key='#{key}'}} call found in privacy.hbs"
        expect(default).to eq(english_value)
      end

      it "stays the `*** ` English fallback in every non-English locale (#{why})" do
        expected = "*** #{english_value}"
        offenders = other_locale_paths.filter_map do |path|
          value = JSON.parse(File.read(path))[key]
          next if value == expected

          "#{File.basename(path)}: #{value.nil? ? '(missing)' : value[0, 80].inspect}"
        end
        expect(offenders).to be_empty,
                             "#{key} must be \"*** \" + the en.json value in every non-English " \
                             "locale; these carry something else:\n  #{offenders.join("\n  ")}"
      end
    end
  end
end

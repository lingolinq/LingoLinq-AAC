# frozen_string_literal: true

require 'spec_helper'
require 'json'

# Pins privacy-policy keys whose non-English values must stay the `*** ` English
# fallback until a human-reviewed translation replaces them.
#
# WHY THIS EXISTS
#   PR #922 (2026-09-03) retracted the claim that children's data is deleted
#   automatically at 18 and set the 12 non-English values of
#   `privacy_security_retention_children` to `*** ` + the corrected English. On
#   2026-09-04 a merge of origin/staging into a long-lived feature branch
#   (1c2bb2333) resolved the conflict in the branch's favour, keeping the machine
#   translations of the RETRACTED claim. PR #963 squash-merged that branch into
#   develop on 2026-09-13 (4104b657b) and the claim reached staging and main. No
#   test noticed: the disclosure guard in
#   spec/lib/lingo_linq/ai_disclosure_surfaces_spec.rb matches English phrases,
#   and a translated claim matches none of them.
#
#   Two more keys on the same page had gone stale the same way: the English was
#   corrected on 2026-07-17 (#625), and a later machine-translation pass
#   translated the OLD English, which i18n_generator.rb had never refreshed.
#
# HOW THE VALUE IS READ
#   app/frontend/app/utils/i18n.js:448 ignores any locale value that starts with
#   `*** ` and renders the template's inline English default instead. For these
#   keys that default lives in app/frontend/app/templates/privacy.hbs. So the only
#   safe non-English shape is exactly `*** ` + the English value, and the English
#   value must match the template default, because that default is what
#   non-English visitors actually see.
#
# WHAT KEEPS IT PINNED
#   - i18n_generator.rb never overwrites an existing value (`json[key] ||
#     "*** ..."`), so a stale translation survives every regenerate. This spec is
#     the only thing that forces a change to the English to reach the other files.
#   - WordData.translate_locale_batch (the extras:translate_ui_locales rake)
#     machine-translates every `*** ` value, which is exactly the pinned shape, so
#     it skips WordData::ENGLISH_PINNED_LOCALE_KEYS. Do NOT remove a key from that
#     list to make the rake or this spec quiet.
#
# STRICTER THAN THE APP, ON PURPOSE: a locale file missing a pinned key would fall
# back safely at runtime (base-language file, then the template default), but this
# spec still fails it, so a new locale file is added with the pinned values.
#
# To ship a human-reviewed translation of a pinned key, remove the key from
# WordData::ENGLISH_PINNED_LOCALE_KEYS in the same PR and name the reviewer. Keep
# its PRIVACY_LOCALE_CONTENT_PINS entry: what the English says is checked whether
# or not the key is translated.
describe 'privacy locale English pins' do
  repo_root = File.expand_path('../..', __dir__)
  locale_dir = File.join(repo_root, 'public/locales')
  privacy_template_path = File.join(repo_root, 'app/frontend/app/templates/privacy.hbs')

  # What each English sentence must still say, and the retracted wording it must
  # not say again, whether or not the key is still pinned to the fallback.
  # Propagation alone is not enough: restoring the retracted sentence in the
  # template, en.json and every fallback together would otherwise pass.
  PRIVACY_LOCALE_CONTENT_PINS = {
    'privacy_security_retention_children' => {
      must: /not automatically deleted solely because a user turns 18/,
      must_not: /purge[ds]? at (?:age )?18|after (?:2|two) years of inactivity/i,
    },
    'privacy_security_retention_ai_logs' => {
      must: /deleted when that account is deleted/,
      must_not: /retained for (?:2|two) years/i,
    },
    'privacy_special_coppa_v2' => {
      must: /AI-assisted board suggestions are handled separately/,
      must_not: /including AI-assisted board generation/i,
    },
  }.freeze

  english = JSON.parse(File.read(File.join(locale_dir, 'en.json')))
  other_locale_paths = Dir[File.join(locale_dir, '*.json')]
                       .reject { |path| File.basename(path) == 'en.json' }
                       .sort
                       .freeze

  it 'has non-English locale files to check' do
    expect(other_locale_paths).not_to be_empty
  end

  it 'has a content pin for every key pinned to the English fallback' do
    expect(WordData::ENGLISH_PINNED_LOCALE_KEYS - PRIVACY_LOCALE_CONTENT_PINS.keys).to be_empty
  end

  keys_to_check = (PRIVACY_LOCALE_CONTENT_PINS.keys | WordData::ENGLISH_PINNED_LOCALE_KEYS).freeze

  keys_to_check.each do |key|
    describe key do
      let(:english_value) { english.fetch(key) }
      let(:template_default) do
        template = File.read(privacy_template_path)
        template[/\{\{t\s+"((?:[^"\\]|\\.)*)"\s+key=['"]#{Regexp.escape(key)}['"]/, 1]
      end

      it 'has an English value' do
        expect(english_value).to be_a(String)
        expect(english_value).not_to start_with('*** ')
      end

      it 'matches the inline default in privacy.hbs that non-English visitors see' do
        expect(template_default).not_to be_nil, "no {{t ... key='#{key}'}} call found in privacy.hbs"
        expect(template_default).to eq(english_value)
      end

      it 'still says what the corrected policy says, in English and in the template' do
        pin = PRIVACY_LOCALE_CONTENT_PINS.fetch(key)
        [['en.json', english_value], ['privacy.hbs', template_default.to_s]].each do |where, text|
          expect(text).to match(pin[:must]), "#{where} #{key} lost the corrected wording #{pin[:must].inspect}"
          expect(text).not_to match(pin[:must_not]), "#{where} #{key} re-asserts #{pin[:must_not].inspect}"
        end
      end

      next unless WordData::ENGLISH_PINNED_LOCALE_KEYS.include?(key)

      it 'stays the `*** ` English fallback in every non-English locale' do
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

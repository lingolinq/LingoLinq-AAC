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

  # The exact English each sentence must read, whether or not the key is still
  # pinned to the fallback. Exact, not a pattern: review of the first version
  # showed that a sentence can keep a required phrase while adding a clause that
  # restates the retracted claim. Changing one of these sentences therefore means
  # changing it here too, in a reviewed PR. Propagation alone is not enough:
  # restoring the retracted sentence in the template, en.json and every fallback
  # together would otherwise pass.
  PRIVACY_LOCALE_CONTENT_PINS = {
    'privacy_security_retention_children' =>
      'Children\'s data (users under 13): parent-controllable at any time; accounts and content are not automatically deleted solely because a user turns 18. Verified parental deletion requests are processed within 30 days.',
    'privacy_security_retention_ai_logs' =>
      'AI request logs: the audit record (AiApiLog) tied to a user account is deleted when that account is deleted; IP addresses on those records are redacted at 90 days.',
    'privacy_special_coppa_v2' =>
      'Children under 13 may only use LingoLinq with verifiable parental consent. We accept a FERPA school-official authorization in place of direct parental consent only for the limited, school-curriculum use of LingoLinq with no AI features, no profiling, and no advertising. Any use of LingoLinq\'s AI word prediction or AI-drafted evaluation summaries by a child under 13 requires verifiable parental consent under 16 CFR Part 312, regardless of school enrollment; AI-assisted board suggestions are handled separately (see below). If we learn we have collected personal information from a child under 13 without the required consent, we will delete it promptly.',
  }.freeze

  english = JSON.parse(File.read(File.join(locale_dir, 'en.json')))
  other_locale_paths = Dir[File.join(locale_dir, '*.json')]
                       .reject { |path| File.basename(path) == 'en.json' }
                       .sort
                       .freeze

  it 'has non-English locale files to check' do
    expect(other_locale_paths).not_to be_empty
  end

  # The root cause, for every string on the privacy page, not only the pinned
  # ones: the English was corrected and a translation of the OLD English stayed
  # live. A translation records the English it came from after " [[ " (i18n.js
  # renders only the part before it). A `*** ` value always renders the
  # template's current English, so it is safe as it stands.
  it 'has no privacy.hbs translation made from English that has since changed' do
    template = File.read(privacy_template_path)
    keys = template.scan(/\{\{t\s+"(?:[^"\\]|\\.)*"\s+key=['"]([a-z0-9_]+)['"]/).flatten.uniq
    expect(keys.length).to be > 50, "found only #{keys.length} {{t}} calls in privacy.hbs; the pattern is stale"
    stale = other_locale_paths.flat_map do |path|
      values = JSON.parse(File.read(path))
      keys.filter_map do |key|
        value = values[key]
        next if value.is_a?(String) && value.start_with?('*** ')

        source = value.to_s.split(' [[ ', 2)[1]
        next if source && source == english[key]

        reason = if value.nil? then 'missing'
                 elsif source.nil? then 'translation with no recorded English source'
                 else 'translated from different English than en.json now has'
                 end
        "#{File.basename(path)} #{key}: #{reason}"
      end
    end
    expect(stale).to be_empty,
                     "re-translate these from the current English, or set them to \"*** \" + en.json:\n  " \
                     "#{stale.join("\n  ")}"
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

      it 'reads exactly the reviewed English, in en.json and in the template' do
        pinned = PRIVACY_LOCALE_CONTENT_PINS.fetch(key)
        expect(english_value).to eq(pinned), "en.json #{key} differs from the reviewed English pinned in this spec"
        expect(template_default).to eq(pinned), "privacy.hbs #{key} differs from the reviewed English pinned in this spec"
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

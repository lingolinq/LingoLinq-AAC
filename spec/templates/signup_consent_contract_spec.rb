require 'spec_helper'

# Lightweight guards for the signup privacy-consent contract. These are not
# behavioral tests of the running app; they pin two invariants that, if broken
# silently, would make the recorded `privacy_policy_acknowledged` artifact dishonest:
#   D) the consent checkbox must actually present the Privacy Policy, because
#      the backend records privacy_policy_acknowledged purely off `terms_agree`.
#   E) PRIVACY_POLICY_VERSION must match the published policy's "Last Updated"
#      date, or new signups stamp consent against a version that no longer
#      matches the policy text.
describe 'signup consent contract' do
  let(:register_hbs) { File.read(Rails.root.join('app/frontend/app/templates/register.hbs')) }
  let(:en_json) { JSON.parse(File.read(Rails.root.join('public/locales/en.json'))) }

  it "folds the Privacy Policy link into the signup consent checkbox (coupling guard)" do
    # Both label variants (combined 13+ and COPPA age-gated) link to /privacy.
    expect(register_hbs.scan('href="/privacy"').length).to be >= 2
    expect(en_json['register_consent_and']).to eq(' and ')
    # The superseded passive-notice acknowledgment must be fully removed.
    expect(register_hbs).to_not include('register_consent_privacy_ack')
    expect(en_json['register_consent_privacy_ack_prefix']).to be_nil
  end

  it "keeps PRIVACY_POLICY_VERSION in sync with the published policy date (drift guard)" do
    updated = en_json['privacy_updated'] # e.g. "Last Updated: June 9, 2026"
    expect(updated).to be_present
    date_str = updated.sub(/^Last Updated:\s*/, '')
    expect(Date.parse(date_str).iso8601).to eq(User::PRIVACY_POLICY_VERSION)
  end

  it "keeps privacy.hbs inline defaults reconciled with en.json (render-truth guard)" do
    # The frontend i18n.t helper PREFERS a truthy en.json value over the inline
    # template default, skipping only values that start with the '*** '
    # untranslated-placeholder prefix (app/frontend/app/utils/i18n.js:447-450).
    # A stray en.json value therefore silently replaces the reviewed template
    # text: en.json's privacy_rights_ccpa_heading held "\\" and the CCPA heading
    # on /privacy rendered as a lone backslash. For every {{t}} pair in
    # privacy.hbs, a non-placeholder en.json value must equal the inline default.
    privacy_hbs = File.read(Rails.root.join('app/frontend/app/templates/privacy.hbs'))
    pairs = privacy_hbs.scan(/\{\{t "((?:[^"\\]|\\.)*)" key=['"]([^'"]+)['"]/)
    # The extraction itself must not silently rot: privacy.hbs carries 102
    # {{t "..." key="..."}} pairs as of 2026-08-30.
    expect(pairs.length).to be > 90
    mismatches = pairs.filter_map do |default, key|
      value = en_json[key]
      next if value.nil? || value.start_with?('*** ')
      inline = default.gsub('\"', '"')
      "#{key}: en.json #{value.inspect} != template #{inline.inspect}" unless value == inline
    end
    expect(mismatches).to be_empty,
                          "en.json silently overrides privacy.hbs defaults:\n  #{mismatches.join("\n  ")}"
  end
end

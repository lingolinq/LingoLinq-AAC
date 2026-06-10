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
end

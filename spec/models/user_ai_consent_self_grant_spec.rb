# frozen_string_literal: true

require 'spec_helper'

# Who may record an AI data-sharing consent for an account (#1136; Scot, 2026-11-17):
# the account holder for their own adult account, never for an account whose consent
# has to come from a parent or guardian.
describe User do
  let(:current_version) { LingoLinq::AiConsentDisclosures::CURRENT_VERSION }

  it 'lets the account holder grant for a plain account (sources registration and in_app)' do
    %w[registration in_app].each do |source|
      u = User.create
      expect(u.grant_ai_consent!(disclosures_version: current_version, granted_by: 'account_holder',
                                 source: source, granted_by_user_id: u.global_id)).to eq(true)
      c = u.reload.settings['ai_consent']
      expect(c['source']).to eq(source)
      expect(c['granted_by_user_id']).to eq(u.global_id)
      expect(u.ai_consent_granted?).to eq(true)
    end
  end

  it 'refuses a registration grant that names a different account as grantor' do
    u = User.create
    other = User.create
    expect {
      u.grant_ai_consent!(disclosures_version: current_version, granted_by: 'x', source: 'registration', granted_by_user_id: other.global_id)
    }.to raise_error(ArgumentError, 'invalid_granted_by_user_id')
  end

  it 'refuses a self-grant, with or without a grantor id, for an account with any COPPA record or an EU under-16 account' do
    pending_child = User.create
    pending_child.settings['coppa'] = { 'pending_parent_consent' => true }
    pending_child.save!
    approved_child = User.create
    approved_child.settings['coppa'] = { 'pending_parent_consent' => true, 'parent_consent_granted_at' => Time.now.utc.iso8601 }
    approved_child.save!
    eu_teen = User.create
    eu_teen.settings['registration'] = { 'under_16' => true, 'eu_under_16' => true }
    eu_teen.save!
    [pending_child, approved_child, eu_teen].each do |u|
      expect(u.ai_consent_parent_route?).to eq(true)
      [nil, u.global_id].each do |id|
        %w[registration in_app].each do |source|
          expect {
            u.grant_ai_consent!(disclosures_version: current_version, granted_by: 'account_holder', source: source, granted_by_user_id: id)
          }.to raise_error(ArgumentError, 'parental_consent_required')
        end
      end
      expect(u.reload.settings['ai_consent']).to be_blank
    end
  end

  it 'still refuses the account itself as grantor on the parent and admin sources' do
    u = User.create
    %w[email_link admin_backfill].each do |source|
      expect {
        u.grant_ai_consent!(disclosures_version: current_version, granted_by: 'Self', source: source, granted_by_user_id: u.global_id)
      }.to raise_error(ArgumentError, 'self_grant_forbidden')
    end
  end
end

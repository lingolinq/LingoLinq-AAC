# frozen_string_literal: true

require 'spec_helper'

describe 'User compliance kernel stamp' do
  before do
    allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
  end

  def create_user(extra = {})
    User.process_new({
      'user_name' => "comp_#{SecureRandom.hex(4)}",
      'email' => "comp_#{SecureRandom.hex(4)}@example.com",
      'password' => 'password1',
      'terms_agree' => true,
      'preferences' => { 'registration_type' => 'communicator' }
    }.merge(extra), { pending: true })
  end

  it 'does not stamp settings.compliance when the flag is OFF' do
    expect(FeatureFlags.compliance_workflow_kernel_enabled?).to eq(false)
    u = create_user('country' => 'US', 'birth_month' => 3, 'birth_year' => 2015)
    expect(u).to be_a(User)
    expect(u.errored?).to eq(false)
    expect(u.settings['compliance']).to be_nil
  end

  it 'stamps settings.compliance when the flag is ON' do
    stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES',
               FeatureFlags::ENABLED_FRONTEND_FEATURES + ['compliance_workflow_kernel'])
    u = create_user(
      'country' => 'DE',
      'birth_month' => 1,
      'birth_year' => 2010,
      'jurisdiction_declaration' => 'DE'
    )
    expect(u.errored?).to eq(false)
    c = u.settings['compliance']
    expect(c).to be_a(Hash)
    expect(c['segment']).to eq('b2c')
    expect(c['jurisdiction']['code']).to eq('DE')
    expect(c['digital_consent_age']).to eq(16)
    expect(c['birth_month']).to eq(1)
    expect(c['birth_year']).to eq(2010)
    expect(c['frameworks']).to include('GDPR')
    expect(u.settings['preferences']['jurisdiction']).to eq('DE')
  end

  it 'honors CA-QC declaration for Law 25 age 14' do
    stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES',
               FeatureFlags::ENABLED_FRONTEND_FEATURES + ['compliance_workflow_kernel'])
    u = create_user(
      'country' => 'CA',
      'jurisdiction_declaration' => 'CA-QC',
      'birth_month' => 6,
      'birth_year' => 2015
    )
    expect(u.settings['compliance']['jurisdiction']['code']).to eq('CA-QC')
    expect(u.settings['compliance']['digital_consent_age']).to eq(14)
    expect(u.settings['compliance']['frameworks']).to include('LAW_25')
  end
end

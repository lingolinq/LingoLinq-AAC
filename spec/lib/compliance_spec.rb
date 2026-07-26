# frozen_string_literal: true

require 'spec_helper'

describe Compliance::DigitalConsentAge do
  describe '.for_code' do
    it 'returns 13 for US and blank/unknown' do
      expect(Compliance::DigitalConsentAge.for_code('US')).to eq(13)
      expect(Compliance::DigitalConsentAge.for_code(nil)).to eq(13)
      expect(Compliance::DigitalConsentAge.for_code('')).to eq(13)
      expect(Compliance::DigitalConsentAge.for_code('XX')).to eq(13)
    end

    it 'returns 14 for Quebec (Law 25)' do
      expect(Compliance::DigitalConsentAge.for_code('CA-QC')).to eq(14)
    end

    it 'returns 13 for Canada outside Quebec' do
      expect(Compliance::DigitalConsentAge.for_code('CA')).to eq(13)
    end

    it 'returns 13 for the UK' do
      expect(Compliance::DigitalConsentAge.for_code('GB')).to eq(13)
    end

    it 'returns per-member GDPR Art. 8 ages for EU states' do
      expect(Compliance::DigitalConsentAge.for_code('DE')).to eq(16)
      expect(Compliance::DigitalConsentAge.for_code('PL')).to eq(16)
      expect(Compliance::DigitalConsentAge.for_code('FR')).to eq(15)
      expect(Compliance::DigitalConsentAge.for_code('ES')).to eq(14)
      expect(Compliance::DigitalConsentAge.for_code('SE')).to eq(13)
      expect(Compliance::DigitalConsentAge.for_code('IE')).to eq(16)
    end
  end

  describe '.classify_age' do
    it 'returns nil for incomplete birth data' do
      expect(Compliance::DigitalConsentAge.classify_age(
        birth_month: nil, birth_year: 2015, consent_age: 13
      )).to eq(nil)
    end

    it 'classifies under threshold with month/year ambiguity rule' do
      as_of = Time.utc(2026, 7, 15)
      # Born July 2013 → still under 13 in July 2026 (ambiguous month)
      expect(Compliance::DigitalConsentAge.classify_age(
        birth_month: 7, birth_year: 2013, consent_age: 13, as_of: as_of
      )).to eq('under_threshold')
      # Born June 2013 → over 13
      expect(Compliance::DigitalConsentAge.classify_age(
        birth_month: 6, birth_year: 2013, consent_age: 13, as_of: as_of
      )).to eq('over_threshold')
    end
  end
end

describe Compliance::SegmentResolver do
  def org(settings = {})
    Struct.new(:settings).new(settings)
  end

  it 'defaults to b2c' do
    expect(Compliance::SegmentResolver.resolve(nil)).to eq('b2c')
  end

  it 'honors org compliance_segment' do
    expect(Compliance::SegmentResolver.resolve(nil, org: org('compliance_segment' => 'clinical'))).to eq('clinical')
    expect(Compliance::SegmentResolver.resolve(nil, org: org('compliance_segment' => 'school'))).to eq('school')
  end

  it 'treats authored_organization_id as school' do
    expect(Compliance::SegmentResolver.resolve(nil, authored_organization_id: '1_2')).to eq('school')
  end
end

describe Compliance::JurisdictionResolver do
  it 'prefers an explicit declaration' do
    res = Compliance::JurisdictionResolver.resolve(declaration: 'de')
    expect(res['code']).to eq('DE')
    expect(res['source']).to eq('declaration')
  end

  it 'accepts CA-QC subdivision' do
    res = Compliance::JurisdictionResolver.resolve(declaration: 'CA-QC')
    expect(res['code']).to eq('CA-QC')
  end

  it 'falls back to user country' do
    u = Object.new
    u.define_singleton_method(:settings) { { 'country' => 'FR' } }
    u.define_singleton_method(:managing_organization) { nil }
    res = Compliance::JurisdictionResolver.resolve(user: u)
    expect(res['code']).to eq('FR')
    expect(res['source']).to eq('user')
  end

  it 'returns unknown when no signal' do
    res = Compliance::JurisdictionResolver.resolve
    expect(res['code']).to eq(nil)
    expect(res['source']).to eq('unknown')
  end
end

describe Compliance::Profile do
  it 'builds a JSON-safe hash with HCD rules' do
    profile = Compliance::Profile.for(nil, declaration: 'DE', birth_month: 1, birth_year: 2010)
    h = profile.to_h
    expect(h['segment']).to eq('b2c')
    expect(h['jurisdiction']['code']).to eq('DE')
    expect(h['digital_consent_age']).to eq(16)
    expect(h['frameworks']).to include('GDPR')
    expect(h['effective_rules']['digital_consent_age']).to eq(16)
    expect(h['age_band']).to eq('over_threshold')
  end

  it 'marks a US child under COPPA threshold' do
    profile = Compliance::Profile.for(
      nil,
      declaration: 'US',
      birth_month: 1,
      birth_year: Time.now.utc.year - 10
    )
    expect(profile.digital_consent_age).to eq(13)
    expect(profile.under_digital_consent_age?).to eq(true)
  end
end

describe Compliance do
  it 'reports enabled? from the feature flag' do
    expect(Compliance.enabled?).to eq(false)
    stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES',
               FeatureFlags::ENABLED_FRONTEND_FEATURES + ['compliance_workflow_kernel'])
    expect(Compliance.enabled?).to eq(true)
  end
end

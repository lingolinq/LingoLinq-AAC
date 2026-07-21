require 'spec_helper'

describe Organization, 'jurisdiction' do
  def updater
    @updater ||= User.create
  end

  describe '.normalize_jurisdiction' do
    it 'maps US and USA to US' do
      expect(Organization.normalize_jurisdiction('US')).to eq('US')
      expect(Organization.normalize_jurisdiction('usa')).to eq('US')
    end

    it 'maps EU to EU' do
      expect(Organization.normalize_jurisdiction('EU')).to eq('EU')
      expect(Organization.normalize_jurisdiction('eu')).to eq('EU')
    end

    it 'returns nil for blank or unknown values' do
      expect(Organization.normalize_jurisdiction(nil)).to be_nil
      expect(Organization.normalize_jurisdiction('')).to be_nil
      expect(Organization.normalize_jurisdiction('UK')).to be_nil
    end
  end

  describe 'process_params' do
    it 'requires jurisdiction on create' do
      o = Organization.new
      expect(o.process({'name' => 'Needs Jurisdiction'}, {'updater' => updater})).to eq(false)
      expect(o.processing_errors.to_s).to match(/jurisdiction required/)
    end

    it 'persists US jurisdiction on create' do
      o = Organization.process_new({'name' => 'US Org', 'jurisdiction' => 'US'}, {'updater' => updater})
      expect(o).to be_persisted
      expect(o.jurisdiction).to eq('US')
      expect(o.us_jurisdiction?).to eq(true)
      expect(o.eu_jurisdiction?).to eq(false)
    end

    it 'persists EU jurisdiction on create' do
      o = Organization.process_new({'name' => 'EU Org', 'jurisdiction' => 'EU'}, {'updater' => updater})
      expect(o).to be_persisted
      expect(o.jurisdiction).to eq('EU')
      expect(o.eu_jurisdiction?).to eq(true)
    end

    it 'rejects invalid jurisdiction values' do
      o = Organization.new
      expect(o.process({'name' => 'Bad', 'jurisdiction' => 'UK'}, {'updater' => updater})).to eq(false)
      expect(o.processing_errors.to_s).to match(/US or EU/)
    end

    it 'allows updating jurisdiction on an existing org' do
      o = Organization.process_new({'name' => 'Move Me', 'jurisdiction' => 'US'}, {'updater' => updater})
      expect(o.process({'jurisdiction' => 'EU'}, {'updater' => updater})).to eq(true)
      expect(o.reload.jurisdiction).to eq('EU')
    end

    it 'accepts country as a synonym for jurisdiction' do
      o = Organization.process_new({'name' => 'Synonym', 'country' => 'USA'}, {'updater' => updater})
      expect(o).to be_persisted
      expect(o.jurisdiction).to eq('US')
    end
  end
end

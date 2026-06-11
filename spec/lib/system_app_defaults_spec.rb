require 'spec_helper'

describe SystemAppDefaults do
  after do
    Setting.find_by(key: SystemAppDefaults::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemAppDefaults::DEFAULT_KEY}")
  end

  describe '.set!' do
    it 'stores site-wide app defaults' do
      SystemAppDefaults.set!(app_name: 'SiteApp', company_name: 'Site Co')
      stored = SystemAppDefaults.get
      expect(stored['app_name']).to eq('SiteApp')
      expect(stored['company_name']).to eq('Site Co')
    end

    it 'rejects invalid admin_email' do
      expect {
        SystemAppDefaults.set!(admin_email: 'not-an-email')
      }.to raise_error(ArgumentError, /valid email/)
    end

    it 'rejects invalid support_url' do
      expect {
        SystemAppDefaults.set!(support_url: 'not-a-url')
      }.to raise_error(ArgumentError, /valid http/)
    end

    it 'rejects values that exceed max length' do
      expect {
        SystemAppDefaults.set!(app_name: 'x' * 101)
      }.to raise_error(ArgumentError, /too long/)
    end
  end

  describe '.effective_settings' do
    it 'merges stored values over env defaults' do
      SystemAppDefaults.set!(app_name: 'StoredApp')
      effective = SystemAppDefaults.effective_settings
      expect(effective['app_name']).to eq('StoredApp')
    end
  end

  describe '.branding_for_org' do
    it 'prefers org host_settings over site defaults' do
      SystemAppDefaults.set!(app_name: 'SiteApp', company_name: 'Site Co')
      org = Organization.create
      org.settings['host_settings'] = { 'app_name' => 'OrgApp', 'email_signature' => 'Org Team' }
      org.save!
      branding = SystemAppDefaults.branding_for_org(org)
      expect(branding['app_name']).to eq('OrgApp')
      expect(branding['email_signature']).to eq('Org Team')
    end

    it 'falls back to company-based signature' do
      org = Organization.create
      branding = SystemAppDefaults.branding_for_org(org)
      expect(branding['email_signature']).to include('Team')
    end
  end
end

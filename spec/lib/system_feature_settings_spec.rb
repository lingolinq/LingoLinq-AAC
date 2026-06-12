require 'spec_helper'

describe SystemFeatureSettings do
  after do
    [SystemFeatureSettings::DEFAULT_KEY,
     SystemFeatureSettings::CANARY_KEY,
     SystemFeatureSettings::BETA_KEY].each do |key|
      Setting.find_by(key: key)&.destroy
      RedisInit.default.del("setting/#{key}")
    end
  end

  describe 'default_enabled_features' do
    it 'falls back to ENABLED_FRONTEND_FEATURES when unset' do
      expect(SystemFeatureSettings.default_enabled_features).to eq(FeatureFlags::ENABLED_FRONTEND_FEATURES)
    end

    it 'returns stored defaults when set' do
      SystemFeatureSettings.set_default_enabled_features!(['goals', 'lessons'])
      expect(SystemFeatureSettings.default_enabled_features).to eq(['goals', 'lessons'])
    end
  end

  describe 'canary_enabled_features' do
    it 'falls back to all available features minus disabled canary features when unset' do
      expect(SystemFeatureSettings.canary_enabled_features).to eq(
        FeatureFlags::AVAILABLE_FRONTEND_FEATURES - FeatureFlags::DISABLED_CANARY_FEATURES
      )
    end

    it 'stores and reads canary features' do
      SystemFeatureSettings.set_canary_enabled_features!(['goals', 'lessons'])
      expect(SystemFeatureSettings.canary_enabled_features).to eq(['goals', 'lessons'])
    end

    it 'excludes disabled canary features from stored list' do
      stub_const('FeatureFlags::DISABLED_CANARY_FEATURES', ['goals'])
      SystemFeatureSettings.set_canary_enabled_features!(['goals', 'lessons'])
      expect(SystemFeatureSettings.canary_enabled_features).to eq(['lessons'])
    end

    it 'clears canary override' do
      SystemFeatureSettings.set_canary_enabled_features!(['goals'])
      SystemFeatureSettings.clear_canary!
      expect(SystemFeatureSettings.group_inherited_from('canary')).to eq('code_default')
    end
  end

  describe 'beta_opt_in_features' do
    it 'falls back to all available features when unset' do
      expect(SystemFeatureSettings.beta_opt_in_features).to eq(FeatureFlags::AVAILABLE_FRONTEND_FEATURES)
    end

    it 'stores and reads beta opt-in features' do
      SystemFeatureSettings.set_beta_opt_in_features!(['goals', 'profiles'])
      expect(SystemFeatureSettings.beta_opt_in_features).to eq(['goals', 'profiles'])
    end

    it 'clears beta override' do
      SystemFeatureSettings.set_beta_opt_in_features!(['goals'])
      SystemFeatureSettings.clear_beta!
      expect(SystemFeatureSettings.group_inherited_from('beta')).to eq('code_default')
    end
  end

  describe 'org overrides' do
    it 'stores and reads per-org enabled features' do
      org = Organization.create
      SystemFeatureSettings.set_org_enabled_features!(org, ['goals'])
      expect(SystemFeatureSettings.org_enabled_features(org.reload)).to eq(['goals'])
    end

    it 'clears org override' do
      org = Organization.create
      SystemFeatureSettings.set_org_enabled_features!(org, ['goals'])
      SystemFeatureSettings.clear_org!(org.reload)
      expect(SystemFeatureSettings.org_enabled_features(org.reload)).to be_nil
    end
  end

  describe 'resolve_scope' do
    it 'resolves default scope' do
      scope = SystemFeatureSettings.resolve_scope('default')
      expect(scope[:type]).to eq(:default)
      expect(scope[:scope_id]).to eq('default')
    end

    it 'resolves group scopes' do
      scope = SystemFeatureSettings.resolve_scope('group:canary')
      expect(scope[:type]).to eq(:group)
      expect(scope[:group_id]).to eq('canary')
    end

    it 'resolves org scope' do
      org = Organization.create
      scope = SystemFeatureSettings.resolve_scope(org.global_id)
      expect(scope[:type]).to eq(:org)
      expect(scope[:org].id).to eq(org.id)
    end
  end

  describe 'effective_enabled_for_scope' do
    it 'returns canary list for group scope' do
      SystemFeatureSettings.set_canary_enabled_features!(['goals'])
      expect(SystemFeatureSettings.effective_enabled_for_scope('group:canary')).to eq(['goals'])
    end

    it 'returns beta list for group scope' do
      SystemFeatureSettings.set_beta_opt_in_features!(['profiles'])
      expect(SystemFeatureSettings.effective_enabled_for_scope('group:beta')).to eq(['profiles'])
    end
  end
end

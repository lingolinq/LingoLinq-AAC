# frozen_string_literal: true

require 'spec_helper'

RSpec.describe DeviceClassification do
  describe '.apply_to_settings!' do
    it 'sets app and removes browser when native_app_device' do
      s = { 'browser' => true }
      described_class.apply_to_settings!(s, native_app_device: true, browser_client: false)
      expect(s['app']).to eq(true)
      expect(s.key?('browser')).to eq(false)
    end

    it 'sets browser and removes app when browser_client and not native' do
      s = { 'app' => true }
      described_class.apply_to_settings!(s, native_app_device: false, browser_client: true)
      expect(s['browser']).to eq(true)
      expect(s.key?('app')).to eq(false)
    end

    it 'leaves app and browser unchanged when neither native nor browser_client' do
      s = { 'app' => true, 'browser' => true }
      described_class.apply_to_settings!(s, native_app_device: false, browser_client: false)
      expect(s['app']).to eq(true)
      expect(s['browser']).to eq(true)
    end

    it 'does not set browser when native wins over browser_client' do
      s = {}
      described_class.apply_to_settings!(s, native_app_device: true, browser_client: true)
      expect(s['app']).to eq(true)
      expect(s.key?('browser')).to eq(false)
    end

    it 'clears stale app and browser when force and neither native nor browser_client' do
      s = { 'app' => true, 'browser' => true }
      described_class.apply_to_settings!(s, native_app_device: false, browser_client: false, force: true)
      expect(s.key?('app')).to eq(false)
      expect(s.key?('browser')).to eq(false)
    end

    it 'does not retain stale app flag when config-equivalent native is false and force is true' do
      s = { 'app' => true }
      described_class.apply_to_settings!(s, native_app_device: false, browser_client: false, force: true)
      expect(s.key?('app')).to eq(false)
    end

    it 'still applies native app after force clears stale browser' do
      s = { 'browser' => true }
      described_class.apply_to_settings!(s, native_app_device: true, browser_client: false, force: true)
      expect(s['app']).to eq(true)
      expect(s.key?('browser')).to eq(false)
    end
  end
end

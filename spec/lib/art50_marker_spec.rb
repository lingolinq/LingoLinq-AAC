# frozen_string_literal: true

require 'spec_helper'

describe Art50Marker do
  describe '.build' do
    it 'returns a signed, self-verifying marker with provenance fields' do
      m = described_class.build(provider: 'claude', model: 'claude-haiku-4-5-20251001')

      expect(m['marked']).to eq(true)
      expect(m['spec']).to eq('eu-ai-act-art50-2')
      expect(m['provider']).to eq('claude')
      expect(m['model']).to eq('claude-haiku-4-5-20251001')
      expect(m['content_id']).to be_a(String)
      expect(m['content_id']).not_to be_empty
      expect(m['signature']).to be_a(String)
      expect(m['signature']).not_to be_empty
      expect(m['generated_at']).to match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(described_class.verify(m)).to eq(true)
    end

    it 'mints a unique content_id per generation' do
      a = described_class.build(provider: 'claude', model: 'm')
      b = described_class.build(provider: 'claude', model: 'm')
      expect(a['content_id']).not_to eq(b['content_id'])
    end

    it 'honors an explicit generated_at and still verifies' do
      t = Time.utc(2026, 8, 2, 12, 0, 0)
      m = described_class.build(provider: 'claude', model: 'm', generated_at: t)
      expect(m['generated_at']).to eq(t.iso8601)
      expect(described_class.verify(m)).to eq(true)
    end
  end

  describe '.verify' do
    let(:marker) { described_class.build(provider: 'claude', model: 'claude-haiku-4-5-20251001') }

    it 'rejects a tampered provider' do
      expect(described_class.verify(marker.merge('provider' => 'gemini'))).to eq(false)
    end

    it 'rejects a tampered model' do
      expect(described_class.verify(marker.merge('model' => 'evil-model'))).to eq(false)
    end

    it 'rejects a tampered generated_at' do
      expect(described_class.verify(marker.merge('generated_at' => marker['generated_at'] + 'X'))).to eq(false)
    end

    it 'rejects a stripped or blank signature' do
      expect(described_class.verify(marker.merge('signature' => ''))).to eq(false)
      expect(described_class.verify(marker.except('signature'))).to eq(false)
    end

    it 'rejects a forged signature of the correct length (constant-time compare)' do
      forged = marker.merge('signature' => 'a' * marker['signature'].length)
      expect(described_class.verify(forged)).to eq(false)
    end

    it 'rejects a marker whose marked flag is not true' do
      expect(described_class.verify(marker.merge('marked' => false))).to eq(false)
    end

    it 'rejects a marker with a mismatched sig_alg' do
      expect(described_class.verify(marker.merge('sig_alg' => 'rot13'))).to eq(false)
    end

    it 'rejects non-hash input without raising' do
      expect(described_class.verify(nil)).to eq(false)
      expect(described_class.verify('not-a-marker')).to eq(false)
      expect(described_class.verify(42)).to eq(false)
    end

    it 'still verifies after a JSON round-trip (as stored in board.settings)' do
      round_tripped = JSON.parse(marker.to_json)
      expect(described_class.verify(round_tripped)).to eq(true)
    end
  end

  describe '.marked?' do
    it 'is true when settings carry a valid marker under ai_generated' do
      m = described_class.build(provider: 'claude', model: 'm')
      expect(described_class.marked?('ai_generated' => m)).to eq(true)
      expect(described_class.marked?(ai_generated: m)).to eq(true)
    end

    it 'is false for absent, empty, or forged markers' do
      expect(described_class.marked?({})).to eq(false)
      expect(described_class.marked?('ai_generated' => { 'marked' => true })).to eq(false)
      expect(described_class.marked?(nil)).to eq(false)
    end
  end
end

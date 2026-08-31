# frozen_string_literal: true

require 'spec_helper'

describe LingoLinq::AiConsentDisclosures do
  describe '::CURRENT_VERSION' do
    it 'is 1' do
      expect(described_class::CURRENT_VERSION).to eq(1)
    end

    it 'is a known version' do
      expect(described_class.known_version?(described_class::CURRENT_VERSION)).to eq(true)
    end
  end

  describe '.metadata' do
    it 'returns nil for an unknown version' do
      expect(described_class.metadata(999)).to be_nil
      expect(described_class.metadata(0)).to be_nil
      expect(described_class.metadata(nil)).to be_nil
      expect(described_class.metadata('not-a-number')).to be_nil
    end

    it 'accepts a String version equal to a known Integer version' do
      expect(described_class.metadata('1')).to be_a(Hash)
    end

    it 'names AWS as the processor and Anthropic as the model provider' do
      m = described_class.metadata(1)
      names = m['vendors'].map { |v| v['name'] }
      expect(names).to include('Amazon Web Services, Inc.')
      expect(names).to include('Anthropic, PBC')
      models = m['vendors'].flat_map { |v| v['models'] }.join(' ')
      expect(models).to include('Claude Haiku 4.5')
      # Opus 4.7 is not invoked on the classic Bedrock plane (absent from the catalog),
      # so eval narration egresses nothing and the model must not be named here.
      expect(models).not_to include('Claude Opus 4.7')
    end

    # The defect this guards against: on 2026-08-02 eval narration was correctly
    # removed from the vendor models/features set (it is inactive on the classic
    # Bedrock plane, which does not carry Opus 4.7), but `data_categories` still
    # listed clinical evaluation notes as shared and `revocation_summary` still
    # said withdrawal stops data being sent "for evaluation narration". The
    # structured facts contradicted each other, and the prose half OVERSTATED
    # what actually egresses to exactly the audience this notice exists to inform.
    #
    # Derived from the vendor features set rather than hardcoded, so it keeps
    # holding when eval narration is switched back on: at that point the feature
    # appears in the active set and the inactive-language requirement lifts
    # automatically.
    it 'never implies eval-narration egress while eval narration is not an active feature' do
      m = described_class.metadata(1)
      active = m['vendors'].flat_map { |v| v['features'] || [] }.uniq

      if active.include?('eval_narrator')
        # Active: the prose SHOULD describe it, and must not call it inactive.
        blob = (m['data_categories'] + [m['revocation_summary']]).join(' ')
        expect(blob).to match(/evaluation/i)
        expect(blob).not_to match(/inactive/i)
      else
        # Inactive: any sentence that mentions evaluation narration must say so.
        mentions = (m['data_categories'] + [m['revocation_summary']])
                   .select { |s| s =~ /evaluation/i }
        mentions.each do |sentence|
          expect(sentence).to match(/not currently sent|inactive|never leaves LingoLinq/i),
                              "consent text implies eval-narration egress while it is inactive: #{sentence[0, 120]}"
        end
      end
    end

    # Anthropic does not receive the data at all on Bedrock: the model runs in
    # AWS-operated accounts the provider cannot access. Saying data is sent
    # "to Anthropic" names the wrong recipient.
    it 'does not name Anthropic as the recipient of runtime data' do
      m = described_class.metadata(1)
      expect(m['revocation_summary']).not_to match(/to Anthropic/i)
      expect(m['retention']['vendor_side']).not_to match(/sent to Anthropic/i)
    end

    it 'does not claim a zero-data-retention guarantee that has not been configured' do
      serialized = JSON.generate(described_class::REGISTRY)
      expect(serialized).not_to match(/under a zero-data-retention agreement/i)
      expect(serialized).not_to match(/Zero-data-retention \(ZDR\) is confirmed/i)
    end

    it 'does not list Google Gemini as a vendor (fallback disabled 2026-07-09, PR #570)' do
      m = described_class.metadata(1)
      gemini = m['vendors'].find { |v| v['name'].include?('Google') }
      expect(gemini).to be_nil
      expect(JSON.generate(m)).not_to match(/gemini/i)
      # Asserts the exact vendor set rather than a bare count. The count was 1 until
      # 2026-08-02, when AWS was added as the actual processor for the Bedrock path;
      # a length check is a proxy that breaks on any truthful vendor change while
      # still not proving Gemini is absent, which is what this test is for.
      expect(m['vendors'].map { |v| v['name'] })
        .to match_array(['Amazon Web Services, Inc.', 'Anthropic, PBC'])
    end

    it 'never uses the word "de-identified" anywhere in the metadata text' do
      m = described_class.metadata(1)
      expect(JSON.generate(m)).not_to match(/de-identified/i)
    end

    it 'does not claim unqualified "never trains"' do
      m = described_class.metadata(1)
      serialized = JSON.generate(m)
      expect(serialized).not_to match(/never trains/i)
    end

    it 'returns retention metadata with the EU/children/general split, not a single blanket number' do
      m = described_class.metadata(1)
      retention = m['retention']
      expect(retention['lingolinq_eu']['window_years']).to eq(5)
      # false, corrected 2026-08-30 with the #888 retraction pass: the 5-year EU
      # purge is scheduled but has removed nothing (no record is old enough), and
      # the "EU AI Act Article 50 record-keeping" basis the old note gave was
      # retracted. This spec previously pinned the wrong value (true).
      expect(retention['lingolinq_eu']['enforced']).to eq(false)
      expect(retention['lingolinq_children']['window_months']).to eq(12)
      expect(retention['lingolinq_children']['enforced']).to eq(false)
      expect(retention['lingolinq_general']['window_months']).to eq(24)
      expect(retention['lingolinq_general']['enforced']).to eq(false)
      expect(retention['ip_address']['window_days']).to eq(90)
      expect(retention['ip_address']['enforced']).to eq(true)
    end

    it 'includes data categories and a scrubbing note' do
      m = described_class.metadata(1)
      expect(m['data_categories']).to be_an(Array)
      # Word prediction + eval narration only -- AI board generation was reclassified
      # Non-personal 2026-07-09 (Scot) and is deliberately not gated by this consent.
      # See docs/legal/AI_DATA_FLOW_CLASSIFICATION.md section 4.2.
      expect(m['data_categories'].length).to be >= 2
      expect(m['scrubbing_note']).to be_a(String)
    end

    it 'includes a revocation summary' do
      m = described_class.metadata(1)
      expect(m['revocation_summary']).to be_a(String)
      expect(m['revocation_summary']).to match(/withdraw/i)
    end

    it 'includes the resolved version number and a content hash' do
      m = described_class.metadata(1)
      expect(m['version']).to eq(1)
      expect(m['content_hash']).to match(/\A[0-9a-f]{64}\z/)
    end

    it 'returns a deep copy: mutating the result does not mutate the REGISTRY' do
      m = described_class.metadata(1)
      m['vendors'] << { 'name' => 'Evil Corp' }
      m2 = described_class.metadata(1)
      expect(m2['vendors'].map { |v| v['name'] }).not_to include('Evil Corp')
    end
  end

  describe '.content_hash' do
    it 'returns nil for an unknown version' do
      expect(described_class.content_hash(999)).to be_nil
    end

    it 'is deterministic across repeated calls' do
      expect(described_class.content_hash(1)).to eq(described_class.content_hash(1))
    end

    it 'is a 64-character hex SHA256 digest' do
      expect(described_class.content_hash(1)).to match(/\A[0-9a-f]{64}\z/)
    end

    it 'changes when the underlying registry entry changes (substantive-change detection)' do
      original_hash = described_class.content_hash(1)
      mutated_registry = described_class::REGISTRY.dup
      mutated_registry[1] = described_class::REGISTRY[1].merge('effective_date' => '2099-01-01')
      stub_const('LingoLinq::AiConsentDisclosures::REGISTRY', mutated_registry)
      expect(described_class.content_hash(1)).not_to eq(original_hash)
    end
  end

  describe '.known_version?' do
    it 'is true for CURRENT_VERSION and false for an unknown version' do
      expect(described_class.known_version?(1)).to eq(true)
      expect(described_class.known_version?(2)).to eq(false)
      expect(described_class.known_version?(nil)).to eq(false)
    end
  end
end

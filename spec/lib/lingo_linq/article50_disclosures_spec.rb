# frozen_string_literal: true

require 'spec_helper'

describe LingoLinq::Article50Disclosures do
  DEV_TOOLING_NAMES = ['gpt-5', 'Codex', 'DeepSeek', 'Fable', 'Gemini', 'OpenAI'].freeze

  describe '::CURRENT_VERSION' do
    it 'is 1' do
      expect(described_class::CURRENT_VERSION).to eq(1)
    end
  end

  describe '.known_version?' do
    it 'is true only for the known Integer version 1' do
      expect(described_class.known_version?(1)).to eq(true)
    end

    it 'is false for an unknown version, a non-numeric-prefixed string, and nil' do
      expect(described_class.known_version?(2)).to eq(false)
      expect(described_class.known_version?('art50_v1')).to eq(false)
      expect(described_class.known_version?(nil)).to eq(false)
    end
  end

  describe '.metadata' do
    it 'returns a Hash with the required structured keys for version 1' do
      m = described_class.metadata(1)
      expect(m).to be_a(Hash)
      expect(m['version']).to eq(1)
      expect(m['effective_date']).to be_a(String)
      expect(m['content_hash']).to match(/\A[0-9a-f]{64}\z/)
      expect(m['vendors']).to be_an(Array)
      expect(m['data_categories']).to be_an(Array)
      expect(m['ai_marking']).not_to be_nil
      expect(m['retention']).to be_a(Hash)
    end

    it 'returns nil for an unknown version' do
      expect(described_class.metadata(2)).to be_nil
    end

    it 'returns a deep copy: mutating the result does not mutate the REGISTRY' do
      m = described_class.metadata(1)
      m['vendors'] << { 'name' => 'Evil Corp' }
      m2 = described_class.metadata(1)
      expect(m2['vendors'].map { |v| v['name'] }).not_to include('Evil Corp')
    end
  end

  describe '.content_hash' do
    it 'is a 64-char hex digest, stable across calls, for version 1' do
      h1 = described_class.content_hash(1)
      h2 = described_class.content_hash(1)
      expect(h1).to match(/\A[0-9a-f]{64}\z/)
      expect(h1).to eq(h2)
    end

    it 'returns nil for an unknown version' do
      expect(described_class.content_hash(2)).to be_nil
    end
  end

  describe 'truthfulness gate 1: vendor allowlist' do
    # Both entities in the runtime AI path must be named, and no others. AWS is the
    # PROCESSOR (it operates Bedrock inside LingoLinq's own AWS account under the AWS
    # BAA); Anthropic is the MODEL PROVIDER, which on Bedrock cannot access prompts or
    # completions. Pinning this gate to Anthropic alone -- as it did until 2026-08-02 --
    # made the notice name the wrong processor and the wrong legal basis, and actively
    # failed CI on the truthful correction.
    RUNTIME_AI_VENDORS = ['Amazon Web Services, Inc.', 'Anthropic, PBC'].freeze

    it 'names only the two entities actually in the runtime AI path' do
      m = described_class.metadata(1)
      expect(m['vendors']).not_to be_empty
      m['vendors'].each do |vendor|
        expect(RUNTIME_AI_VENDORS).to include(vendor['name'])
      end
      expect(m['vendors'].map { |v| v['name'] }).to match_array(RUNTIME_AI_VENDORS)
    end

    it 'identifies AWS as the operator of the inference, not merely a host' do
      m = described_class.metadata(1)
      aws = m['vendors'].find { |v| v['name'] == 'Amazon Web Services, Inc.' }
      expect(aws['tier']).to include('Amazon Bedrock')
      expect(aws['tier']).to match(/Business Associate Agreement/i)
    end

    # Guards the specific falsehood this gate previously permitted.
    it 'never describes the runtime path as Anthropic\'s commercial API' do
      serialized = JSON.generate(described_class::REGISTRY)
      expect(serialized).not_to match(/commercial API \(not/i)
      expect(serialized).not_to match(/zero-data-retention agreement/i)
    end

    it 'lists only Claude Haiku 4.5 as a model' do
      m = described_class.metadata(1)
      models = m['vendors'].flat_map { |v| v['models'] }
      expect(models).not_to be_empty
      models.each do |model_string|
        expect(model_string).to match(/Claude Haiku 4\.5/)
      end
      # Opus 4.7 must NOT appear: it is absent from the classic Bedrock catalog, so
      # eval narration invokes no model and falls back to a local template. Naming a
      # model that is never invoked overstates exposure to exactly the audience this
      # notice exists to inform.
      expect(models.join(' ')).not_to include('Claude Opus 4.7')
    end

    it 'never mentions dev-loop review tooling as a runtime vendor anywhere in the serialized registry' do
      serialized = JSON.generate(described_class::REGISTRY)
      DEV_TOOLING_NAMES.each do |name|
        expect(serialized).not_to include(name)
      end
    end
  end

  describe 'truthfulness gate 2: tiered retention' do
    it 'has all required retention keys' do
      retention = described_class.metadata(1)['retention']
      %w[vendor_side lingolinq_general lingolinq_children lingolinq_eu lingolinq_hipaa_floor ip_address account_deletion].each do |key|
        expect(retention).to have_key(key)
      end
    end

    it 'states the general tier as 24 months' do
      retention = described_class.metadata(1)['retention']
      expect(retention['lingolinq_general']['window_months']).to eq(24)
    end

    it 'states the children tier as a rolling 12 months' do
      retention = described_class.metadata(1)['retention']
      expect(retention['lingolinq_children']['window_months']).to eq(12)
      expect(retention['lingolinq_children']['rolling']).to eq(true)
    end

    it 'states the EU tier as up to 5 years' do
      retention = described_class.metadata(1)['retention']
      expect(retention['lingolinq_eu']['window_years']).to eq(5)
    end

    # Until 2026-08-30 this example pinned the RETRACTED claim: it required the
    # note to present 45 CFR 164.316(b)(2) as a retention "hard floor". That rule
    # governs a covered entity's written policies and procedures, not AI request
    # logs (#888 retraction). The note may now cite the regulation only to
    # retract it, and must say the window is under counsel review.
    it 'states the healthcare window as 6 years without reasserting the retracted 164.316(b)(2) hard floor' do
      retention = described_class.metadata(1)['retention']
      floor = retention['lingolinq_hipaa_floor']
      expect(floor['window_years']).to eq(6)
      expect(floor['note']).to include('45 CFR 164.316(b)(2)')
      expect(floor['note']).to match(/under review with counsel/i)
      # The retracted assertion shape: "a hard floor" NOT immediately followed by
      # the retraction's "required by ..." framing. Mirrors the BANNED_CLAIMS row
      # in spec/support/ai_disclosure_claims.rb.
      expect(floor['note']).not_to match(/a hard floor(?! required by)/i)
      expect(floor['note']).not_to match(/This (?:is a )?hard floor/)
    end
  end

  describe 'truthfulness gate 3: no flat retention number' do
    it 'never asserts a bare, unqualified 24-months-for-everyone retention claim' do
      serialized = JSON.generate(described_class::REGISTRY)
      expect(serialized).not_to match(/24 months for (all|every)/i)
      expect(serialized).not_to match(/all (data|accounts|records).{0,40}24 months/i)
    end

    it 'states that the general tier note is overridden upward by the EU and HIPAA floors' do
      note = described_class.metadata(1)['retention']['lingolinq_general']['note']
      expect(note).to match(/override/i)
      expect(note).to match(/upward/i)
    end

    it 'states that the children tier note is overridden upward by the EU and HIPAA floors' do
      note = described_class.metadata(1)['retention']['lingolinq_children']['note']
      expect(note).to match(/override/i)
      expect(note).to match(/upward/i)
    end
  end

  describe 'truthfulness gate 4: vendor-side retention is separate from LingoLinq retention' do
    it 'describes vendor_side and lingolinq_* retention as distinct facts under distinct keys' do
      retention = described_class.metadata(1)['retention']
      vendor_side = retention['vendor_side']
      expect(vendor_side).to be_a(String)
      expect(vendor_side).to match(/Anthropic/)

      general_note = retention['lingolinq_general']['note']
      children_note = retention['lingolinq_children']['note']
      # LingoLinq's own retention notes describe LingoLinq's own record-keeping, not
      # Anthropic's vendor-side retention -- the two facts must not be merged into one
      # sentence under one key.
      expect(general_note).not_to match(/Anthropic/)
      expect(children_note).not_to match(/Anthropic/)
      expect(vendor_side).not_to eq(general_note)
    end
  end

  describe 'truthfulness gate 5: eval narration states its own de-identification' do
    # The notice claims the student's name and diagnosis are removed before eval
    # data is sent. That claim is only true because EvalNarrator#payload_for_prompt
    # drops them. Assert BOTH halves here so the pair cannot silently decouple: if
    # someone stops dropping either field, this spec fails on the code side, and if
    # someone removes the reassurance from the notice, it fails on the text side.
    let(:eval_feature) do
      described_class.metadata(1)['ai_features'].detect { |f| f['key'] == 'eval_narrator' }
    end

    it 'tells the reader that the name and diagnosis are removed before sending' do
      expect(eval_feature).not_to be_nil
      description = eval_feature['description']
      expect(description).to match(/removed before/i)
      expect(description).to match(/name/i)
      expect(description).to match(/diagnosis/i)

      category = described_class.metadata(1)['data_categories'].detect { |c| c =~ /evaluation/i }
      expect(category).to match(/removed before sending/i)
    end

    it 'matches what EvalNarrator actually strips from the egress payload' do
      payload = {
        'eval_mode' => 'comprehensive',
        'intake' => { 'etiology' => 'cerebral palsy', 'age' => 7 },
        'sett' => { 'student' => 'Jane Doe', 'environment' => 'classroom' },
        'recommendation' => { 'grid_size' => '4x8' },
        'slp_notes' => 'consistent direct selection',
        'duration_s' => 900
      }
      out = EvalNarrator.send(:payload_for_prompt, payload)

      # The two removals the notice promises.
      expect(out['sett']).not_to have_key('student')
      expect(out['intake']).not_to have_key('etiology')
      # And the fields the notice DOES say are sent are still sent, so the notice
      # is not under-claiming either.
      expect(out['slp_notes']).to eq('consistent direct selection')
      expect(out['recommendation']).to eq({ 'grid_size' => '4x8' })
    end
  end

  describe 'ai_marking' do
    it 'states that Article 50(2) marking is unconditional and independent of jurisdiction or feature flags' do
      marking = described_class.metadata(1)['ai_marking']
      serialized = marking.is_a?(String) ? marking : JSON.generate(marking)
      expect(serialized).to match(/50\(2\)/)
      expect(serialized).to match(/unconditional|regardless of jurisdiction/i)
    end
  end
end

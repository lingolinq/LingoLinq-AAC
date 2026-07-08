require 'spec_helper'

describe Language::VocabGenerator do
  let(:vocab) { described_class.vocab_for('en') }

  describe '.vocab_for' do
    it 'returns the top-level schema-2 vocab envelope' do
      expect(vocab['_locale']).to eq('en')
      expect(vocab['_schema']).to eq(2)
      expect(vocab['_type']).to eq('vocab')
      expect(vocab['sets']).to be_a(Array)
      expect(vocab['concepts']).to be_a(Hash)
    end

    it 'is deterministic (two calls deep-equal)' do
      expect(described_class.vocab_for('en')).to eq(described_class.vocab_for('en'))
    end
  end

  describe 'set structure' do
    let(:core_sets) { vocab['sets'].select { |s| s['category'] == 'core' } }
    let(:fringe_sets) { vocab['sets'].select { |s| s['category'] == 'fringe' } }

    it 'has exactly 4 core sets in source order with ids/names/urls preserved' do
      expect(core_sets.map { |s| s['id'] }).to eq(
        %w[default project_core unc_common_core basic_core]
      )
      core_sets.each do |set|
        expect(set['name']).to be_a(String)
        expect(set['url']).to be_a(String)
        expect(set['category']).to eq('core')
        expect(set['concepts']).to be_a(Array)
        expect(set['ext_members']).to be_a(Array)
      end
    end

    it 'has at least one fringe set per source category, ids/names preserved' do
      expect(fringe_sets.length).to be > 0
      fringe_sets.each do |set|
        expect(set['id']).to be_a(String)
        expect(set['name']).to be_a(String)
        expect(set['category']).to eq('fringe')
        expect(set['concepts']).to be_a(Array)
        expect(set['ext_members']).to be_a(Array)
      end
      ids = fringe_sets.map { |s| s['id'] }
      expect(ids).to include('animal', 'body', 'food')
    end
  end

  describe 'ext_members verbatim preservation (the additive compatibility anchor)' do
    let(:core_lists_snapshot) { JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'core_lists.snapshot.json'))) }
    let(:fringe_snapshot) { JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'fringe_suggestions.snapshot.json'))) }

    it "the default set's ext_members deep-equals the snapshot's default words array" do
      default_set = vocab['sets'].detect { |s| s['id'] == 'default' }
      default_snapshot = core_lists_snapshot.detect { |l| l['id'] == 'default' }
      expect(default_set['ext_members']).to eq(default_snapshot['words'])
    end

    it "a sampled fringe category's ext_members deep-equals the snapshot's words array" do
      animal_set = vocab['sets'].detect { |s| s['id'] == 'animal' }
      animal_snapshot = fringe_snapshot.first['categories'].detect { |c| c['id'] == 'animal' }
      expect(animal_set['ext_members']).to eq(animal_snapshot['words'])
    end
  end

  describe 'concept-id literalness' do
    it 'a concept id equals its surface string' do
      default_set = vocab['sets'].detect { |s| s['id'] == 'default' }
      expect(default_set['concepts']).to include('more', 'i', 'you', 'help')
      expect(vocab['concepts']).to have_key('more')
    end
  end

  describe 'VOCAB-03 (non-concept exclusion)' do
    it '+ed, adjectives, and don’t are absent from the concepts registry and the default set concepts, but present in ext_members' do
      default_set = vocab['sets'].detect { |s| s['id'] == 'default' }

      %w[+ed adjectives don’t].each do |surface|
        expect(vocab['concepts']).to_not have_key(surface)
        expect(default_set['concepts']).to_not include(surface)
        expect(default_set['ext_members']).to include(surface)
      end
    end
  end

  describe 'VOCAB-04 (duplicate collapse)' do
    it 'more appears exactly once as a concepts registry key despite occurring in multiple core sets' do
      expect(vocab['concepts'].keys.count('more')).to eq(1)
      expect(vocab['concepts']).to have_key('more')

      occurrences = vocab['sets'].count { |s| s['category'] == 'core' && s['concepts'].include?('more') }
      expect(occurrences).to be > 1
    end
  end

  describe 'CONCEPT-02 (optional external_refs)' do
    it 'every concepts registry entry has an external_refs key equal to {}' do
      expect(vocab['concepts']).to_not be_empty
      vocab['concepts'].each_value do |entry|
        expect(entry['external_refs']).to eq({})
      end
    end
  end

  describe 'fail-closed accounting' do
    it 'raises when a set has a surface that is neither a concept nor a classified non-concept' do
      sets = [
        {
          'id' => 'broken',
          'name' => 'Broken',
          'category' => 'core',
          'concepts' => %w[cat],
          'ext_members' => %w[cat unaccounted_surface]
        }
      ]
      lookup = { exact: Set.new, downcased: Set.new }

      expect {
        described_class.verify_accounting!(sets, lookup)
      }.to raise_error(/unaccounted_surface.*neither a registry concept nor a classified non-concept/)
    end
  end
end

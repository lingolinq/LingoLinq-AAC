require 'spec_helper'

describe QuickCoreDescriptions do
  def coughdrop_markers
    ['mycoughdrop', 'CoughDrop', 'coughdrop.com']
  end

  describe '.root_description_for' do
    QuickCoreDescriptions::SLUGS.each do |slug|
      it "returns CoughDrop-free copy for #{slug}" do
        desc = described_class.root_description_for(slug)
        expect(desc).to be_present
        coughdrop_markers.each do |marker|
          expect(desc).not_to include(marker)
        end
        expect(desc).to match(%r{lingolinq/quick-core-\d+})
        expect(desc).to include('PrAACtical AAC')
        expect(desc).to include("isn't unique (http://www.speakforyourself.org")
        expect(desc).to include('Find a Button')
      end
    end

    it 'keeps the Quick Core 24 yes/no first-screen note and 24-specific counts' do
      desc = described_class.root_description_for('quick-core-24')
      expect(desc).to include('without yes/no on the first screen')
      expect(desc).to include('about 600 words')
      expect(desc).to include('at most 3 button-presses')
      expect(desc).to include('"eat" contains food words')
      expect(desc).to include('lingolinq/quick-core-60')
      expect(desc).not_to include('lingolinq/quick-core-24')
    end

    it 'keeps Quick Core 84 counts and category examples' do
      desc = described_class.root_description_for('quick-core-84')
      expect(desc).to include('at most 2 button-presses')
      expect(desc).to include('about 4,500 words')
      expect(desc).to include('"with" contains ingredients and condiments')
    end

    it 'returns nil for unknown slugs' do
      expect(described_class.root_description_for('vocal-flair-60')).to eq(nil)
      expect(described_class.root_description_for(nil)).to eq(nil)
    end
  end

  describe '.apply_to_root!' do
    it 'stamps the overlay onto an existing Quick Core board' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({
        name: "Quick Core 60",
        public: true,
        description: "See https://app.mycoughdrop.com/example/core-24. This strategy isn't unique to CoughDrop."
      }, {user: owner, key: 'quick-core-60'})

      expect(described_class.apply_to_root!(board, slug: 'quick-core-60')).to eq(true)
      board.reload
      expect(board.settings['description']).to eq(described_class.root_description_for('quick-core-60'))
      expect(board.settings['description']).not_to include('mycoughdrop')
    end

    it 'returns false when the overlay is already in place' do
      owner = User.create(user_name: 'lingolinq')
      desc = described_class.root_description_for('quick-core-60')
      board = Board.process_new({name: "Quick Core 60", public: true, description: desc}, {user: owner, key: 'quick-core-60'})
      expect(described_class.apply_to_root!(board, slug: 'quick-core-60')).to eq(false)
    end
  end

  describe '.sanitize_child_description!' do
    it 'replaces the CoughDrop default string only' do
      owner = User.create(user_name: 'lingolinq')
      child = Board.process_new({name: "Core 60 - it", public: true, description: 'built with CoughDrop'}, {user: owner, key: 'core-60-it'})
      keep = Board.process_new({name: "Core 60 - do", public: true, description: 'Food and cooking words'}, {user: owner, key: 'core-60-do'})

      expect(described_class.sanitize_child_description!(child)).to eq(true)
      expect(described_class.sanitize_child_description!(keep)).to eq(false)
      expect(child.reload.settings['description']).to eq('built with LingoLinq')
      expect(keep.reload.settings['description']).to eq('Food and cooking words')
    end
  end

  describe '.apply_to_imported_boards!' do
    it 'overlays the root and sanitizes default child descriptions for Quick Core files' do
      owner = User.create(user_name: 'lingolinq')
      root = Board.process_new({name: "Quick Core 24", public: true, description: 'https://app.mycoughdrop.com/example/core-60'}, {user: owner, key: 'core-24'})
      child = Board.process_new({name: "Core 24 - it", public: true, description: 'built with CoughDrop'}, {user: owner, key: 'core-24-it'})

      result = described_class.apply_to_imported_boards!([root, child], filename: 'quick-core-24.obz')

      expect(result[:slug]).to eq('quick-core-24')
      expect(result[:root]).to eq(true)
      expect(result[:children]).to eq(1)
      expect(root.reload.settings['description']).to include('without yes/no')
      expect(child.reload.settings['description']).to eq('built with LingoLinq')
    end

    it 'is a no-op for non-Quick-Core imports' do
      owner = User.create(user_name: 'lingolinq')
      root = Board.process_new({name: "Vocal Flair 60", public: true, description: 'built with CoughDrop'}, {user: owner, key: 'vocal-flair-60'})
      result = described_class.apply_to_imported_boards!([root], filename: 'vocal-flair-60.obz')
      expect(result[:slug]).to eq(nil)
      expect(root.reload.settings['description']).to eq('built with CoughDrop')
    end
  end

  describe '.apply_existing_roots!' do
    it 'stamps present Quick Core roots owned by the system user' do
      owner = User.create(user_name: 'lingolinq')
      other = User.create(user_name: 'someone')
      qc60 = Board.process_new({name: "Quick Core 60", public: true, description: 'built with CoughDrop'}, {user: owner, key: 'quick-core-60'})
      Board.process_new({name: "Quick Core 24", public: true, description: 'mine'}, {user: other, key: 'quick-core-24'})

      results = described_class.apply_existing_roots!(owner: owner)

      expect(results.map { |r| r[:slug] }).to eq(['quick-core-60'])
      expect(results.first[:changed]).to eq(true)
      expect(qc60.reload.settings['description']).to include('about 2,000 words')
    end
  end
end

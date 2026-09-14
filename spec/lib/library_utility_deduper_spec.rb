require 'spec_helper'

describe LibraryUtilityDeduper do
  describe '.utility_page_key?' do
    it 'matches generic and brand-prefixed utility slugs' do
      expect(described_class.utility_page_key?('lingolinq/emoji_7', 'lingolinq')).to eq(true)
      expect(described_class.utility_page_key?('lingolinq/vocal-flair-84-keyboard', 'lingolinq')).to eq(true)
      expect(described_class.utility_page_key?('lingolinq/quick-core-24-numbers', 'lingolinq')).to eq(true)
    end

    it 'rejects roots and unrelated keys' do
      expect(described_class.utility_page_key?('lingolinq/vocal-flair-84-w-keyboard', 'lingolinq')).to eq(false)
      expect(described_class.utility_page_key?('lingolinq/keyboard-with-categories', 'lingolinq')).to eq(false)
      expect(described_class.utility_page_key?('lingolinq/vocal-flair-84', 'lingolinq')).to eq(false)
      expect(described_class.utility_page_key?('larry/emoji', 'lingolinq')).to eq(false)
    end
  end

  describe '.pick_canonical' do
    it 'prefers a brand-prefixed key over a short slug' do
      u = User.create
      generic = Board.process_new({name: 'Keyboard', public: true}, {user: u, key: 'keyboard'})
      namespaced = Board.process_new({name: 'Vocal Flair 84 - Keyboard', public: true}, {user: u, key: 'vocal-flair-84-keyboard'})
      picked = described_class.pick_canonical([generic, namespaced], user_name: u.user_name)
      expect(picked.key).to eq(namespaced.key)
    end

    it 'prefers an unsuffixed slug when no brand prefix exists' do
      u = User.create
      root = Board.process_new({name: 'emoji', public: true}, {user: u, key: 'emoji'})
      copy = Board.process_new({name: 'emoji', public: true}, {user: u, key: 'emoji_7'})
      picked = described_class.pick_canonical([copy, root], user_name: u.user_name)
      expect(picked.key).to eq(root.key)
    end
  end

  describe '.plan' do
    it 'clusters identical pages and lists parent relinks' do
      owner = User.create
      emoji_a = Board.process_new({
        name: 'emoji',
        public: true,
        buttons: [{id: 1, label: 'smile'}, {id: 2, label: 'sad'}],
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'emoji'})
      emoji_b = Board.process_new({
        name: 'emoji',
        public: true,
        buttons: [{id: 1, label: 'smile'}, {id: 2, label: 'sad'}],
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'emoji_7'})
      other = Board.process_new({
        name: 'Keyboard',
        public: true,
        buttons: [{id: 1, label: 'a'}],
        grid: {rows: 3, columns: 10, order: [[1]]}
      }, {user: owner, key: 'keyboard_2'})
      root = Board.process_new({
        name: 'Quick Core 24',
        public: true,
        buttons: [
          {id: 1, label: 'emoji', load_board: {'id' => emoji_b.global_id, 'key' => emoji_b.key}}
        ],
        grid: {rows: 1, columns: 1, order: [[1]]}
      }, {user: owner, key: 'quick-core-24'})

      plan = described_class.plan(owner)
      expect(plan.clusters.length).to eq(1)
      cluster = plan.clusters.first
      expect(cluster.canonical.key).to eq(emoji_a.key)
      expect(cluster.extras.map(&:key)).to eq([emoji_b.key])
      expect(cluster.relinks.map(&:parent_key)).to eq([root.key])
      expect(cluster.relinks.first.from_key).to eq(emoji_b.key)
      expect(cluster.relinks.first.to_key).to eq(emoji_a.key)
      expect(plan.skipped.map { |s| s[:key] }).to include(other.key)
    end

    it 'does not cluster keyboards with different button sets' do
      owner = User.create
      qc = Board.process_new({
        name: 'Keyboard',
        public: true,
        buttons: [{id: 1, label: 'a'}, {id: 2, label: 'b'}],
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'keyboard_12'})
      vf = Board.process_new({
        name: 'Vocal Flair 84 - Keyboard',
        public: true,
        buttons: [{id: 1, label: 'q'}, {id: 2, label: 'w'}, {id: 3, label: 'e'}],
        grid: {rows: 7, columns: 12, order: [[1, 2, 3]]}
      }, {user: owner, key: 'vocal-flair-84-keyboard'})

      plan = described_class.plan(owner)
      expect(plan.clusters).to eq([])
      expect(plan.skipped.map { |s| s[:key] }).to include(qc.key, vf.key)
    end
  end
end

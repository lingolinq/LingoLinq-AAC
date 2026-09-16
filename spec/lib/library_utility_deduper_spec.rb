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

  describe '.prod_database?' do
    it 'is true for the production Cloud SQL instance or database name' do
      expect(described_class.prod_database?(database: 'lingolinq_production', host: '/cloudsql/x')).to eq(true)
      expect(described_class.prod_database?(database: 'lingolinq_staging', host: '/cloudsql/lingolinq-prod:us-central1:lingolinq-prod-pg')).to eq(true)
    end

    it 'is false for nonprod Cloud SQL' do
      expect(described_class.prod_database?(
        database: 'lingolinq_staging',
        host: '/cloudsql/lingolinq-nonprod:us-central1:lingolinq-nonprod-pg'
      )).to eq(false)
    end
  end

  describe '.assert_apply_allowed!' do
    it 'refuses APPLY without APPLY_CONFIRM' do
      expect {
        described_class.assert_apply_allowed!(
          {'APPLY' => '1'},
          database: 'lingolinq_staging',
          host: '/cloudsql/lingolinq-nonprod:us-central1:lingolinq-nonprod-pg'
        )
      }.to raise_error(/APPLY_CONFIRM/)
    end

    it 'refuses APPLY against a production database even with confirm' do
      expect {
        described_class.assert_apply_allowed!(
          {'APPLY' => '1', 'APPLY_CONFIRM' => '1'},
          database: 'lingolinq_production',
          host: '/cloudsql/lingolinq-prod:us-central1:lingolinq-prod-pg'
        )
      }.to raise_error(/ALLOW_PROD_APPLY/)
    end

    it 'allows APPLY on production with confirm and ALLOW_PROD_APPLY' do
      expect {
        described_class.assert_apply_allowed!(
          {'APPLY' => '1', 'APPLY_CONFIRM' => '1', 'ALLOW_PROD_APPLY' => '1'},
          database: 'lingolinq_production',
          host: '/cloudsql/lingolinq-prod:us-central1:lingolinq-prod-pg'
        )
      }.not_to raise_error
    end

    it 'allows APPLY with confirm on nonprod without ALLOW_PROD_APPLY' do
      expect {
        described_class.assert_apply_allowed!(
          {'APPLY' => '1', 'APPLY_CONFIRM' => '1'},
          database: 'lingolinq_staging',
          host: '/cloudsql/lingolinq-nonprod:us-central1:lingolinq-nonprod-pg'
        )
      }.not_to raise_error
    end
  end

  describe '.apply!' do
    it 'relinks kept boards then destroys extras, and leaves the sidebar slug cluster untouched' do
      owner = User.create
      emoji_keep = Board.process_new({
        name: 'emoji',
        public: true,
        buttons: [{id: 1, label: 'smile'}, {id: 2, label: 'sad'}],
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'emoji'})
      emoji_extra = Board.process_new({
        name: 'emoji',
        public: true,
        buttons: [{id: 1, label: 'smile'}, {id: 2, label: 'sad'}],
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'emoji_7'})

      keyboard_buttons = lambda do |emoji_target|
        [
          {id: 1, label: 'a'},
          {id: 2, label: 'emoji', load_board: {'id' => emoji_target.global_id, 'key' => emoji_target.key}}
        ]
      end
      keyboard_keep = Board.process_new({
        name: 'Keyboard',
        public: true,
        buttons: keyboard_buttons.call(emoji_extra),
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'keyboard_10'})
      keyboard_extra = Board.process_new({
        name: 'Keyboard',
        public: true,
        buttons: keyboard_buttons.call(emoji_extra),
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'keyboard_4'})
      root = Board.process_new({
        name: 'Quick Core 24',
        public: true,
        buttons: [
          {id: 1, label: 'keyboard', load_board: {'id' => keyboard_extra.global_id, 'key' => keyboard_extra.key}}
        ],
        grid: {rows: 1, columns: 1, order: [[1]]}
      }, {user: owner, key: 'quick-core-24'})

      sidebar = Board.process_new({
        name: 'Vocal Flair 84 - Keyboard',
        public: true,
        buttons: [{id: 1, label: 'q'}, {id: 2, label: 'w'}, {id: 3, label: 'e'}],
        grid: {rows: 7, columns: 12, order: [[1, 2, 3]]}
      }, {user: owner, key: 'keyboard'})
      vf84 = Board.process_new({
        name: 'Vocal Flair 84 - Keyboard',
        public: true,
        buttons: [{id: 1, label: 'q'}, {id: 2, label: 'w'}, {id: 3, label: 'e'}],
        grid: {rows: 7, columns: 12, order: [[1, 2, 3]]}
      }, {user: owner, key: 'vocal-flair-84-keyboard'})

      result = described_class.apply!(owner)

      expect(Board.find_by_path(emoji_keep.key)).to be_present
      expect(Board.find_by_path(emoji_extra.key)).to eq(nil)
      expect(Board.find_by_path(keyboard_keep.key)).to be_present
      expect(Board.find_by_path(keyboard_extra.key)).to eq(nil)
      expect(Board.find_by_path(sidebar.key)).to be_present
      expect(Board.find_by_path(vf84.key)).to be_present

      keep = Board.find_by_path(keyboard_keep.key)
      emoji_btn = keep.buttons.detect { |b| b['label'] == 'emoji' }
      expect(emoji_btn['load_board']['id']).to eq(emoji_keep.global_id)
      expect(emoji_btn['load_board']['key']).to eq(emoji_keep.key)

      qc = Board.find_by_path(root.key)
      kb_btn = qc.buttons.detect { |b| b['label'] == 'keyboard' }
      expect(kb_btn['load_board']['id']).to eq(keyboard_keep.global_id)
      expect(kb_btn['load_board']['key']).to eq(keyboard_keep.key)

      expect(result[:skipped_sidebar_clusters]).to eq(1)
      expect(result[:destroyed_keys]).to match_array([emoji_extra.key, keyboard_extra.key])
    end

    it 'retargets user sidebar keys that point at a destroyed extra, not the sidebar slug' do
      owner = User.create
      keyboard_keep = Board.process_new({
        name: 'Keyboard',
        public: true,
        buttons: [{id: 1, label: 'a'}, {id: 2, label: 'b'}],
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'keyboard_12'})
      keyboard_extra = Board.process_new({
        name: 'Keyboard',
        public: true,
        buttons: [{id: 1, label: 'a'}, {id: 2, label: 'b'}],
        grid: {rows: 3, columns: 10, order: [[1, 2]]}
      }, {user: owner, key: 'keyboard_16'})
      sidebar = Board.process_new({
        name: 'Vocal Flair 84 - Keyboard',
        public: true,
        buttons: [{id: 1, label: 'q'}, {id: 2, label: 'w'}, {id: 3, label: 'e'}],
        grid: {rows: 7, columns: 12, order: [[1, 2, 3]]}
      }, {user: owner, key: 'keyboard'})
      Board.process_new({
        name: 'Vocal Flair 84 - Keyboard',
        public: true,
        buttons: [{id: 1, label: 'q'}, {id: 2, label: 'w'}, {id: 3, label: 'e'}],
        grid: {rows: 7, columns: 12, order: [[1, 2, 3]]}
      }, {user: owner, key: 'vocal-flair-84-keyboard'})

      viewer = User.create
      viewer.settings ||= {}
      viewer.settings['preferences'] ||= {}
      viewer.settings['preferences']['sidebar_boards'] = [
        {'name' => 'Keyboard', 'key' => sidebar.key},
        {'name' => 'QC Keyboard', 'key' => keyboard_extra.key, 'id' => keyboard_extra.global_id}
      ]
      viewer.save!

      result = described_class.apply!(owner)
      viewer.reload

      keys = Array(viewer.settings.dig('preferences', 'sidebar_boards')).map { |e| e['key'] }
      expect(keys).to include(sidebar.key)
      expect(keys).to include(keyboard_keep.key)
      expect(keys).not_to include(keyboard_extra.key)
      qc_entry = Array(viewer.settings.dig('preferences', 'sidebar_boards')).detect { |e| e['key'] == keyboard_keep.key }
      expect(qc_entry['id']).to eq(keyboard_keep.global_id)
      expect(Board.find_by_path(keyboard_extra.key)).to eq(nil)
      expect(result[:retargeted_user_refs]).to include(
        hash_including(user_name: viewer.user_name, kind: 'sidebar', from_key: keyboard_extra.key, to_key: keyboard_keep.key)
      )
    end
  end
end

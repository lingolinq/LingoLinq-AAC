require 'spec_helper'

describe BoardSetCopier, :type => :model do
  describe "large board set integration" do
    it "copies a 50+ board set and rewrites every load_board link to the new mapper" do
      owner = User.create
      recipient = User.create

      root = Board.create(user: owner, public: true)

      # Build a tree: 1 root + 7 children + 49 grandchildren = 57 boards.
      # Each grandchild is also cross-linked from one sibling branch to exercise
      # the reverse-link index and the dedup path.
      children = 7.times.map { Board.create(user: owner, public: true) }
      grandchildren_by_child = {}
      children.each do |child|
        grandchildren_by_child[child.global_id] = 7.times.map { Board.create(user: owner, public: true) }
      end

      all_grandchildren = grandchildren_by_child.values.flatten
      all_old_boards = [root] + children + all_grandchildren
      expect(all_old_boards.length).to be >= 50

      # Root links to each child.
      root.settings['buttons'] = children.each_with_index.map do |c, i|
        { 'id' => i + 1, 'load_board' => { 'id' => c.global_id, 'key' => c.key } }
      end
      root.instance_variable_set('@buttons_changed', true)
      root.save!

      # Each child links to its 7 grandchildren + one grandchild from the next
      # child (cross-branch link, exercises the dedup path).
      children.each_with_index do |child, idx|
        own = grandchildren_by_child[child.global_id]
        cross_branch = grandchildren_by_child[children[(idx + 1) % children.length].global_id].first
        buttons = own.each_with_index.map do |g, i|
          { 'id' => i + 1, 'load_board' => { 'id' => g.global_id, 'key' => g.key } }
        end
        buttons << { 'id' => own.length + 1, 'load_board' => { 'id' => cross_branch.global_id, 'key' => cross_branch.key } }
        child.settings['buttons'] = buttons
        child.instance_variable_set('@buttons_changed', true)
        child.save!
      end

      Worker.process_queues
      root.reload
      root.track_downstream_boards!
      expect(root.settings['downstream_board_ids'].length).to eq(all_old_boards.length - 1)

      # Seed the copy of the root, then run the full copy-and-relink.
      new_root = root.copy_for(recipient)
      mapper = Board.copy_board_links_for(recipient, starting_old_board: root, starting_new_board: new_root)

      # Every old board must appear in the mapper with a new id.
      all_old_boards.each do |old|
        expect(mapper[old.global_id]).not_to be_nil, "missing mapper entry for #{old.key}"
        expect(mapper[old.global_id][:id]).not_to eq(old.global_id)
      end

      # Every load_board link in the copied boards must reference a NEW id
      # (i.e. a value from the mapper), never an old id.
      old_ids = all_old_boards.map(&:global_id).to_set
      new_ids = mapper.values.map { |v| v[:id] }.to_set

      all_old_boards.each do |old|
        copy = Board.find_by_global_id(mapper[old.global_id][:id])
        expect(copy).not_to be_nil
        (copy.buttons || []).each do |btn|
          target = btn.dig('load_board', 'id')
          next unless target
          expect(old_ids).not_to include(target), "copy of #{old.key} still links to old board #{target}"
          expect(new_ids).to include(target), "copy of #{old.key} links to unmapped id #{target}"
        end
      end
    end
  end
end

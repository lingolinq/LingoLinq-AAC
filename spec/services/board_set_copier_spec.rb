require 'spec_helper'

describe BoardSetCopier, :type => :model do
  it "reports a rising percent across both copy phases" do
    # Before this, the copy job ran under a Progress record but never called
    # update_current_progress, so `percent` was absent from the payload for the whole copy and
    # every UI showed an indeterminate bar. The assertions are about the SHAPE of the reported
    # series -- rising, bounded, reaching the relink phase -- not exact values, which depend on
    # how many boards a fixture happens to clone.
    owner = User.create
    recipient = User.create
    root = Board.create(user: owner, public: true)
    child = Board.create(user: owner, public: true)
    root.settings['buttons'] = [
      { 'id' => 1, 'load_board' => { 'id' => child.global_id, 'key' => child.key } }
    ]
    root.instance_variable_set('@buttons_changed', true)
    root.save!
    root.reload

    reported = []
    allow(Progress).to receive(:update_current_progress) do |pct, key|
      reported << [pct, key]
    end
    allow(Progress).to receive(:as_percent).and_wrap_original do |m, *args, &blk|
      reported << [args.first, :as_percent_start]
      blk.call
    end

    new_root = root.copy_for(recipient)
    Board.copy_board_links_for(
      recipient,
      starting_old_board: root,
      starting_new_board: new_root,
      valid_ids: [root.global_id, child.key]
    )

    pcts = reported.map(&:first).compact
    expect(pcts).not_to be_empty, "the copier reported no percent at all"
    # Every figure is a FRACTION -- json_api/progress.rb ships it as-is and the client
    # multiplies by 100, so a 0-100 value here would render as 4200%.
    expect(pcts.all? { |p| p >= 0.0 && p <= 1.0 }).to eq(true), "percent must be a 0-1 fraction, got #{pcts.inspect}"
    # Never goes backwards.
    expect(pcts).to eq(pcts.sort), "percent went backwards: #{pcts.inspect}"
    # Phase 2 is reached and bracketed, so the bar cannot stall in the copy phase.
    expect(reported.map(&:last)).to include(:relinking_boards)
    expect(reported.map(&:last)).to include(:as_percent_start)
    # Phase 1 must report too. Without these two the spec passed with the whole cloning-phase
    # report deleted -- the phase-2 bracket alone satisfied every other assertion, which is the
    # hollow-test shape rule 14.2 warns about.
    expect(reported.map(&:last)).to include(:copying_boards)
    copying = reported.select { |(_, key)| key == :copying_boards }.map(&:first)
    expect(copying.min).to be < 0.75, "cloning must start well below the relink handoff, got #{copying.inspect}"
    expect(copying.min).to be < 0.1, "the bar should open near zero, not part-way along: #{copying.inspect}"
  end

  it "advances the cloning bar once per board, not once per mapper entry" do
    # Regression: `done` was computed as `@mapper.size - 1`, but the loop inserts a SECOND
    # mapper key for any board carrying `shallow_source` (board_set_copier.rb:86-88). The
    # counter therefore advanced 2 per 1 cloned board and hit the 0.75 phase ceiling early,
    # where `.min(total)` turned the overshoot into a silent stall rather than an overflow.
    #
    # All three children are shallow so the series is ORDER-INDEPENDENT: with a single
    # shallow board among plain ones, whether the bug shows depends on whether that board
    # happens to be cloned last, and find_batches_by_global_id does not promise an order.
    owner = User.create
    recipient = User.create
    root = Board.create(user: owner, public: true)
    kids = 3.times.map { Board.create(user: owner, public: true) }

    root.settings['buttons'] = kids.each_with_index.map do |kid, i|
      { 'id' => i + 1, 'load_board' => { 'id' => kid.global_id, 'key' => kid.key } }
    end
    root.instance_variable_set('@buttons_changed', true)
    root.save!
    kids.each_with_index do |kid, i|
      # The on-disk shape of a shallow-copied board. Distinct ids per board, because
      # identical ones would collide in the mapper and mask the double-count.
      kid.settings['shallow_source'] = { 'id' => "shallow_#{i}", 'key' => "shallow/#{i}" }
      kid.save!
    end
    root.reload

    reported = []
    allow(Progress).to receive(:update_current_progress) { |pct, key| reported << [pct, key] }
    allow(Progress).to receive(:as_percent).and_wrap_original { |m, *args, &blk| blk.call }

    new_root = root.copy_for(recipient)
    Board.copy_board_links_for(
      recipient,
      starting_old_board: root,
      starting_new_board: new_root,
      valid_ids: [root.global_id] + kids.map(&:key)
    )

    copying = reported.select { |(_, key)| key == :copying_boards }.map(&:first)
    expect(copying.size).to eq(3), "expected one sample per cloned board, got #{copying.inspect}"

    # Each sample reports work completed BEFORE that board, so board i reports i/total.
    # Written as literals rather than derived from the source: this is what pins the 0.02
    # base, the 0.73 span, the `total` denominator and the -1 offset all at once. Mutate any
    # one of them in the copier and one of these three equalities fails.
    expect(copying[0]).to be_within(0.0001).of(0.02)
    expect(copying[1]).to be_within(0.0001).of(0.02 + (0.73 * (1.0 / 3.0)))
    expect(copying[2]).to be_within(0.0001).of(0.02 + (0.73 * (2.0 / 3.0)))

    # The ceiling belongs to phase 2 alone. Reaching it while boards are still being cloned
    # is the exact symptom of the double-count.
    expect(copying.max).to be < 0.75, "cloning reached the relink handoff early: #{copying.inspect}"

    # Strictly rising, with genuinely distinct values -- a hard-coded constant would satisfy
    # a sorted-order check but not this one.
    expect(copying.uniq.size).to eq(3), "the bar did not move between boards: #{copying.inspect}"
    expect(copying).to eq(copying.sort)
  end

  it "copies explicitly selected linked boards even when downstream ids are stale" do
    owner = User.create
    recipient = User.create
    root = Board.create(user: owner, public: true)
    child = Board.create(user: owner, public: true)
    grandchild = Board.create(user: owner, public: true)

    root.settings['buttons'] = [
      { 'id' => 1, 'load_board' => { 'id' => child.global_id, 'key' => child.key } }
    ]
    root.instance_variable_set('@buttons_changed', true)
    root.save!
    child.settings['buttons'] = [
      { 'id' => 1, 'load_board' => { 'id' => grandchild.global_id, 'key' => grandchild.key } }
    ]
    child.instance_variable_set('@buttons_changed', true)
    child.save!
    root.reload
    root.settings['downstream_board_ids'] = []
    root.save_subtly

    new_root = root.copy_for(recipient)
    mapper = Board.copy_board_links_for(
      recipient,
      starting_old_board: root,
      starting_new_board: new_root,
      valid_ids: [root.global_id, child.key],
      expand_selected_board_ids: true
    )

    expect(mapper[child.global_id]).not_to eq(nil)
    child_copy = Board.find_by_global_id(mapper[child.global_id][:id])
    expect(child_copy).not_to eq(nil)
    expect(mapper[grandchild.global_id]).not_to eq(nil)
    grandchild_copy = Board.find_by_global_id(mapper[grandchild.global_id][:id])
    expect(grandchild_copy).not_to eq(nil)

    new_root.reload
    child_copy.reload
    expect(new_root.buttons[0]['load_board']['id']).to eq(child_copy.global_id)
    expect(new_root.buttons[0]['load_board']['key']).to eq(child_copy.key)
    expect(child_copy.buttons[0]['load_board']['id']).to eq(grandchild_copy.global_id)
    expect(child_copy.buttons[0]['load_board']['key']).to eq(grandchild_copy.key)
  end

  it "respects explicit selections when full hierarchy choices are available" do
    owner = User.create
    recipient = User.create
    root = Board.create(user: owner, public: true)
    child = Board.create(user: owner, public: true)
    grandchild = Board.create(user: owner, public: true)

    root.settings['buttons'] = [
      { 'id' => 1, 'load_board' => { 'id' => child.global_id, 'key' => child.key } }
    ]
    root.instance_variable_set('@buttons_changed', true)
    root.save!
    child.settings['buttons'] = [
      { 'id' => 1, 'load_board' => { 'id' => grandchild.global_id, 'key' => grandchild.key } }
    ]
    child.instance_variable_set('@buttons_changed', true)
    child.save!

    new_root = root.copy_for(recipient)
    mapper = Board.copy_board_links_for(
      recipient,
      starting_old_board: root,
      starting_new_board: new_root,
      valid_ids: [root.global_id, child.global_id]
    )

    expect(mapper[child.global_id]).not_to eq(nil)
    expect(mapper[grandchild.global_id]).to eq(nil)
  end

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

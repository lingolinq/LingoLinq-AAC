require 'spec_helper'

describe BoardSetCopier, :type => :model do
  # Records the percent series a copy actually reports, in the terms the CLIENT sees.
  #
  # Progress.as_percent maps everything reported inside its block into [lo, hi]
  # (progress.rb:153-156), so a raw 0.5 inside as_percent(0.75, 1.0) reaches the user as
  # 0.875. Emulating that here rather than recording raw arguments is what lets one series
  # be asserted across both phases -- recording raw would make phase 2's values look like
  # they go backwards.
  #
  # Returns the array; entries are [percent, message_key], plus a [lo, :as_percent_start]
  # marker when a bracket opens.
  def capture_progress
    reported = []
    scale = [0.0, 1.0]
    allow(Progress).to receive(:update_current_progress) do |pct, key|
      lo, hi = scale
      reported << [lo + ((hi - lo) * pct), key]
    end
    allow(Progress).to receive(:as_percent).and_wrap_original do |_m, *args, &blk|
      lo, hi = args
      prior = scale
      reported << [lo, :as_percent_start]
      scale = [prior[0] + ((prior[1] - prior[0]) * lo), prior[0] + ((prior[1] - prior[0]) * hi)]
      begin
        blk.call
      ensure
        # as_percent writes settings['percent'] to the band ceiling on the way out,
        # unconditionally and even if the block reported nothing (progress.rb:168). Modelled
        # here because it is what makes the ceiling the highest value a phase can report.
        reported << [scale[1], :as_percent_end]
        scale = prior
      end
    end
    reported
  end
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

    reported = capture_progress

    new_root = root.copy_for(recipient)
    Board.copy_board_links_for(
      recipient,
      starting_old_board: root,
      starting_new_board: new_root,
      valid_ids: [root.global_id, child.key]
    )

    pcts = reported.map(&:first).compact
    expect(pcts).not_to be_empty, "the copier reported no percent at all"
    # Every figure is a FRACTION. json_api/progress.rb ships it as-is (progress.rb:29) and
    # every client consumer multiplies by 100 -- components/importing-boards.js:50,
    # components/download-board.js:90 and seven others all do, and none render it raw.
    # Passing a 0-100 value here does NOT overflow the display: update_current_progress
    # clamps to [0,1] BEFORE storing (progress.rb:197), so it would be silently truncated to
    # 1.0 and shown as a bar stuck at 100%. That is the failure this bound catches.
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

    reported = capture_progress

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

  it "moves the bar during relinking instead of freezing at the phase handoff" do
    # Regression: phase 2 was wrapped in Progress.as_percent(0.75, 1.0), but relink_boards
    # reported no percent at all -- `grep -n "Progress\." app/models/concerns/relinking.rb`
    # returns nothing, and the copier's own relink loop called only update_minutes_estimate.
    # as_percent writes settings['percent'] once, on block EXIT (progress.rb:168), so the
    # bracket's only effect was to jump 0.75 -> 1.0 when relinking finished. On a large set
    # the bar sat at 75% for the whole phase.
    owner = User.create
    recipient = User.create
    root = Board.create(user: owner, public: true)
    kids = 3.times.map { Board.create(user: owner, public: true) }

    root.settings['buttons'] = kids.each_with_index.map do |kid, i|
      { 'id' => i + 1, 'load_board' => { 'id' => kid.global_id, 'key' => kid.key } }
    end
    root.instance_variable_set('@buttons_changed', true)
    root.save!
    root.reload

    reported = capture_progress

    new_root = root.copy_for(recipient)
    Board.copy_board_links_for(
      recipient,
      starting_old_board: root,
      starting_new_board: new_root,
      valid_ids: [root.global_id] + kids.map(&:key)
    )

    # Strictly INSIDE the band. The 0.75 floor written just before the bracket opens is not
    # evidence the bar moved, and neither is the 1.0 that as_percent writes on the way out --
    # both are present even with the bug, which is why this asserts on neither.
    inside = reported.map(&:first).select { |p| p > 0.75 && p < 1.0 }
    expect(inside.uniq.size).to be >= 2,
      "relinking never moved the bar off the handoff: #{reported.inspect}"

    # Reported in the client's terms, so a raw fraction escaping the bracket unmapped would
    # show up here as a value below the handoff.
    relinking = reported.select { |(_, key)| key == :relinking_boards }.map(&:first)
    expect(relinking.min).to be >= 0.75,
      "a relink sample landed below the phase floor -- unmapped raw fraction? #{relinking.inspect}"
    expect(relinking).to eq(relinking.sort)
    expect(reported.map(&:first)).to eq(reported.map(&:first).sort),
      "the series went backwards across the phase boundary: #{reported.inspect}"
  end

  it "does not report 100% before the image swap has run" do
    # copy_board_links calls starting_new_board.swap_images AFTER copy_board_links_for
    # returns (user.rb:4248-4255), and Board#swap_images reports no progress. When phase 2's
    # bracket ended at 1.0, the meter hit 100% the instant relinking finished and then sat
    # there for the whole symbol-library swap -- typically the longest part of the copy.
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

    reported = capture_progress

    new_root = root.copy_for(recipient)
    Board.copy_board_links_for(
      recipient,
      starting_old_board: root,
      starting_new_board: new_root,
      valid_ids: [root.global_id, child.key]
    )

    # as_percent writes its ceiling unconditionally on block exit (progress.rb:168), so the
    # highest value this copy can report IS the band ceiling. Asserting it stays below 1.0 is
    # what keeps the headroom; widen the band back to 1.0 and this goes red.
    expect(reported.map(&:first).max).to be < 1.0,
      "the copy reported 100% while swap_images had not run: #{reported.inspect}"
    expect(reported.map(&:first).max).to be_within(0.0001).of(0.95)
  end

  it "reports no percent from the board-replacement path" do
    # relink_boards has two callers. Only copy_and_relink brackets it in as_percent, so an
    # unbracketed report here would be written as an ABSOLUTE percent and would reach 1.0
    # while replace_and_relink still had the sidebar rewrite, the home-board preference
    # update and track_downstream_boards! to run (board_set_copier.rb:150-182). Flip
    # `report_progress` to default true and this goes red.
    u = User.create
    old = Board.create(user: u, public: true, settings: { 'name' => 'old' })
    ref = Board.create(user: u, public: true, settings: { 'name' => 'ref' })
    old.settings['buttons'] = [{ 'id' => 1, 'load_board' => { 'id' => ref.global_id } }]
    old.instance_variable_set('@buttons_changed', true)
    old.save!
    new_board = old.reload.copy_for(u)
    u.settings['preferences']['home_board'] = { 'id' => ref.global_id, 'key' => ref.key }
    u.save

    reported = capture_progress

    Board.replace_board_for(u.reload, {
      starting_old_board: old.reload,
      starting_new_board: new_board.reload
    })

    expect(reported).to eq([]), "the replace path reported progress it cannot bracket: #{reported.inspect}"
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

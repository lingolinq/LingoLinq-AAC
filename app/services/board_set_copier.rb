# frozen_string_literal: true

# Replaces the recursive copy_board_links_batch + relink_board_batch_for pattern
# in Relinking with a linear two-phase approach:
#   Phase 1: Copy all downstream boards using BoardCloner
#   Phase 2: Relink all new copies to point to each other via the mapper
class BoardSetCopier
  attr_reader :mapper

  def initialize(user:, starting_old_board:, starting_new_board:, opts: {})
    @user = user
    @starting_old = starting_old_board
    @starting_new = starting_new_board
    @opts = opts
    @auth_user = opts[:authorized_user]
    @copier = opts[:copier]
    @mapper = {} # old_global_id => { id: new_global_id, key: new_key }
    @boards_link_to = {} # board_id => [ids of boards that link TO it]
  end

  # Full copy-and-relink flow (replaces copy_board_links_for + copy_board_links_batch)
  def copy_and_relink
    overall_started = Time.now
    # Capture prior so nested calls (or any other caller that already set this flag)
    # don't get their state stomped when our ensure block runs.
    prior_bulk_copy = Thread.current[:bulk_copy_in_progress]
    Thread.current[:bulk_copy_in_progress] = true
    begin
      # Ensure starting_new_board has a copy_id
      if !@starting_new.settings['copy_id']
        @starting_new.settings['copy_id'] = @starting_new.global_id
        @starting_new.save_subtly
      end

      # Seed the mapper with the already-existing starting board copy
      @mapper[@starting_old.global_id] = { id: @starting_new.global_id, key: @starting_new.key }

      # Phase 1: Collect downstream board IDs and copy them. Prefer live folder
      # links so copy-all and fallback one-level selections don't depend on the
      # cached downstream_board_ids, which can lag behind live button links.
      board_ids = selected_board_ids
      total = board_ids.size
      Rails.logger.info("[copy_perf] BoardSetCopier#copy_and_relink starting for #{@starting_old.global_id} -> #{@starting_new.global_id} (#{total} downstream boards)")

      @user.instance_variable_set('@already_updating_available_boards', true)

      phase1_started = Time.now
      # Counts boards this loop has PROCESSED, for the progress percentage below. Deliberately
      # not derived from @mapper.size: the mapper is a link-rewriting index, not a progress
      # counter, and it gains a second key for every shallow board (:88-90 below).
      cloned = 0
      Board.find_batches_by_global_id(board_ids, batch_size: 15) do |orig|
        next if @mapper.key?(orig.global_id)

        # Progress outside any transaction to avoid holding locks during IO
        Progress.update_minutes_estimate((total * 3) + (total - @mapper.size), "copying #{orig.key}, #{total - @mapper.size} left")
        # ...and a PERCENT, which this job never reported before, so every copy showed an
        # indeterminate bar for its whole duration. Phase 1 (cloning boards) owns 0.02-0.75 and
        # phase 2 (relinking) the rest; the split is by measured cost -- the [copy_perf] logs
        # below time both, and cloning dominates.
        # Reports work completed BEFORE this board, so the first sample is the 0.02 floor and
        # the last is 0.02 + 0.73*(n-1)/n; the move to 0.75 itself belongs to phase 2.
        # `cloned` is incremented just below rather than here, and counts every board the loop
        # reaches past the dedupe guard -- including one skipped for permissions, which still
        # represents work the user is waiting through.
        # `total` counts requested downstream ids while `cloned` counts iterations, and the
        # batcher can yield a different number of records than ids requested, so the ratio is
        # clamped.
        if total > 0
          done = [cloned, total].min
          Progress.update_current_progress(0.02 + (0.73 * (done.to_f / total.to_f)), :copying_boards)
        end
        cloned += 1

        if !orig.allows?(@user, +'view') && !orig.allows?(@auth_user, +'view')
          # Permission denied, skip (mirrors relinking.rb:432-433)
          next
        end

        copy = orig.copy_for(@user,
          make_public: @opts[:make_public],
          copy_id: @starting_new.global_id,
          prefix: @opts[:copy_prefix],
          new_owner: @opts[:new_owner],
          disconnect: @opts[:disconnect],
          copier: @copier,
          unshallow: true,
          skip_user_update: true
        )
        copy.update_default_locale!(@opts[:old_default_locale], @opts[:new_default_locale])

        @mapper[orig.global_id] = { id: copy.global_id, key: copy.key }
        if orig.shallow_source
          @mapper[orig.shallow_source[:id]] = { id: copy.global_id, key: copy.key }
        end

        # Build reverse link index (which boards link TO each board)
        index_board_links(orig)
      end
      Rails.logger.info("[copy_perf] Phase 1 (clone #{total} boards) took #{(Time.now - phase1_started).round(2)}s")

      # Also index links from starting boards
      index_board_links(@starting_old)
      index_board_links(@starting_new)

      @user.instance_variable_set('@already_updating_available_boards', false)

      # Phase 2: Relink all copies to point to each other
      phase2_started = Time.now
      all_board_ids = [@starting_old.global_id] + board_ids
      # Phase 2 reports per relinked item, mapped into 0.75-0.95 by the bracket. The explicit
      # 0.75 below is the floor: as_percent itself writes settings['percent'] only on block
      # EXIT (progress.rb:168), so without a floor the bar would not leave phase 1's last
      # value until relinking had already finished.
      # The band stops at 0.95, not 1.0, because copy_board_links runs swap_images after this
      # returns (user.rb:4248-4255) and that reports nothing; leaving headroom keeps the bar
      # off 100% while a symbol-library swap is still running.
      Progress.update_current_progress(0.75, :relinking_boards)
      Progress.as_percent(0.75, 0.95) do
        relink_boards(all_board_ids, 'update_inline', report_progress: true)
      end
      Rails.logger.info("[copy_perf] Phase 2 (relink) took #{(Time.now - phase2_started).round(2)}s")

      @user.update_available_boards

      Rails.logger.info("[copy_perf] BoardSetCopier#copy_and_relink total #{(Time.now - overall_started).round(2)}s for #{@starting_old.global_id}")
      @mapper
    ensure
      Thread.current[:bulk_copy_in_progress] = prior_bulk_copy
    end
  end

  # Relink-only flow (replaces replace_board_for)
  # Used when swapping a board in a user's existing set
  def replace_and_relink
    prior_bulk_copy = Thread.current[:bulk_copy_in_progress]
    Thread.current[:bulk_copy_in_progress] = true
    begin
      @mapper[@starting_old.global_id] = { id: @starting_new.global_id, key: @starting_new.key }

      # Collect all board IDs from user's home + sidebar
      board_ids = collect_user_board_ids
      sidebar_ids = @sidebar_ids || {}

      update_preference = @opts[:update_inline] ? 'update_inline' : nil

      @user.instance_variable_set('@already_updating_available_boards', true)

      # Relink phase, may create copies for boards that aren't private to the user
      user_home_changed = relink_boards(board_ids, update_preference)

      @user.instance_variable_set('@already_updating_available_boards', false)

      # Update sidebar if any sidebar boards were replaced
      sidebar_changed = false
      sidebar = @user.sidebar_boards
      sidebar_ids.each do |key, id|
        if @mapper[id]
          idx = sidebar.index { |s| s['key'] == key }
          sidebar[idx]['key'] = @mapper[id][:key] if idx
          sidebar_changed = true
        end
      end

      # Update user preferences if home board or sidebar changed
      if user_home_changed || sidebar_changed
        if user_home_changed
          @user.update_setting({
            'preferences' => { 'home_board' => {
              'id' => user_home_changed[:id],
              'key' => user_home_changed[:key]
            }}
          })
        end
        if sidebar_changed
          @user.settings['preferences']['sidebar_boards'] = sidebar
          @user.save
        end
      elsif @user.settings.dig('preferences', 'home_board')
        home = Board.find_by_path(@user.settings['preferences']['home_board']['id'])
        home.track_downstream_boards! if home
      end

      @user.update_available_boards
      true
    ensure
      Thread.current[:bulk_copy_in_progress] = prior_bulk_copy
    end
  end

  private

  def collect_user_board_ids
    board_ids = []
    @sidebar_ids = {}

    if @user.settings.dig('preferences', 'home_board')
      board_ids << @user.settings['preferences']['home_board']['id']
      board = Board.find_by_path(@user.settings['preferences']['home_board']['id'])
      if board
        board.track_downstream_boards!
        downstream_ids = board.downstream_board_ids
        downstream_ids = downstream_ids & @opts[:valid_ids] if @opts[:valid_ids]
        board_ids += downstream_ids
      end
    end

    sidebar = @user.sidebar_boards
    sidebar.each do |brd|
      next unless brd['key']
      board = Board.find_by_path(brd['key'])
      next unless board
      @sidebar_ids[brd['key']] = sidebar_relink_source_id(board)
      board_ids << board.global_id
      board.track_downstream_boards!
      downstream_ids = board.downstream_board_ids
      downstream_ids = downstream_ids & @opts[:valid_ids] if @opts[:valid_ids]
      board_ids += downstream_ids
    end

    board_ids
  end

  def selected_board_ids
    if @opts[:valid_ids]
      boards = Board.find_all_by_path(@opts[:valid_ids])
      ids = @opts[:expand_selected_board_ids] ? expand_linked_board_ids(boards) : boards.map(&:global_id)
    else
      ids = expand_linked_board_ids([@starting_old])
    end

    ids.uniq - [@starting_old.global_id]
  end

  def expand_linked_board_ids(boards)
    ids = []
    seen = {}
    queue = boards.compact

    until queue.empty?
      board = queue.shift
      next if seen[board.global_id]

      seen[board.global_id] = true
      ids << board.global_id

      (board.buttons || []).each do |button|
        next unless button['load_board']
        next if button['link_disabled']

        linked = board_from_load_board(button['load_board'])
        queue << linked if linked && !seen[linked.global_id]
      end
    end

    ids
  end

  def board_from_load_board(load_board)
    [load_board['id'], load_board['key'], load_board['path'], load_board['data_url'], load_board['url']].compact.each do |ref|
      board = Board.find_by_path(ref)
      return board if board
    end
    nil
  end

  def index_board_links(board)
    (board.buttons || []).each do |button|
      if button['load_board'] && button['load_board']['id']
        target_id = button['load_board']['id']
        @boards_link_to[target_id] ||= []
        @boards_link_to[target_id] << board.global_id
        @boards_link_to[target_id].uniq!
      end
    end
  end

  # Processes pending replacements in batches, rewriting board links.
  # Returns the home board replacement ref if the home board was replaced, nil otherwise.
  # `report_progress` is opt-in and OFF by default because this method has two callers.
  # copy_and_relink brackets it in Progress.as_percent(0.75, 0.95) and wants the bar to
  # move; replace_and_relink does not bracket it and does substantial work afterwards
  # (sidebar rewrite, home-board preference, track_downstream_boards!, :150-182), so an
  # unbracketed 0-1 report there would drive the bar to 100% with work still to run.
  def relink_boards(board_ids, update_preference, report_progress: false)
    pending = @mapper.to_a.dup
    boards_to_save = []
    boards_to_save_hash = {}
    board_ids_to_re_save = []

    # Build reverse link index if not already populated
    if @boards_link_to.empty?
      Board.find_batches_by_global_id(board_ids, batch_size: 50) do |orig|
        index_board_links(orig)
      end
    end

    # Counted before the loop consumes `pending`, and per ITEM rather than per batch so the
    # bar still moves on a set small enough to fit in one batch.
    relink_total = pending.length
    relinked = 0
    while pending.length > 0
      batch = pending.shift(Relinking::RELINKING_BATCH_SIZE)

      batch.each do |old_board_id, new_board_ref|
        Progress.update_minutes_estimate(pending.length * 3, "replacing links to #{old_board_id}, #{pending.length} left")
        if report_progress && relink_total > 0
          Progress.update_current_progress(relinked.to_f / relink_total.to_f, :relinking_boards)
        end
        relinked += 1

        linking_board_ids = @boards_link_to[old_board_id]
        next unless linking_board_ids

        Board.find_batches_by_global_id(linking_board_ids, batch_size: 50) do |orig|
          # Use already-modified version if we have one in memory
          board = boards_to_save_hash[orig.global_id] || orig

          # If this board was already replaced, use the replacement
          if @mapper[orig.global_id]
            board = boards_to_save_hash[@mapper[orig.global_id][:id]]
            board ||= Board.find_by_global_id(@mapper[orig.global_id][:id])
            board ||= orig
          end

          next unless board.links_to?(old_board_id)

          if !board.allows?(@user, +'view') && !board.allows?(@auth_user, +'view')
            next
          elsif update_preference == 'update_inline' && !board.instance_variable_get('@sub_id') && board.allows?(@user, +'edit')
            # Update in place
            board.replace_links!(old_board_id, new_board_ref)
            save_or_defer(board, board_ids, boards_to_save, boards_to_save_hash, board_ids_to_re_save)
          elsif board.instance_variable_get('@sub_id') || !board.just_for_user?(@user)
            # Create a private copy
            copy = board.copy_for(@user,
              make_public: @opts[:make_public],
              copy_id: @starting_new.global_id,
              prefix: @opts[:copy_prefix],
              new_owner: @opts[:new_owner],
              disconnect: @opts[:disconnect],
              copier: @copier,
              unshallow: true,
              skip_user_update: true
            )
            copy.replace_links!(old_board_id, new_board_ref)
            save_or_defer(copy, board_ids, boards_to_save, boards_to_save_hash, board_ids_to_re_save)
            @mapper[board.global_id] = { id: copy.global_id, key: copy.key }
            pending << [board.global_id, { id: copy.global_id, key: copy.key }]
          else
            # User's private board -- update in place
            board.replace_links!(old_board_id, new_board_ref)
            save_or_defer(board, board_ids, boards_to_save, boards_to_save_hash, board_ids_to_re_save)
          end
        end
      end
    end

    # Save all deferred boards
    boards_to_save.uniq.each do |brd|
      brd.update_default_locale!(@opts[:old_default_locale], @opts[:new_default_locale])
      brd.save
    end
    Board.find_batches_by_global_id(board_ids_to_re_save.uniq, batch_size: 50) do |brd|
      brd.update_default_locale!(@opts[:old_default_locale], @opts[:new_default_locale])
      brd.save
    end

    @user.update_available_boards

    # Return home board replacement if applicable
    home_id = @user.settings.dig('preferences', 'home_board', 'id')
    @mapper[home_id] if home_id
  end

  def save_or_defer(board, board_ids, boards_to_save, boards_to_save_hash, board_ids_to_re_save)
    if board_ids.length > Relinking::BOARD_CUTOFF_SIZE
      board.save_subtly
      board_ids_to_re_save << board.global_id
    else
      boards_to_save << board
      boards_to_save_hash[board.global_id] = board
    end
  end

  # Sidebar display keys may resolve to a user copy while replace_board_for maps
  # parent (catalog) board global_ids — track the lineage source for sidebar updates.
  def sidebar_relink_source_id(board)
    if board.parent_board_id
      parent = Board.find_by(id: board.parent_board_id)
      return parent.global_id if parent
    end
    board.global_id
  end
end

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
    # Ensure starting_new_board has a copy_id
    if !@starting_new.settings['copy_id']
      @starting_new.settings['copy_id'] = @starting_new.global_id
      @starting_new.save_subtly
    end

    # Seed the mapper with the already-existing starting board copy
    @mapper[@starting_old.global_id] = { id: @starting_new.global_id, key: @starting_new.key }

    # Phase 1: Collect downstream board IDs and copy them
    board_ids = @starting_old.downstream_board_ids || []
    board_ids = board_ids & @opts[:valid_ids] if @opts[:valid_ids]
    total = board_ids.size

    @user.instance_variable_set('@already_updating_available_boards', true)

    Board.find_batches_by_global_id(board_ids, batch_size: 15) do |orig|
      next if @mapper.key?(orig.global_id)

      # Progress outside any transaction to avoid holding locks during IO
      Progress.update_minutes_estimate((total * 3) + (total - @mapper.size), "copying #{orig.key}, #{total - @mapper.size} left")

      if !orig.allows?(@user, +'view') && !orig.allows?(@auth_user, +'view')
        # Permission denied -- skip (mirrors relinking.rb:432-433)
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

    # Also index links from starting boards
    index_board_links(@starting_old)
    index_board_links(@starting_new)

    @user.instance_variable_set('@already_updating_available_boards', false)

    # Phase 2: Relink all copies to point to each other
    all_board_ids = [@starting_old.global_id] + board_ids
    relink_boards(all_board_ids, 'update_inline')

    @user.update_available_boards

    @mapper
  end

  # Relink-only flow (replaces replace_board_for)
  # Used when swapping a board in a user's existing set
  def replace_and_relink
    @mapper[@starting_old.global_id] = { id: @starting_new.global_id, key: @starting_new.key }

    # Collect all board IDs from user's home + sidebar
    board_ids = collect_user_board_ids
    sidebar_ids = @sidebar_ids || {}

    update_preference = @opts[:update_inline] ? 'update_inline' : nil

    @user.instance_variable_set('@already_updating_available_boards', true)

    # Relink phase -- may create copies for boards that aren't private to the user
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
      @sidebar_ids[brd['key']] = board.global_id
      board_ids << board.global_id
      board.track_downstream_boards!
      downstream_ids = board.downstream_board_ids
      downstream_ids = downstream_ids & @opts[:valid_ids] if @opts[:valid_ids]
      board_ids += downstream_ids
    end

    board_ids
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
  def relink_boards(board_ids, update_preference)
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

    while pending.length > 0
      batch = pending.shift(Relinking::RELINKING_BATCH_SIZE)

      batch.each do |old_board_id, new_board_ref|
        Progress.update_minutes_estimate(pending.length * 3, "replacing links to #{old_board_id}, #{pending.length} left")

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
end

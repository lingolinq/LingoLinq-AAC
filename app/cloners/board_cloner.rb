# frozen_string_literal: true

require_relative '../../lib/art50_marker'

class BoardCloner < Clowne::Cloner
  adapter :active_record

  # Board links live in the buttons JSON, not in AR associations.
  # The orchestrator (BoardSetCopier) handles graph traversal and relinking.
  # This cloner handles a SINGLE board copy.

  init_as do |source, user:, **_params|
    Board.new(user_id: user.id, parent_board_id: source.id, settings: {})
  end

  finalize do |source, record, **params|
    user      = params.fetch(:user)
    copier    = params[:copier]
    opts      = params[:opts] || {}

    # Ensure content offload exists (relinking.rb:44-48)
    if !source.board_content_id || source.board_content_id == 0
      orig = Board.find_by(id: source.id)
      BoardContent.generate_from(orig)
      source.reload
    end

    # Vocabulary protection check (relinking.rb:49-56)
    if source.settings.dig('protected', 'vocabulary')
      unless source.copyable_if_authorized?(source.user(true))
        Progress.set_error("the board #{source.key} is not authorized for copying")
        raise "not authorized to copy #{source.global_id} by #{source.user.global_id}"
      end
    end

    # Shallow clone bookkeeping (relinking.rb:58-71)
    orig_key = source.key
    unshallowed = source
    sub_id = source.instance_variable_get(:@sub_id)
    if sub_id
      unshallowed = Board.find_by_path(source.global_id(true))
      orig_key = orig_key.split(/my:/)[1].sub(/:/, '/')
      unless opts[:unshallow]
        record.settings['shallow_source'] = {
          'key' => source.key,
          'id' => source.global_id
        }
        record.instance_variable_set('@shallow_source_changed', true)
      end
    end

    # Key generation (relinking.rb:72)
    record.key = record.generate_board_key(orig_key.split(/\//)[1])

    # Disconnect handling (relinking.rb:73-78)
    disconnected = false
    if opts[:disconnect] && copier && source.allows?(copier, +'edit')
      record.settings['copy_parent_board_id'] = source.global_id
      record.parent_board_id = nil
      disconnected = true
    end

    # Direct settings (relinking.rb:79-80)
    record.settings['copy_id'] = opts[:copy_id]
    record.settings['source_board_id'] = source.source_board.global_id

    # Name with prefix handling (relinking.rb:81-90)
    record.settings['name'] = source.settings['name']
    prefix = opts[:prefix]
    if !prefix.blank? && record.settings['name']
      if source.settings['prefix'] && record.settings['name'].index(source.settings['prefix']) == 0
        record.settings['name'] = record.settings['name'].sub(/#{source.settings['prefix']}\s+/, '')
      end
      if record.settings['name'].index(prefix) != 0
        record.settings['name'] = "#{prefix} #{record.settings['name']}"
      end
      record.settings['prefix'] = prefix
    end

    # Description (relinking.rb:91)
    record.settings['description'] = source.settings['description']

    # Protected/vocabulary settings (relinking.rb:92-104)
    record.settings['protected'] = {}.merge(source.settings['protected']) if source.settings['protected']
    if record.settings['protected'] && record.settings['protected']['vocabulary']
      if opts[:new_owner] && source.allows?(copier, +'edit') && !source.settings['protected']['sub_owner']
        record.settings['protected']['vocabulary_owner_id'] = user.global_id
        record.settings['protected']['sub_owner'] = source.settings['protected']['sub_owner'] || source.user.global_id != user.global_id
        record.settings['protected']['sub_owner'] = false if disconnected
      else
        record.settings['protected']['vocabulary_owner_id'] = source.settings['protected']['vocabulary_owner_id'] || source.user.global_id
        record.settings['protected']['sub_owner'] = source.settings['protected']['sub_owner'] || source.user.global_id != user.global_id
      end
    end

    # Content attributes via BoardContent offload chain (relinking.rb:105-112)
    record.settings['image_url'] = source.settings['image_url']
    record.settings['locale'] = source.settings['locale']
    record.settings['locales'] = source.settings['locales']
    record.settings['translations'] = BoardContent.load_content(source, 'translations')
    record.settings['background'] = BoardContent.load_content(source, 'background')
    record.settings['buttons'] = BoardContent.load_content(source, 'buttons')
    record.settings['grid'] = BoardContent.load_content(source, 'grid')
    record.settings['intro'] = BoardContent.load_content(source, 'intro')
    record.settings['downstream_board_ids'] = source.settings['downstream_board_ids']

    # Library settings (relinking.rb:114-116)
    source.current_library if !source.settings['common_library'] && !source.settings['swapped_library']
    record.settings['common_library'] = source.settings['common_library'] if source.settings['common_library']
    record.settings['swapped_library'] = source.settings['swapped_library'] if source.settings['swapped_library']
    record.settings['swap_incomplete'] = source.settings['swap_incomplete'] if source.settings['swap_incomplete']

    # Remaining settings (relinking.rb:117-121)
    record.settings['word_suggestions'] = source.settings['word_suggestions']
    record.settings['categories'] = source.settings['categories']
    # The curated category arrangement travels WITH the board. This is the whole point of
    # keeping it on the board rather than in a user preference: a copy inherits the layout
    # its author designed, and the person who copied it can then edit it as their own.
    # The cloner is an allowlist by construction -- it starts from `settings: {}` -- so an
    # unlisted key is silently dropped on copy, which is exactly the failure this line
    # exists to prevent. Button ids are carried unchanged alongside `buttons` and `grid`,
    # so the per-button overrides keyed by id stay pointing at the same buttons.
    record.settings['category_layout'] = source.settings['category_layout']
    record.settings['license'] = source.settings['license']
    # EU AI Act Article 50(2): carry the AI-generation provenance marker onto copies.
    # The marker is provenance-bound (it attests the content originated from AI
    # generation, not the exact bytes) and server-signed, so it stays valid on a copy.
    # The cloner only copies allowlisted settings keys, so an unlisted key is silently
    # dropped on copy; without this line copied/shared boards would lose their marking.
    # Re-normalize on copy: this drops any unsigned keys and, crucially, refuses to
    # propagate a marker that no longer verifies (e.g. a stale marker after key rotation),
    # so only genuine, canonical markers ride onto the copy.
    if source.settings['ai_generated']
      marker = Art50Marker.normalized(source.settings['ai_generated'])
      record.settings['ai_generated'] = marker if marker
    end
    record.settings['intro']['unapproved'] = true if record.settings['intro'].is_a?(Hash)
    record.settings['never_edited'] = true

    # Visibility (relinking.rb:122-123)
    record.public = true if opts[:make_public]
    record.settings.delete('unlisted') if opts[:make_public]

    # Skip heavy callbacks during batch operations (relinking.rb:124,130)
    record.instance_variable_set('@skip_board_post_checks', true) if opts[:skip_user_update]
    record.instance_variable_set('@map_later', true)

    # Content offload reuse (relinking.rb:125)
    BoardContent.apply_clone(unshallowed, record) if source.board_content_id && source.board_content_id != 0
  end
end

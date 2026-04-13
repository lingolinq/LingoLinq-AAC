# frozen_string_literal: true

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
      if !record.settings['name'].index(prefix) != 0
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

    # Remaining settings (relinking.rb:117-121)
    record.settings['word_suggestions'] = source.settings['word_suggestions']
    record.settings['categories'] = source.settings['categories']
    record.settings['license'] = source.settings['license']
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

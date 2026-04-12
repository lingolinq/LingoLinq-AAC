class BoardContent < ApplicationRecord
  include Async
  include SecureSerialize
  secure_serialize :settings

  before_save :generate_defaults
  # When making a copy of a board, if there is no content offload
  # or there are measurable changes from the current content offload,
  # create a new content offload and link both old and new to it.
  # NOTE: If board_content records ever change, then versioning
  # will break for any boards tied to board_content

  def generate_defaults
    # TODO: freeze changed, these should never be updated
    self.settings ||= {}
    self.settings['board_ids'] ||= []
    self.board_count = self.settings['board_ids'].length
    true
  end

  # Content should store buttons, grid, translations, 
  # intro, background, 
  OFFLOADABLE_ATTRIBUTES=['buttons', 'grid', 'translations', 'intro', 'background']

  def self.generate_from(board)
    # Generate a new content offload from an existing board
    content = BoardContent.new
    attrs = OFFLOADABLE_ATTRIBUTES
    content.settings = {'board_ids' => [board.global_id]}
    # TODO: sharding
    content.source_board_id = board.id
    attrs.each do |attr|
      val = BoardContent.load_content(board, attr)
      content.settings[attr] = val if val
    end
    content.save
    if board.board_content
      # TODO: schedule check to mark content as stale if
      # no one is using it anymore
    end
    board.board_content = content
    attrs.each do |attr|
      board.settings.delete(attr)
    end
    board.settings['content_overrides'] = {}
    board.save
    content
  end

  def self.load_content(board, attr)
    # Load the current state, using the board settings first and
    # the offloaded content second
    raise "unexpected attribute for loading, #{attr}" unless OFFLOADABLE_ATTRIBUTES.include?(attr)

    from_offload = false
    board.settings ||= {}
    res = board.settings[attr] if !board.settings[attr].blank?
    if board.board_content_id && board.board_content_id > 0 && !res
      # Cache only the immutable offloaded base content by board_content_id/attr
      # to avoid re-parsing the same S3-backed content multiple times within a
      # single request or background job. Overrides are always applied fresh.
      # Cleared by ApplicationController and Worker after each request/job.
      Thread.current[:board_content_cache] ||= {}
      offload_key = "#{board.board_content_id}/#{attr}"
      unless Thread.current[:board_content_cache].has_key?(offload_key)
        Thread.current[:board_content_cache][offload_key] = board.board_content.settings[attr]
      end
      raw = Thread.current[:board_content_cache][offload_key]
      res = raw ? raw.deep_dup : nil
      from_offload = true
    end
    res ||= board.settings[attr]
    if (board.settings['content_overrides'] || {}).has_key?(attr) && from_offload
      over = board.settings['content_overrides'][attr]
      if over == nil && board.settings['content_overrides'].has_key?(attr)
        # If override defined but nil, that means it was cleared
        res = nil unless ['buttons', 'grid'].include?(attr)
      else
        if attr == 'buttons'
          over.each do |id, hash|
            btn = res.detect{|b| b['id'].to_s == id.to_s }
            if btn
              hash.each do |key, val|
                btn[key] = val
                btn.delete(key) if val == nil
              end
              else
              res << hash 
            end
          end
        elsif ['grid', 'intro', 'background', 'translations'].include?(attr)
          over.each do |key, val|
            res[key] = val
            res.delete(key) if val == nil
          end
        end
      end
    end
    res
  end

  def self.attach_as_clone(board)
    # Manually takes an existing board and makes it a clone 
    # of its existing parent board (will also make a clone 
    # of the parent board only if it hasn't already been cloned)
    if board.parent_board
      BoardContent.apply_clone(board.parent_board, board, true)
      board.save!
    end
  end

  def self.link_clones(count=100)
    ids = Board.where(['parent_board_id IS NOT NULL AND board_content_id IS NULL']).limit(count).select('id').map(&:id)
    Board.where(id: ids).find_in_batches(batch_size: 15) do |batch|
      ids = []
      batch.each do |board|
        if board && board.parent_board && !board.board_content_id
          len1 = board.settings.to_json.length
          BoardContent.apply_clone(board.parent_board, board, true)
          len2 = board.settings.to_json.length
          if len2 > len1
            # If it takes up more space in the db, then don't bother saving
            board.board_content_id = nil
          else
            # puts "#{len2} from #{len1} #{board.parent_board.key} #{board.key}"
            board.save
          end
        end
        if !board.board_content_id
          ids << board.id
        end
      end
      Board.where(id: ids).where(['board_content_id IS NULL']).update_all(board_content_id: 0)
    end
  end

  def self.apply_clone(original, copy, prevent_new_copy_unless_necessary=false)
    # copy=nil when you want to manually offload content as-is
    # prevent_new_copy_unless_necessary=true when you want to use existing offloaded content 
    #    (think manually linking legacy copies)
    content = original.board_content
    if !content || (!prevent_new_copy_unless_necessary && BoardContent.has_changes?(original, content))
      # generate a new content offload
      content = BoardContent.generate_from(original)
    end
    if copy
      # use the newly-generated content
      copy.board_content = content
      BoardContent.track_differences(copy, content, true)
    end
  end

  def self.has_changes?(board, content)
    return true if !content || board.board_content_id != content.id
    any_not_blank = false
    (board.settings['content_overrides'] || {}).each do |key, hash|
      any_not_blank = true if !hash.empty?
    end
    return any_not_blank
  end

  def self.track_differences(board, content, skip_save=false)
    if !content
      if board && board.settings && board.settings['content_overrides']
        board.settings.delete('content_overrides')
      end
      return true 
    end
    return false if content.id != board.board_content_id
    changed = false
    board.settings ||= {}
    if !board.settings['buttons'].blank? && content.settings['buttons']
      if !(board.settings['content_overrides'] || {})['buttons'].blank?
        new_hash = {}
        board.settings['content_overrides']['buttons'].each do |id, btn|
          if (board.settings['buttons'] || []).detect{|b| b['id'].to_s == id.to_s }
            new_hash[id] = btn
          elsif (content.settings['buttons'] || []).detect{|b| b['id'].to_s == id.to_s }
            new_hash[id] = btn
          end
        end
        board.settings['content_overrides']['buttons'] = new_hash
      end
      board.settings['buttons'].each do |btn|
        original_btn = content.settings['buttons'].detect{|b| b['id'].to_s == btn['id'].to_s }
        if original_btn
          prior_override = (((board.settings['content_overrides'] || {})['buttons'] || {})[btn['id'].to_s] || {})
          prior_override.each do |key, val|
            if btn[key] == nil && original_btn[key] == nil
              board.settings['content_overrides']['buttons'][btn['id'].to_s].delete(key)
            end
          end
          btn.each do |key, new_override_val|
            prior_override_val = prior_override[key]
            if new_override_val != prior_override_val
              board.settings['content_overrides'] ||= {}
              board.settings['content_overrides']['buttons'] ||= {}
              if original_btn[key] == new_override_val
                board.settings['content_overrides']['buttons'][btn['id'].to_s].delete(key) if board.settings['content_overrides']['buttons'][btn['id'].to_s]
              else
                board.settings['content_overrides']['buttons'][btn['id'].to_s] ||= {}
                board.settings['content_overrides']['buttons'][btn['id'].to_s][key] = new_override_val
              end
              changed = true
            elsif ((board.settings['content_overrides'] || {})['buttons'] || {})[btn['id'].to_s] != nil
              if original_btn[key] == new_override_val
                board.settings['content_overrides']['buttons'][btn['id'].to_s].delete(key)
              end
            end
          end
          original_btn.each do |key, val|
            if val != nil && btn[key] == nil
              board.settings['content_overrides'] ||= {}
              board.settings['content_overrides']['buttons'] ||= {}
              board.settings['content_overrides']['buttons'][btn['id'].to_s] ||= {}
              board.settings['content_overrides']['buttons'][btn['id'].to_s][key] = nil
              changed = true
            end
          end
        else
          board.settings['content_overrides'] ||= {}
          board.settings['content_overrides']['buttons'] ||= {}
          board.settings['content_overrides']['buttons'][btn['id'].to_s] = btn
          changed = true
        end
      end
      (board.settings['content_overrides']['buttons'] || {}).each do |id, btn|
        board.settings['content_overrides']['buttons'].delete(id) if btn.keys.length == 0
      end
      board.settings['content_overrides'].delete('buttons') if board.settings['content_overrides']['buttons'].keys.length == 0
      board.settings.delete('buttons')
    end
    ['grid', 'intro', 'background', 'translations'].each do |attr|
      if board.settings[attr] == 'delete'
        if content.settings[attr] && attr != 'grid'
          board.settings['content_overrides'] ||= {}
          board.settings['content_overrides'][attr] = nil
          changed = true
        end
        board.settings.delete(attr)
      elsif !board.settings[attr].blank? && content.settings[attr]
        board.settings[attr].each do |key, val|
          if content.settings[attr][key] != val
            board.settings['content_overrides'] ||= {}
            board.settings['content_overrides'][attr] ||= {}
            board.settings['content_overrides'][attr][key] = val
            changed = true
          elsif (board.settings['content_overrides'] || {})[attr] != nil
            board.settings['content_overrides'][attr].delete(key)
          end
        end
        content.settings[attr].each do |key, val|
          if val != nil && board.settings[attr][key] == nil
            board.settings['content_overrides'] ||= {}
            board.settings['content_overrides'][attr] ||= {}
            board.settings['content_overrides'][attr][key] = nil
            changed = true
          end
        end
        if board.settings['content_overrides'] && board.settings['content_overrides'][attr].blank?
          board.settings['content_overrides'].delete(attr)
        end
        board.settings.delete(attr)
      end
    end
    board.save if changed && !skip_save
    true
  end
end

module Relinking
  extend ActiveSupport::Concern
  COPYING_BATCH_SIZE = 200
  RELINKING_BATCH_SIZE = 200
  BOARD_CUTOFF_SIZE = 200
  
  def links_to?(board, skip_disabled_links=false)
    board_id = board.is_a?(String) ? board : board.global_id
    (self.buttons || []).each do |button|
      if button['load_board'] && button['load_board']['id'] == board_id
        if skip_disabled_links
          return !button['hidden'] && !button['link_disabled']
        else
          return true
        end
      end
    end
    false
  end
  
  def for_user?(user)
    user && self.user_id == user.id
  end
  
  def just_for_user?(user)
    return !self.public && self.for_user?(user) && !self.shared_by?(user)
  end
  
  def copy_for(user, opts=nil)
    opts ||= {}
    raise "missing user" unless user

    result = BoardCloner.call(self,
      user: user,
      copier: opts[:copier],
      opts: opts
    )
    board = result.is_a?(Board) ? result : result.to_record

    if !opts[:skip_save]
      board.save!
      if !user.instance_variable_get('@already_updating_available_boards')
        user.update_available_boards
      end
    end
    board
  end
  
  # If copy_id = nil, this is an original, root board
  # If copy_id == self.global_id, this is a root board
  # If copy_id != self.global_id, this is a sub-board of Board.find_by_global_id(copy_id)
  def assert_copy_id
    return true if self.settings['copy_id']
    return false if !self.parent_board_id
    if (self.settings['immediately_upstream_board_ids'] || []).length > 0
      upstreams = Board.find_all_by_global_id(self.settings['immediately_upstream_board_ids'])
      # if all upstream boards are copies and belong to the current user, let's assume this goes with them
      if upstreams.all?{|u| u.parent_board_id } && upstreams.map(&:user_id).uniq == [self.user_id]
        parent = self.parent_board
        upstream_parents = upstreams.map(&:parent_board).select{|b| b.user_id == parent.user_id }
        # if any original upstream boards belong to the current board's original user, then this is
        # probably part of a copy group
        if upstream_parents.map(&:user_id).uniq == [parent.user_id]
          asserted_copy_id = upstreams.map{|u| u.settings['asserted_copy_id'] && u.settings['copy_id'] }.compact.first
          # if a known root board is found, go ahead and mark it as such
          if upstreams.length > 10 && self.key.match(/top-page/)
            self.settings['copy_id'] = self.global_id
            self.settings['asserted_copy_id'] = true
            self.save
            return true
          # if any of the upstream boards have an asserted copy id, go ahead and use that
          elsif asserted_copy_id
            self.settings['copy_id'] = asserted_copy_id
            self.settings['asserted_copy_id'] = true
            self.save
            return true
          # if the board and its upstreams were all created within 30 seconds of each other, call it a batch
          elsif self.created_at - (upstreams.map(&:created_at).min) < 30
            self.settings['copy_id'] = upstreams[0].global_id
            self.settings['asserted_copy_id'] = true
            self.save
            return true
          # if the upstream boards have unasserted copy ids, let's not link it up
          elsif upstreams.any?{|u| u.settings['copy_id'] }
          # if the parent has no upstream boards, consider it the root of the copy group
          elsif upstreams.length == 1 && (upstreams[0].settings['immediately_upstream_board_ids'] || []).length == 0
            self.settings['copy_id'] = upstreams[0].global_id
            self.settings['asserted_copy_id'] = true
            self.save
            return true
          end
        end
      end
    end
    return false
  end
  
  def replace_links!(old_board_id, new_board_ref)
    buttons = self.buttons
    raise "old_board must be an id" unless old_board_id.is_a?(String)
    raise "new_board must be a ref" unless new_board_ref.is_a?(Hash)
    raise "can't change links for a shallow clone" if @sub_id
    buttons.each_with_index do |button, idx|
      if button['load_board'] && button['load_board']['id'] == old_board_id
        button['load_board']['id'] = new_board_ref[:id]
        button['load_board']['key'] = new_board_ref[:key]
      end
    end
    self.settings['buttons'] = buttons
    self.settings['downstream_board_ids'] = (self.settings['downstream_board_ids'] || []).map{|id| id == old_board_id ? new_board_ref[:id] : id }
  end

  def slice_locales(locales_to_keep, ids_to_update=[], updater=nil)
    updater = User.find_by_path(updater) if updater.is_a?(String)
    return {sliced: false, reason: 'id not included'} unless ids_to_update.include?(self.global_id)
    all_locales = [self.settings['locale']]
    trans = BoardContent.load_content(self, 'translations') || {}
    trans.each do |key, hash|
      next unless hash.is_a?(Hash)
      all_locales += hash.keys
    end
    all_locales.uniq!
    board_locales_to_keep = locales_to_keep & all_locales
    return {sliced: false, reason: 'no locales would be kept'} if board_locales_to_keep.length == 0
    return {sliced: true, ids: [self.global_id], reason: 'already includes only specified locales'} if locales_to_keep.sort == all_locales.sort && ids_to_update == [self.global_id]
    update_board = self
    if @sub_id
      return {sliced: false, reason: 'unauthorized'} unless self.allows?(@sub_global, 'edit') 
      update_board = self.copy_for(@sub_global, skip_save: true, skip_user_update: true)
    end

    if !board_locales_to_keep.include?(update_board.settings['locale'])
      update_board.update_default_locale!(update_board.settings['locale'], board_locales_to_keep[0])
    end
    trans = {}.merge(update_board.settings['translations'] || trans)
    trans.each do |key, hash|
      if hash.is_a?(Hash)
        trans[key] = hash.slice(*board_locales_to_keep)
      end
    end
    update_board.settings['translations'] = trans
    update_board.instance_variable_set('@map_later', true)
    update_board.save!
    sliced_ids = [self.global_id]
    if ids_to_update.length > 1
      board_ids = ids_to_update & (self.downstream_board_ids || [])
      Board.find_batches_by_global_id(board_ids, batch_size: 50) do |board|
        next unless board.allows?(updater, 'edit')
        res = board.slice_locales(locales_to_keep, [board.global_id], updater)
        sliced_ids << board.global_id if res[:sliced]
      end
    end
    return {sliced: true, ids: sliced_ids}
  end

  def update_default_locale!(old_default_locale, new_default_locale)
    if new_default_locale && self.settings['locale'] == old_default_locale && old_default_locale != new_default_locale
      raise "can't change locale for a shallow clone" if @sub_id
      buttons = self.buttons
      trans = BoardContent.load_content(self, 'translations') || {}
      anything_translated = false
      trans['board_name'] ||= {}
      trans['board_name'][old_default_locale] ||= self.settings['name']
      if trans['board_name'][new_default_locale]
        self.settings['name'] = trans['board_name'][new_default_locale]
        anything_translated = true
      end
      buttons.each do |btn|
        btn_trans = trans[btn['id'].to_s] || {}
        btn_trans[old_default_locale] ||= {}
        if !btn_trans[old_default_locale]['label']
          btn_trans[old_default_locale]['label'] = btn['label']
          btn_trans[old_default_locale]['vocalization'] = btn['vocalization']
          btn_trans[old_default_locale].delete('vocalization') if !btn_trans[old_default_locale]['vocalization']
          btn_trans[old_default_locale]['inflections'] = btn['inflections']
          btn_trans[old_default_locale].delete('inflections') if !btn_trans[old_default_locale]['inflections']
        end
        if btn_trans[new_default_locale]
          anything_translated = true
          btn['label'] = btn_trans[new_default_locale]['label']
          btn['vocalization'] = btn_trans[new_default_locale]['vocalization']
          btn.delete('vocalization') if !btn['vocalization']
          btn['inflections'] = btn_trans[new_default_locale]['inflections']
          btn.delete('inflections') if !btn['inflections']
        end
        trans[btn['id'].to_s] = btn_trans
      end
      trans['default'] = new_default_locale
      trans['current_label'] = new_default_locale
      trans['current_vocalization'] = new_default_locale
      self.settings['translations'] = trans

      if anything_translated
        self.settings['buttons'] = buttons
        self.settings['locale'] = new_default_locale
      end
    end
  end

  module ClassMethods
    # take the previous board set in its entirety,
    # and, depending on the preference, make new copies
    # of sub-boards, or use existing copies of sub-boards
    # for specified boards (all if none specified)
    # on behalf of the specified used
    def replace_board_for(user, opts)
      starting_old_board = opts[:starting_old_board] || raise("starting_old_board required")
      starting_new_board = opts[:starting_new_board] || raise("starting_new_board required")
      copier = BoardSetCopier.new(
        user: user,
        starting_old_board: starting_old_board,
        starting_new_board: starting_new_board,
        opts: {
          authorized_user: opts[:authorized_user],
          copier: opts[:copier],
          update_inline: opts[:update_inline] || false,
          make_public: opts[:make_public] || false,
          new_owner: opts[:new_owner],
          disconnect: opts[:disconnect],
          copy_prefix: opts[:copy_prefix],
          old_default_locale: opts[:old_default_locale],
          new_default_locale: opts[:new_default_locale],
          valid_ids: opts[:valid_ids]
        }
      )
      copier.replace_and_relink
    end

    # Creates copies of specified boards
    # (all if none specified) for the user,
    # then wires up all the new copies to link to
    # each other instead of the originals.
    # Delegates to BoardSetCopier for the optimized two-phase approach.
    def copy_board_links_for(user, opts)
      starting_old_board = opts[:starting_old_board] || raise("starting_old_board required")
      starting_new_board = opts[:starting_new_board] || raise("starting_new_board required")
      copier = BoardSetCopier.new(
        user: user,
        starting_old_board: starting_old_board,
        starting_new_board: starting_new_board,
        opts: {
          authorized_user: opts[:authorized_user],
          copier: opts[:copier],
          make_public: opts[:make_public],
          new_owner: opts[:new_owner],
          disconnect: opts[:disconnect],
          copy_prefix: opts[:copy_prefix],
          old_default_locale: opts[:old_default_locale],
          new_default_locale: opts[:new_default_locale],
          valid_ids: opts[:valid_ids]
        }
      )
      copier.copy_and_relink
    end

    def cluster_related_boards(user)
      # Tries to cluster legacy boards for a user which never got clustered (copy_id) correctly
      boards = Board.where(user: user); boards.count
      roots = boards.where(['search_string ILIKE ?', "%root%"]).select{|b| !Board.find_all_by_global_id(b.settings['immediately_upstream_board_ids'] || []).detect{|b| b.user_id == user.id } }
      counts = {}
      roots.each do |board|
        (board.settings['downstream_board_ids'] || []).each do |board_id|
          counts[board_id] ||= 0
          counts[board_id] += 1
        end
      end
      unique_ids = counts.to_a.select{|id, cnt| cnt == 1 }.map(&:first)
      boards.find_in_batches(batch_size: 25) do |batch|
        batch.each do |sub_board|
          roots.each do |board|
            if !sub_board.settings['copy_id'] && (board.settings['downstream_board_ids'] || []).include?(sub_board.global_id) && unique_ids.include?(sub_board.global_id)
              sub_board.settings['copy_id'] = board.global_id
              sub_board.save
            end
          end
          if !sub_board.settings['copy_id'] && (sub_board.settings['immediately_upstream_board_ids'] || []).length == 1
            parent = Board.find_by_global_id(sub_board.settings['immediately_upstream_board_ids'])[0]
            if parent.user_id == sub_board.user_id && parent.settings['copy_id']
              sub_board.settings['copy_id'] = parent.settings['copy_id']
              sub_board.save
            end
          end
        end
      end
    end
  end
end
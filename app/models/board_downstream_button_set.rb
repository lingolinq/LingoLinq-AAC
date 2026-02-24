class BoardDownstreamButtonSet < ActiveRecord::Base
  MAX_DEPTH = 10
  include Async
  include GlobalId
  include SecureSerialize
  include ExtraData
  secure_serialize :data
  belongs_to :board, optional: true
  include Replicate

  after_initialize :init_data
  before_save :generate_defaults

  def init_data
    self.data ||= {}
  end

  def board
    if self.user_id
      Board.find_by_global_id("#{self.related_global_id(self.board_id)}-#{self.related_global_id(self.user_id)}")
    else
      super
    end
  end

  def generate_defaults(force=false)
    self.data ||= {}
    self.data['remote_salt'] ||= GoSecure.nonce('remote_salt')
    @buttons = nil
    @cached_extra_data = nil
    if !skip_extra_data_processing? || force
      buttons = self.buttons(false)
      self.data['board_ids'] = buttons.map{|b| b['board_id'] }.compact.uniq
      # find_by_global_id is required to retrieve shallow clones instead of originals
      self.data['public_board_ids'] = Board.where(public: true).select('id').find_all_by_global_id(self.data['board_ids']).map(&:global_id)
      # Board.where(:id => Board.local_ids(self.data['board_ids']), :public => true).select('id').map(&:global_id)
      self.data['linked_board_ids'] = buttons.map{|b| b['linked_board_id'] }.compact.uniq
      self.data['button_count'] = buttons.length
      self.data['board_count'] = buttons.map{|b| b['board_id'] }.uniq.length
      if (self.data['buttons'] || []).length > 200
        @cached_extra_data = self.data['buttons']
        self.data.delete('buttons')
      end
      self.data.delete('json_response')
    end
    true
  end
  
  def cached_json_response
    self.data && self.data['json_response']
  end
  
  def self.for_user(user, allow_slow=false, load_extra_data=true)
    board_ids = []
    if user.settings['preferences'] && user.settings['preferences']['home_board']
      board_ids << user.settings['preferences']['home_board']['id']
    end
    board_ids += user.sidebar_boards.map{|b| b['key'] }
    boards = Board.find_all_by_path(board_ids).uniq
    if allow_slow
      boards.each do |brd|
        if !brd.board_downstream_button_set || brd.board_downstream_button_set.data['full_set_revision'] != brd.full_set_revision
          BoardDownstreamButtonSet.update_for(brd, true)
          brd.reload
          brd.board_downstream_button_set.reload if brd.board_downstream_button_set
        end
      end
    end
    
    button_sets = boards.map{|b| b.board_downstream_button_set }.compact.uniq
    button_sets.each{|bs| bs.assert_extra_data } if load_extra_data
    button_sets
  end
  
  def buttons(allow_schedule=true)
    self.touch if self.updated_at && self.updated_at < 1.week.ago
    return @buttons if @buttons
    brd = self
    visited_sources = []
    # TODO: we have a potential problem, if the root board referenced by
    # source_id disappears, then updates will stop because source_id disappears then since we're
    # updating on-demand 
    while brd && brd.data['source_id'] && !visited_sources.include?(brd.global_id)
      visited_sources << brd.global_id
      bs = BoardDownstreamButtonSet.find_by_global_id(brd.data['source_id'])
      if bs && bs.board && !bs.data['source_id']
        if bs.data['linked_board_ids'].include?(self.related_global_id(self.board_id))
          bs.assert_extra_data
          @buttons = bs.buttons_starting_from(self.related_global_id(self.board_id))
          bs.touch if bs.updated_at && bs.updated_at < 1.week.ago
          if self.data['source_id'] != bs.global_id
            self.data['source_id'] = bs.global_id
            self.save
          end
          return @buttons
        else
          # Source no longer references this board, so this button set is 
          # source information is out of date
          self.class.schedule_once(:update_for, self.related_global_id(self.board_id)) if allow_schedule
          self.data['source_id'] = nil
          self.data['full_set_revision'] = 'outdated'
          self.save
          @buttons = []
        end
      else
        brd = bs if bs
      end
    end
    self.assert_extra_data
    if self.data['buttons']
      @buttons = self.data['buttons']
    elsif @cached_extra_data
      @buttons = @cached_extra_data
    else
      # If brd.data['source_id'] is defined, that means we got
      # to a dead end, so we should probably schedule .update_for
      if brd.data['source_id'] && self.data['dead_end_source_id'] != brd.data['source_id']
        # Don't need eager generation, and this may cause infinite recursion
        # self.class.schedule_once(:update_for, self.related_global_id(self.board_id))
        self.data['dead_end_source_id'] = brd.data['source_id']
        self.save
      end
      @buttons = []
    end
  end
  
  def buttons_starting_from(board_id)
    boards_to_include = {}
    boards_to_include[board_id] = 0
    res = []
    (self.data['buttons'] || []).each do |button|
      if boards_to_include[button['board_id']] != nil
        if button['linked_board_id']
          boards_to_include[button['linked_board_id']] = [boards_to_include[button['linked_board_id']], boards_to_include[button['board_id']] + 1].compact.min
        end
      end
    end
    (self.data['buttons'] || []).each do |button|
      if boards_to_include[button['board_id']]
        button['depth'] = boards_to_include[button['board_id']] if boards_to_include[button['board_id']]
        res << button
      end
    end
    res
  end

  def has_buttons_defined?
    self.data && (self.data['buttons'] || self.data['extra_url'])
  end

  def url_for(user, full_set_revision, allow_detach=false)
    # Force an auto-regenerate if the revision doesn't match
    allowed_ids = {}
    original = self
    button_set = original
    button_set_revision = button_set.data['full_set_revision']
    if button_set.data['source_id']
      button_set = BoardDownstreamButtonSet.find_by_global_id(button_set.data['source_id'])
      if button_set && !button_set.data['linked_board_ids'].include?(original.related_global_id(original.board_id))
        original.data['source_id'] = nil
        original.data['full_set_revision'] = 'outdated'
        original.save
        return nil
      end
      button_set ||= original
    end
    @linked_encryption_settings = button_set.data['extra_data_encryption'] if button_set != original

    # find_by_global_id is required to retrieve shallow clones instead of originals
    public_board_ids = button_set.data['public_board_ids'] || Board.where(public: true).select('id').find_all_by_global_id(button_set.data['board_ids']).map(&:global_id)
    #Board.where(:id => Board.local_ids(button_set.data['board_ids']), :public => true).select('id').map(&:global_id)
    public_board_ids.each{|id| allowed_ids[id] = true }
    if user
      allowed_prefixes = {}
      allowed_uids = nil
      user.private_viewable_board_ids.each do |id|
        allowed_ids[id] = true
        allowed_prefixes[id] = true
      end
      if user.possible_admin?
        if Organization.admin_manager?(user)
          button_set.data['board_ids'].each{|id| allowed_ids[id] = true }
        end
      end
      button_set.data['board_ids'].each do |id|
        # Shallow clones need to check permission on the source board AND the shallow clone user
        # NOTE: if the shallow clone was copied, then the board's shallow_id should be included in private list
        if id.match(/-/) && !allowed_ids[id]
          if !allowed_uids
            # Only run these checks if needed by one or more board ids
            ids = button_set.data['board_ids'].map{|id| id.split(/-/, 2)[1] }.compact.uniq
            allowed_uids = {}
            User.find_batches_by_global_id(ids, batch_size: 25) {|u| allowed_uids[user.global_id] = u.allows?(user, 'model') }
          end
          bid, uid = id.split(/-/, 2)
          allowed_ids[id] = true if allowed_prefixes[bid] && allowed_uids[uid]
        end
      end
    end
    @unviewable_ids = button_set.data['board_ids'].select{|id| !allowed_ids[id] }
    revision_match = full_set_revision && button_set_revision == full_set_revision
    if @unviewable_ids.blank? && revision_match && !button_set.data['source_id']
      # Cache the CDN URL for 24 hours
      if button_set.data['private_cdn_url']
        button_set.data['private_cdn_url_checked'] ||= Time.now.to_i
      end
      if button_set.data['private_cdn_url'] && button_set.data['private_cdn_revision'] == button_set_revision && (button_set.data['private_cdn_url_checked'] || Time.now.to_i) > (24.hours.ago.to_i)
        return button_set.data['private_cdn_url']
      end
      private_path = button_set.extra_data_private_url
      private_path = private_path.sub("https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/", "") if private_path
      url = (Uploader.check_existing_upload(private_path) || {})[:url]
      if !url && button_set.data['buttons'] && allow_detach
        button_set.detach_extra_data('force')
        url = Uploader.check_existing_upload(private_path)[:url]
      end
      if url
        button_set.data['private_cdn_url'] = url
        button_set.data['private_cdn_url_checked'] = Time.now.to_i
        button_set.data['private_cdn_revision'] = button_set_revision
        button_set.save
        return url
      elsif button_set.data['buttons']
        button_set.schedule_once(:detach_extra_data, 'force')
      else
        BoardDownstreamButtonSet.schedule_once(:update_for, self.related_global_id(self.board_id))
      end
    end

    if !button_set.data['remote_salt']
      button_set.generate_defaults(true)
      button_set.save
    end

    @remote_hash = GoSecure.sha512(@unviewable_ids.sort.to_json, button_set.data['remote_salt'])
    @remote_path = nil
    if revision_match && (((button_set.data['remote_paths'] || {})[@remote_hash] || {})['expires'] || 0) > Time.now.to_i
      @remote_path = ((button_set.data['remote_paths'] || {})[@remote_hash] || {})['path']
      @remote_checksum = ((button_set.data['remote_paths'] || {})[@remote_hash] || {})['checksum'] || 'none'
      if button_set.data['remote_paths'][@remote_hash]['expires'] < 2.weeks.from_now.to_i
        button_set.schedule_once(:touch_remote, @remote_hash)
      end
      url = Uploader.check_existing_upload(button_set.data['remote_paths'][@remote_hash]['path'])[:url]
      return url if url
    end
    @remote_path ||= "extras-cache#{button_set.global_id[-5,5]}/button_set_cache/#{button_set.global_id}/#{@remote_hash}.json"
    return nil
  end

  def touch_remote(hash)
    if self.data['remote_paths'] && self.data['remote_paths'][hash]
      # Touch the remote file so it hangs around longer now that
      # we know it's actually being used
      res = Uploader.remote_touch(self.data['remote_paths'][hash]['path'])
      if res
        self.data['remote_paths'][hash]['expires'] = 5.months.from_now.to_i
        self.save
      else
        self.data['remote_paths'].delete(hash)
        self.save
      end
    end
  end

  def self.generate_for(board_id, user_id)
    # Doesn't reprocess the content, just generates the correct file
    board = Board.find_by_global_id(board_id)
    user = user_id && User.find_by_global_id(user_id)
    # User's just-copied boards mightn't be here yet
    user.update_available_boards if user
    return {success: false, error: 'missing board or user'} unless board && user
    button_set = board.board_downstream_button_set
    just_generated = false
    if !button_set
      # Generate the button set if it doesn't already exist
      just_generated = true
      self.update_for(board_id, true)
      button_set = board.reload.board_downstream_button_set
    end
    button_set_revision = button_set && button_set.data['full_set_revision']
    if button_set && button_set.data['source_id']
      bs = BoardDownstreamButtonSet.find_by_global_id(button_set.data['source_id'])
      if bs && bs.board
        button_set = bs
      else
        button_set.data['source_id'] = nil
      end
    end
    return {success: false, error: 'could not generate button set'} unless button_set && button_set.board
    if button_set_revision != board.full_set_revision && !just_generated
      # Force-update the button set if it's stale
      just_generated = true
      self.update_for(board_id, true)
      button_set = board.reload.board_downstream_button_set
    end
    url = button_set.board && button_set.url_for(user, button_set.board.full_set_revision, true)
    return {success: true, state: 'url_for', url: url} if url
    unviewable_ids = button_set.instance_variable_get('@unviewable_ids') || []
    remote_path = button_set.instance_variable_get('@remote_path')
    remote_hash = button_set.instance_variable_get('@remote_hash')
    if !button_set.data['extra_data_nonce'] || just_generated
      # If the button set has never been detached or was just updated, ensure it is detached
      button_set.detach_extra_data(true)
      return {success: true, state: 'fresh', url: button_set.extra_data_private_url} if unviewable_ids.blank? && button_set.extra_data_private_url
    end
    button_set.data['remote_paths'] ||= {}
    if button_set.data['remote_paths'][remote_hash] && button_set.data['remote_paths'][remote_hash]['path'] != false && button_set.data['remote_paths'][remote_hash]['generated'] > 12.hours.ago.to_i
      # Don't allow repeated regeneration attempts to bog things down
      if button_set.data['remote_paths'][remote_hash]['path']
        return {success: true, state: 'cached', url: "#{ENV['UPLOADS_S3_CDN']}/#{button_set.data['remote_paths'][remote_hash]['path']}"}
      else
        return {success: false, error: 'button set failed to generate, waiting for cool-down period'}
      end
    end

    # Generate a subset version of the button set for the specified user's access level
    button_set.generate_defaults(true)
    bad_ids = {}
    unviewable_ids.each{|id| bad_ids[id] = true }
    button_set.assert_extra_data
    available_buttons = button_set.buttons.select{|b| !bad_ids[b['board_id']] }

    path = remote_path
    button_set.data['remote_paths'][remote_hash] = {'generated' => Time.now.to_i, 'path' => path, 'expires' => 5.months.from_now.to_i}
    begin
      file = Tempfile.new("stash")
      json = button_set.encrypted_json(available_buttons)
      file.write(json)
      file.close
      # If upload is throttled, schedule it for later (and don't repeat if already scheduled)
      if RemoteAction.where(path: "#{board_id}::#{user_id}", action: 'upload_extra_data').count == 0
        new_checksum = Digest::MD5.hexdigest(json)
        old_checksum = button_set.instance_variable_get('@remote_checksum') || new_checksum || 'none'

        begin
          res = Uploader.remote_upload(remote_path, file.path, 'text/json', new_checksum)
        rescue => e
          if e.message && e.message.match(/throttled/)
            res = {error: 'throttled'}
          else
            raise e
          end
        end
        if res && res[:error] == 'throttled'
          RemoteAction.where(path: "#{board_id}::#{user_id}", action: 'upload_extra_data').delete_all
          RemoteAction.create(path: "#{board_id}::#{user_id}", act_at: 5.minutes.from_now, action: 'upload_extra_data')
        elsif res && res[:path] && res[:path] != remote_path
          RemoteAction.where(path: res[:path], action: 'delete').delete_all
          Uploader.remote_remove_later(remote_path, old_checksum)
          button_set.data['remote_paths'][remote_hash]['path'] = res[:path]
          button_set.data['remote_paths'][remote_hash]['checksum'] = new_checksum
        elsif res && res[:path]
          RemoteAction.where(path: res[:path], action: 'delete').delete_all
          button_set.data['remote_paths'][remote_hash]['path'] = res[:path]
          button_set.data['remote_paths'][remote_hash]['checksum'] = new_checksum
        end
      else
        # TODO: need a way to force this to retry if it's holding up a user's progress
      end
    rescue => e
      button_set.data['remote_paths'][remote_hash]['path'] = false
      button_set.data['remote_paths'][remote_hash]['error'] = e.message
    end
    button_set.save
    # TODO: I was stuck getting "button set failed to generate" for no reason
    # nothing I as a user could do about it. Is there a way to retry this?
    # Once I called BDBS.update_for(board_id) the issue resolved itself.
    return {success: false, error: 'button set failed to generate'} unless button_set.data && button_set.data['remote_paths'] && button_set.data['remote_paths'][remote_hash] && button_set.data['remote_paths'][remote_hash]['path']
    {success: true, state: 'uploaded', url: "#{ENV['UPLOADS_S3_CDN']}/#{button_set.data['remote_paths'][remote_hash]['path']}"}
  end

  def self.flush_caches(board_ids, timestamp)
    board_ids.each do |board_id|
      board = Board.find_by_global_id(board_id)
      bs = board && board.board_downstream_button_set
      if bs && bs.data['remote_paths']
        changed = false
        bs.data['remote_paths'].each do |hash, obj|
          if obj['generated'] < timestamp && obj['path']
            changed = true
            path = obj['path']
            # Uploader.invalidate_cdn(path)            
            Uploader.remote_remove(path)
            bs.data['remote_paths'].delete(hash)
          end
        end
        bs.save if changed
      end
    end
  end

  def self.update_for(board_id, immediate_update=false, traversed_ids=[])
    traversed_ids ||= []
    key = "traversed/button_set/#{board_id}"
    cached_traversed = (JSON.parse(RedisInit.default.get(key)) rescue nil) || []
    RedisInit.default.del(key)
    traversed_ids = (traversed_ids + cached_traversed).uniq

    board = Board.find_by_global_id(board_id)
    return if board && traversed_ids.include?(board.global_id)
    board.track_downstream_boards! if board && (!board.settings || !board.settings['full_set_revision'])
    if board
      # Prevent loop from running forever
      traversed_ids << board.global_id
      set = BoardDownstreamButtonSet.find_or_create_by(:board_id => board.id, :user_id => Board.local_ids([board.instance_variable_get('@sub_id')].compact)[0]) rescue nil
      set ||= BoardDownstreamButtonSet.find_or_create_by(:board_id => board.id, :user_id => Board.local_ids([board.instance_variable_get('@sub_id')].compact)[0])
      set.data['source_id'] = nil if set.data['source_id'] == set.global_id
      # Don't re-update if you've updated more recently than when this
      # job was scheduled
      return if self.last_scheduled_stamp && (set.updated_at.to_i - 5) > self.last_scheduled_stamp
      
      set.data['full_set_revision'] = board.full_set_revision
      existing_board_ids = (set.data || {})['linked_board_ids'] || []

      # Step 1: Check for an already-generated upstream board and use that if available
      # If more than a few upstream boards, this will take too long and isn't explicitly necessary
      up_ids = (board.settings['immediately_upstream_board_ids'] || [])[0, 10]
      # Shallow clones shouldn't travel upstream beyond the root board in the set
      if board.instance_variable_get('@sub_id')
        up_ids = []
        if board.root_board && board.root_board != board
          up_ids = [board.root_board.global_id]
        end
      end
      if board.settings['copy_id'] && board.settings['copy_id'] != board.global_id
        up_ids = [board.settings['copy_id']] + up_ids
      end
      Board.find_batches_by_global_id(up_ids, :batch_size => 3) do |brd|
        set.data['found_upstream_board'] = true
        just_updated = false
        if !brd.board_downstream_button_set || brd.board_downstream_button_set.data['full_set_revision'] != brd.full_set_revision
          BoardDownstreamButtonSet.update_for(brd.global_id, false, traversed_ids)
          just_updated = true
          brd.reload
        end
        bs = brd.board_downstream_button_set
        set.data['found_upstream_set'] = true if bs
        source_board_id = nil
        linked_board_ids = bs && (bs.data['linked_board_ids'] || bs.buttons(false).map{|b| b['linked_board_id'] }.compact.uniq)
        do_update = false
        # If the parent board is the correct source, use that
        if bs && bs.has_buttons_defined? && linked_board_ids.include?(board.global_id)
          # legacy lists don't correctly filter linked board ids
          valid_button = bs.buttons(false).detect{|b| b['linked_board_id'] == board.global_id } # && !b['hidden'] && !b['link_disabled'] }
          if valid_button && bs != set
            do_update = true if bs.updated_at <= set.updated_at
            set.data['source_id'] = bs.global_id
            set.data['buttons'] = nil
            set.save
            source_board_id = bs.related_global_id(bs.board_id)
          end
        # Otherwise if the parent board has a source_id, use that
        elsif bs && bs.data['source_id'] && linked_board_ids.include?(board.global_id)
          # legacy lists don't correctly filter linked board ids
          buttons = bs.buttons(false)
          valid_button = (buttons || []).detect{|b| b['linked_board_id'] == board.global_id } # && !b['hidden'] && !b['link_disabled'] }
          if valid_button && bs.data['source_id'] != set.global_id
            source = BoardDownstreamButtonSet.find_by_global_id(bs.data['source_id'])
            if source
              do_update = true if source.updated_at <= set.updated_at
              source_board_id = source.related_global_id(source.board_id) if source
              set.data['source_id'] = bs.data['source_id']
              set.data['buttons'] = nil
              set.save
            end
          end
        end
        if source_board_id
          # If pointing to a source, go ahead and update that source
          # as part of the update process for this button set
          if do_update && !just_updated && !traversed_ids.include?(source_board_id)
            # If we're already in a slow background job, just do everything immediately
            if immediate_update || Worker.current_speed.to_s == 'slow'
              BoardDownstreamButtonSet.update_for(source_board_id, true, traversed_ids)
            else
              BoardDownstreamButtonSet.schedule_update(source_board_id, traversed_ids)
            end
          end
          return set
        end
      end
      boards_hash = {}
      # hash of all downstream boards is pretty memory intensive, let's skip
#      Board.find_batches_by_global_id(board.settings['downstream_board_ids'] || [], :batch_size => 3) do |brd|
#        boards_hash[brd.global_id] = brd
#      end
      
      # Step 2: Traverse all downstream boards and add in buttons from all these boards
      # TODO: Should we limit the depth?
      boards_to_visit = [{:board_id => board.global_id, :depth => 0, :index => 0}]
      visited_board_ids = []
      linked_board_ids = []
      all_buttons = []
      # set.data['tmp_buttons'] = []
      while boards_to_visit.length > 0
        boards_to_visit.sort_by!{|bv| [bv[:depth], bv[:index]] }
        batch = boards_to_visit[0, 20]
        boards_to_visit = boards_to_visit - batch
        batch_ids = batch.map{|bv| bv[:board_id]}
        boards_by_id = Board.find_all_by_global_id(batch_ids).index_by(&:global_id)
        batch_ids.each do |board_id|
          board_to_visit = boards_by_id[board_id]
          bv = batch.detect{|v| v[:board_id] == board_id}
          if bv && board_to_visit
            images = board_to_visit.known_button_images
            visited_board_ids << board_to_visit.global_id
            # add all buttons
            trans = BoardContent.load_content(board_to_visit, 'translations') || {}

            inflections = {}
            (board_to_visit.settings['locales'] || []).each do |loc|
              words_to_check = board_to_visit.grid_buttons.map{|b|
                btn = (trans[b['id'].to_s] || {})[loc] || b
                btn['vocalization'] || btn['label']
              }.compact
              inflections[loc] = WordData.inflection_locations_for(words_to_check, loc)
            end

            board_to_visit.grid_buttons.each_with_index do |button, idx|
              image = images.detect{|i| button['image_id'] == i.global_id }
              visible_level = 1
              linked_level = 1
              if button['level_modifications'] && button['level_modifications']['pre'] && button['level_modifications']['pre']['hidden']
                visible_level = button['level_modifications'].select{|l, mod| mod['hidden'] == false }.map(&:first).sort.first.to_i || 10
                if button['level_modifications']['override'] && button['level_modifications']['override']['hidden'] == false
                  visible_level = 1
                end
              end
              if button['level_modifications'] && button['level_modifications']['pre'] && button['level_modifications']['pre']['link_disabled']
                linked_level = button['level_modifications'].select{|l, mod| mod['link_disabled'] == false }.map(&:first).sort.first.to_i || 1
                if button['level_modifications']['override'] && button['level_modifications']['override']['link_disabled'] == false
                  linked_level = 1
                end
              end
              # set.data['tmp_buttons'] << {'id'=>button['id'],'board_id' => board_to_visit.global_id}
              button_data = {
                'id' => button['id'],
                'locale' => board_to_visit.settings['locale'] || 'en',
                'board_id' => board_to_visit.shallow_id,
                'board_key' => board_to_visit.shallow_key,
                'hidden' => !!button['hidden'],
                'hidden_link' => !!bv[:hidden],
                'visible_level' => visible_level,
                'linked_level' => linked_level,
                'image' => image && image.url,
                'hc' => image && image.settings['hc'],
                'image_id' => button['image_id'],
                'sound_id' => button['sound_id'],
                'label' => button['label'],
                'ref_id' => button['ref_id'],
                'force_vocalize' => button['add_vocalization'] == nil ? button['add_to_vocalization'] : button['add_vocalization'],
                'vocalization' => button['vocalization'],
                'link_disabled' => !!button['link_disabled'],
                'border_color' => button['border_color'],
                'background_color' => button['background_color'],
                'depth' => bv[:depth] || 0
              }
              # Include translated strings in button_set data
              (trans[button['id'].to_s] || {}).each do |loc, hash|
                if hash['label'] || hash['vocalization']
                  button_data['tr'] ||= {}
                  button_data['tr'][loc] = [hash['label'] || '', hash['vocalization']].compact
                end
              end

              # Include localized inflections in button_set data
              inflections.each do |loc, hash|
                btn = (trans[button['id'].to_s] || {})[loc] || button
                word = btn && (hash[btn['vocalization']] || hash[btn['label']])
                if btn || word
                  lookup = btn['inflection_defaults'] || (board_to_visit.settings['locale'] == loc && button['inflection_defaults']) || {}
                  arr = btn['inflections'] || (board_to_visit.settings['locale'] == loc && button['inflections']) || []
                  loc_hash = {'nw' => 0, 'n' => 1, 'ne' => 2, 'w' => 3, 'e' => 4, 'sw' => 5, 's' => 6, 'se' => 7};
                  lookup.each do |pt, str|
                    arr[loc_hash[pt]] ||= str if loc_hash[pt]
                  end
                  (word || {}).each do |pt, str|
                    arr[loc_hash[pt]] ||= str if loc_hash[pt]
                  end
                  if arr.compact.length > 0
                    button_data['infl'] ||= {}
                    button_data['infl'][loc] = arr.compact
                  end
                end
              end

              button_data.keys.each{|k| button_data.delete(k) if button_data[k] == nil }
              # check for any linked buttons
              # (unless it's a meta_home link, then it should have its own button set)
              if button['load_board'] && button['load_board']['id'] && !button['meta_home']
                if button['meta_home']
                  button_data['meta_home_id'] = button['load_board']['id']
                else
                  linked_board = boards_hash[button['load_board']['id']]
                  linked_board ||= Board.find_by_global_id(button['load_board']['id'])
                  # hidden or disabled links shouldn't be tracked (why not???)
                  if linked_board # && !button['hidden'] && !button['link_disabled']
                    button_data['linked_board_id'] = linked_board.shallow_id
                    button_data['linked_board_key'] = linked_board.shallow_key
                    button_data['home_lock'] = true if button['home_lock']
                  end
                  # mark the first link to each board as "preferred"
                  if linked_board && !linked_board_ids.include?(linked_board.global_id) # && !button['hidden'] && !button['link_disabled']
                    button_data['preferred_link'] = true
                    linked_board_ids << button['load_board']['id']
                    boards_to_visit << {:board_id => linked_board.global_id, :depth => bv[:depth] + 1, :hidden => (bv[:hidden] || button['hidden'] || button['link_disabled']), :index => idx} if !visited_board_ids.include?(linked_board.global_id)
                  end
                end
              end
              all_buttons << button_data
            end
          end
        end
      end

      # Step 3: Update the resulting data
      set.data['included_board_ids'] = visited_board_ids
      set.data['buttons'] = all_buttons
      set.data['source_id'] = nil
      set.generate_defaults(true)
      # Don't ever save data['buttons'] to the db, it's too big
      set.detach_extra_data(true)
      set.save

      # Step 4: Any boards that used to potentially use this board as their
      # source but who can no longer do that due to a link removal
      # need to have their caches flushed. Also flush the cache for this
      # board since we just changed it.
      board_ids_to_flush = [board.global_id]
      lost_board_ids = existing_board_ids - set.data['linked_board_ids']
      # Any boards that we no longer referenced are going to need their
      # own button data instead of using this button set as their source
      lost_board_ids.each do |id|
        # BoardDownstreamButtonSet.schedule_update(id, traversed_ids) # :update_for
        board_ids_to_flush << id
      end

      # Retrieve all linked boards and set them to this source or mark them as needing a cache flush
      Board.find_batches_by_global_id(set.data['linked_board_ids'] || [], :batch_size => 10) do |brd|
        bs = brd.board_downstream_button_set
        # NOTE: it was too expensive updating everyone with the wrong source,
        # so I changed it to only update everyone with no source, since 
        # bs.buttons should update to the right source eventually
        if bs && bs.data['source_id'] != set.global_id
          board_ids_to_flush << brd.global_id
        end
        if bs && bs.global_id != set.global_id && !bs.data['source_id'] # bs.data['source_id'] != set.global_id
          bs.data['full_set_revision'] = brd.full_set_revision
          bs.data['source_id'] = set.global_id
          bs.data['buttons'] = nil
          bs.save
        end
      end
      # Limit to only those sets that actually exist for performance
      board_ids_to_flush = BoardDownstreamButtonSet.where(board_id: Board.local_ids(board_ids_to_flush)).select('id, board_id').map{|bs| bs.related_global_id(bs.board_id) }
      board_ids_to_flush.each_slice(25) do |ids|
        BoardDownstreamButtonSet.schedule_for('slow', :flush_caches, ids, Time.now.to_i)
      end

      if board.settings['board_downstream_button_set_id'] != set.global_id && !board.instance_variable_get('@sub_id')
        # TODO: race condition?
        board.update_setting('board_downstream_button_set_id', set.global_id)
      end
      set
    end
  end

  def self.schedule_update(board_id, traversed_ids)
    # This appears to be here to prevent multiple updates happening
    # independently from updating button sets when they don't have to.
    key = "traversed/button_set/#{board_id}"
    # NOTE: if the Redis value gets removed unexpectedly, we
    # won't have a list of traversed ids which could result
    # in a recursive loop. This check is an emergency measure
    # to prevent that from happening and stuffing the queue.
    return if Worker.job_chain.split(/##/).select{|c| c.match(/BoardDownstreamButtonSet/) }.length > 5
    traversed = JSON.parse(RedisInit.default.get(key)) rescue nil
    traversed ||= []
    traversed += (traversed_ids - [board_id])
    Permissions.setex(RedisInit.default, key, 6.hours.to_i, traversed.uniq.to_json)
    BoardDownstreamButtonSet.schedule_once(:update_for, board_id)
  end
  
  def self.spoken_button?(button, user)
    if !button['hidden']
      if !button['linked_board_id'] || (user && user.settings['preferences']['vocalize_linked_buttons']) || button['force_vocalize']
        if button['label'] && button['label'].split(/\s/).length <= 2
          return true
        end
      end
    end
    false
  end

  def self.reconcile(start_id = 0)
    wasted = 0
    destroyed = 0
    BoardDownstreamButtonSet.where("id > ?", start_id).find_in_batches(batch_size: 10) do |batch|
      batch.each do |button_set|
        button_set.assert_extra_data
        if button_set.data['buttons']
          size = button_set.data.to_json.length
          board = button_set.board
          puts "#{button_set.global_id} #{board ? board.key : 'NO BOARD'} #{size}"
          if !board
            puts "  no board!"
            button_set.destroy
            destroyed += size
          elsif (board.settings['immediately_upstream_board_ids'] || []).length > 0
            if size > 20000
              if button_set.data['source_id'] == button_set.global_id
                button_set.data['source_id'] = nil 
                button_set.save
              end
              bs = BoardDownstreamButtonSet.update_for(board.global_id)
              bs_size = bs.data.to_json.length
              if bs_size < size
                puts "  -#{size - bs_size}"
                wasted += size - bs_size
              end
            end
          end
        elsif button_set.data['source_id'] == button_set.global_id
          button_set.data['source_id'] = nil 
          button_set.save
          if button_set.board
            bs = BoardDownstreamButtonSet.update_for(button_set.board.global_id)                
          else
            puts "  no board!"
            button_set.destroy
            destroyed += size
          end
          puts "  mismatched source"
        end
      end
    end
    puts "wasted #{wasted / 1.megabyte}Mb, destroyed #{destroyed / 1.megabyte}Mb"
  end

  def self.clean_old_button_sets
    ids = BoardDownstreamButtonSet.where(['updated_at < ?', 3.months.ago]).select('id').limit(200).map(&:id)
    BoardDownstreamButtonSet.where(id: ids).delete_all
  end
  
  def self.word_map_for(user)
    board_key = user && user.settings['preferences'] && user.settings['preferences']['home_board'] && user.settings['preferences']['home_board']['key']
    board = Board.find_by_path(board_key) if board_key
    button_set = board && board.board_downstream_button_set
    return nil unless button_set
    button_set.assert_extra_data
    res = {'words' => [], 'word_map' => {}}
    
    # TODO: include images with attribution
    
    button_set.buttons(false).each do |button|
      if spoken_button?(button, user)
        res['words'] << button['label'].downcase
        locale = button['locale'] || 'en'
        res['word_map'][locale] ||= {}
        res['word_map'][locale][button['label'].downcase] = {
          'label' => button['label'].downcase,
          'border_color' => button['border_color'],
          'background_color' => button['background_color'],
          'image' => {
            'image_url' => button['image'],
            'license' => 'private'
          }
        }
      end
    end
    res['words'].uniq!
    
    res
  end
end

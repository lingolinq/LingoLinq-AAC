require_relative '../method_tracer'
require_relative '../art50_marker'

module JsonApi::Board
  extend MethodTracer
  extend JsonApi::Json
  
  TYPE_KEY = 'board'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50
  
  def self.build_json(board, args={})
    json = {} #board.settings
    json['id'] = board.shallow_id
    json['key'] = board.shallow_key
    json['shallow_clone'] = true if board.instance_variable_get('@sub_id')
    json['simple_refs'] = true if args[:skip_subs]
    # Index/list pages only need tile metadata. Shipping full buttons +
    # BoardContent blobs for every owned sub-board dominates Mine-tab
    # payload/CPU (boards page filters hundreds of rows down to roots).
    # Show/tree keep the full shape. See 2026-08-10-boards-page-load-perf.
    list_summary = !!args[:paginated]
    unless list_summary
      json['buttons'] = board.buttons || []
      ['grid', 'intro', 'background'].each do |key|
        json[key] = BoardContent.load_content(board, key)
      end
    end
    ['name', 'prefix', 'description', 'image_url', 'stars', 'forks', 'word_suggestions', 'locale', 'home_board', 'categories', 'dim_header', 'small_header'].each do |key|
      json[key] = board.settings[key]
    end
    # EU AI Act Article 50(2): expose the marking as a non-secret provenance view
    # (spec/provider/model/generated_at + marked), verified server-side. The signature and
    # content_id are withheld -- clients cannot verify the server-secret HMAC and content_id
    # links to an internal AiApiLog row, so exposing them would only enable a bearer-token
    # transplant. Returns nil (unmarked) for a board with no valid marker. See Art50Marker.
    json['ai_generated'] = Art50Marker.public_view(board.settings['ai_generated'])
    json['sort_score'] = ((board.popularity || -1) + 1) * (board.any_upstream ? 1 : 2)

    list = [board.settings['locale'] || 'en']
    trans = {}
    if list_summary
      # Avoid scanning every button translation key for tile locale chips;
      # settings locales cover that. When a request locale is present, still
      # load translations for localized_name (board_content is eager-loaded
      # on index). Do not rewrite button labels — list payloads omit buttons.
      list += Array(board.settings['locales'])
      if args[:locale]
        trans = (BoardContent.load_content(board, 'translations') || {})
        list += (trans['board_name'] || {}).keys
      end
    else
      trans = (BoardContent.load_content(board, 'translations') || {})
      trans.each{|k, h| if h.is_a?(Hash); list += h.keys; end }
    end
    json['translated_locales'] = list.select{|loc| !loc.blank? }.uniq
    json['style'] = board.settings['board_style'] if board.settings['board_style']
    if args[:locale]
      matching = list.detect{|l| l == args[:locale] }
      matching ||= list.detect{|l| l.split(/-|_/)[0] == args[:locale] }
      matching ||= list.detect{|l| l.split(/-|_/)[0] == args[:locale].split(/-|_/)[0] }
      if matching
        json['localized_name'] = (trans['board_name'] || {})[matching] || json['name']
        json['localized_locale'] = matching
        if !list_summary && !args[:permissions]
          json['buttons'].each do |button|
            btn_tran = trans[button['id'].to_s]
            if btn_tran && btn_tran[matching]
              # Only when the entry actually HAS one. A translation row carrying a
              # vocalization but no label used to null the label, the same shape of bug as
              # the vocalization guard below.
              button['label'] = btn_tran[matching]['label'] if btn_tran[matching]['label']
              # A vocalization beginning ':' or '+' is an ACTION, not a word — ':suggestion'
              # marks a word-prediction slot, '+s' appends a letter — and it has no
              # translation. Overwriting it from a translation entry that carries only a
              # label set it to nil, and the marker the client identifies these buttons by
              # simply vanished for anyone whose session asked for a locale: word prediction
              # never ran (Board#refresh_suggestions finds slots by == ':suggestion') and the
              # grid could not group them either. The client has always guarded this exact
              # assignment the same way — app/frontend/app/models/board.js
              # #translated_buttons, `has_special_vocalization` — so this makes the server
              # agree with the rule the client already applies.
              # A translation with NO vocalization still clears an ordinary button's, which
              # is deliberate: the client falls back to the translated label.
              unless button['vocalization'].to_s.match(/^[:+]/)
                button['vocalization'] = btn_tran[matching]['vocalization']
              end
              button['inflections'] = btn_tran[matching]['inflections']
              button['rules'] = btn_tran[matching]['rules']
            end
          end
        end
      end
    end
    self.trace_execution_scoped(['json/board/license']) do
      json['license'] = OBF::Utils.parse_license(board.settings['license'])
    end
    json['created'] = (board.created_at || Time.current).iso8601
    json['updated'] = board.settings['last_updated'] || (board.updated_at || Time.current).iso8601
    # This checks for updated/newly-added launch URLs for previously-defined apps
    unless list_summary
      self.trace_execution_scoped(['json/board/apps']) do
        json['buttons'].each do |button|
          if button['apps']
            button['apps'] = AppSearcher.update_apps(button['apps'])
          end
        end
      end
    end
    json['link'] = "#{JsonApi::Json.current_host}/#{board.key}"
    json['public'] = !!board.public
    json['visibility'] = board.public ? (board.fully_listed? ? 'public' : 'unlisted') : 'private'
    if json['shallow_clone']
      json['public'] = false
      json['visibility'] = 'private'
    end
    json['full_set_revision'] = board.full_set_revision
    json['current_revision'] = board.current_revision
    json['protected'] = !!board.protected_material?
    # json['button_set_id'] = board.button_set_id (not used)
    base_id = (board.shallow_id || board.global_id || '').to_s.split(/-/)[0]
    json['copy_id'] = board.settings['copy_id'] unless board.settings['copy_id'] == base_id
    json['brand_new'] = (board.created_at || Time.current) > 1.hour.ago
    json['non_author_uses'] = board.settings['non_author_uses'] if !json['shallow_clone']
    json['total_buttons'] = board.settings['total_buttons']
    json['unlinked_buttons'] = board.settings['unlinked_buttons']
    json['downstream_boards'] = (board.downstream_board_ids || []).length
    json['immediately_upstream_boards'] = (board.settings['immediately_upstream_board_ids'] || []).length
    json['current_library'] = board.current_library(false)
    json['user_name'] = board.cached_user_name
    # Lite serialization (:as_lite, used by #tree and #bulk prefetch) skips
    # the parent_board association load. It's an unindexed per-board lookup
    # that becomes an N+1 across a MAX_TREE-node tree (RCA 2026-05-24, issue
    # #286). Prefetch is only a cache warm; the full per-board endpoint
    # refills parent linkage when the user actually navigates into a board.
    # CONTRACT (issue #293): the non-lite path below ALWAYS sets
    # json['parent_board_id'] (to null when there is no parent). The Ember
    # client (Board#reload_if_lite) keys on parent_board_id === undefined to
    # detect a lite-sourced record and trigger a refetch in the share/details
    # modals. Do not make this key conditional on having a parent, or the
    # client can no longer distinguish "lite, not yet loaded" from "fully
    # loaded, genuinely no parent" and will either refetch on every modal open
    # or miss the refetch entirely.
    unless args[:as_lite]
      self.trace_execution_scoped(['json/board/parent_board']) do
        parent_board = nil
        if defined?(Octopus)
          conn = (Octopus.config[Rails.env] || {}).keys.sample
          parent_board = board.using(conn).parent_board if conn
        else
          parent_board = board.parent_board
        end
        json['parent_board_id'] = parent_board && parent_board.global_id
        json['parent_board_key'] = parent_board && parent_board.key
      end
    end
    json['link'] = "#{JsonApi::Json.current_host}/#{board.key}"
    
    if args.key?(:permissions)
      self.trace_execution_scoped(['json/board/permissions']) do
        json['permissions'] = board.permissions_for(args[:permissions])
        json['starred'] = board.starred_by?(args[:permissions])
      end      
    end
    
    # Lite skips the edit-scoped enrichment: copy_key (a find_by_path
    # query), non_author_starred?, and shared_users. None are needed to
    # warm a prefetch cache entry, and shared_users in particular is a
    # per-board fan-out (RCA 2026-05-24, issue #286).
    if !args[:as_lite] && json['permissions'] && json['permissions']['edit']
      if board.settings['copy_id']
        copy = Board.find_by_path(board.settings['copy_id'])
        if copy
          json['copy_key'] = copy.key
        end
      end
      if !json['shallow_clone']
        json['non_author_starred'] = board.non_author_starred? 
        self.trace_execution_scoped(['json/board/share_users']) do
          shared_users = board.shared_users
          json['shared_users'] = shared_users
        end
      end
    end
    # Lite skips the delete/admin-scoped using_user_names block: it issues
    # a UserBoardConnection + User query per board (another N+1 over a tree)
    # and surfaces support-only metadata the prefetch never reads.
    if !args[:as_lite] && ((json['permissions'] && json['permissions']['delete']) || (args[:permissions] && args[:permissions].allows?(args[:permissions], 'admin_support_actions')))
      json['downstream_board_ids'] = board.downstream_board_ids
      if args[:permissions] && args[:permissions].respond_to?(:settings)
        # TODO: sharding
        user_ids = UserBoardConnection.where(:board_id => board.id).limit(20).map(&:user_id)
        user_names = User.where(:id => user_ids).select('id, user_name').map(&:user_name)
        valid_names = [args[:permissions].user_name] + (args[:permissions].settings['supervisees'] || []).map{|s| s['user_name'] }
        if args[:permissions].allows?(args[:permissions], 'admin_support_actions')
          valid_names = user_names
        end
        json['using_user_names'] = (user_names & valid_names).sort
      end
    end
    
    json
  end
  
  def self.extra_includes(board, json, args={})
    if board.protected_material?
      json['board']['protected_settings'] = board.settings['protected'] || {}
      json['board']['protected_settings']['copyable'] = true if board.copyable_if_authorized?(args[:permissions])
    end
    # If this save fired a folder-level cascade, surface the touched
    # boards so the client can invalidate its boardDetailCache entries
    # for them. Otherwise the 5-min cache TTL would serve pre-cascade
    # data when the user next navigates into a downstream board.
    cascade_invalidations = board.instance_variable_get(:@cascade_invalidations)
    if cascade_invalidations && cascade_invalidations.is_a?(Array) && cascade_invalidations.any?
      json['board']['cascade_invalidations'] = cascade_invalidations
    end
    self.trace_execution_scoped(['json/board/images_and_sounds']) do
      hash = board.images_and_sounds_for(args[:permissions])
      unless json['board'] && json['board']['simple_refs']
        json['images'] = hash['images']
        json['sounds'] = hash['sounds']
      end
      json['board'] ||= {}
      json['board']['image_urls'] = board.settings['image_urls'] || {}
      json['board']['hc_image_ids'] = {}
      json['board']['sound_urls'] = board.settings['sound_urls'] || {}
      schedule_skin_enrichment = false
      # When a logged-in user prefers Default symbols (id: original), never let a
      # background library skin match replace the button's source URL. Anonymous
      # board JSON keeps the legacy skin_url preference for library boards.
      preferred_symbols = nil
      prefer_original_images = false
      if args[:permissions] && args[:permissions].respond_to?(:settings)
        preferred_symbols = (args[:permissions].settings || {}).dig('preferences', 'preferred_symbols')
        prefer_original_images = preferred_symbols.blank? || preferred_symbols == 'original' || preferred_symbols == 'default'
      end
      hash['images'].each{|i|
        # Lite skips the per-image ButtonImage.find_by_global_id skin lookup
        # (the dominant N+1: one query per image per board across the tree,
        # RCA 2026-05-24, issue #286). image_urls is still populated below
        # from the already-resolved hash url, so prefetched thumbnails render;
        # they just fall back to the base url instead of a skin-capable one
        # until the full per-board fetch enriches them.
        bi = nil
        if i['id'] && !args[:as_lite]
          bi = ButtonImage.find_by_global_id(i['id']) rescue nil
          if bi
            # skin_capable_url is safe for preserve_source_image (own URL only;
            # never enrichment label-search swaps).
            skin_url = bi.skin_capable_url
            # Omit skin_url from the image payload when the user prefers Default
            # symbols. Speak-mode board-detail (and older packaged clients) still
            # do `skin_url || url` and would otherwise paint enrichment matches.
            if skin_url && skin_url != i['url'] && !prefer_original_images
              i['skin_url'] = skin_url
            end
            schedule_skin_enrichment = true if bi.needs_library_url_enrichment?
          end
        end
        # JsonApi::Image.as_json already stamps skin_url whenever skin_capable_url
        # differs from url. Clear it for Default/original so clients that do
        # `skin_url || url` cannot paint enrichment matches.
        i.delete('skin_url') if prefer_original_images
        # Prefer skin-capable library URLs only when the user asked for a symbol
        # library (opensymbols / arasaac / …). "Default symbols" (original) keeps
        # the settings_for URL so board-detail does not paint enrichment matches.
        use_skin = i['skin_url'].present? && !prefer_original_images
        json['board']['image_urls'][i['id']] = use_skin ? i['skin_url'] : i['url']
        (i['alternates'] || []).each do |alternate|
          json['board']['image_urls']["#{i['id']}-#{alternate['library']}"] = alternate['url'] unless alternate['library'] == 'unknown'
        end
        json['board']['hc_image_ids'][i['id']] = true if i['hc']
        json['board']['has_fallbacks'] = true if i['fallback']
      }
      if schedule_skin_enrichment
        board.schedule_skin_enrichment!
      end
      hash['sounds'].each{|i| 
        json['board']['sound_urls'][i['id']] = i['url'] 
        json['board']['has_fallbacks'] = true if i['fallback']
      }
    end
    if args.key?(:permissions)
      trans = BoardContent.load_content(board, 'translations')
      json['board']['translations'] = trans if trans
      if json['shallow_clone']
        # Currently hiding this because if you click to go the original, there won't be a way back
        # json['board']['original'] = {
        #   'id' => board.global_id(true),
        #   'key' => board.key(true),
        # }
      # Lite skips find_copies_by (board.rb:620, a per-board query with a
      # board_content join and a limit-15 sort) and copies.count. This is
      # one of the heaviest per-descendant calls in the tree fan-out
      # (RCA 2026-05-24, issue #286).
      elsif !args[:as_lite]
        self.trace_execution_scoped(['json/board/copy_check']) do
          # TODO: if the user has access to a shallow clone, include that as the first result
          copies = board.find_copies_by(args[:permissions])
          copy = copies[0]
          copy = nil if copy && (!args[:permissions] || copy.user_id != args[:permissions].id)
          if copy
            json['board']['copy'] = {
              'id' => copy.global_id,
              'key' => copy.key
            }
          end
          json['board']['copies'] = copies.count
        end
      end
      # Lite skips the second parent_board association load (build_json
      # already skips the first). Both are unindexed per-board lookups.
      unless args[:as_lite]
        self.trace_execution_scoped(['json/board/parent_board_check']) do
          parent = board.parent_board
          if parent
            json['board']['original'] = {
              'id' => parent.global_id,
              'key' => parent.key
            }
          end
        end
      end
    end
    json
  end
end

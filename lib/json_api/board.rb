module JsonApi::Board
  extend ::NewRelic::Agent::MethodTracer
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
    json['buttons'] = board.buttons || []
    ['grid', 'intro', 'background'].each do |key|
      json[key] = BoardContent.load_content(board, key)
    end
    ['name', 'prefix', 'description', 'image_url', 'stars', 'forks', 'word_suggestions', 'locale', 'home_board', 'categories', 'dim_header', 'small_header'].each do |key|
      json[key] = board.settings[key]
    end
    json['sort_score'] = ((board.popularity || -1) + 1) * (board.any_upstream ? 1 : 2)

    list = [board.settings['locale'] || 'en']
    trans = (BoardContent.load_content(board, 'translations') || {})
    trans.each{|k, h| if h.is_a?(Hash); list += h.keys; end }
    json['translated_locales'] = list.select{|loc| !loc.blank? }.uniq
    json['style'] = board.settings['board_style'] if board.settings['board_style']
    if args[:locale]
      matching = list.detect{|l| l == args[:locale] }
      matching ||= list.detect{|l| l.split(/-|_/)[0] == args[:locale] }
      matching ||= list.detect{|l| l.split(/-|_/)[0] == args[:locale].split(/-|_/)[0] }
      if matching
        json['localized_name'] = (trans['board_name'] || {})[matching] || json['name']
        json['localized_locale'] = matching
        if !args[:permissions]
          json['buttons'].each do |button|
            btn_tran = trans[button['id'].to_s]
            if btn_tran && btn_tran[matching]
              button['label'] = btn_tran[matching]['label']
              button['vocalization'] = btn_tran[matching]['vocalization']
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
    self.trace_execution_scoped(['json/board/apps']) do
      json['buttons'].each do |button|
        if button['apps']
          button['apps'] = AppSearcher.update_apps(button['apps'])
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
    json['link'] = "#{JsonApi::Json.current_host}/#{board.key}"
    
    if args.key?(:permissions)
      self.trace_execution_scoped(['json/board/permissions']) do
        json['permissions'] = board.permissions_for(args[:permissions])
        json['starred'] = board.starred_by?(args[:permissions])
      end      
    end
    
    if json['permissions'] && json['permissions']['edit']
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
    if (json['permissions'] && json['permissions']['delete']) || (args[:permissions] && args[:permissions].allows?(args[:permissions], 'admin_support_actions'))
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
      hash['images'].each{|i| 
        json['board']['image_urls'][i['id']] = i['url'] 
        (i['alternates'] || []).each do |alternate|
          json['board']['image_urls']["#{i['id']}-#{alternate['library']}"] = alternate['url'] unless alternate['library'] == 'unknown'
        end
        json['board']['hc_image_ids'][i['id']] = true if i['hc']
        json['board']['has_fallbacks'] = true if i['fallback']
      }
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
      else
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
    json
  end
end

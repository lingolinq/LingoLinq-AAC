require_relative '../../../lib/method_tracer'

class Api::BoardsController < ApplicationController
  extend MethodTracer
  before_action :require_api_token, :except => [:user_index, :show, :simple_obf, :download, :index]
  # index: allowed unauthenticated for public board search (no user_id or user_id=cache). cache: requires auth (not in except list).

  def cache
    # Security: require_api_token ensures authentication for this action
    render json: { user: { id: 'cache' } }
  end

  def index
    boards = Board
    if defined?(Octopus)
      conn = (Octopus.config[Rails.env] || {}).keys.sample
      boards = boards.using(conn) if conn
    end
    qp = request.query_parameters
    cache_key = nil
    if qp.keys.sort == ['locale', 'q', 'sort']
      if (params['q'] || '') == '' && params['locale'] && params['sort']
        cache_key = "board/search/#{params['locale']}/#{params['sort']}"
      end
    end
    if params['sort'] == 'popularity' && params['q'].blank?
      params['sort'] = 'home_popularity'
    end
    if cache_key
      cached = RedisInit.default.get(cache_key)
      if cached.present?
        # Return cached value (real data or empty placeholder for stampede protection); render as body to avoid double-encoding
        return render(body: cached, content_type: 'application/json')
      else
        # Set empty placeholder so concurrent requests return it instead of all running the heavy query
        RedisInit.default.setex(cache_key, 5.minutes.to_i, {}.to_json)
      end
    end
    start = Time.now.to_i
    # `:parent_board` eager-load prevents the N+1 in `lib/json_api/board.rb`
    # where `build_json` unconditionally accesses `board.parent_board` for
    # every result. Without this include, a paginated index call fires one
    # extra SELECT per board (~25 at default per_page). Verified by the
    # regression spec in spec/controllers/api/boards_controller_spec.rb.
    # See docs/task-management/2026-05-27-boards-index-n-plus-one.md.
    # NOTE: id-only partial selects off this relation (the two
    # `.except(:includes)` sites below, ~line 173 and ~307) drop this
    # eager-load so the :parent_board preloader does not read an unselected
    # parent_board_id FK (LINGOLINQ-RAILS-J). If you ever switch this to a
    # `references`/`eager_load`-backed join, update those two sites too.
    boards = boards.includes(:board_content, :parent_board)
    other_boards = nil
    other_searchable_board_ids = nil

    Rails.logger.warn('checking key')
    self.class.trace_execution_scoped(['boards/key_check']) do
      if params['key']
        keys = [params['key']]
        if @api_user
          keys << "#{@api_user.user_name}/#{params['key']}"
        end
        boards = boards.where(:key => keys).limit(1)
      end
    end
    
    Rails.logger.warn('filtering by user')
    self.class.trace_execution_scoped(['boards/user_filter']) do
      user_id_param = params['user_id'] || params[:user_id]
      if user_id_param.present?
        # Special pseudo-user IDs for index: not a real user lookup; no permission check.
        if user_id_param.to_s == 'cache'
          params['public'] = true
        else
          # Real user lookup: resolve user and enforce existence + view_detailed permission.
          user = User.find_by_path(user_id_param)
          return unless exists?(user, user_id_param)
          return unless user && allowed?(user, 'view_detailed')
          unless params['starred'] || params['tag']
            if params['shared']
              Rails.logger.warn('looking up shared board ids')
              arel = Board.arel_table
              shared_board_ids = Board.all_shared_board_ids_for(user)
              # TODO: fix when sharding actually happens
              Rails.logger.warn('filtering by shared board ids')
              boards = boards.where(arel[:id].in(Board.local_ids(shared_board_ids)))
            elsif params['include_shared']
              arel = Board.arel_table
              Rails.logger.warn('looking up shared board ids 2')
              shared_board_ids = Board.all_shared_board_ids_for(user)
              # TODO: fix when sharding actually happens
              Rails.logger.warn('filtering by share board ids')
              boards = boards.where(arel[:user_id].eq(user.id).or(arel[:id].in(Board.local_ids(shared_board_ids))))
            else
              find_shallow_clones = false
              if !params['q'] && !params['locale'] && !params['public'] && !params['offset'] && user.allows?(@api_user, 'model')
                find_shallow_clones = true
              elsif params['q']
                find_shallow_clones = true
              end
              if find_shallow_clones
                shallow_clone_ids = []
                if user.settings['preferences'] && user.settings['preferences']['home_board'] && user.settings['preferences']['home_board']['id'].match(/-/)
                  # Include the home board if it's a shallow clone
                  shallow_clone_ids << user.settings['preferences']['home_board']['id']
                end
                if user.settings['preferences'] && (!user.settings['preferences']['home_board'] || user.settings['preferences']['sync_starred_boards'])
                  # Include any shallow clone roots that are in the user's starred list
                  shallow_clone_ids += user.starred_board_refs.select{|r| !r['suggested'] && r['key'] && r['key'].match(/^#{user.user_name}\/my:/) }.map{|c| c['id'] }
                end
                # Also include any shallow clone roots that have had a sub-board edited
                ue = UserExtra.find_by(user: user)
                if ue && ue.settings['replaced_roots']
                  ue.settings['replaced_roots'].each do |id, hash|
                    shallow_clone_ids << hash['id']
                  end
                end
                # Include in the results shallow clone roots that aren't currently owned by the user
                other_boards = Board.order('id DESC').find_all_by_global_id(shallow_clone_ids.uniq).select{|b| b.user_id != user.id } if shallow_clone_ids.length > 0
                if params['q'] && other_boards
                  other_searchable_board_ids = other_boards.map(&:global_id) + other_boards.map{|b| b.downstream_board_ids }.flatten.uniq
                  other_boards = nil
                end
              end
              boards = boards.where(:user_id => user.id)
            end
          end
          if !params['public']
            Rails.logger.warn('checking for supervision permission')
            return unless allowed?(user, 'model')
          end
          if params['private']
            Rails.logger.warn('checking for publicness')
            boards = boards.where(:public => false)
          end
          if params['starred'] || params['tag']
            Rails.logger.warn('filtering by user or public')
            ids = [user.id] + User.local_ids(user.supervised_user_ids)
            boards = boards.where(['user_id IN (?) OR public = ?',ids, true])
          end
          if params['starred']
            ids = (user.settings['starred_board_ids'] || [])
            Rails.logger.warn('filtering by starred board ids')
            boards = boards.where(:id => Board.local_ids(ids))
          end
          if params['tag']
            return unless allowed?(user, 'model')
            ids = []
            if user.user_extra
              ids = (user.user_extra.settings['board_tags'] || {})[params['tag']] || []
            end
            Rails.logger.warn('filtering by tagged board ids')
            boards = boards.where(:id => Board.local_ids(ids))
          end
        end
      else
        params['public'] = true
      end
    end
    
    Rails.logger.warn('public query')
    ranks = {}
    self.class.trace_execution_scoped(['boards/public_query']) do
      if !params['q'].blank? && params['public']
        Rails.logger.warn('public blank lookup')
        q = CGI.unescape(params['q']).downcase
        locs = BoardLocale
        if !params['locale'].blank? && params['locale'] != 'any'
          locs = locs.where(locale: [params['locale'], params['locale'].split(/-|_/)[0]])
        end
        if params['user_id']
          # `.except(:includes)`: `boards` carries `includes(:board_content,
          # :parent_board)` for the full serialization path below. A partial
          # `select('id, board_content_id')` omits `parent_board_id`, so the
          # preloader raises MissingAttributeError when it reads the
          # :parent_board foreign key off these records. We only want the ids
          # here, so drop the eager-load entirely (also avoids a wasted
          # preload over up to 500 discarded records). See LINGOLINQ-RAILS-J.
          board_ids = boards.except(:includes).select('id, board_content_id').limit(500).map(&:id)
          locs = locs.where(board_id: board_ids)
        end
        board_ids = []

        if params['sort'] == 'home_popularity'
          Rails.logger.warn('home_popularity search')
          locs.search_by_text_for_home_popularity(q).limit(100).with_pg_search_rank.each do |bl|
            board_ids << bl.board_id
            ranks[bl.board_id] = bl.pg_search_rank
          end
          # begin
          #   ActiveRecord::Base.connection.execute('set statement_timeout = 20000')
          #   # Do some long running queries
          # ensure
          #   # Always restore the statement_timeout to its initial value
          #   ActiveRecord::Base.connection.execute('set statement_timeout = 10000')
          # end          
        else
          Rails.logger.warn('popularity search')
          locs.search_by_text(q).limit(100).with_pg_search_rank.each do |bl|
            board_ids << bl.board_id
            ranks[bl.board_id] = 0 - (bl.pg_search_rank * (bl.popularity || 1))
          end
        end
        boards = boards.where(id: board_ids)
      end
    end
    if !params['locale'].blank? && params['locale'] != 'any' && (params['q'].blank? || !params['public'])
      if params['public']
        board_ids = []
        locs = BoardLocale.where(locale: [params['locale'], params['locale'].split(/-|_/)[0]])
        if params['sort'] == 'home_popularity'
          locs.order('home_popularity DESC, popularity DESC').limit(100).each_with_index do |bl, idx|
            board_ids << bl.board_id
            ranks[bl.board_id] = 100 - idx
          end
        else
          locs.order('popularity DESC, home_popularity DESC').limit(100).each_with_index do |bl, idx|
            board_ids << bl.board_id
            ranks[bl.board_id] = 100 - idx
          end
        end
        boards = boards.where(id: board_ids)
      else
        Rails.logger.warn('private locale search')
        lang = params['locale'].split(/-|_/)[0].downcase
        # board.search_string now includes locales, even on private boards
        # This filter should be applied for private searches (which wouldn't yet
        # have been filtered by locale) or for requests without a search query
        boards = boards.where(['search_string ILIKE ?', "%locale:#{ActiveRecord::Base.sanitize_sql_like(lang)}%"])
      end
    end

    Rails.logger.warn('public check')
    self.class.trace_execution_scoped(['boards/public_check']) do
      if params['public']
        boards = boards.where(:public => true)
      end
    end

    Rails.logger.warn('sort board')
    self.class.trace_execution_scoped(['boards/sort']) do
      if params['sort']
        if params['sort'] == 'popularity'
          boards = boards.order(popularity: :desc, home_popularity: :desc, id: :desc)
        elsif params['sort'] == 'home_popularity'
          if !params['user_id']
            boards = boards.where(['home_popularity > ?', 0]).order(home_popularity: :desc, id: :desc)
          else
            boards = boards.order(home_popularity: :desc, id: :desc)
          end
        elsif params['sort'] == 'custom_order'
          boards = boards[0, 100].sort_by { |b| (b.settings || {})['custom_order'] || b.id }
        end
      else
        boards = boards.order(popularity: :desc, any_upstream: :asc, id: :desc)
      end
    end
    
    Rails.logger.warn('starred filter')
    if params['exclude_starred']
      user = User.find_by_path(params['exclude_starred'])
      exclude_board_ids = []
      if user && user.settings['public']
        exclude_board_ids = user.settings['starred_board_ids'] || []
      end
      boards = boards.limit(100) if boards.respond_to?(:limit)
      boards = boards[0, 100].select{|b| !exclude_board_ids.include?(b.global_id) }
    end
    
    Rails.logger.warn('category filter')
    self.class.trace_execution_scoped(['boards/category']) do
      if params['category']
        boards = boards.limit(200) if boards.respond_to?(:limit)
        boards = boards[0, 200].select{|b| b.categories.include?(params['category']) }
      elsif params['copies'] == false || params['copies'] == 'false'
        if boards.respond_to?(:where)
          boards = boards.where('parent_board_id IS NULL')
        else
          boards = boards[0, 100].select{|b| !b.parent_board_id }[0, 100]
        end
        boards = boards.limit(100) if boards.respond_to?(:limit)
      end
    end

    if params['sort'] && params['sort'] != 'custom_order' && params['locale'] && params['locale'] != 'any'
      # All locale-defined lists should already have been filtered by locale
      # and search relevance, so we can safely trim to the top results here
      boards = boards.limit(50) if boards.respond_to?(:limit)
      # TODO: this was maybe too demanding on memory
      # boards = Board.sort_for_locale(boards[0, 50], params['locale'], params['sort'], ranks)
    end

    # Private boards don't have search_string set as a column to protect against 
    # leakage of private information. This iterative method is slower than a db clause
    # so we limit the possible result set to be more performant, which will only
    # be an issue for search users with very many boards (still problematic, I know)
    Rails.logger.warn('private query')
    progress = nil
    self.class.trace_execution_scoped(['boards/private_query']) do
      if params['root']
#        boards = boards.select{|b| !b.settings['copy_id'] || b.settings['copy_id'] == b.global_id }
        boards = boards.where(['search_string ILIKE ?', "%root%"])
      end

      if !params['q'].blank? && !params['public']
        limited_boards = boards
        if params['allow_job'] #&& boards.limit(26).select('id').length > 25
          # `.except(:includes)`: see the note above. The partial select omits
          # `parent_board_id`, which the `includes(:parent_board)` preloader
          # needs, so loading these records raised MissingAttributeError and
          # 500'd the request (LINGOLINQ-RAILS-J). We only need the global_ids
          # to hand off to the background long_query job.
          progress = Progress.schedule(Board, :long_query, params['q'], params['locale'], boards.except(:includes).select('id, board_content_id').map(&:global_id) + (other_searchable_board_ids || []), for_user: @api_user)
          boards = []
        else
          # For private user searches this will limit to the user's first 25 boards
          # since no search has been performed yet, so it will most likely
          # not be useful
          limited_boards = limited_boards.limit(15) if limited_boards.respond_to?(:limit)
          limited_boards = limited_boards[0, 15]
          boards = limited_boards
          # TODO: this was maybe too demanding on memory
          boards = Board.sort_for_query(limited_boards, params['q'], params['locale'], 0, 25)
        end
      end
    end
    
    json = nil
    Rails.logger.warn('start paginated result')
    self.class.trace_execution_scoped(['boards/json_paginate']) do
      json = JsonApi::Board.paginate(params, boards, {locale: params['locale'], extra_results: other_boards})
      json[:meta] ||= {}
      json[:meta]['progress'] = JsonApi::Progress.as_json(progress) if progress
    end
    # Always set meta for consistent structure; uncached = true only for this fresh response
    json[:meta] ||= {}
    json[:meta]['uncached'] = true
    if cache_key
      # Cache a copy without uncached so cached responses don't incorrectly claim to be uncached
      json_for_cache = json.deep_dup
      json_for_cache[:meta] = (json_for_cache[:meta] || {}).dup
      json_for_cache[:meta].delete('uncached')
      RedisInit.default.setex(cache_key, 12.hours.to_i, json_for_cache.to_json)
    end

    if (Time.now.to_i - start) > 5
      Rails.logger.warn('extra-long-index')
    end

    render json: json
  end
  
  def show
    Rails.logger.warn('looking up board')
    board = nil
    ApplicationRecord.using(:master) do
      # Followers can get behind, resulting in outdated info being
      # sent back to the user, or used for background jobs :-/
      board = Board.find_by_possibly_old_path(params['id'])
    end
    if !board
      deleted_board = DeletedBoard.find_by_path(params['id'])
      # TODO: Sharding
      deleted_board ||= DeletedBoard.find_by(:id => (Board.local_ids([params['id']])[0] || 0))
      user = deleted_board && deleted_board.user
      res = {error: "Record not found"}
      res[:id] = params['id']
      if deleted_board && user && user.allows?(@api_user, 'view_deleted_boards')
        res[:deleted] = true
        res[:key] = deleted_board.key
        return api_error 404, res
      elsif params['id'].match(/\//)
        user = User.find_by_path(params['id'].split(/\//)[0])
        if user && user.allows?(@api_user, 'view_deleted_boards')
          res[:never_existed] = true
          return api_error 404, res
        end
      end
      return unless exists?(board)
    end
    allowed = false
    Rails.logger.warn('checking permission')
    self.class.trace_execution_scoped(['boards/board/permission_check']) do
      allowed = allowed?(board, 'view')
    end
    return unless allowed
    json = {}
    Rails.logger.warn('rendering json')
    self.class.trace_execution_scoped(['boards/board/json_render']) do
      board.track_usage!
      json = JsonApi::Board.as_json(board, :wrapper => true, :permissions => @api_user, :skip_subs => true)
    end
    Rails.logger.warn('rails render')
    render json: json.to_json
    Rails.logger.warn('done with controller')
  end

  # One-shot tree fetch: returns the root board AND every reachable
  # descendant in a single response. The frontend uses this for the
  # initial board entry so the whole sub-tree lands in cache in one
  # round-trip — every subsequent folder tap inside that tree is then
  # served synchronously from cache, no network, no overlay flash.
  #
  # Leans on `Board#downstream_board_ids` (already precomputed and
  # stored in settings by `upstream_downstream#track_downstream_boards!`)
  # so we don't have to walk the tree at request time. One bulk
  # `Board.find_all_by_global_id` resolves every descendant in one
  # query. Each board's JSON is serialized via the same
  # `JsonApi::Board.as_json` path the `show` action uses, so the
  # client treats responses identically.
  #
  # Capped at MAX_TREE descendants for safety — a healthy AAC vocab
  # tree is well under that ceiling; extremely large trees fall back
  # to the depth-1 prefetch on the client.
  #
  # root_only=1 skips descendant load/serialize so speak-mode can paint
  # the visible board first, then call /tree again (without root_only)
  # in the background to warm folder targets. Same lite root JSON either way.
  MAX_TREE = 500
  def tree
    # Member route is GET /api/v1/boards/:board_id/tree, so Rails supplies
    # params['board_id'] (NOT params['id']). Reading 'id' here made every
    # /tree request resolve to a nil board -> 404 "Record not found",
    # silently disabling the instant-cache prefetch. Accept both.
    board_path = params['board_id'] || params['id']
    root = nil
    ApplicationRecord.using(:master) do
      root = Board.find_by_possibly_old_path(board_path)
    end
    return unless exists?(root)
    return unless allowed?(root, 'view')

    root_only = params['root_only'].to_s =~ /^(1|true|yes)$/i
    descendants = []
    unless root_only
      descendant_ids = ((root.settings || {})['downstream_board_ids'] || []).first(MAX_TREE)
      if descendant_ids.any?
        ApplicationRecord.using(:master) do
          descendants = Board.find_all_by_global_id(descendant_ids)
        end
        # Permission filter. Use the Permissable model method `allows?`
        # directly — NOT the controller's `allowed?`, which renders an
        # error response as a side effect (it's designed for single-
        # resource gates, not list filtering). `scopes` mirrors what
        # `allowed?` computes internally via `api_permission_scopes`.
        scopes = api_permission_scopes
        descendants = descendants.select { |b| b && b.allows?(@api_user, 'view', scopes) }
      end
    end

    # as_lite drops the per-board N+1 enrichment (parent_board, find_copies_by,
    # shared_users, per-image ButtonImage lookups) that made this endpoint
    # Rack::Timeout under MAX_TREE fan-out. See RCA 2026-05-24, issue #286.
    # Gated by a deploy-free kill-switch (see lite_board_serialization?).
    lite = lite_board_serialization?
    root_json = JsonApi::Board.as_json(root, wrapper: true, permissions: @api_user, skip_subs: true, as_lite: lite)
    descendants_json = descendants.map do |b|
      JsonApi::Board.as_json(b, wrapper: true, permissions: @api_user, skip_subs: true, as_lite: lite)
    end
    render json: { root: root_json, descendants: descendants_json }
  end

  # Kill-switch for the #tree / #bulk lite serialization (RCA 2026-05-24,
  # issue #286). Lite is ON by default. Ops can revert to the full as_json
  # path WITHOUT a deploy by writing the Setting from a console:
  #   Setting.set('tree_lite_serialization', 'false')
  # and re-enable with any other value (or by deleting the Setting). The
  # Setting.set call busts the Redis cache, so the flip takes effect on the
  # next request. The unset (default-on) path is one cached lookup, O(1) per
  # request, negligible next to the per-board fan-out this removes.
  def lite_board_serialization?
    Setting.get_cached('tree_lite_serialization') != 'false'
  end
  private :lite_board_serialization?

  # Bulk-resolve a list of board keys/ids in one request. The frontend
  # uses this to pre-warm the boardDetailCache for a board's reachable
  # sub-tree on initial entry — one round-trip per BFS layer instead of
  # one per board. Permission-filtered: a board the caller can't view
  # is silently dropped from the response (the client just won't have a
  # cache entry and will fall back to the per-board endpoint if they
  # navigate to it later, where the standard auth error path applies).
  #
  # Capped at MAX_BULK to prevent abuse / runaway memory; typical AAC
  # vocab trees fit comfortably under that ceiling.
  MAX_BULK = 200
  def bulk
    raw_keys = params[:keys]
    raw_keys = [raw_keys] unless raw_keys.is_a?(Array)
    keys = raw_keys.map { |k| k.to_s.strip }.reject(&:blank?).uniq.first(MAX_BULK)
    return render(json: { boards: [] }) if keys.empty?

    boards = []
    ApplicationRecord.using(:master) do
      # find_by_path accepts both global IDs ("1_123") and key paths
      # ("user_name/board"), matching the single-board endpoint.
      boards = keys.map { |k| Board.find_by_path(k) }.compact
    end

    # Permission filter via the Permissable model method `allows?`
    # (NOT the controller's `allowed?`, which renders an error
    # response as a side effect). Denied boards are silently dropped.
    scopes = api_permission_scopes
    visible = boards.select { |b| b && b.allows?(@api_user, 'view', scopes) }

    # Same lite serialization as #tree: this is a prefetch warm, not a
    # navigation, so skip the per-board N+1 enrichment (RCA 2026-05-24,
    # issue #286). Same deploy-free kill-switch as #tree.
    lite = lite_board_serialization?
    out = visible.map do |board|
      JsonApi::Board.as_json(board, wrapper: true, permissions: @api_user, skip_subs: true, as_lite: lite)
    end
    render json: { boards: out }
  end

  def from_html
    permitted = params.permit(:html, :name, :key, :locale)
    html = permitted[:html].to_s
    return api_error(400, { error: 'html required' }) if html.blank?

    board_opts = {
      name: permitted[:name].presence || 'Imported Board',
      key: permitted[:key].presence,
      locale: permitted[:locale].presence || 'en'
    }.compact

    board = Converters::HtmlBoard.create_from_html(html, @api_user, board_opts)
    if board && !board.errored?
      render json: JsonApi::Board.as_json(board, wrapper: true, permissions: @api_user)
    else
      api_error(400, {
        error: 'board creation failed',
        errors: board&.processing_errors
      })
    end
  end

  def from_json_bundle
    unless FeatureFlags.feature_enabled_for?('paste_html_import', @api_user)
      return api_error(403, { error: 'Feature not available' })
    end

    if params['url']
      raw_url = params['url'].to_s
      return api_error(400, { error: 'url required' }) if raw_url.blank?

      url = Uploader.sanitize_url(raw_url)
      return api_error(400, { error: 'invalid URL' }) unless url.present?
      unless Uploader.valid_import_bundle_url?(url, @api_user.global_id)
        return api_error(400, { error: 'invalid import bundle URL' })
      end

      extra = {}
      raw = params['recipient_global_ids'] || params.dig('board', 'recipient_global_ids')
      if raw.present?
        extra['recipient_global_ids'] = raw.is_a?(Array) ? raw : raw.to_s.split(/,/).map(&:strip).reject(&:blank?)
      end

      progress = Progress.schedule(Board, :import_json_bundle, @api_user.global_id, url, extra, for_user: @api_user)
      render json: JsonApi::Progress.as_json(progress, wrapper: true).to_json
    else
      remote_path = "imports/boards/#{@api_user.global_id}/bundle-#{GoSecure.nonce('filename')}.json"
      upload_params = Uploader.remote_upload_params(remote_path, 'application/json')
      url = upload_params[:upload_url] + remote_path
      upload_params[:success_url] = "/api/v1/boards/from_json_bundle?url=#{CGI.escape(url)}"
      render json: { 'remote_upload' => upload_params }.to_json
    end
  end

  def generate_labels
    # Gate on the AI-specific check so an org-level AI opt-out (disable_ai_features) is
    # enforced at the endpoint and returns a clean 403, instead of passing the plain flag
    # check here and being rejected deeper in the generator as a 503.
    unless FeatureFlags.ai_feature_enabled_for?('ai_board_generation', @api_user)
      return api_error(403, { error: 'Feature not available' })
    end
    # EU AI Act Article 50(1) server-side backstop (Phase 3 Plan 03-04, T-03-04-01;
    # shared helper LL-6723438462): a client that skips the ai-disclosure modal and
    # calls this endpoint directly must still be refused. The feature-flag check
    # inside the helper is load-bearing (T-03-04-02). NOTE: 'article_50_disclosure'
    # is registered AVAILABLE-only in lib/feature_flags.rb, but that describes CODE,
    # not production. Production serves it from the default_enabled_features DB
    # Setting, which overrides the code constant, and a direct read on 2026-08-23
    # found the flag ENABLED for all 34 then-existing accounts. So this guard is
    # LIVE in production, not inert. An earlier version of this comment said it was
    # "inert until the flag is enabled"; that was true of the code and false of the
    # running system. See docs/legal/2026-08-23_article-50-production-flag-verification.md
    # and application_controller.rb#article_50_disclosure_missing? for the same note.
    return unless require_article_50_disclosure!

    processed_params, json_body_source = board_json_body_params_source
    if json_body_source == :invalid_json_root
      return api_error(400, { error: 'JSON body must be an object' })
    end
    prompt = (processed_params['prompt'] || '').to_s.strip
    return api_error(400, { error: 'prompt required' }) if prompt.blank?

    rows = (processed_params['rows'] || 2).to_i
    columns = (processed_params['columns'] || 4).to_i
    rows = [[1, rows].max, 20].min
    columns = [[1, columns].max, 20].min

    cell_count = rows * columns
    locale_param = processed_params['locale'].presence || 'en'
    include_core_words = processed_params['include_core_words'] != false && processed_params['include_core_words'] != 'false'
    result = AiBoardGenerator.generate_words(
      prompt: prompt,
      rows: rows,
      columns: columns,
      locale: locale_param,
      include_core_words: include_core_words,
      user: @api_user
    )
    if result[:error]
      err_payload = { error: result[:error] }
      if Rails.env.development?
        err_payload[:error_detail] = result[:error_detail] if result[:error_detail].present?
        err_payload[:error_kind] = result[:error_kind] if result[:error_kind].present?
      end
      return api_error(503, err_payload)
    end
    words = result[:words]
    return api_error(400, { error: 'Could not generate words' }) if words.blank?
    labels_str = words.first(cell_count).join(', ')
    response = { labels: labels_str }
    ai_name = result[:name].to_s.strip
    response[:name] = if ai_name.present? && !name_looks_truncated?(ai_name)
      ai_name
    else
      fallback_board_name(prompt)
    end
    response[:description] = result[:description].presence || prompt
    # EU AI Act Article 50(2): surface the signed AI-generated marker on the
    # generation response (unconditional; not flag-gated). NOTE: durable persistence
    # of this marker onto board.settings at save time, and its propagation through
    # relinking copy_for, are NOT yet implemented -- they are the follow-up
    # persistence slice. Until then the marker exists only on this transient
    # response, so saved/exported/shared boards are not yet marked. The Art. 50
    # register entry stays OPEN until persistence lands.
    response[:ai_generated] = result[:ai_generated] if result[:ai_generated]
    render json: response
  end

  def create
    @board_user = @api_user
    processed_params, json_body_source = board_json_body_params_source
    if json_body_source == :invalid_json_root
      return api_error(400, { error: 'JSON body must be an object' })
    end
    is_json_request = json_body_source == :json_hash
    # Use a single source for board params: parsed JSON body for JSON requests, params otherwise.
    # JSON-parsed params are plain hashes; Rails params need permit! since models do their own filtering.
    board_params = if is_json_request
      processed_params['board'] || {}
    else
      raw_board = params['board']
      if raw_board.is_a?(ActionController::Parameters)
        raw_board.permit!.to_unsafe_h
      elsif raw_board.is_a?(Hash)
        raw_board
      else
        {}
      end
    end
    if board_params['for_user_id'] && board_params['for_user_id'] != 'self'
      user = User.find_by_path(board_params['for_user_id'])
      if !user
        # User doesn't exist (might be deleted) - return error instead of silently defaulting
        return api_error(400, {error: "User not found", for_user_id: board_params['for_user_id']})
      end
      # A supervise-only supervisor may COPY a board for a communicatee — that is
      # how the board-picker home-board flow works (models/board.js create_copy
      # posts create with parent_board_id + for_user_id) — but may NOT author a
      # brand-new board owned by them. Keyed on parent_board_id because that is
      # exactly what separates the two; without it the allowance would cover any
      # board, any time, which is far broader than the picker needs.
      #
      # `allows?` is the PURE predicate. `allowed?` renders a 400 as a side
      # effect before returning false, so an `allowed?(a) || allowed?(b)` chain
      # renders on the first failure whatever the second says — which then
      # double-renders (500) both when the second check passes and when it
      # doesn't. Exactly one `allowed?` call may appear in this expression.
      #
      # Pass scopes explicitly: a bare `allows?` falls back to the RAW
      # user.permission_scopes (permissable.rb:72), skipping the normalization
      # api_permission_scopes does — blank (integration / dev-key devices) and a
      # legacy lone '*' both become 'full', and without that neither intersects
      # the 'full' supervision rules require, denying legitimate supervisors.
      supervise_copy = board_params['parent_board_id'].present? &&
                       user.allows?(@api_user, 'supervise', api_permission_scopes)
      return unless supervise_copy || allowed?(user, 'edit')
      @board_user = user
    end
    if FeatureFlags.feature_enabled_for?('english_first_board_generation', @api_user)
      locale = board_params['locale'].to_s
      translations = board_params['translations']
      if locale.present? && !locale.match?(/^en/i) && translations.blank?
        board_params['locale'] = 'en'
      end
    end
    opts = {:user => @board_user, :author => @api_user, :key => board_params['key']}
    if board_params['parent_board_id']
      pb = Board.find_by_path(board_params['parent_board_id'])
      if pb && pb.copyable_if_authorized?(@api_user)
        opts[:allow_copying_protected_boards] = true
      end
    end
    begin
      board = Board.process_new(board_params, opts)
    rescue ActiveRecord::RecordNotUnique
      return api_error(400, {error: 'board key already in use'})
    end
    if board.errored? || !board.persisted?
      errors = board&.processing_errors
      errors ||= board&.errors&.full_messages if board && errors.blank?
      return api_error(400, {error: "board creation failed", errors: errors})
    else
      render json: JsonApi::Board.as_json(board, :wrapper => true, :permissions => @api_user)
    end
  end

  def rollback
    board_id = nil
    board = Board.find_by_path(params['board_id'])
    deleted_board = DeletedBoard.find_by_path(params['board_id'])
    return unless exists?(board || deleted_board, params['board_id'])
    allowed = @api_user.allows?(@api_user, 'admin_support_actions')
    date = Date.parse(params['date']) rescue nil
    return api_error 400, {error: 'invalid date'} unless date
    return api_error 400, {error: 'only 6 months history allowed'} unless date > 6.months.ago
    revert_date = nil
    restored = false
    if board
      return unless allowed || allowed?(board, 'edit')
    elsif deleted_board && deleted_board.user
      return unless allowed || allowed?(deleted_board.user, 'view_deleted_boards')
      revert_date = deleted_board.updated_at
      board = deleted_board.restore! rescue nil
      restored = true if board
    end
    if board
      revert_date = board.rollback_to(date)
    end
    render json: {board_id: board ? board.global_id : nil, key: board ? board.key : nil, restored: restored, reverted: revert_date.iso8601}
  end
  
  def share_response
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board)
    return unless allowed?(board, 'view')
    approve = !!(params['approve'] == 'true' || params['approve'] == true || params['approve'] == 1 || params['approve'] == '1')
    if board.update_shares_for(@api_user, approve)
      render json: {updated: true, approved: approve}.to_json
    else
      api_error(400, {error: "board share update failed"})
    end
  end
  
  def copies
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board)
    return unless allowed?(board, 'view')
    boards = board.find_copies_by(@api_user)
    render json: JsonApi::Board.paginate(params, boards)
  end
  
  def update
    board = Board.find_by_path(params['id'])
    if !board
      deleted_board = DeletedBoard.find_by_path(params['id'])
      deleted_board ||= DeletedBoard.find_by_path((params['board'] || {})['key'])
      if deleted_board && params['board'] && deleted_board.key == params['board']['key']
        # TODO: it should be allowable to restore a deleted board that has a different 
        # key, it should just use a different key instead
        user_name = deleted_board.key && deleted_board.key.split(/\//)[0]
        user = User.find_by_path(user_name)
        return unless allowed?(user, 'supervise')
        return allowed?(user, 'never_allow') if deleted_board.board
        board = Board.new
        board.id = deleted_board.board_id
        board.user = user
        board.key = deleted_board.key
        new_key = board.generate_unique_key(deleted_board.key)
        if new_key != board.key
          board.rename_to(new_key)
        end
        board.settings = {}
        board.settings['undeleted'] = true
        board.save
      end
    end    
    return unless exists?(board, params['id'])
    return unless allowed?(board, 'edit')
    processed_params, json_body_source = board_json_body_params_source
    if json_body_source == :invalid_json_root
      return api_error(400, { error: 'JSON body must be an object' })
    end
    res = false
    if processed_params['button']
      button_data = processed_params['button'].is_a?(ActionController::Parameters) ? processed_params['button'].permit! : processed_params['button']
      res = board.process_button(button_data)
    else
      board_data = processed_params['board']
      board_data = board_data.permit! if board_data.is_a?(ActionController::Parameters)
      version_date = Date.parse(request.headers['X-LingoLinq-Version']) rescue nil
      add_voc_error = version_date && version_date < Date.parse('August 3, 2021')
      new_board = board.process(board_data, {:allow_clone => true, :user => @api_user, :updater => @api_user, add_voc_error: add_voc_error})
      board = new_board if new_board.is_a?(Board)
      res = !!new_board
    end
    if res
      render json: JsonApi::Board.as_json(board, :wrapper => true, :permissions => @api_user).to_json
    else
      api_error(400, {error: "board update failed", errors: board && board.processing_errors})
    end
  end
  
  def history
    board_id = nil
    board = Board.find_by_path(params['board_id'])
    deleted_board = DeletedBoard.find_by_path(params['board_id'])
    return unless exists?(board || deleted_board)
    allowed = @api_user.allows?(@api_user, 'admin_support_actions')
    if board
      return unless allowed || allowed?(board, 'edit')
      board_id = board.global_id
    elsif deleted_board && deleted_board.user
      return unless allowed || allowed?(deleted_board.user, 'view_deleted_boards')
      board_id = deleted_board.board_global_id
    end
    return unless exists?(board_id)
    versions = Board.user_versions(board_id)
    render json: JsonApi::BoardVersion.paginate(params, versions, {:admin => Organization.admin_manager?(@api_user)})
  end
  
  def rename
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board)
    return unless allowed?(board, 'edit')
    if params['new_key'] && params['old_key'] == board.key && board.rename_to(params['new_key'])
      un, ky = params['new_key'].split(/\//, 2)
      key = "#{un}/#{Board.clean_path(ky)}"
      render json: {rename: true, key: key}.to_json
    else
      api_error(400, {error: "board rename failed", key: params['key'], collision: board.collision_error?})
    end
  end
  
  def unlink
    board = Board.find_by_path(params['board_id'])
    user = User.find_by_path(params['user_id'])
    type = params['type']
    return unless exists?(board)
    return unless allowed?(user, 'edit')
    if type == 'delete'
      return unless allowed?(board, 'delete')
      board.destroy
    elsif type == 'unstar'
      board.star!(user, false)
    elsif type == 'unlink'
      board.unshare_with(user)
    elsif type == 'untag'
      extra = user.reload.user_extra
      extra.tag_board(board, params['tag'], true, false) if extra
    else
      return api_error(400, {error: "unrecognized type"})
    end
    render json: {removed: true, type: type}.to_json
  end
  
  def star
    star_or_unstar(true)
  end

  def slice_locales
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'edit')
    progress = Progress.schedule(board, :slice_locales, params['locales'], params['ids_to_update'], (@api_user && @api_user.global_id), for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
  end

  def tag
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'view')
    extra = UserExtra.find_or_create_by(user: @api_user)
    res = extra.tag_board(board, params['tag'], params['remove'], params['downstream'])
    board_tag_map = (extra.settings['board_tags'] || {}).transform_values { |v| v || [] }
    render json: {tagged: !!res, board_tags: res, board_tag_map: board_tag_map}
  end
  
  def unstar
    star_or_unstar(false)
  end
  
  def stats
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'view')
    render json: Stats.board_use(board.global_id, {}).to_json
  end

  def simple_obf
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'view')
    file = Tempfile.new(["board-#{board.global_id}", '.obf'])
    path = file.path
    file.close
    json = Converters::LingoLinq.to_external(board, {'simple' => true})
    OBF::External.to_obf(json, path, nil, {image_urls: true, sound_urls: true})
    send_data File.read(path), :type => 'application/obf', :disposition => 'attachment', :filename => "board-#{board.global_id}.obf"
  end
  
  def destroy
    board = Board.find_by_path(params['id'])
    return unless exists?(board)
    if board.instance_variable_get('@sub_id')
      return unless allowed?(board, 'edit')
      # Unstar and ensure it's not in replaced roots list (it shouldn't be)
      board.star!(board.instance_variable_get('@sub_global'), false)
      ue = UserExtra.find_by(user: board.instance_variable_get('@sub_global'))
      if ue && ue.settings['replaced_roots']
        ue.settings['replaced_roots'].delete(board.global_id(true))
        ue.save
      end
    else
      return unless allowed?(board, 'delete')
      if board.shallow_source
        ue = UserExtra.find_by(user: board.user)
        if ue && ue.settings['replaced_roots']
          ue.settings['replaced_roots'].delete(board.global_id(true))
          ue.save
        end
      end
      board.destroy
    end
    render json: JsonApi::Board.as_json(board, :wrapper => true).to_json
  end
  
  def download
    board = Board.find_by_path(params['id'] || params['board_id'])
    return unless exists?(board)
    return unless allowed?(board, 'view')
    progress = Progress.schedule(board, :generate_download, (@api_user && @api_user.global_id), params['type'], {
      'include' => params['include'],
      'headerless' => params['headerless'] == '1',
      'text_on_top' => params['text_on_top'] == '1',
      'transparent_background' => params['transparent_background'] == '1',
      'symbol_background' => params['symbol_background'],
      'text_only' => params['text_only'] == '1',
      'text_case' => params['text_case'],
      'font' => params['font']
    }, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
  end
  
  def import
    if params['url']
      extra = {}
      raw = params['recipient_global_ids'] || params.dig('board', 'recipient_global_ids')
      if raw.present?
        extra['recipient_global_ids'] = raw.is_a?(Array) ? raw : raw.to_s.split(/,/).map(&:strip).reject(&:blank?)
      end
      progress = Progress.schedule(Board, :import, @api_user.global_id, params['url'], extra, for_user: @api_user)
      render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
    else
      type = (params['type'] == 'obz' ? 'obz' : 'obf')
      remote_path = "imports/boards/#{@api_user.global_id}/upload-#{GoSecure.nonce('filename')}.#{type}"
      content_type = "application/#{type}"
      params = Uploader.remote_upload_params(remote_path, content_type)
      url = params[:upload_url] + remote_path
      params[:success_url] = "/api/v1/boards/imports?type=#{type}&url=#{CGI.escape(url)}"
      render json: {'remote_upload' => params}.to_json
    end
  end
  
  def translate
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'edit')
    ids = params['board_ids_to_translate'] || []
    ids << board.global_id
    translations = params['translations']
    translations = translations.permit! if translations.is_a?(ActionController::Parameters)
    translations = translations.to_unsafe_h if translations.respond_to?(:to_unsafe_h)
    set_as_default = true
    set_as_default = false if params['set_as_default'] == false || params['set_as_default'] == 'false' || params['set_as_default'] == 0 || params['set_as_default'] == '0'
    # When the client opts in via `force_update_default`, the server
    # applies the new labels to the visible button text even when
    # source_lang == destination_lang. The default behavior (off)
    # leaves `set_as_default_here` falsy in same-locale re-translation
    # so existing labels are preserved; the flag is set by the
    # Re-Translate path in translation-select.js where the user has
    # explicitly chosen to overwrite.
    force_update_default = params['force_update_default'] == '1' || params['force_update_default'] == 'true' || params['force_update_default'] == true || params['force_update_default'] == 1
    progress = Progress.schedule(board, :translate_set, translations, {
      'source' => params['source_lang'],
      'dest' => params['destination_lang'],
      'allow_fallbacks' => params['fallbacks'] == '1' || params['fallbacks'] == 'true' || params['fallbacks'] == true || params['fallbacks'] == 1,
      'force_update_default' => force_update_default,
      'board_ids' => ids,
      'default' => set_as_default,
      'user_key' => user_for_paper_trail
    }, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
  end

  def swap_images
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'edit')
    ids = params['board_ids_to_convert'] || []
    ids << board.global_id
    ids << "new:#{board.global_id}" if params['include_new']
    progress = Progress.schedule(board, :swap_images, params['library'], @api_user.global_id, ids, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
  end

  def update_privacy
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'edit')
    ids = params['board_ids_to_update'] || []
    ids << board.global_id
    progress = Progress.schedule(board, :update_privacy, params['privacy'], @api_user.global_id, ids, for_user: @api_user)
    render json: JsonApi::Progress.as_json(progress, :wrapper => true).to_json
  end

  private

  # Re-parse JSON from raw_post for application/json because Rails drops nil entries in arrays
  # (e.g. grid.order). On JSON::ParserError, fall back to params (same as before). On valid JSON
  # whose root is not an object, returns :invalid_json_root so callers can respond with 400.
  def board_json_body_params_source
    unless request.media_type == 'application/json'
      return params, :rails_params
    end
    begin
      parsed = JSON.parse(request.raw_post)
    rescue JSON::ParserError
      return params, :rails_params
    end
    return parsed, :json_hash if parsed.is_a?(Hash)

    [nil, :invalid_json_root]
  end

  protected
  
  def star_or_unstar(star)
    board = Board.find_by_path(params['board_id'])
    return unless exists?(board, params['board_id'])
    return unless allowed?(board, 'view')
    return unless exists?(@api_user)
    board.star!(@api_user, star)
    render json: {starred: board.starred_by?(@api_user), user_id: @api_user.global_id, stars: board.stars}.to_json
  end

  TRUNCATED_NAME_ENDINGS = %w[the a an to for with and or of in on].freeze

  def name_looks_truncated?(name)
    return true if name.blank?
    return true if name.split(/\s+/).size > 6
    last_word = name.split(/\s+/).last&.downcase
    TRUNCATED_NAME_ENDINGS.include?(last_word)
  end

  def fallback_board_name(prompt)
    return 'AI Generated Board' if prompt.blank?
    words = prompt.split(/\s+/).reject(&:blank?).first(6)
    name = words.join(' ')
    name = name[0, 50] + '…' if name.length > 50
    name.presence || 'AI Generated Board'
  end

end

import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import i18n from '../../utils/i18n';
import speecher from '../../utils/speecher';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';
import persistence from '../../utils/persistence';
import capabilities from '../../utils/capabilities';
import boardDetailCache from '../../utils/board_detail_cache';
import boardCacheDiag from '../../utils/board_cache_diag';

export default Route.extend({
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),

  // One-shot promise so concurrent board-detail entries share a single prime.
  _prime_caches_promise: null,

  // Load offline url_cache from IndexedDB/filesystem before building buttons
  // so _make_btn can resolve local image URLs (mirrors legacy fast_html).
  _maybe_prime_caches: function() {
    var persistenceSvc = this.persistence;
    if(!persistenceSvc || persistenceSvc.get('primed')) {
      return RSVP.resolve();
    }
    if(!this.stashes || !this.stashes.get('auth_settings')) {
      return RSVP.resolve();
    }
    if(this._prime_caches_promise) {
      return this._prime_caches_promise;
    }
    var ensure_local = RSVP.resolve();
    var local = persistenceSvc.get('local_system');
    if(!local || local.available === undefined) {
      ensure_local = capabilities.storage.status().then(function(res) {
        if(res.available && !res.requires_confirmation) {
          res.allowed = true;
        }
        persistenceSvc.set('local_system', res);
      }, function() {
        return RSVP.resolve();
      });
    }
    var route = this;
    var clearPrimePromiseIfUnprimed = function() {
      if(!persistenceSvc.get('primed')) {
        route._prime_caches_promise = null;
      }
    };
    this._prime_caches_promise = ensure_local.then(function() {
      var localAfter = persistenceSvc.get('local_system');
      if(!localAfter || !localAfter.available || !localAfter.allowed) {
        return RSVP.resolve();
      }
      return persistenceSvc.prime_caches(true).then(null, function() {
        return RSVP.resolve();
      });
    }).then(clearPrimePromiseIfUnprimed, clearPrimePromiseIfUnprimed);
    return this._prime_caches_promise;
  },

  // Build the symbol grid, warm current-board images, prefetch linked boards.
  _finalize_board_display: function(controller, raw) {
    if(!raw || !controller || controller.isDestroyed || controller.isDestroying) { return; }
    if(raw.images && raw.images.length) {
      controller._board_detail_images = raw.images;
    }
    controller._build_from_raw(raw);
    if(controller.get('edit_mode')) { return; }
    var warm_opts = {
      skin: controller.get('app_state.referenced_user.preferences.skin'),
      preferred_symbols: controller.get('app_state.referenced_user.preferences.preferred_symbols')
    };
    // Current board first, then batched image warm for every cached child
    // (folder / load_board targets), then fetch JSON for any missing children.
    runLater(function() {
      if(controller.isDestroyed || controller.isDestroying || controller.get('edit_mode')) { return; }
      var warm_started = Date.now();
      boardCacheDiag.mark('warm_images:start', { key: raw && raw.key });
      boardDetailCache.warm_images(raw, warm_opts);
      boardCacheDiag.mark('warm_images:dispatched', {
        key: raw && raw.key,
        ms: Date.now() - warm_started
      });
    }, 100);
    runLater(function() {
      if(controller.isDestroyed || controller.isDestroying || controller.get('edit_mode')) { return; }
      boardDetailCache.prefetch_linked(raw, warm_opts);
    }, 500);
  },

  model: function(params) {
    var _this = this;
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('board_detail', "Board Detail"));
    var board_key = user.get('user_name') + '/' + params.boardname;
    boardCacheDiag.mark('model:start', { board_key: board_key });

    // Cache-first: try the in-memory raw cache + Ember Data identity map
    // before hitting the network. Mirrors the cache-first pattern in
    // routes/user/board-alt.js. We keep our own raw-JSON cache because
    // _build_from_raw needs the raw response shape (Ember Data hydration
    // is bypassed for speed on the plain-object render path).
    var cached_raw = boardDetailCache.get(board_key);
    var cached_record = null;
    if (cached_raw) {
      cached_record = this.store.peekAll('board').find(function(b) {
        if (!b) { return false; }
        return b.get('key') === board_key;
      });
    }
    if (cached_raw && cached_record && !cached_record.get('should_reload')) {
      // Deep-clone so downstream consumers (normalize, _build_from_raw)
      // can mutate without poisoning the cached copy.
      var cached_copy = JSON.parse(JSON.stringify(cached_raw));
      _this.set('_raw_board_data', cached_copy);
      // Re-push the cached raw into the store. The original (pre-cache)
      // route always did fetch+push on every navigation, which kept the
      // Ember Data record's internal `_data` (committed attributes) in
      // sync with the latest server response. Skipping the push entirely
      // on cache hit caused board.save() to serialize stale internal
      // state and the backend rejected the PUT with "Not authorized".
      // The push is bookkeeping only (no network), so the cache benefit
      // is preserved.
      try {
        var hit_normalized = this.store.normalize('board', JSON.parse(JSON.stringify(cached_raw)));
        this.store.push(hit_normalized);
      } catch (e) { /* best-effort; serializer edge cases shouldn't block nav */ }
      boardCacheDiag.span('model:start', 'model:cache_hit', {
        board_key: board_key,
        button_count: (cached_raw.buttons && cached_raw.buttons.length) || 0,
        root_only: boardDetailCache.is_root_only(board_key)
      });
      /* Prefetch stores /tree?root_only=1. Paint from that hit, then
         ingest the full tree so folder taps are not left cold. */
      if (boardDetailCache.is_root_only(board_key)) {
        boardCacheDiag.mark('model:cache_hit_root_only_warm', { board_key: board_key });
        boardDetailCache.warm_full_tree_if_root_only(board_key);
      }
      return RSVP.resolve(cached_record);
    }

    // Cache miss — two-phase load so large vocab trees do not block paint:
    //   1) GET /tree?root_only=1 (lite root JSON only) → resolve + paint
    //   2) GET /tree (full) in background → ingest descendants into
    //      boardDetailCache + Ember Data for instant folder taps
    // Fallback: if root_only fails, try show, then still warm full /tree.
    boardCacheDiag.mark('model:cache_miss', { board_key: board_key });
    return new RSVP.Promise(function(resolve) {
      var resolved = false;
      var handleRoot = function(boardData, source) {
        var raw_copy = JSON.parse(JSON.stringify(boardData));
        _this.set('_raw_board_data', raw_copy);
        // force: network response is authoritative for this navigation.
        // root_only: lite /tree and show fallback have no descendants yet.
        boardDetailCache.set(raw_copy, { force: true, root_only: true });
        var store = _this.store;
        var normalized = store.normalize('board', boardData);
        var record = store.push(normalized);
        boardCacheDiag.span('model:start', 'model:root_ready', {
          board_key: board_key,
          source: source || 'tree',
          button_count: (boardData.buttons && boardData.buttons.length) || 0
        });
        if (!resolved) {
          resolved = true;
          // Image warm runs in _finalize_board_display for the visible board.
          resolve(record);
        }
        return record;
      };

      var warmFullTreeInBackground = function() {
        var tree_started = Date.now();
        boardCacheDiag.mark('model:background_tree_start', { board_key: board_key });
        boardDetailCache.warm_full_tree_if_root_only(board_key).then(function(result) {
          result = result || {};
          if (result.warmed) {
            boardCacheDiag.mark('model:background_tree_response', {
              board_key: board_key,
              ms: Date.now() - tree_started,
              descendant_count: result.descendant_count || 0
            });
            boardCacheDiag.mark('model:descendants_cached', {
              board_key: board_key,
              descendant_count: result.descendant_count || 0
            });
          } else {
            boardCacheDiag.mark('model:background_tree_fail', { board_key: board_key });
          }
        });
      };

      // Both board fetches were single-shot: `/tree?root_only=1` falls back to
      // `/boards/<key>`, and if THAT also fails the model resolves straight to the
      // error POJO — the "This board is not currently available." page. On a login
      // entry these fire inside a burst (findRecord('user','self') + the parent
      // user queryRecord + this pair + prime_caches), so a single transient 5xx or
      // dropped connection is enough to dead-end a user whose board is perfectly
      // fine. That matches the reported symptom: intermittent, and "Go to Home
      // Board" (which re-requests the SAME key) then works.
      //
      // So retry ONCE before giving up. This is deliberately NOT a guess at which
      // transient cause fires — it closes the structural gap (no retry at all)
      // that makes every one of them fatal.
      //
      // Not retried: a definitive answer from the server (404/403/401 — the board
      // is gone or not ours, and a retry would only delay a correct error), and
      // the offline short-circuit (persistence.ajax rejects instantly with
      // `short_circuit` when offline; there is no request to repeat, and
      // reload_on_connect already refreshes when connectivity returns).
      var fallbackAttempted = false;
      var isDefinitive = function(err) {
        if (!err) { return false; }
        if (err.short_circuit || err.offline) { return true; }
        return err.status === 404 || err.status === 403 || err.status === 401;
      };
      var fallbackSingleBoard = function() {
        boardCacheDiag.mark('model:tree_fallback_show', { board_key: board_key });
        persistence.ajax('/api/v1/boards/' + board_key, { type: 'GET' }).then(function(data) {
          var boardData = boardDetailCache.normalize_board_payload(data);
          if (boardData) {
            handleRoot(boardData, 'show');
            warmFullTreeInBackground();
          } else if (!resolved) {
            resolved = true;
            resolve({ error: true, boardname: params.boardname });
          }
        }, function(err) {
          if (!resolved && !fallbackAttempted && !isDefinitive(err)) {
            fallbackAttempted = true;
            boardCacheDiag.mark('model:fallback_retry', { board_key: board_key });
            // Short pause so the retry lands after the login burst rather than
            // adding to it. Guarded again on `resolved` because the background
            // tree warm can resolve the model while this is pending.
            // `setTimeout`, not `runLater`, on purpose: the callback only re-fires
            // an ajax and touches promise-local state (no route/component
            // mutation), so it needs none of the run-loop scheduling guarantees —
            // and a new `runLater` here would add an `ember/no-runloop` violation
            // beyond the file's grandfathered baseline. Same pattern as the
            // debounced save timer in components/display-style.js.
            setTimeout(function() { if (!resolved) { fallbackSingleBoard(); } }, 600);
            return;
          }
          if (!resolved) {
            resolved = true;
            resolve({ error: true, boardname: params.boardname });
          }
        });
      };

      var root_started = Date.now();
      persistence.ajax('/api/v1/boards/' + board_key + '/tree?root_only=1', { type: 'GET' }).then(function(data) {
        boardCacheDiag.mark('model:root_only_response', {
          board_key: board_key,
          ms: Date.now() - root_started,
          descendant_count: (data && data.descendants && data.descendants.length) || 0
        });
        if (!data || !data.root || !data.root.board) {
          fallbackSingleBoard();
          return;
        }
        var rootBoardData = boardDetailCache.normalize_board_payload(data.root);
        if (!rootBoardData) {
          fallbackSingleBoard();
          return;
        }
        handleRoot(rootBoardData, 'tree_root_only');
        warmFullTreeInBackground();
      }, function() {
        fallbackSingleBoard();
      });
    });
  },

  setupController: function(controller, model) {
    var _this = this;
    /* Hide any pending board-loading overlay set by callers that
       fired show_loading_overlay before this transition (the My
       Boards picker, the boards-page tile click, etc.). The
       overlay's LOADING_OVERLAY_MIN_MS still enforces a minimum
       visible duration so a fast cache-hit transition doesn't
       flash-and-disappear. */
    this.appState.hide_loading_overlay();
    var user = this.modelFor('user');

    // Reset the exit-in-progress flag each time the route is set up, so that
    // guards inside async callbacks (e.g. _build_from_raw) don't stay "armed"
    // after a previous exit.
    controller.set('_exiting', false);
    // Reset retrying flag — fresh model load means any prior "Trying again..."
    // state is resolved.
    controller.set('retrying', false);

    controller.set('model', model);
    controller.set('user', user);

    // Light/dark board view is the single remembered user preference
    // `board_dark_mode` (see controller._persist_board_dark_mode), shared with the
    // create-board-new preview. Boards open LIGHT by default; dark only once the
    // user turns it on. Honor the saved choice on every board entry.
    var darkPref = this.appState.get('currentUser.preferences.board_dark_mode');
    controller.set('dark_mode', !!darkPref);

    // Mirror the board model onto the `board.index` controller. The
    // application controller injects `board: inject('board.index')` and
    // reads `this.get('board.model')` from many legacy code paths —
    // notably `highlight_button` / `activateButton` / the find-button
    // modal's result-picking logic. Without this, those paths see
    // `board.model == null` while we are on the board-detail route and
    // silently no-op. Sharing the same model instance keeps every legacy
    // hook working unchanged.
    // Only mirror a REAL Ember board record. model() resolves with a
    // plain { error: true, boardname } object when the /tree (and
    // single-board fallback) fetch fails — mirroring that POJO would
    // poison application.board.model, and legacy paths that call
    // `board.model.get(...)` directly (e.g. app-state refresh_suggestions)
    // would throw "board.get is not a function" and hard-crash the view
    // instead of showing the recoverable board-detail error state. Same
    // guard the next line (`model.get ? ...`) and resolve_board_from_controller
    // (`m.get && !m.get('error')`) already use.
    try {
      var boardIndexController = this.controllerFor('board.index');
      if (boardIndexController && model && model.get && !model.get('error') && (model.get('key') || model.get('id'))) {
        boardIndexController.set('model', model);
      }
    } catch (e) { /* board.index controller may not exist yet on first load */ }
    controller.set('boardname', (model.get ? model.get('key') : '').split('/').slice(1).join('/') || '');
    controller.set('ordered_buttons', null);
    controller.set('preview_level', null);
    controller.set('show_options_menu', false);
    controller.set('show_color_legend', false);
    if (!this.appState.get('board_layout_mode')) {
      controller.set('edit_mode', false);
    }
    controller.set('paint_mode', null);
    controller.set('color_picker_button', null);
    controller.set('show_paint_color_picker', false);
    controller.set('board_recolored', false);
    controller.set('_saved_recolor', null);
    controller.set('borders_matched', false);
    controller.set('_saved_border_colors', null);
    // These are personal VIEWING preferences of whoever is using the app
    // right now, not properties of the board's author. Every toggle that
    // writes them (set_folder_style, toggle_folder_colored_face,
    // toggle_soft_borders, toggle_hide_speak_bar,
    // set_speak_menu_item_hidden) saves to `app_state.currentUser`, so the
    // read here must mirror that source. Reading from `user`
    // (modelFor('user') === the URL/board-owner) made these revert to their
    // defaults whenever the current user opened a board they don't own
    // (anything outside "My Boards"), because the board owner has no such
    // preference saved.
    // Resolve folder_display_style preference-FIRST, then fall back to the
    // 'default' style only when no value is stored — covers legacy users who
    // predate the server-side default (new users get it at registration via
    // User preference_defaults; the backfill task fills existing users). Read
    // from currentUser (see note above); this single value drives BOTH speak
    // mode and edit mode through board-detail-grid, so the fallback applies
    // everywhere the modern board renders folders.
    var pref_user = this.appState.get('currentUser');
    controller.set('folder_display_style', (pref_user && pref_user.get && pref_user.get('preferences.folder_display_style')) || 'default');
    // Folder colored face defaults to ON for every user. Only the
    // explicit saved value of `false` turns it off; an undefined /
    // unset preference (new users, existing users who never touched
    // the toggle) inherits the colored look.
    var folder_colored_face_saved = pref_user && pref_user.get && pref_user.get('preferences.folder_colored_face');
    controller.set('folder_colored_face', folder_colored_face_saved == null ? true : !!folder_colored_face_saved);
    controller.set('folder_dropdown_open', false);
    // Soft borders default to ON for every user. Only the explicit
    // saved value of `false` turns them off; an undefined / unset
    // preference (new users, existing users who never touched the
    // toggle) inherits the soft style.
    var soft_borders_saved = pref_user && pref_user.get && pref_user.get('preferences.soft_borders');
    controller.set('soft_borders', soft_borders_saved == null ? true : !!soft_borders_saved);
    // Hide speak bar — default OFF. Only flips on if the user
    // explicitly toggles it via the right-panel "Hide speak bar"
    // control in the Speak Bar section.
    controller.set('hide_speak_bar', !!(pref_user && pref_user.get && pref_user.get('preferences.hide_speak_bar')));
    // Customize Menu — array of speak-mode options-menu item ids
    // the user has hidden. Default empty (everything visible).
    // Saved on user.preferences.speak_mode_hidden_menu_items via
    // the `toggle_speak_menu_item` action in the right panel.
    var saved_hidden_menu = pref_user && pref_user.get && pref_user.get('preferences.speak_mode_hidden_menu_items');
    controller.set('speak_menu_hidden_items', Array.isArray(saved_hidden_menu) ? saved_hidden_menu.slice() : []);

    // Re-apply the user's symbol_background scope on every board-detail
    // entry. The app-state `sync_fitzgerald_scope` observer covers the
    // case where the pref *changes*, but doesn't fire if sessionUser was
    // already populated before the observer attached — leaving the JS
    // palette cache filled with original Fitzgerald hues even when the
    // user has Colored Soft saved. Calling `set_fitzgerald_scope` here
    // toggles `.fitzgerald-soft` on <html> and invalidates the
    // `_bd_cache` closure, so the paint swatches and any subsequent
    // auto-coloring (`editManager.get_keyed_colors` → POS lookup) read
    // the soft variants from the swapped `--fitzgerald-*` CSS vars.
    if (window.LingoLinq && window.LingoLinq.set_fitzgerald_scope) {
      var bg = (user && user.get && user.get('preferences.symbol_background')) || null;
      window.LingoLinq.set_fitzgerald_scope(bg);
    }

    // Default panels to collapsed (unexpanded), unless a one-shot flag was
    // set by an in-page navigation that wants to preserve the expanded state
    // (e.g. clicking Symbol Board to reload the current board view).
    var keep_expanded = this.appState.get('board_detail_keep_panels_expanded');
    if(keep_expanded) {
      controller.set('panels_collapsed', false);
      this.appState.set('board_detail_keep_panels_expanded', false);
    } else {
      controller.set('panels_collapsed', true);
    }
    controller.set('board_collapsed', true);

    // Initialize the user's saved voice for speech synthesis
    if(user && user.get && user.get('preferences.device.voice')) {
      user.update_voice_uri();
      speecher.set_voice(
        user.get('preferences.device.voice'),
        user.get('preferences.device.alternate_voice')
      );
    }

    if(!model || model.error || (model.get && model.get('error')) || typeof model.load_button_set !== 'function') {
      return;
    }

    // Load button set for find-a-button functionality — DEFERRED off the board-open
    // critical path. For an uncached set, model.load_button_set() hits
    // POST /api/v1/buttonsets/:id/generate, which makes the server generate the whole
    // find-a-button hierarchy (BoardDownstreamButtonSet.update_for). On a large board
    // (e.g. vocal-flair-112) that takes several seconds — running it inside setupController
    // made board opens feel ~4s slow even on a cache hit (board grid itself paints in ~12ms).
    // find-a-button is user-invoked, so warm the set in the background after the board is
    // painted (mirrors the deferred warm_images / prefetch_linked runLater pattern below).
    if(model.get('valid_id') && !model.get('integration')) {
      runLater(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        if(!model || (model.get && model.get('isDestroyed')) || typeof model.load_button_set !== 'function') { return; }
        // Skip if the user has already navigated to a different board in the meantime.
        if(_this.appState.get('currentBoardState.id') !== (model.get('global_id') || model.get('id'))) { return; }
        var bs_key = model.get('key');
        // Find-a-button support; failure must not surface as an unhandled rejection.
        var bs_started = Date.now();
        boardCacheDiag.mark('setup:buttonset_start', { board_key: bs_key });
        var load_bs = model.load_button_set();
        if(load_bs && typeof load_bs.then === 'function') {
          load_bs.then(function() {
            boardCacheDiag.mark('setup:buttonset_done', { board_key: bs_key, ms: Date.now() - bs_started });
          }, function() {
            boardCacheDiag.mark('setup:buttonset_fail', { board_key: bs_key, ms: Date.now() - bs_started });
          });
        }
      }, 750);
    }

    // Set currentBoardState
    var board_langs = (model.get('locales') || []);
    var model_locale = model.get('locale') || 'en';
    var board_key = model.get('key') || '';
    var user_locale = _this.appState.get('currentUser.preferences.locale') ||
      _this.appState.get('sessionUser.preferences.locale');
    var keyboard_default_locale = (board_key.match(/\/keyboard$/) && !user_locale) ? 'en' : model_locale;
    _this.appState.set('currentBoardState', {
      id: model.get('global_id') || model.get('id'),
      key: board_key,
      parent_id: model.get('parent_board_id'),
      name: model.get('name'),
      has_fallbacks: model.get('has_fallbacks'),
      default_locale: keyboard_default_locale,
      copy_version: model.get('copy_version'),
      integration_name: model.get('integration') && model.get('integration_name'),
      parent_key: model.get('parent_board_key'),
      text_direction: i18n.text_direction(keyboard_default_locale),
      translatable: board_langs.length > 1
    });

    // Configure locales — honor explicit Switch Languages overrides; otherwise
    // follow the board's default locale so translated boards speak the target language.
    var stripped_langs = board_langs.map(function(l) { return l.split(/-|_/)[0]; });
    var has_locale_override = _this.stashes.get('override_label_locale') || _this.stashes.get('override_vocalization_locale');
    ['label_locale', 'vocalization_locale'].forEach(function(loc_type) {
      if(!has_locale_override) {
        _this.appState.set(loc_type, keyboard_default_locale);
      } else if(_this.stashes.get(loc_type)) {
        var preferred = _this.stashes.get(loc_type);
        var stripped = preferred.split(/-|_/)[0];
        if(stripped_langs.indexOf(stripped) == -1) {
          _this.appState.set(loc_type, keyboard_default_locale);
        } else if(board_langs.indexOf(preferred) == -1) {
          _this.appState.set(loc_type, stripped);
        } else {
          _this.appState.set(loc_type, _this.stashes.get(loc_type));
        }
      } else {
        _this.appState.set(loc_type, keyboard_default_locale);
      }
    });

    // Set up editManager for edit mode operations. ordered_buttons was
    // already cleared in the state-reset block above; we don't re-clear
    // here so _build_from_raw can write the new grid in a single pass.
    editManager.setup(controller, _this.appState, _this.persistence, _this.stashes);
    _this.appState.set('board_virtual_dom.triggerAction', function(action, id, extra) {
      controller.send(action, id, extra);
    });
    contentGrabbers.board_controller = controller;

    // Build display buttons from raw data AFTER editManager setup
    // so nothing overwrites them. Prime offline url_cache BEFORE
    // _build_from_raw so ordered_buttons cache ctx includes the
    // correct url_cache_primed flag — overlay is already dismissed
    // above; priming here does not extend overlay visibility.
    var raw = _this.get('_raw_board_data');
    if(raw) {
      var primed_already = !!(this.persistence && this.persistence.get('primed'));
      boardCacheDiag.mark('setup:prime_start', {
        board_key: board_key,
        primed_already: primed_already
      });
      var prime_started = Date.now();
      _this._maybe_prime_caches().then(function() {
        if(controller.isDestroyed || controller.isDestroying) { return; }
        boardCacheDiag.mark('setup:prime_done', {
          board_key: board_key,
          ms: Date.now() - prime_started,
          primed_already: primed_already
        });
        var build_started = Date.now();
        _this._finalize_board_display(controller, raw);
        boardCacheDiag.mark('setup:grid_built', {
          board_key: board_key,
          ms: Date.now() - build_started,
          rows: (controller.get('ordered_buttons') || []).length
        });
      });
    }

    // Store original name for rename detection
    controller.set('_original_board_name', model.get('name'));

    // Track the first board entered as fallback home
    if(!controller.get('app_state.board_detail_entry_board')) {
      controller.set('app_state.board_detail_entry_board', {
        user_name: user.get('user_name'),
        boardname: controller.get('boardname'),
        key: model.get('key')
      });
    }

    // Scroll to top on entry — #content is the actual scroll container, not window
    window.scrollTo(0, 0);
    var content = document.getElementById('content');
    if (content) { content.scrollTop = 0; }

    // Prefetch linked boards
    if(model.prefetch_linked_boards) {
      model.prefetch_linked_boards();
    }

    // Board-detail operates as speak mode — activate it if not already active
    if(_this.stashes.get('current_mode') !== 'speak') {
      controller.set('_was_not_speak_mode', true);
      _this.stashes.persist('current_mode', 'speak');
    }

    if(typeof controller._syncInlineSidebarFromPrefs === 'function') {
      controller._syncInlineSidebarFromPrefs();
    }

    // Trigger scanning check after speak mode is set and buttons are rendered
    runLater(function() {
      if(_this.appState && typeof _this.appState.check_scanning === 'function') {
        _this.appState.check_scanning();
      }
    }, 500);
  },

  actions: {
    refreshData: function() {
      this.refresh();
    },
    re_transition: function() {
      var controller = this.controllerFor('user.board-detail');
      if(controller) { controller.set('retrying', true); }
      this.refresh();
    }
  },

  resetController: function(controller, isExiting) {
    if(isExiting) {
      /* Drop the "Try this Board" marker on ANY exit from board-detail. The Back
         control it drives is scoped to a single trial, so leaving by the sidebar,
         the Home button, a browser Back, or anything else ends that trial just as
         much as pressing Back does -- and a marker that survived would put a
         stale "Back to picker" on some unrelated board later in the session.
         Clearing it here rather than in each exit path means new exits get the
         behaviour for free. */
      this.appState.set('board_detail_try_origin', null);
      var board_layout = this.appState.get('board_layout_mode');
      controller.set('ordered_buttons', null);
      controller.set('active_category', 'all');
      controller.set('sentence_parts', []);
      if (!board_layout) {
        controller.set('edit_mode', false);
        controller.set('paint_mode', null);
        controller.set('color_picker_button', null);
        if(editManager.controller === controller) {
          editManager.controller = null;
        }
      }
      // Restore previous mode if we activated speak mode on entry
      if(controller.get('_was_not_speak_mode')) {
        controller.set('_was_not_speak_mode', false);
        this.stashes.persist('current_mode', 'default');
      }
    }
  }
});

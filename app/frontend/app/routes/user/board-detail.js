import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import i18n from '../../utils/i18n';
import speecher from '../../utils/speecher';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';
import persistence from '../../utils/persistence';
import boardDetailCache from '../../utils/board_detail_cache';
import boardCacheDiag from '../../utils/board_cache_diag';
import scanner from '../../utils/scanner';
import modal from '../../utils/modal';
import { available_board_langs, board_default_locale, session_board_locale } from '../../utils/board_display_locale';

export default Route.extend({
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),

  // One-shot promise so concurrent board-detail entries share a single prime.
  _prime_caches_promise: null,

  // Load offline url_cache from IndexedDB/filesystem before building buttons
  // so _make_btn can resolve local image URLs (mirrors legacy fast_html).
  // The app also does this at startup for every view; this joins the same promise
  // (persistence.prepare_local_files in services/persistence.js).
  _maybe_prime_caches: function() {
    var persistenceSvc = this.persistence;
    if(!persistenceSvc || typeof persistenceSvc.prepare_local_files !== 'function') {
      return RSVP.resolve();
    }
    return persistenceSvc.prepare_local_files();
  },

  // Build the symbol grid, warm current-board images, prefetch linked boards.
  /* Re-arm scanning once the grid actually exists in the DOM.
     A switch/eye-gaze user who opens a board before its grid has rendered gets a scan list
     built from chrome only: `scan_content` takes its shape from `model.grid` but resolves
     cells with `find_elem(".button[data-id=…]")`, and `start()` DISCARDS the ones that do not
     resolve (utils/scanner.js:399, :408). Nothing repaired it afterwards, and it could not
     repair itself: `actively_scanning()` (:634) stays true while the scanner cycles the
     sentence row — which is static markup that survives board navigation — so every later
     `start()` returned at :177. The user was left with Home/Back/Clear and no vocabulary.

     GATED, deliberately. `services/app-state.js:2070-2075` wraps its own `stop()` in the
     same condition, and the comment there records why: "this was breaking the 'find button'
     interface when you get to the second board." `stop()` calls `modal.close_highlight()` and
     removes every `.highlight` node (:617-620), and `utils/edit_manager.js:1974-1990`
     repaints exactly that overlay for find-a-button and the `board-intro` tour at around this
     moment. Ungated, this erased it — demonstrated by a test before the gate was written.

     ZERO-DELAY runLater, not `check_scanning()`. That is the pattern the modals already use
     (`utils/modal.js:126-130`, `:188-192`, `services/modal.js:115-121`) and it is not
     cosmetic: `check_scanning` defers its whole body by 1000ms (`app-state.js:2031`), which
     would leave this a wall-clock race that can capture a chrome-only list again on a slow
     device. A zero-delay runLater is ordered by the RUNLOOP — the current turn's render queue
     flushes before the next-turn timer — so the grid is in the DOM by the time it fires.
     `scanner.options` survives `stop()`; `last_options` does not (:616), so pass options. */
  _rearm_scanning_after_build: function() {
    if(!scanner.scanning && !scanner.interval) { return; }
    /* Leave a find-a-button search alone. The app deliberately supports that overlay running
       WHILE the scanner scans — `utils/modal.js:332` routes a `button_search` highlight to the
       SECONDARY outlet precisely `if(… && scanner.scanning)` — and `scanner.start()` itself
       refuses to rebuild in that state rather than stopping (`utils/scanner.js:233`). Stopping
       here would call `close_highlight()`, which nulls BOTH `highlight_settings` and
       `highlight2_settings` (`utils/modal.js:377-378`). `utils/edit_manager.js:1974-1992`
       usually repaints it, but that is guarded by
       `_bd_highlight_resume_board != board_id` — so a second arrival at the SAME board inside
       one sequence gets no repaint and the search dies silently. Refusing here mirrors what
       `start()` already does, and costs nothing when no search is open. */
    var hl = (modal.highlight_settings || {}).highlight_type;
    var hl2 = (modal.highlight2_settings || {}).highlight_type;
    if(hl === 'button_search' || hl2 === 'button_search') { return; }
    var _this = this;
    scanner.stop();
    /* Teardown-guarded like every other runLater in this file (:111, :121, :470, :600): the
       gate above was evaluated a turn earlier, so the route can be gone by the time this runs. */
    runLater(function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      scanner.start(scanner.options);
    });
  },
  _finalize_board_display: function(controller, raw) {
    if(!raw || !controller || controller.isDestroyed || controller.isDestroying) { return; }
    if(raw.images && raw.images.length) {
      controller._board_detail_images = raw.images;
    }
    controller._build_from_raw(raw);
    if(controller.get('edit_mode') || controller.get('served_from_device')) { return; } // a device copy: nothing to fetch
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

  _model_from_cache_or_server: function(params, nav) {
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
      return _this.cached_unless_revoked(cached_record, params.boardname);
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
        nav.answered = true; if(_this._board_nav === nav) { _this.set('_raw_board_data', raw_copy); } // only the current navigation sets the grid source
        // force: network response is authoritative for this navigation.
        // root_only: lite /tree and show fallback have no descendants yet.
        boardDetailCache.set(raw_copy, { force: _this._board_nav === nav, root_only: true });
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
        if(_this._board_nav !== nav) { return; } var tree_started = Date.now();
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
        persistence.ajax('/api/v1/boards/' + board_key, nav.copy ? _this._one_try() : { type: 'GET' }).then(function(data) {
          var boardData = boardDetailCache.normalize_board_payload(data);
          if (usable_copy(boardData)) {
            handleRoot(boardData, 'show');
            warmFullTreeInBackground();
          } else if (!resolved) {
            resolved = true;
            resolve({ error: true, boardname: params.boardname });
          }
        }, function(err) { nav.failures.push(err);
          if (!resolved && !fallbackAttempted && !isDefinitive(err) && !nav.copy) {
            fallbackAttempted = true;
            boardCacheDiag.mark('model:fallback_retry', { board_key: board_key });
            // Short pause so the retry lands after the login burst, not in it. Guarded again
            // on `resolved`: the background tree warm can resolve the model while this is pending.
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
      var noBoardFromTree = function(err) { _this._after_tree_failure(nav, err || {}, requestTree, fallbackSingleBoard, function() { resolved = true; resolve({ error: true, boardname: params.boardname }); }); };
      var requestTree = function(options) { persistence.ajax('/api/v1/boards/' + board_key + '/tree?root_only=1', options).then(function(data) {
        boardCacheDiag.mark('model:root_only_response', {
          board_key: board_key,
          ms: Date.now() - root_started,
          descendant_count: (data && data.descendants && data.descendants.length) || 0
        });
        if (!data || !data.root || !data.root.board) {
          noBoardFromTree();
          return;
        }
        var rootBoardData = boardDetailCache.normalize_board_payload(data.root);
        if (!usable_copy(rootBoardData)) {
          noBoardFromTree();
          return;
        }
        handleRoot(rootBoardData, 'tree_root_only');
        warmFullTreeInBackground();
      }, function(err) {
        nav.failures.push(err); noBoardFromTree(err);
      }); }; requestTree(_this._one_try());
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
    var raw_for_langs = _this.get('_raw_board_data') || {};
    var board_langs = available_board_langs(model, raw_for_langs);
    var model_locale = model.get('locale') || raw_for_langs.locale || 'en';
    var board_key = model.get('key') || '';
    var user_locale = _this.appState.get('currentUser.preferences.locale') ||
      _this.appState.get('sessionUser.preferences.locale');
    var keyboard_default_locale = board_default_locale(model_locale, board_key, user_locale, board_langs);
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

    // Honor Switch Languages for the whole session. An empty locales list
    // (Flexiones, a cache hit before translations hydrate) must not drop
    // Spanish back to the board default.
    ['label_locale', 'vocalization_locale'].forEach(function(loc_type) {
      _this.appState.set(loc_type, session_board_locale(_this.stashes, loc_type, keyboard_default_locale, board_langs));
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
        if(controller.isDestroyed || controller.isDestroying || _this.get('_raw_board_data') !== raw) { return; } // Edit can replace a device copy first
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
        /* The grid exists now, so a scanner that armed before it did can pick up the
           buttons. No-op unless one is actually running — see the gate in the method. */
        _this._rearm_scanning_after_build();
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
      // Not `_board_nav`: a slow board shows the loading page, which exits this route mid-navigation.
      controller.set('served_from_device', false);
    }
  },
  // A cache hit serves a board without asking the server. Offline, a board whose
  // local copy is marked as no longer viewable by any synced user resolves as
  // this route's error state instead (the { error, boardname } shape the failed
  // fetch uses), never as the cached copy. utils/board_revocation.js#blocks_view_route
  // decides; it never blocks online.
  cached_unless_revoked: function(record, boardname) {
    var online = !!(this.persistence && this.persistence.get('online'));
    return boardRevocation.blocks_view_route(record, this.appState, online).then(function(blocked) {
      return blocked ? { error: true, boardname: boardname } : record;
    });
  },

  session: service('session'),
  router: service('router'),
  // Offline with nothing to show, and the server did not refuse it: never a dead end.
  afterModel: function(model) {
    var nav = this._board_nav;
    if(!model || !model.error || !nav || !this.session.get('access_token') || this._refused()[nav.board_key]) { return; }
    if(persistence.get('online') === false || (nav.failures.length && nav.failures.every(no_connection))) {
      return leave_unsaved_board(this.router, this.appState, persistence, boardDetailCache, nav.board_key);
    }
  },
  device_copy_wait: DEVICE_COPY_WAIT_MS,
  device_read_wait: DEVICE_READ_WAIT_MS,
  session_wait: DEFAULT_WAIT_MS,
  denial_session_wait: 10000,
  // Network first with a timeout, then the device copy (#1213), all in order. Each step has ended before
  // the next starts, so no answer for this board can arrive after the page has moved on. `nav` stands
  // for this navigation: a superseded one may still be running, and must change nothing.
  model: function(params) {
    var _this = this;
    var board_key = this.modelFor('user').get('user_name') + '/' + params.boardname;
    // Read first: boardDetailCache.get treats an expired entry as gone.
    var nav = { board_key: board_key, memory_raw: boardDetailCache.peek(board_key), failures: [], served: false };
    this._board_nav = nav;
    return this._model_from_cache_or_server(params, nav).then(function(result) {
      if(!result || !result.error) {
        // A memory hit with no connection is a copy too, as far as its pictures go.
        return (nav.answered || persistence.get('online') !== false) ? result : within(load_copy_images(_this.persistence, _this.get('_raw_board_data') || {}), _this.device_read_wait).then(function() { return result; });
      }
      return _this._serve_copy(nav).then(function(record) { return record || result; });
    }).then(function(result) {
      if(_this._board_nav === nav) { _this._mark_device_copy(nav.served); }
      if(nav.answered) { delete _this._refused()[board_key]; }
      return result;
    });
  },
  // One attempt that ends itself. A new object each time: $.ajax changes the options it is given.
  _one_try: function() {
    // After a silent owner lookup, only what is left of the wait; read once, so a later request gets the
    // full wait again (utils/board_device_copy.js remaining_wait).
    var appState = this.get('appState'), silent_at = appState && appState.get('device_copy_server_silent_at');
    if(silent_at) { appState.set('device_copy_server_silent_at', null); }
    var timeout = (this.device_copy_wait === DEVICE_COPY_WAIT_MS) ? remaining_wait(silent_at, Date.now()) : this.device_copy_wait;
    return { type: 'GET', timeout: timeout, attempt: 3 };
  },
  // What to do when the one bounded /tree attempt gave no board. No answer and a copy on the device:
  // the copy. No answer and no copy: this page has nothing else, so ask with the usual patience.
  // Anything else goes on to the show request, which is bounded too when there is a copy to fall back on.
  _after_tree_failure: function(nav, err, request_tree, request_show, give_up) {
    if(nav.patient) { return request_show(); }
    var no_answer = !!(err.short_circuit || (err.fakeXHR && err.fakeXHR.status === 0));
    this._find_copy(nav).then(function(raw) {
      if(raw && no_answer) { return give_up(); }
      if(no_answer && !err.short_circuit) {
        nav.patient = true;
        return request_tree({ type: 'GET', attempt: 2 });
      }
      request_show();
    });
  },
  // The copy that may be shown, or null. Bounded as a whole, because the revocation check reads the
  // database too, and it writes nothing, so a read that outlives the limit has no effect. The server
  // did not answer, so that check treats this as offline whatever `online` says.
  _find_copy: function(nav) {
    var _this = this;
    return this._session_user_loaded(nav).then(function() {
      return _this._checked_copy(nav);
    }).then(null, function() { return null; });
  },
  // On a cold start the session user is still loading, and the denial and revocation rules say nothing
  // until it has (board_revocation.js#acting_as_self), so wait for the read that is already running.
  _session_user_loaded: function(nav) {
    if(this.appState.get('sessionUser')) { return RSVP.resolve(); }
    // Longer when the server has answered, because then a board may be wrongly opened.
    var answered = nav.failures.some(function(err) { return err && err.fakeXHR && err.fakeXHR.status; });
    return wait_for_session_user(this.appState, {
      promise: this.appState.get('session_user_promise'),
      timeout: answered ? this.denial_session_wait : this.session_wait
    });
  },
  // Read before judging, so a home board held by id is recognised. Judged even with no row, so a
  // refusal or a dead session is remembered for the next board.
  _checked_copy: function(nav) {
    var _this = this;
    if(!this._may_read_copies()) {
      this._copy_refused(nav);
      return RSVP.resolve(null);
    }
    return this._read_copy(nav).then(function(raw) {
      return (_this._copy_refused(nav) || !raw) ? null : raw;
    });
  },
  _read_copy: function(nav) {
    if(!nav.lookup) {
      var appState = this.appState;
      var read = read_device_copy(persistence, nav.board_key, nav.memory_raw).then(function(raw) {
        if(!raw) { return null; }
        var board = { get: function(attr) { return raw[attr]; } };
        // Modern turns Speak Mode on for everyone (setupController), so it excuses nothing here.
        return boardRevocation.blocks_view_route(board, appState, false, { ignore_speak_mode: true }).then(function(blocked) {
          return blocked ? null : raw;
        });
      });
      nav.lookup = within(read, this.device_read_wait).then(function(raw) {
        nav.copy = raw;
        if(!raw) { nav.lookup = null; } // it may only have been slow: read again before the error page
        return raw;
      });
    }
    return nav.lookup;
  },
  _serve_copy: function(nav) {
    var _this = this;
    return this._find_copy(nav).then(function(raw) {
      if(!raw || _this._board_nav !== nav || _this._copy_refused(nav)) { return null; }
      var record = _this._record_for_copy(raw);
      _this.set('_raw_board_data', raw);
      nav.served = true;
      return within(load_copy_images(_this.persistence, raw), _this.device_read_wait).then(function() { return record; });
    }).then(null, function() { return null; });
  },
  // Signed in, on that user's own database. `auth_settings` will not do: a forced logout leaves `{}`.
  _may_read_copies: function() {
    return !!this.session.get('access_token') && persistence.local_db_is_current_user();
  },
  // Boards the server refused, by the token it refused: the answer holds until it says otherwise.
  _refused: function() {
    this._refused_boards = this._refused_boards || {};
    return this._refused_boards;
  },
  // A dead session is remembered per token: in Speak Mode nothing logs out (utils/extras.js), and the
  // next navigation may have no server answer to show it. Read even when there is no copy.
  _copy_refused: function(nav) {
    var session = this.session;
    var token = session.get('access_token');
    if(session.get('invalid_token') || nav.failures.some(function(err) { return session_ended(err, session); })) {
      this._dead_token = token;
    }
    if(token && this._dead_token === token && offline_shell.device_trust(this.appState.get('sessionUser')) !== 'trusted') {
      return true;
    }
    var copy_id = nav.copy && nav.copy.id;
    if(this._refused()[nav.board_key] === token) { return !board_kept_on_refusal(nav.board_key, copy_id, this.appState); }
    // Unknown user: home and sidebar boards cannot be told apart yet, so nothing is remembered.
    if(!this.appState.get('sessionUser') || !server_refused(nav.failures, nav.board_key, copy_id, this.appState)) { return false; }
    this._refused()[nav.board_key] = token;
    boardDetailCache.invalidate(nav.board_key);
    return true;
  },
  // The server answered a device copy's fetch (controllers/user/board-detail.js#_refresh_device_copy)
  // with a failure. A refusal goes back through model(), so the router shows the error page.
  device_copy_fetch_failed: function(board_key, err, board_id) {
    if(this._copy_refused({ board_key: board_key, failures: [err], copy: { id: board_id } })) { this.refresh(); }
  },
  // A record already in memory keeps its identity, and may have changes waiting to save (the same
  // rule as services/persistence.js#find_boards). The grid comes from the newest copy, not the record.
  // A row the store cannot take throws into _serve_copy's rejection handler: no copy.
  _record_for_copy: function(raw) {
    var existing = this.store.peekRecord('board', raw.id);
    if(existing) { return existing; }
    var attrs = JSON.parse(JSON.stringify(raw));
    delete attrs.images; // sideloaded objects, not the relationship the model declares; the grid reads them from raw
    delete attrs.sounds;
    return this.store.push(this.store.normalize('board', attrs));
  },
  // The controller's flag is the one record of what is on screen: read by the notice, by
  // _finalize_board_display and by the actions that would save the board. Changed when a navigation
  // settles, so a tap that is still loading leaves the current board's flag alone.
  _mark_device_copy: function(served) {
    var controller = this.controllerFor('user.board-detail', true);
    if(controller) { controller.set('served_from_device', served); }
  }
});
// Placed last so the import does not shift the ESLint baseline rows above. Imports are hoisted.
import boardRevocation from '../../utils/board_revocation';
import { DEVICE_COPY_WAIT_MS, DEVICE_READ_WAIT_MS, remaining_wait, board_kept_on_refusal, leave_unsaved_board, load_copy_images, read_device_copy, server_refused, session_ended, usable_copy, within } from '../../utils/board_device_copy';
import offline_shell from '../../utils/offline_shell';
import { DEFAULT_WAIT_MS, wait_for_session_user } from '../../utils/session_user_wait';
import { no_connection } from '../../utils/board_owner';

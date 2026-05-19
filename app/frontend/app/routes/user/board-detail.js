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

export default Route.extend({
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),

  model: function(params) {
    var _this = this;
    var user = this.modelFor('user');
    user.set('subroute_name', i18n.t('board_detail', "Board Detail"));
    var board_key = user.get('user_name') + '/' + params.boardname;

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
      return RSVP.resolve(cached_record);
    }

    // Cache miss — fetch via /api/v1/boards/:id/tree (root + every
    // reachable descendant in one response). NO loading overlay: the
    // grid renders as soon as the root is ready; descendants are
    // cached + pushed to the Ember Data store as background work so
    // every subsequent folder tap is a synchronous cache HIT (instant,
    // no overlay, no network). Images warm in the background too.
    //
    // Resolve the route the moment the ROOT board is ready — we do
    // NOT block on descendant caching or image preloads. Descendant
    // work continues after resolve(); by the time the user reads the
    // board and taps a folder, it's done.
    //
    // Fallback: if /tree fails (older deploy, network) we retry with
    // the single-board endpoint so the page still works.
    return new RSVP.Promise(function(resolve) {
      var handleRoot = function(boardData) {
        var raw_copy = JSON.parse(JSON.stringify(boardData));
        _this.set('_raw_board_data', raw_copy);
        boardDetailCache.set(JSON.parse(JSON.stringify(boardData)));
        var store = _this.store;
        var normalized = store.normalize('board', boardData);
        var record = store.push(normalized);
        // Warm current board's images in the background (no await).
        if (boardDetailCache.warm_images) {
          try { boardDetailCache.warm_images(raw_copy); } catch (e) { /* ignore */ }
        }
        // Resolve immediately — grid renders now, no overlay.
        resolve(record);
      };

      var fallbackSingleBoard = function() {
        persistence.ajax('/api/v1/boards/' + board_key, { type: 'GET' }).then(function(data) {
          if(data && data.board) {
            handleRoot(data.board);
          } else {
            resolve({ error: true, boardname: params.boardname });
          }
        }, function() {
          resolve({ error: true, boardname: params.boardname });
        });
      };

      persistence.ajax('/api/v1/boards/' + board_key + '/tree', { type: 'GET' }).then(function(data) {
        if(!data || !data.root || !data.root.board) {
          fallbackSingleBoard();
          return;
        }
        var rootBoardData = data.root.board;
        if (data.root.images) { rootBoardData.images = data.root.images; }
        if (data.root.sounds) { rootBoardData.sounds = data.root.sounds; }
        // Resolve the route with the root FIRST so the user sees the
        // board immediately — descendant caching happens after.
        handleRoot(rootBoardData);

        // Background: cache + Ember-Data-push every descendant so
        // sub-board navigation is a true synchronous cache hit
        // (boardDetailCache.get → raw AND store.peekAll → record).
        // This is the work that makes folder taps instant.
        var subStore = _this.store;
        (data.descendants || []).forEach(function(wrapped) {
          var sub_raw = wrapped && wrapped.board;
          if (!sub_raw) { return; }
          if (wrapped.images) { sub_raw.images = wrapped.images; }
          if (wrapped.sounds) { sub_raw.sounds = wrapped.sounds; }
          boardDetailCache.set(sub_raw);
          try {
            var sub_normalized = subStore.normalize('board', JSON.parse(JSON.stringify(sub_raw)));
            subStore.push(sub_normalized);
          } catch (e) { /* serializer edge cases shouldn't block prefetch */ }
          if (boardDetailCache.warm_images) {
            try { boardDetailCache.warm_images(sub_raw); } catch(e) { /* ignore */ }
          }
        });
      }, function() {
        fallbackSingleBoard();
      });
    });
  },

  setupController: function(controller, model) {
    var _this = this;
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
    controller.set('button_menu_id', null);
    controller.set('show_paint_color_picker', false);
    controller.set('board_recolored', false);
    controller.set('_saved_recolor', null);
    controller.set('borders_matched', false);
    controller.set('_saved_border_colors', null);
    controller.set('folder_display_style', (user && user.get && user.get('preferences.folder_display_style')) || 'default');
    controller.set('folder_colored_face', !!(user && user.get && user.get('preferences.folder_colored_face')));
    controller.set('folder_dropdown_open', false);
    controller.set('shrink_labels_to_fit', !!(user && user.get && user.get('preferences.shrink_labels_to_fit')));

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

    if(!model || model.error) { return; }

    // Load button set for find-a-button functionality
    if(model.get('valid_id') && !model.get('integration')) {
      model.load_button_set();
    }

    // Set currentBoardState
    var board_langs = (model.get('locales') || []);
    _this.appState.set('currentBoardState', {
      id: model.get('global_id') || model.get('id'),
      key: model.get('key'),
      parent_id: model.get('parent_board_id'),
      name: model.get('name'),
      has_fallbacks: model.get('has_fallbacks'),
      default_locale: model.get('locale'),
      copy_version: model.get('copy_version'),
      integration_name: model.get('integration') && model.get('integration_name'),
      parent_key: model.get('parent_board_key'),
      text_direction: i18n.text_direction(model.get('locale')),
      translatable: board_langs.length > 1
    });

    // Configure locales
    var stripped_langs = board_langs.map(function(l) { return l.split(/-|_/)[0]; });
    ['label_locale', 'vocalization_locale'].forEach(function(loc_type) {
      if(_this.stashes.get(loc_type)) {
        var preferred = _this.stashes.get(loc_type);
        var stripped = preferred.split(/-|_/)[0];
        if(stripped_langs.indexOf(stripped) == -1) {
          _this.appState.set(loc_type, model.get('locale'));
        } else if(board_langs.indexOf(preferred) == -1) {
          _this.appState.set(loc_type, stripped);
        } else {
          _this.appState.set(loc_type, _this.stashes.get(loc_type));
        }
      } else {
        _this.appState.set(loc_type, model.get('locale'));
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
    // so nothing overwrites them
    var raw = _this.get('_raw_board_data');
    if(raw) {
      controller._build_from_raw(raw);
      // The tree (root + all descendants) was fetched and cached up
      // front in model(). Every folder tap from here on will hit a
      // boardDetailCache cache hit and resolve synchronously — no
      // network, no overlay, instant transition.
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

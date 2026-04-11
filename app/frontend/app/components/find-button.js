import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';
import LingoLinq from '../app';

// Hard safety cap on the client-side walk. The largest published LingoLinq
// boards tree in practice is ~40 boards deep; 60 gives headroom without
// letting a malformed cycle run away.
const LOCAL_WALK_MAX_BOARDS = 60;

/**
 * Find Button modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistenceService: service('persistence'),
  stashes: service('stashes'),
  tagName: '',

  init() {
    this._super(...arguments);
    this._loadModelFromService();
  },

  _loadModelFromService() {
    const modalService = this.get('modal');
    const template = 'find-button';
    var options = null;
    if (modalService && modalService.settingsFor && modalService.settingsFor[template]) {
      options = modalService.settingsFor[template];
    }
    if (!options) {
      var legacyModal = modal;
      if (legacyModal && legacyModal.settings_for && legacyModal.settings_for[template]) {
        options = legacyModal.settings_for[template];
      }
    }
    if (!options) {
      options = this.get('model') || {};
    }
    this.set('model', options);
  },

  willDestroy() {
    this._super(...arguments);
    this.set('_findButtonOpeningSetupDone', false);
  },

  ensureFindButtonOpeningOnce() {
    if (this.get('_findButtonOpeningSetupDone')) { return; }
    this.set('_findButtonOpeningSetupDone', true);
    this.runOpeningSetup();
  },

  didRender() {
    this._super(...arguments);
    this.ensureFindButtonOpeningOnce();
  },

  runOpeningSetup() {
    this.set('results', null);
    this.set('searchString', '');
    var _this = this;
    // Make sure the persistence url-cache gate is open before any search
    // runs. `ButtonSet.find_buttons` / `find_sequence` call
    // `persistence.find_url` on every remote image URL during their
    // image-lookup phase; when `persistence.primed` is falsy it enters a
    // 500ms retry-loop that only exits after `prime_caches()` runs — which
    // never happens in sessions that have not triggered a full sync (dev
    // setups, first-open-after-login, etc), freezing the search modal on
    // "Loading…" forever. Forcing the flag true is safe because every
    // other code path that sets it only ever sets it to true, and
    // find_url's downstream logic still rejects correctly for URLs that
    // are not in `url_cache` / `url_uncache` — the image-lookup code
    // already handles those rejections by leaving the remote URL in place.
    //
    // IMPORTANT: there are two separate persistence singletons — the
    // `persistence` utility module (default export) and the
    // `service('persistence')` ember service. ButtonSet.find_buttons uses
    // the SERVICE; patch that one. Patch the utility too for safety.
    var persistenceSvc = this.get('persistenceService');
    if (persistenceSvc && !persistenceSvc.get('primed')) {
      persistenceSvc.set('primed', true);
    }
    if (persistence && !persistence.primed) {
      persistence.primed = true;
    }
    const board = this.get('model.board');
    if (board) {
      this._loadOrBuildButtonSet(board).then(function(bs) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (bs) {
          // Mirror onto the board record so existing callers that read
          // `board.button_set` (search observer, other code paths) keep working.
          if (!board.get('button_set')) { board.set('button_set', bs); }
          _this.set('button_set', bs);
        }
        // Kick off a background walk of the user's home board AND each
        // sidebar board so the cross-board search paths inside
        // `find_buttons` / `find_sequence` (when `include_other_boards`
        // is true) find them via `peekRecord` instead of falling back to
        // the broken server `load_button_set` call. Fire-and-forget —
        // by the time the user types again, the store has the
        // contributing button sets; the next search picks them up.
        if (_this.get('model.include_other_boards')) {
          _this._ensureCrossBoardSetsInStore();
        }
      }, function(err) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('button_set', null);
        _this.set('error', (err && err.error) || i18n.t('button_set_not_found', "Button set not downloaded, please try syncing or going online and reopening this board"));
      });
    }
    this._focusSearchInput();
  },

  /**
   * Ensure the contributing button sets for cross-board search exist in
   * the ember-data store. This is the client-side equivalent of the
   * `add_buttons` / `lookup` helpers inside `find_buttons` and
   * `find_sequence` — when those functions need to merge results from
   * the user's home board and sidebar boards, they call
   * `LingoLinq.store.peekRecord('buttonset', key)` and only fall back to
   * `LingoLinq.Buttonset.load_button_set(key)` (broken server path) on a
   * miss. By pre-populating the store via the local walker, we make
   * those peeks hit and avoid the server entirely.
   *
   * Walks:
   *   1. The user's home board (skipped if it == current board)
   *   2. Every entry in `appState.sidebar_boards` that is a real board
   *      (id present, not an alert/special placeholder, not the
   *      current board, not the home board to avoid double-walking)
   *
   * Each walked buttonset gets the `home_lock_set` flag set on it so
   * `find_buttons` will tag the resulting cross-board breadcrumb with
   * the correct home_lock semantics — exactly what the original
   * `lookup(key, home_lock)` helper does.
   *
   * Runs asynchronously and silently; failures are swallowed because
   * the cross-board search degrades gracefully on its own when a
   * contributing board cannot be loaded.
   */
  _ensureCrossBoardSetsInStore() {
    var _this = this;
    var board = this.get('model.board');
    if (!board) { return; }
    var store = (board && board.store) || LingoLinq.store;
    var current_id = board.get('id');
    var stashes = this.get('stashes');
    var appState = this.get('appState');

    // Track ids we've already queued so we never walk the same board
    // twice in a single open (home board + sidebar entry could collide,
    // sidebar entries could collide with each other, etc.).
    var queued = {};

    var walk_one = function(target_id, home_lock) {
      if (!target_id) { return; }
      if (target_id == current_id) { return; }
      if (queued[target_id]) { return; }
      queued[target_id] = true;

      // Cheap path — already in store with usable buttons. Just stamp
      // home_lock_set on the existing record so cross-board breadcrumbs
      // come out correctly.
      var existing = store.peekRecord('buttonset', target_id);
      if (existing && existing.get('buttons') && existing.get('buttons.length')) {
        if (home_lock !== undefined) { existing.set('home_lock_set', home_lock); }
        return;
      }

      // Need to walk. findRecord goes through ember-data → persistence
      // → IndexedDB, so previously-synced boards resolve from local
      // cache when offline.
      store.findRecord('board', target_id).then(function(targetBoard) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (!targetBoard) { return; }
        _this._buildLocalButtonSet(targetBoard).then(function(bs) {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          if (bs && home_lock !== undefined) {
            bs.set('home_lock_set', home_lock);
          }
        }, function() { /* swallow */ });
      }, function() { /* swallow */ });
    };

    // (1) Home board.
    var home_board_id = (stashes && stashes.get('root_board_state.id')) ||
                        (appState && appState.get('currentUser.preferences.home_board.id'));
    walk_one(home_board_id, false);

    // (2) Sidebar boards. Only walk entries that are real boards —
    // skip alert/special placeholder entries that don't have a board id
    // or that mark themselves as non-board sidebar items.
    var sidebar = (appState && appState.get('sidebar_boards')) || [];
    sidebar.forEach(function(entry) {
      if (!entry) { return; }
      if (entry.alert || entry.special) { return; }
      if (!entry.id) { return; }
      walk_one(entry.id, !!entry.home_lock);
    });
  },

  _focusSearchInput() {
    var _this = this;
    runLater(function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      var el = document.getElementById('button_search_string');
      if (el) { el.focus(); }
    }, 100);
  },

  /**
   * Resolve the ButtonSet record for a board, preferring in-order:
   *   1. Already-attached `board.button_set` (set on previous open)
   *   2. Cached record in the ember-data store whose `full_set_revision`
   *      matches the current board (so edits invalidate it correctly)
   *   3. A freshly walked and pushed record built from the linked board
   *      hierarchy (no S3 / no server button set generation)
   *
   * The resulting record lives in the store, so subsequent opens on the
   * same page reuse it instantly, and it is indistinguishable from a
   * server-loaded ButtonSet as far as find_buttons / redepth / etc are
   * concerned.
   */
  _loadOrBuildButtonSet(board) {
    var _this = this;
    var store = board.store || LingoLinq.store;
    var board_id = board.get('id');
    var current_revision = board.get('full_set_revision');

    // (1) Already attached to the board.
    var attached = board.get('button_set');
    if (attached && attached.get('buttons') && attached.get('buttons.length')) {
      if (!current_revision || attached.get('full_set_revision') === current_revision) {
        return RSVP.resolve(attached);
      }
    }

    // (2) Cached in the store from a previous session / page load.
    var cached = store.peekRecord('buttonset', board_id);
    if (cached && cached.get('buttons') && cached.get('buttons.length')) {
      if (!current_revision || cached.get('full_set_revision') === current_revision) {
        return RSVP.resolve(cached);
      }
    }

    // (3) Walk the hierarchy and build a fresh record.
    return this._buildLocalButtonSet(board);
  },

  /**
   * Walk the board hierarchy client-side, mirroring the shape of the
   * flat button array that `BoardDownstreamButtonSet.generate_for`
   * produces on the server. Each entry includes the fields that
   * `ButtonSet.find_buttons` and `redepth` read:
   *
   *   { id, board_id, board_key, label, vocalization, image, image_id,
   *     hidden, link_disabled, depth, linked_board_id, linked_board_key,
   *     preferred_link, home_lock, locale }
   *
   * Board resolution goes through `store.findRecord('board', id)` so the
   * ember-data adapter + persistence layer serves cached boards
   * transparently when offline. Fetch failures are swallowed — the walk
   * continues with whatever boards it could reach, and find-button
   * degrades gracefully (sub-boards that could not be loaded are simply
   * absent from the flat list).
   *
   * BFS traversal with a hard board cap ensures termination on malformed
   * cyclic link graphs.
   */
  _buildLocalButtonSet(rootBoard) {
    var _this = this;
    var store = rootBoard.store || LingoLinq.store;
    var root_id = rootBoard.get('id');
    var root_revision = rootBoard.get('full_set_revision');

    var all_buttons = [];
    var visited = {};             // board_id → true (processed)
    var linked_seen = {};          // board_id → true (for preferred_link marking)
    var fetch_count = 0;

    // Extract buttons from a resolved board record into all_buttons.
    var process_board = function(board, depth) {
      var board_id = board.get('id');
      if (visited[board_id]) { return []; }
      visited[board_id] = true;

      var image_urls = board.get('image_urls') || {};
      var locale = board.get('locale') || 'en';
      var board_key = board.get('key');
      var raw_buttons = board.get('buttons') || [];
      var children_to_fetch = [];

      raw_buttons.forEach(function(btn) {
        if (!btn) { return; }

        var image_url = null;
        if (btn.image_id && image_urls[btn.image_id]) {
          image_url = image_urls[btn.image_id];
        }

        // `force_vocalize` mirrors the server's
        // `BoardDownstreamButtonSet.generate_for` field. It marks folder
        // buttons that *also* speak ("Add to Sentence" toggle on a
        // folder), so they are kept in the searchable buttons list by
        // `board_map` instead of being filtered out as pure navigation.
        // Without this, folders with vocalize-on-tap behavior would be
        // invisible to find-a-button.
        var force_vocalize = (btn.add_vocalization == null)
          ? !!btn.add_to_vocalization
          : !!btn.add_vocalization;

        var button_data = {
          id: btn.id,
          board_id: board_id,
          board_key: board_key,
          label: btn.label,
          vocalization: btn.vocalization,
          image: image_url,
          image_id: btn.image_id,
          sound_id: btn.sound_id,
          hidden: !!btn.hidden,
          link_disabled: !!btn.link_disabled,
          force_vocalize: force_vocalize,
          border_color: btn.border_color,
          background_color: btn.background_color,
          depth: depth,
          locale: locale
        };

        // Folder / linked board handling. Mirror the server's
        // preferred_link logic: the first time we see a link to a given
        // sub-board, mark it preferred and queue that board for walking.
        if (btn.load_board && btn.load_board.id) {
          button_data.linked_board_id = btn.load_board.id;
          if (btn.load_board.key) { button_data.linked_board_key = btn.load_board.key; }
          if (btn.home_lock) { button_data.home_lock = true; }

          if (!linked_seen[btn.load_board.id]) {
            linked_seen[btn.load_board.id] = true;
            button_data.preferred_link = true;
            if (fetch_count + children_to_fetch.length < LOCAL_WALK_MAX_BOARDS) {
              children_to_fetch.push({
                id: btn.load_board.id,
                depth: depth + 1
              });
            }
          }
        }

        all_buttons.push(button_data);
      });

      return children_to_fetch;
    };

    // Sequential-but-parallel walk: resolve all children of a level,
    // then recurse. ember-data dedupes concurrent findRecord calls for
    // the same id so there is no wasted work if two parent boards both
    // link to the same child.
    var walk_level = function(entries) {
      if (!entries.length) { return RSVP.resolve(); }
      var next_children = [];
      var promises = entries.map(function(entry) {
        if (visited[entry.id]) { return RSVP.resolve(); }
        if (fetch_count >= LOCAL_WALK_MAX_BOARDS) { return RSVP.resolve(); }
        fetch_count++;
        return store.findRecord('board', entry.id).then(function(child) {
          if (!child) { return; }
          var kids = process_board(child, entry.depth);
          next_children = next_children.concat(kids);
        }, function() {
          // Swallow: board unavailable (offline + not cached, deleted,
          // permission denied, etc.). The walk continues without it.
        });
      });
      return RSVP.all(promises).then(function() {
        return walk_level(next_children);
      });
    };

    fetch_count = 1;
    var initial_children = process_board(rootBoard, 0);

    return walk_level(initial_children).then(function() {
      if (_this.isDestroyed || _this.isDestroying) { return null; }

      // Push the freshly-built data into the ember-data store so it
      // acts exactly like a server-loaded ButtonSet — including being
      // picked up by future peekRecord calls and serialized into the
      // persistence layer (IndexedDB) alongside everything else.
      var payload = {
        data: {
          type: 'buttonset',
          id: root_id,
          attributes: {
            _actual_id: root_id,
            key: rootBoard.get('key'),
            buttons: all_buttons,
            full_set_revision: root_revision || ('local-' + (new Date()).getTime())
          }
        }
      };
      var record = store.push(payload);
      // Mark as locally generated so we can tell it apart from
      // server-loaded sets if we ever need to (e.g. for diagnostics).
      record.set('buttons_loaded', true);
      record.set('buttons_force_loaded', true);
      return record;
    });
  },

  search: observer('searchString', 'button_set', function() {
    const board = this.get('model.board');
    if (!board) {
      this.set('results', null);
      return;
    }
    if (this.get('searchString')) {
      const _this = this;
      if (!_this.get('results')) {
        _this.set('loading', true);
      }
      _this.set('error', null);
      const include_other_boards = this.get('model.include_other_boards');
      var bs = this.get('button_set') || board.get('button_set');
      if (board && bs) {
        if (!board.get('button_set')) { board.set('button_set', bs); }
        const user = this.get('appState').get('currentUser');
        const include_home = this.get('appState').get('speak_mode');
        const now = (new Date()).getTime();
        const search_id = Math.random() + '-' + now;
        _this.set('search_id', search_id);
        const interval = this.get('search_interval') || (capabilities.system === 'iOS' ? 400 : null);
        runLater(function() {
          if (_this.get('search_id') !== search_id) { _this.set('loading', true); return; }
          let search = null;
          if (_this.get('appState').get('feature_flags.find_multiple_buttons')) {
            search = board.get('button_set').find_sequence(_this.get('searchString'), board.get('id'), user, include_home);
          } else {
            search = board.get('button_set').find_buttons(_this.get('searchString'), board.get('id'), user, include_home);
          }
          search.then(function(results) {
            const timing = (new Date()).getTime() - now;
            if (timing > interval + 200) {
              _this.set('search_interval', Math.min(interval + 200, 1000));
            }
            if (persistence.get('online')) {
              _this.set('results', results);
              _this.set('loading', false);
            } else {
              const new_results = [];
              results.forEach(function(b) {
                const images = [b.image];
                if (b.sequence) {
                  b.steps.forEach(function(s) { images.push(s.button.image); });
                }
                const missing_image = images.find(function(i) { return !i || LingoLinq.remote_url(i); });
                if (!missing_image) {
                  new_results.push(b);
                }
              });
              RSVP.all_wait([]).then(null, function() { return RSVP.resolve(); }).then(function() {
                _this.set('results', new_results);
                _this.set('loading', false);
              });
            }
            _this.set('results', results);
            _this.set('loading', false);
          }, function(err) {
            _this.set('loading', false);
            _this.set('error', err && err.error);
          });
        }, interval);
      } else {
        this.set('loading', false);
        this.set('error', i18n.t('button_set_not_found', 'Button set not downloaded, please try syncing or going online and reopening this board'));
      }
    } else {
      this.set('results', null);
    }
  }),

  actions: {
    opening() {
      var modalService = this.get('modal');
      if (modalService && modalService.setComponent) {
        modalService.setComponent(this);
      }
      this._loadModelFromService();
      this.set('_findButtonOpeningSetupDone', false);
      this.runOpeningSetup();
    },
    close() {
      this.get('modal').close();
    },
    closing() {},
    pick_result(result) {
      if (!result) {
        result = this.get('results')[0];
      }
      if (!result) { return; }
      const appState = this.get('appState');
      const controller = appState.get('controller');
      const boardController = editManager && editManager.controller;
      const currentBoard = boardController && boardController.get && boardController.get('model');
      // Match search semantics (buttonset uses == for ids); strict === breaks when types differ.
      const onCurrentBoard = currentBoard && result.board_id == currentBoard.get('id');
      // Defensive cleanup helper. After the user taps a highlighted
      // button, the modal.highlight overlay's `.highlight` mask divs
      // (z-index 2001, absolutely positioned, covering everything
      // except the target) can linger in the DOM if the close path's
      // outlet cleanup misses them. Leftover masks intercept clicks
      // on every other button on the board, freezing the page from
      // the user's perspective. Forcibly remove them. We also blur
      // the activated button so its `:focus-visible` outline doesn't
      // persist as a "stuck selection" once activation is complete.
      var cleanup_after_activation = function($activated_btn) {
        try {
          document.querySelectorAll('.highlight').forEach(function(el) { el.remove(); });
        } catch(e) { }
        if ($activated_btn && $activated_btn[0] && typeof $activated_btn[0].blur === 'function') {
          try { $activated_btn[0].blur(); } catch(e) { }
        }
      };
      if (onCurrentBoard) {
        const board = currentBoard;
        const $button = $(".button[data-id='" + result.id + "']");
        modal.highlight($button, { highlight_type: 'button_search' }).then(function() {
          const button = editManager && editManager.find_button(result.id);
          if (controller && controller.activateButton && button && board) {
            controller.activateButton(button, { board: board, trigger_source: 'click' });
          }
          cleanup_after_activation($button);
        }, function() {
          cleanup_after_activation($button);
        });
      } else {
        let buttons = result.pre_buttons || [];
        if (result.pre_action === 'home') {
          buttons.unshift('home');
        }
        if (result.sequence) {
          result.steps.forEach(function(step) {
            if (step.sequence.pre === 'true_home') {
              buttons.push({ pre: 'true_home' });
            }
            step.sequence.buttons.forEach(function(btn) {
              buttons.push(btn);
            });
            buttons.push(step.button);
          });
        } else {
          buttons.push(result);
        }
        if (controller && controller.highlight_button) {
          // The application controller's `highlight_button` returns a
          // promise that resolves only after the user has tapped every
          // button in the guided sequence (the chained
          // modal.highlight().then() loop reaches `defer.resolve()`
          // when `buttons.shift()` empties the queue). Hook into that
          // to run our defensive cleanup at the END of the
          // walkthrough — after the final tap activates the last
          // button — so any leftover `.highlight` overlay DOM does
          // not block subsequent board interactions.
          var hl_promise = controller.highlight_button(buttons, this.get('button_set'));
          if (hl_promise && typeof hl_promise.then === 'function') {
            hl_promise.then(function() {
              cleanup_after_activation(null);
            }, function() {
              // Reject path: user pressed escape, modal force-closed,
              // or path-resolution failed. Cleanup is still important.
              cleanup_after_activation(null);
            });
          }
        }
      }
    }
  }
});

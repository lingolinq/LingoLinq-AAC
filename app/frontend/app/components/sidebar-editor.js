import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import RSVP from 'rsvp';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import { findExistingUserCopy } from '../utils/board-copy';
import { filterRootBoards, dedupeByName, boardsPagePreferUserNames } from '../utils/board-roots';
import { filterBrandRoots, BRAND_FAMILIES } from '../utils/board-brands';
import buildEventAction from '../utils/event_action';

/* Inline "Edit Sidebar" panel for the board-detail speak-mode sidebar. Reuses the
   My Board Collection panel chrome (the `md-board-collection` root layout + all the
   `md-board-collection__*` card/list/search styling, incl. dark-mode) so the two
   surfaces read identically. Sections:
     1. "On your sidebar"  — current items, with a remove (inline confirm).
     2. "Your Boards"      — the user's OWNED top-level boards (+ Alert / Crisis
                             defaults when missing), add directly.
     3. Brand families     — categorized PUBLIC boards (Quick Core, Sequoia, …),
                             same as the board-collection panel. Adding one the user
                             doesn't own COPIES it into their library first (progress
                             overlay), reusing an existing copy when one already
                             exists, then puts the copy on the sidebar.
   All three sections share one live search filter. */

// eslint-disable-next-line no-unused-vars
function _sidebar_editor_i18n_extractor_no_op() {
  i18n.t('edit_sidebar', "Edit Sidebar");
  i18n.t('sidebar_editor_current', "On your sidebar");
  i18n.t('sidebar_editor_your_boards', "Your Boards");
  i18n.t('sidebar_editor_remove_q', "Remove from sidebar?");
  i18n.t('sidebar_editor_add_q', "Add to sidebar?");
  i18n.t('sidebar_editor_adding', "Adding to your sidebar");
  i18n.t('sidebar_editor_copy_failed', "We couldn't add that board. Please try again.");
  i18n.t('sidebar_editor_already_added', "That board is already on your sidebar.");
  i18n.t('sidebar_editor_always_on', "Always on");
  i18n.t('sidebar_editor_cannot_remove', "Always on your sidebar — can't be removed");
  i18n.t('sidebar_editor_hide', "Hide from sidebar");
  i18n.t('sidebar_editor_show', "Show on sidebar");
  i18n.t('sidebar_editor_reorder_hint', "Drag and drop the boards below to change their order on your sidebar.");
  i18n.t('sidebar_editor_drag_to_reorder', "Drag to reorder");
  i18n.t('sidebar_editor_move_up', "Move up");
  i18n.t('sidebar_editor_move_down', "Move down");
}

function _alphaByName(boards) {
  var copy = (boards || []).filter(Boolean);
  copy.sort(function(a, b) {
    var an = (a.get && a.get('name')) || a.name || '';
    var bn = (b.get && b.get('name')) || b.name || '';
    return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
  });
  return copy;
}

/* Case-insensitive match against name + key — mirrors board-collection's filter. */
function _matchesQuery(name, key, q) {
  q = (q || '').trim().toLowerCase();
  if (!q) { return true; }
  return ((name || '').toLowerCase().indexOf(q) !== -1) ||
         ((key || '').toLowerCase().indexOf(q) !== -1);
}

/* Shape an Ember board record into the plain row object the template renders. */
function _shapeBoard(b, extra) {
  var grid = (b.get && b.get('grid')) || b.grid;
  var row = {
    id: (b.get && b.get('key')) || b.key,
    key: (b.get && b.get('key')) || b.key,
    name: (b.get && b.get('name')) || b.name,
    image: (b.get && b.get('icon_url_with_fallback')) || b.icon_url_with_fallback || b.image,
    rows: grid && grid.rows,
    columns: grid && grid.columns,
    record: b
  };
  if (extra) { for (var k in extra) { row[k] = extra[k]; } }
  return row;
}

export default Component.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  /* Reuse the My Board Collection panel chrome (root flex layout + all the
     `md-board-collection__*` card/list styling, incl. dark-mode overrides). */
  classNames: ['md-board-collection', 'md-sidebar-editor'],

  my_boards_state: null,
  brand_communikate: null,
  brand_quick_core: null,
  brand_sequoia: null,
  brand_vocal_flair: null,
  saving: false,
  busy_id: null,
  adding: false,
  adding_board_name: null,
  confirm_remove_idx: null,
  confirm_add_id: null,
  search_query: '',
  changed: false,
  _lastSave: null,
  draggingIdx: null,
  dropTargetIdx: null,

  didInsertElement: function() {
    this._super(...arguments);
    this._loadMyBoards();
    this._loadAllBrands();
  },

  willDestroyElement: function() {
    // Drop the save chain so the last (resolved) save promise isn't retained past
    // teardown. Saves themselves already no-op after destroy (the isDestroyed
    // guard in _save's runSave), so nothing in flight is interrupted.
    this._saveChain = null;
    this._super(...arguments);
  },

  search_active: computed('search_query', function() {
    return (this.get('search_query') || '').trim().length > 0;
  }),

  /* True once My Boards AND every brand family have settled (loaded or errored).
     The template holds all sections behind a single loading message until then, so
     the rows — with their grid-size pills — appear fully formed in one pass instead
     of popping in section-by-section (which shifted the remove/add buttons). */
  all_sections_loaded: computed('my_boards_state.state', 'brand_communikate.state', 'brand_quick_core.state', 'brand_sequoia.state', 'brand_vocal_flair.state', function() {
    var _this = this;
    var ready = function(s) { return s === 'loaded' || s === 'error'; };
    if (!ready(this.get('my_boards_state.state'))) { return false; }
    return BRAND_FAMILIES.every(function(f) { return ready(_this.get('brand_' + f.id + '.state')); });
  }),

  /* Current sidebar items in ARRAY ORDER — the same order the live speak-mode
     sidebar shows — so drag-and-drop reordering maps 1:1 onto the stored array.
     Each carries its raw index (`idx`) for unambiguous remove/reorder. Crisis →
     locked "Always on" pill (can't be removed; the server auto-adds it). Alert →
     eye toggle (hide/show persists). Everything else → remove (×). When Alert is
     hidden (absent from the array) a non-draggable "show" row is appended. */
  current_items: computed('appState.currentUser.preferences.sidebar_boards.[]', 'search_query', function() {
    var q = this.get('search_query');
    var raw = this.get('appState.currentUser.preferences.sidebar_boards') || [];
    var n = raw.length;
    var items = raw.map(function(b, idx) {
      var isAlert = !!b.alert;
      var isCrisis = !isAlert && b.key && (/crisis/i).test(b.key);
      return {
        id: 'cur:' + idx,
        idx: idx,
        name: b.name,
        image: b.image,
        key: b.key,
        special: !!b.special,
        protected: isCrisis,
        toggleable: isAlert,
        visible: true,
        reorderable: true,
        is_first: idx === 0,
        is_last: idx === n - 1
      };
    });
    if (!raw.some(function(b) { return b.alert; })) {
      var alertDef = this._default_sidebar_boards().find(function(d) { return d.alert; });
      if (alertDef) {
        items.push({ id: 'alert-hidden', idx: -1, name: alertDef.name || 'Alert', image: alertDef.image, alert: true, toggleable: true, visible: false, is_hidden: true, reorderable: false });
      }
    }
    return items.filter(function(it) { return _matchesQuery(it.name, it.key, q); });
  }),

  /* Reordering is disabled while a search filters the list (the visible subset no
     longer maps to contiguous array positions). */
  reorder_enabled: computed('search_active', function() {
    return !this.get('search_active');
  }),

  _default_sidebar_boards: function() {
    return (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.default_sidebar_boards) || [];
  },

  _current_lookup: function() {
    var raw = this.get('appState.currentUser.preferences.sidebar_boards') || [];
    var lookup = { keys: {}, slugs: {}, alert: false };
    raw.forEach(function(b) {
      if (b.alert) { lookup.alert = true; }
      else if (b.key) {
        lookup.keys[b.key] = true;
        // A copy keeps the original's slug under the user's namespace, so track the
        // bare slug too — that's how a public catalog board (someorg/<slug>) is
        // matched to the user's already-on-sidebar copy (username/<slug>).
        var slug = b.key.split('/').pop();
        if (slug) { lookup.slugs[slug] = true; }
      }
    });
    return lookup;
  },

  // The sidebar editor edits — and `_save` persists to — the CURRENT user's own
  // `preferences.sidebar_boards`, so the "Your Boards" list must come from that
  // SAME user. Use currentUser explicitly (not setup_user, which board-collection
  // uses for the board-PICKER setup flow): keeping the load subject identical to
  // the save subject means we can never display one user's library while writing
  // another's sidebar, even if setup_user semantics change later.
  _subjectUserId: function() {
    return this.appState.get('currentUser.id');
  },

  _loadMyBoards: function() {
    var userId = this._subjectUserId();
    if (!userId) { this.set('my_boards_state', { state: 'error' }); return; }
    this._loadMyBoardsPage(userId, null, []);
  },

  _loadMyBoardsPage: function(userId, offset, accumulated) {
    var _this = this;
    var args = { user_id: userId, sort: 'home_popularity', per_page: 50 };
    if (offset != null) { args.offset = offset; }
    LingoLinq.store.query('board', args).then(function(data) {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      var next = accumulated.slice();
      if (data && data.forEach) { data.forEach(function(b) { if (b) { next.push(b); } }); }
      var meta = null;
      try { meta = _this.get('persistence') && _this.get('persistence').meta('board', data); } catch (e) { meta = null; }
      if (meta && meta.more) { _this._loadMyBoardsPage(userId, meta.next_offset, next); return; }
      _this.set('my_boards_state', { state: 'loaded', boards: _this._sortMyBoards(next) });
    }).catch(function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      if (accumulated && accumulated.length) {
        _this.set('my_boards_state', { state: 'loaded', boards: _this._sortMyBoards(accumulated) });
      } else {
        _this.set('my_boards_state', { state: 'error' });
      }
    });
  },

  /* Top-level boards only (cluster sub-board copies to their root with
     filterRootBoards + drop brand-family sub-pages with filterBrandRoots), then
     dedupe same-name copies and alphabetize — same roots-only + dedupe rules the
     My Board Collection panel uses, so no sub-boards or duplicates leak. */
  _sortMyBoards: function(boards) {
    boards = filterBrandRoots(filterRootBoards(boards || [], this._subjectUserId()));
    boards = dedupeByName(boards, { preferUserNames: boardsPagePreferUserNames(this.get('appState')) });
    return _alphaByName(boards);
  },

  /* Categorized PUBLIC brand families — identical query/filter/dedup to the board
     collection panel (roots only, deduped by name, alphabetized). */
  _loadAllBrands: function() {
    var _this = this;
    BRAND_FAMILIES.forEach(function(family) {
      LingoLinq.store.query('board', {
        public: true,
        q: family.query,
        sort: 'home_popularity',
        per_page: 50
      }).then(function(data) {
        var matched = [];
        if (data && data.forEach) {
          data.forEach(function(b) {
            if (!family.test(b)) { return; }
            var key = (b && b.get && b.get('key')) || '';
            if (family.root_re && !family.root_re.test(key)) { return; }
            matched.push(b);
          });
        }
        _this._setBrandResult(family.id, { state: 'loaded', boards: _alphaByName(dedupeByName(matched, { preferUserNames: boardsPagePreferUserNames(_this.get('appState')) })) });
      }).catch(function() {
        _this._setBrandResult(family.id, { state: 'error' });
      });
    });
  },

  _setBrandResult: function(familyId, result) {
    if (this.isDestroyed || this.isDestroying) { return; }
    this.set('brand_' + familyId, result);
  },

  /* "Your Boards": the user's own top-level boards not already on the sidebar,
     filtered by search. These add DIRECTLY (the user already owns them). Alert +
     Crisis Vocabulary are NOT here — they live in the "On your sidebar" list with a
     visibility toggle (they can't be removed, only hidden). */
  your_boards: computed('my_boards_state.boards.[]', 'appState.currentUser.preferences.sidebar_boards.[]', 'search_query', function() {
    var q = this.get('search_query');
    var lookup = this._current_lookup();
    var list = [];
    (this.get('my_boards_state.boards') || []).forEach(function(b) {
      var key = (b.get && b.get('key')) || b.key;
      if (!key || lookup.keys[key]) { return; }
      list.push(_shapeBoard(b, { needs_copy: false }));
    });
    return list.filter(function(it) { return _matchesQuery(it.name, it.key, q); });
  }),

  /* Categorized public brand sections — boards the user likely doesn't own, so
     adding one COPIES it first (needs_copy: true). Mirrors board-collection. */
  ordered_brands: computed('brand_communikate', 'brand_quick_core', 'brand_sequoia', 'brand_vocal_flair', 'appState.currentUser.preferences.sidebar_boards.[]', 'search_query', function() {
    var q = this.get('search_query');
    var lookup = this._current_lookup();
    return BRAND_FAMILIES.map(function(family) {
      var result = this.get('brand_' + family.id) || { state: 'loading' };
      var boards = (result.boards || []).map(function(b) { return _shapeBoard(b, { needs_copy: true }); })
        .filter(function(it) {
          if (!_matchesQuery(it.name, it.key, q)) { return false; }
          // Hide a catalog board once the user has its copy on the sidebar, so they
          // can't add a duplicate.
          var slug = (it.key || '').split('/').pop();
          if (slug && lookup.slugs[slug]) { return false; }
          return true;
        });
      return {
        id: family.id,
        label_key: family.label_key,
        default_label: family.default_label,
        state: result.state,
        boards: boards
      };
    }, this);
  }),

  _save: function(newArray) {
    var _this = this;
    var user = this.get('appState.currentUser');
    if (!user || !user.set) { return RSVP.resolve(); }
    this.set('saving', true);
    this.set('changed', true);
    // Update the live preference synchronously so the UI (current_items) reflects
    // the change immediately, regardless of when the network save runs.
    user.set('preferences.sidebar_boards', newArray);
    if (!user.save) { this.set('saving', false); this.set('busy_id', null); return RSVP.resolve(); }
    var clear = function() {
      if (!_this.isDestroyed && !_this.isDestroying) { _this.set('saving', false); _this.set('busy_id', null); }
    };
    // SERIALIZE saves: chain each user.save() off the previous one so two quick
    // actions (e.g. successive drag-drops) can't run concurrent saves — which
    // could PUT out of order (a lost update) or trip Ember Data's "save already in
    // flight" error. Each chained save serializes the model's CURRENT prefs (the
    // latest array, since the set above already applied), so coalescing is safe.
    var runSave = function() {
      if (_this.isDestroyed || _this.isDestroying) { return RSVP.resolve(); }
      return user.save();
    };
    var prior = this._saveChain || RSVP.resolve();
    var promise = prior.then(runSave, runSave);
    // Keep the chain alive past a rejection so one failed save can't wedge the queue.
    this._saveChain = promise.then(function() {}, function() {});
    promise.then(clear, clear);
    this.set('_lastSave', promise);
    return promise;
  },

  /* Reload the speak page so the live inline sidebar fully reflects the saved set
     (it doesn't reliably re-render freshly-saved sidebar_boards / freshly-copied
     board records in place). Falls back to a plain close if reload is unavailable. */
  _reloadSpeakPage: function() {
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
      window.location.reload();
      return;
    }
    var fn = this.get('onBack');
    if (typeof fn === 'function') { fn(); }
  },

  /* When a removed item is one of the user's OWN boards, make sure it's present in
     the loaded owned-boards list so it reappears under "Your Boards" immediately —
     covers boards copied during THIS session (loaded once at open, so not yet in
     `my_boards_state`). Pre-existing owned boards are already in the list and
     re-list via the sidebar dependency; public defaults (Alert / Crisis) come back
     via the defaults loop in `your_boards`, so they're skipped here. */
  _restoreToYourBoards: function(item) {
    if (!item || item.alert || item.special || !item.key) { return; }
    var userName = this.get('appState.currentUser.user_name');
    if (!userName || item.key.indexOf(userName + '/') !== 0) { return; }
    var state = this.get('my_boards_state');
    if (!state || state.state !== 'loaded') { return; }
    var boards = state.boards || [];
    var exists = boards.some(function(b) { return ((b.get && b.get('key')) || b.key) === item.key; });
    if (exists) { return; }
    var next = boards.slice();
    next.push({ key: item.key, name: item.name, image: item.image });
    this.set('my_boards_state', { state: 'loaded', boards: _alphaByName(next) });
  },

  /* Append one entry to the sidebar and persist. Guards against a duplicate key:
     even though add buttons are disabled while busy and `lookup.keys` is checked
     before reaching here, re-check against the LIVE array at write time so a
     rapid/concurrent add can't push the same board onto the sidebar twice. */
  _pushEntry: function(entry) {
    var raw = (this.get('appState.currentUser.preferences.sidebar_boards') || []).slice();
    if (entry && entry.key && raw.some(function(b) { return b && b.key === entry.key; })) {
      return RSVP.resolve();
    }
    raw.push(entry);
    return this._save(raw);
  },

  /* Symbol library for a copy — the user's preferred set gated by extras access
     (mirrors board-preview-overlay#pick_for_home); falls back to 'original'. */
  _copyLibrary: function(user) {
    var lib = (user.get && user.get('preferences.preferred_symbols')) || 'original';
    if (['pcs', 'symbolstix', 'lessonpix'].indexOf(lib) !== -1) {
      if (!user.get('extras_enabled') && !user.get('subscription.extras_enabled')) { lib = 'original'; }
    }
    return lib;
  },

  /* Add a board the user may not own: reuse an existing copy if there is one, else
     copy the public board into the user's library (progress overlay), then put the
     resulting owned board on the sidebar. */
  _addWithCopy: function(row) {
    var _this = this;
    var user = this.get('appState.currentUser');
    var board = row && row.record;
    if (!board || !user || !user.save) {
      modal.error(i18n.t('sidebar_editor_copy_failed', "We couldn't add that board. Please try again."));
      return;
    }
    this.set('adding', true);
    this.set('adding_board_name', row.name);
    var lookup = this._current_lookup();
    var finish = function() {
      if (!_this.isDestroyed && !_this.isDestroying) { _this.set('adding', false); _this.set('adding_board_name', null); }
    };
    var fail = function(err) {
      finish();
      var msg = (typeof err === 'string' && err) ? err : i18n.t('sidebar_editor_copy_failed', "We couldn't add that board. Please try again.");
      modal.error(msg);
    };
    var addOwned = function(owned) {
      var key = owned.get('key');
      if (lookup.keys[key]) { finish(); modal.notice(i18n.t('sidebar_editor_already_added', "That board is already on your sidebar.")); return; }
      _this._pushEntry({ name: owned.get('name'), key: key, image: owned.get('icon_url_with_fallback') }).then(finish, finish);
    };
    findExistingUserCopy(board, user).then(function(existing) {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      if (existing) { addOwned(existing); return; }
      // Load the full original (its downstream ids drive the copy) before copying.
      LingoLinq.store.findRecord('board', board.get('id'), { reload: true }).then(function(full) {
        var src = full || board;
        editManager.copy_board(src, 'links_copy', user, false, _this._copyLibrary(user)).then(addOwned, fail);
      }, function() {
        editManager.copy_board(board, 'links_copy', user, false, _this._copyLibrary(user)).then(addOwned, fail);
      });
    }, function() {
      // Dedup lookup itself failed — copy fresh rather than block the user.
      if (_this.isDestroyed || _this.isDestroying) { return; }
      editManager.copy_board(board, 'links_copy', user, false, _this._copyLibrary(user)).then(addOwned, fail);
    });
  },

  actions: {
    back: function() {
      var _this = this;
      // If boards were added/removed, reload the speak page (after the save settles)
      // so the just-edited sidebar shows in full — otherwise a freshly-added board
      // can look like it didn't take. No changes → just close the panel.
      if (this.get('changed')) {
        var save = this.get('_lastSave') || RSVP.resolve();
        save.then(function() { _this._reloadSpeakPage(); }, function() { _this._reloadSpeakPage(); });
        return;
      }
      var fn = this.get('onBack');
      if (typeof fn === 'function') { fn(); }
    },
    update_search: function(event) {
      this.set('search_query', (event && event.target && event.target.value) || '');
    },
    clear_search: function() {
      this.set('search_query', '');
    },
    request_remove: function(item) {
      this.set('confirm_add_id', null);
      this.set('confirm_remove_idx', item.idx);
    },
    cancel_remove: function() {
      this.set('confirm_remove_idx', null);
    },
    /* ── Drag-and-drop reorder (native HTML5 DnD, mirrors label-chips). Operates on
       raw array indices (item.idx) and persists the reordered array on drop. ── */
    row_drag_start: function(item, event) {
      if (!item.reorderable || !this.get('reorder_enabled')) {
        if (event && event.preventDefault) { event.preventDefault(); }
        return;
      }
      this.set('confirm_remove_idx', null);
      this.set('draggingIdx', item.idx);
      if (event && event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', String(item.idx)); } catch (e) { /* Firefox needs data set */ }
      }
    },
    row_drag_over: function(item, event) {
      if (!item.reorderable) { return; }
      if (this.get('draggingIdx') === null || this.get('draggingIdx') === undefined) { return; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && event.stopPropagation) { event.stopPropagation(); }
      if (event && event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
      if (this.get('dropTargetIdx') !== item.idx) { this.set('dropTargetIdx', item.idx); }
    },
    row_drag_leave: function(item) {
      if (this.get('dropTargetIdx') === item.idx) { this.set('dropTargetIdx', null); }
    },
    row_drop: function(item, event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && event.stopPropagation) { event.stopPropagation(); }
      var from = this.get('draggingIdx');
      var to = item.idx;
      this.set('draggingIdx', null);
      this.set('dropTargetIdx', null);
      if (!item.reorderable || from === null || from === undefined || from === to) { return; }
      var raw = (this.get('appState.currentUser.preferences.sidebar_boards') || []).slice();
      if (from < 0 || from >= raw.length || to < 0 || to >= raw.length) { return; }
      var moved = raw.splice(from, 1)[0];
      raw.splice(to, 0, moved);
      this._save(raw);
    },
    row_drag_end: function() {
      this.set('draggingIdx', null);
      this.set('dropTargetIdx', null);
    },
    /* Keyboard / touch-friendly reorder: move a row one slot up or down. Same array
       splice + persist as the drag reorder, so all three paths agree. */
    move_up: function(item) {
      if (!item.reorderable) { return; }
      var raw = (this.get('appState.currentUser.preferences.sidebar_boards') || []).slice();
      if (item.idx <= 0 || item.idx >= raw.length) { return; }
      var moved = raw.splice(item.idx, 1)[0];
      raw.splice(item.idx - 1, 0, moved);
      this._save(raw);
    },
    move_down: function(item) {
      if (!item.reorderable) { return; }
      var raw = (this.get('appState.currentUser.preferences.sidebar_boards') || []).slice();
      if (item.idx < 0 || item.idx >= raw.length - 1) { return; }
      var moved = raw.splice(item.idx, 1)[0];
      raw.splice(item.idx + 1, 0, moved);
      this._save(raw);
    },
    /* Alert visibility toggle (eye ↔ eye-slash). Visible (in array) → remove;
       hidden → add back. Persists because Alert isn't a server auto-add key. */
    toggle_alert: function(item) {
      var raw = (this.get('appState.currentUser.preferences.sidebar_boards') || []).slice();
      if (item.visible && item.idx >= 0 && item.idx < raw.length) {
        raw.splice(item.idx, 1);
      } else if (!item.visible) {
        raw.push({ name: item.name, alert: true, special: true, image: item.image });
      }
      this.set('confirm_remove_idx', null);
      this.set('busy_id', item.id);
      this._save(raw);
    },
    confirm_remove: function(item) {
      var raw = (this.get('appState.currentUser.preferences.sidebar_boards') || []).slice();
      if (item.idx >= 0 && item.idx < raw.length) { raw.splice(item.idx, 1); }
      this.set('confirm_remove_idx', null);
      this.set('busy_id', item.id);
      this._restoreToYourBoards(item);
      this._save(raw);
    },
    request_add: function(board) {
      this.set('confirm_remove_idx', null);
      this.set('confirm_add_id', board.id);
    },
    cancel_add: function() {
      this.set('confirm_add_id', null);
    },
    confirm_add: function(board) {
      this.set('confirm_add_id', null);
      if (board.needs_copy) {
        this._addWithCopy(board);
      } else if (board.alert) {
        this.set('busy_id', board.id);
        this._pushEntry({ name: board.name, alert: true, special: true, image: board.image });
      } else {
        this.set('busy_id', board.id);
        this._pushEntry({ name: board.name, key: board.key, image: board.image });
      }
    }
  },

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    // For `input` bindings: the handler reads event.target.value, which the
    // generic ctrlAction above discards (5.12 upgrade #490), so the search
    // box never filtered. ctrlAction is unchanged for clicks.
    this.eventAction = buildEventAction(this);
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  }
});

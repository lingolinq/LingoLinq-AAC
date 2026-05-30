import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import LingoLinq from '../app';
import i18n from '../utils/i18n';

/* Brand families surfaced in the speak-mode "My Board Collection"
   panel. Each family is shown as its own alphabetized section under
   the user's "My Boards" list.

   `query` is the server-side `q=` term used to fetch a candidate set.
   `test(board)` is the client-side guard: server search may match
   tangentially-related boards by description/keyword, so we drop
   anything whose key OR name doesn't actually contain the brand
   marker. Order of this array drives the section order in the
   rendered panel. */
const BRAND_FAMILIES = [
  {
    id: 'communikate',
    label_key: 'communikate',
    default_label: 'CommuniKate',
    query: 'CommuniKate',
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)communikate\b/i.test(key) || /\bcommunikate\b/i.test(name);
    }
  },
  {
    id: 'quick_core',
    label_key: 'quick_core',
    default_label: 'Quick Core',
    query: 'Quick Core',
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)quick-core\b/i.test(key) || /\bquick[\s-]?core\b/i.test(name);
    }
  },
  {
    id: 'sequoia',
    label_key: 'sequoia',
    default_label: 'Sequoia',
    query: 'Sequoia',
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)sequoia\b/i.test(key) || /\bsequoia\b/i.test(name);
    }
  },
  {
    id: 'vocal_flair',
    label_key: 'vocal_flair',
    default_label: 'Vocal Flair',
    query: 'Vocal Flair',
    test: function(board) {
      var key = (board && board.get && board.get('key')) || '';
      var name = (board && board.get && board.get('name')) || '';
      return /(?:^|\/|-)vocal-flair\b/i.test(key) || /\bvocal[\s-]?flair\b/i.test(name);
    }
  }
];

/* Static i18n declarations — the section headers render via dynamic
   `{{t section.default_label key=section.label_key}}` in the template,
   which i18n_generator.rb's static parser cannot extract. Mirrors the
   `_customize_menu_i18n_extractor_no_op` pattern used elsewhere in
   the codebase (see controllers/user/board-detail.js). */
// eslint-disable-next-line no-unused-vars
function _board_collection_i18n_extractor_no_op() {
  i18n.t('my_board_collection', "My Board Collection");
  i18n.t('back_to_options', "Back to Options");
  i18n.t('my_boards', "My Boards");
  i18n.t('communikate', "CommuniKate");
  i18n.t('quick_core', "Quick Core");
  i18n.t('sequoia', "Sequoia");
  i18n.t('vocal_flair', "Vocal Flair");
  i18n.t('loading_boards', "Loading boards…");
  i18n.t('no_boards_found', "No boards found");
  i18n.t('boards_load_error', "Couldn't load boards");
  i18n.t('show_n_more_boards', "Show %{n} more boards");
  i18n.t('show_fewer_boards', "Show fewer");
  i18n.t('board_collection_search_placeholder', "Search boards");
  i18n.t('clear_search', "Clear search");
  i18n.t('no_search_matches', "No boards match your search");
}

/* Natural sort by name — embedded numbers compare as numbers, not as
   strings. Pure lexicographic ordering puts "Quick Core 112" before
   "Quick Core 20" because the character '1' < '2' (lexicographically),
   which is the opposite of what a user expects when scanning a list
   of variants. `localeCompare` with `{numeric: true}` collates digit
   runs as integers so 20 < 24 < 40 < 60 < 84 < 112 the way a human
   reads them. `sensitivity: 'base'` makes the compare case-insensitive
   (replaces the prior .toLowerCase() normalization). */
function _alphaByName(boards) {
  if (!boards || !boards.length) { return []; }
  var copy = [];
  boards.forEach(function(b) { if (b) { copy.push(b); } });
  copy.sort(function(a, b) {
    var an = (a.get && a.get('name')) || '';
    var bn = (b.get && b.get('name')) || '';
    return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
  });
  return copy;
}

/* Case-insensitive name filter. Empty / blank queries return the
   input list unchanged. The board's `key` is also matched so users
   can filter by URL slug (e.g. "quick-core-60") even when the
   visible name uses spacing/casing. */
function _filterByName(boards, query) {
  if (!boards || !boards.length) { return boards || []; }
  var q = (query || '').trim().toLowerCase();
  if (!q) { return boards; }
  var out = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var name = ((b.get && b.get('name')) || '').toLowerCase();
    var key = ((b.get && b.get('key')) || '').toLowerCase();
    if (name.indexOf(q) !== -1 || key.indexOf(q) !== -1) { out.push(b); }
  });
  return out;
}

/* Drop boards whose `name` is an exact duplicate of an earlier entry
   in the input. Order of `boards` is preserved — the FIRST entry for
   each name wins. Empty / missing names are not deduped (each gets
   through) since a board with no name is unusual and there's no safe
   way to assert two such records are "the same". Used by the brand
   sections to collapse the common case where multiple owners ship
   identically-named copies (e.g. several "Quick Core 60" boards). */
function _dedupByName(boards) {
  if (!boards || !boards.length) { return []; }
  var seen = Object.create(null);
  var out = [];
  boards.forEach(function(b) {
    if (!b) { return; }
    var name = (b.get && b.get('name')) || '';
    if (!name) { out.push(b); return; }
    if (seen[name]) { return; }
    seen[name] = true;
    out.push(b);
  });
  return out;
}

export default Component.extend({
  appState: service('app-state'),
  router: service('router'),
  persistence: service('persistence'),
  classNames: ['md-board-collection'],
  /* Dark-mode styling triggers through the page shell's
     `.md-board-detail--dark` ancestor class (applied in
     templates/user/board-detail.hbs:1), so no per-component class
     binding is needed — the cascade handles it. */

  /* Per-section result holders. `null` is treated as "loading" by the
     template. Each holder resolves to one of:
       { state: 'loaded', boards: [...] }
       { state: 'error' }
     Kept as separate properties (not a single dictionary) so that an
     individual brand's resolved query reactively updates `ordered_brands`
     without racing the other three in-flight requests. */
  my_boards_state: null,
  brand_communikate: null,
  brand_quick_core: null,
  brand_sequoia: null,
  brand_vocal_flair: null,

  /* Show-more state for the My Boards section. Default 5 rows
     (home + first 4 favorites/others); the rest live behind a
     "Show N more" toggle at the bottom of the section. Brand
     sections are always fully expanded — they're already deduped
     and a power user wants to scan the full set. */
  my_boards_expanded: false,
  MY_BOARDS_DEFAULT_LIMIT: 5,

  /* Live-filter input at the top of the panel. Empty string means
     "no filter active" (the panel renders normally with the 5-row
     My Boards cap + Show more toggle). Any non-empty value bypasses
     the cap (the user is searching, they want everything that matches)
     and case-insensitively narrows each section by board name. */
  search_query: '',

  didInsertElement: function() {
    this._super(...arguments);
    this._loadMyBoards();
    this._loadAllBrands();
  },

  _subjectUserId: function() {
    /* Match the existing My Boards flow's user lookup: prefer the
       supervisee being set up if there is one, fall back to the
       signed-in user. Mirrors the helper in components/board-picker.js
       so a supervisor browsing for their student sees the student's
       roots first. */
    var su = this.appState.get('setup_user');
    if (su && su.get('id')) { return su.get('id'); }
    return this.appState.get('currentUser.id');
  },

  _loadMyBoards: function() {
    /* My Boards section = the same set the user sees as tiles on the
       /u/:user_name boards page. Two non-obvious gotchas the boards
       page taught us (and that v1 of this component got wrong):

       1. Per-page is server-capped at 50 (`lib/json_api/board.rb`).
          Asking for a higher per_page silently returns 50 — so a
          single request can leave roots off the end of the list when
          the account has many sub-board copies in the same page.

       2. `?user_id=X` returns owned boards INCLUDING every sub-board
          copy in a copied set. Client-side `filterRootBoards` works
          but is sensitive to which records landed on the first
          page. The boards page sidesteps both by paginating through
          `meta.more` / `meta.next_offset` and accumulating.

       Simpler approach: ask the server to return ROOTS ONLY via
       `root: true` (same param the boards page's "Root" tab uses).
       That eliminates the need for client-side clustering AND keeps
       the page count tiny — a user with 8 root tiles fits in one
       page regardless of how many sub-board copies they have. We
       still paginate to be safe against extreme cases. */
    var _this = this;
    var userId = _this._subjectUserId();
    if (!userId) {
      _this.set('my_boards_state', { state: 'error' });
      return;
    }
    _this._loadMyBoardsPage(userId, null, []);
  },

  _loadMyBoardsPage: function(userId, offset, accumulated) {
    var _this = this;
    var args = { user_id: userId, root: true, sort: 'home_popularity', per_page: 50 };
    if (offset != null) { args.offset = offset; }
    LingoLinq.store.query('board', args).then(function(data) {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      var next = accumulated.slice();
      if (data && data.forEach) {
        data.forEach(function(b) { if (b) { next.push(b); } });
      }
      var meta = null;
      try { meta = _this.get('persistence') && _this.get('persistence').meta('board', data); } catch (e) { meta = null; }
      if (meta && meta.more) {
        _this._loadMyBoardsPage(userId, meta.next_offset, next);
        return;
      }
      _this.set('my_boards_state', { state: 'loaded', boards: _this._sortMyBoards(next) });
    }).catch(function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      /* If we already paged some boards before the failure, render
         what we have rather than an error — partial > empty. */
      if (accumulated && accumulated.length) {
        _this.set('my_boards_state', { state: 'loaded', boards: _this._sortMyBoards(accumulated) });
      } else {
        _this.set('my_boards_state', { state: 'error' });
      }
    });
  },

  /* The subject's home board key (currentUser or the supervisee under
     setup). Used both to mark the row visually AND to anchor it at
     the top of the My Boards list. Returns '' (falsy) when no home
     board is set so callers can short-circuit. */
  _subjectHomeKey: function() {
    var su = this.appState.get('setup_user');
    if (su && su.get('id')) {
      return su.get('preferences.home_board.key') || '';
    }
    return this.appState.get('currentUser.preferences.home_board.key') || '';
  },

  /* My Boards ordering: home board → favorites (starred) → everyone
     else, with the second and third groups individually natural-
     sorted by name. Mirrors the dashboard preview rule (see
     `components/dashboard/authenticated-view.js`) so the user's
     anchor boards land in the same position across surfaces.
     `starred` is the boolean the Liked-tab on the boards page reads,
     so users who organize via the heart icon there get the same
     prioritization here automatically. */
  _sortMyBoards: function(boards) {
    var homeKey = this._subjectHomeKey();
    var home = null;
    var starred = [];
    var rest = [];
    (boards || []).forEach(function(b) {
      if (!b) { return; }
      var key = (b.get && b.get('key')) || b.key;
      if (homeKey && key === homeKey && !home) { home = b; return; }
      if (b.get && b.get('starred')) { starred.push(b); return; }
      rest.push(b);
    });
    var result = [];
    if (home) { result.push(home); }
    _alphaByName(starred).forEach(function(b) { result.push(b); });
    _alphaByName(rest).forEach(function(b) { result.push(b); });
    return result;
  },

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
          data.forEach(function(b) { if (family.test(b)) { matched.push(b); } });
        }
        /* Dedup by exact name. Public brand listings routinely include
           several copies of the same board (different owners shipping
           a "Quick Core 60" each), and the user only wants one row per
           distinct name. The server sort is home_popularity DESC, so
           the FIRST occurrence of a given name is the most-popular
           variant — keep that one and drop the rest. Alphabetize
           AFTER dedup so the final order is name-A→Z but the chosen
           representative is the popular one. Empty / missing names
           pass through unchanged (each gets its own row). */
        _this._setBrandResult(family.id, { state: 'loaded', boards: _alphaByName(_dedupByName(matched)) });
      }).catch(function() {
        _this._setBrandResult(family.id, { state: 'error' });
      });
    });
  },

  _setBrandResult: function(familyId, result) {
    if (this.isDestroyed || this.isDestroying) { return; }
    this.set('brand_' + familyId, result);
  },

  /* True when the user has typed something into the top-of-panel
     search input. Switches the panel into "search results" mode:
     the 5-row My Boards cap is bypassed and brand sections shrink
     to only matching boards. */
  search_active: computed('search_query', function() {
    return (this.get('search_query') || '').trim().length > 0;
  }),

  /* Slice of my_boards_state.boards actually rendered. Honors the
     5-row default cap unless the user has clicked "Show more" OR
     a search is active (search results show every match). When the
     section hasn't loaded yet (or errored), pass the raw value
     through so the template's state branches keep working. */
  visible_my_boards: computed('my_boards_state.boards.[]', 'my_boards_expanded', 'search_query', function() {
    var all = this.get('my_boards_state.boards');
    if (!all || !all.length) { return all || []; }
    var filtered = _filterByName(all, this.get('search_query'));
    if (this.get('search_active') || this.get('my_boards_expanded')) { return filtered; }
    return filtered.slice(0, this.MY_BOARDS_DEFAULT_LIMIT);
  }),

  /* Count of My Boards rows hidden behind the show-more button.
     Drives the button's label ("Show 3 more") and its own visibility
     — when zero (or when a search is active) we suppress the button
     entirely. */
  my_boards_overflow_count: computed('my_boards_state.boards.[]', 'search_query', function() {
    if (this.get('search_active')) { return 0; }
    var all = this.get('my_boards_state.boards');
    if (!all || !all.length) { return 0; }
    return Math.max(0, all.length - this.MY_BOARDS_DEFAULT_LIMIT);
  }),

  /* The board key (`<owner>/<slug>`) the subject treats as their home
     board. Surfaced to the template so each row can compare its own
     key and render the home indicator (glyphicon-home, matching the
     pattern in `templates/components/board-icon.hbs`). Returns '' when
     no home board is set; the template's `(is_equal board.key '')` then
     never matches a real row. */
  home_key: computed(
    'appState.currentUser.preferences.home_board.key',
    'appState.setup_user.preferences.home_board.key',
    function() {
      return this._subjectHomeKey();
    }
  ),

  ordered_brands: computed('brand_communikate', 'brand_quick_core', 'brand_sequoia', 'brand_vocal_flair', 'search_query', function() {
    var _this = this;
    var query = _this.get('search_query');
    return BRAND_FAMILIES.map(function(family) {
      var result = _this.get('brand_' + family.id) || { state: 'loading' };
      return {
        id: family.id,
        label_key: family.label_key,
        default_label: family.default_label,
        state: result.state,
        boards: _filterByName(result.boards || [], query)
      };
    });
  }),

  actions: {
    back: function() {
      var fn = this.get('onBack');
      if (typeof fn === 'function') { fn(); }
    },
    toggle_my_boards_expanded: function() {
      this.toggleProperty('my_boards_expanded');
    },
    update_search: function(event) {
      var value = (event && event.target && event.target.value) || '';
      this.set('search_query', value);
    },
    clear_search: function() {
      this.set('search_query', '');
      var input = this.element && this.element.querySelector && this.element.querySelector('.md-board-collection__search-input');
      if (input) { input.focus(); }
    },
    select_board: function(board) {
      /* Hand off to the outer controller — it owns the options-menu
         visibility flag (`show_options_menu`) and the collection flag,
         and needs to close both before the route transitions. The
         controller's action also does the actual `router.transitionTo`
         so any navigation policy lives in one place. */
      var fn = this.get('onSelect');
      if (typeof fn === 'function' && board) { fn(board); }
    }
  }
});

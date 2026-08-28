import Component from '@ember/component';
import buildEventAction from '../utils/event_action';
import { getOwner } from '@ember/application';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { alias } from '@ember/object/computed';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import modalUtil from '../utils/modal';
import utterance from '../utils/utterance';
import speecher from '../utils/speecher';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';

/**
 * Speak Menu Modal Component
 *
 * Converted from speak-menu template/controller to component for the
 * service-based modal system. Avoids route.render() so main content stays visible.
 */
/* Distance from the top of the viewport to the top of the Speak Options modal. Clamped at
   0 by the caller — see the note in `place()`.

   Whatever this is, .md-speak-menu's `max-height` subtracts it (via the --sm-menu-top
   custom property this publishes), so the panel's BOTTOM stays on screen as the top moves
   down. The two must not be set independently. */
const SPEAK_MENU_TOP_PX = 4;

/* Row geometry, in step with `.md-speak-menu__bottom-btn--remembered` in app.scss.
   PHRASE_ROW_H is that rule's fixed `height` and PHRASE_ROW_GAP its `margin-bottom`;
   n rows occupy n*H + (n-1)*GAP because the last row's margin is zeroed. PHRASE_PAGER_H is
   the Up/Down row's footprint (44px target + 6px margin + slack), reserved only when a
   pager is actually going to be shown. */
const PHRASE_ROW_H = 60;
const PHRASE_ROW_GAP = 6;
const PHRASE_PAGER_H = 56;
/* Fallback only — used before the first measurement lands. */
const PHRASE_PAGE_SIZE_DEFAULT = 4;
/* How many times the fit may step down before giving up — see apply_phrase_page_size. */
const PHRASE_FIT_TRIES = 4;

export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  stashes: service('stashes'),
  app_state: alias('appState'),
  tagName: '',

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
    /*
     * ButtonListener's handler, deliberately NOT `ctrlAction`.
     *
     * `ctrlAction` looks at the LAST argument and, if it smells like a DOM event, calls
     * preventDefault and POPS it. That is right for `{{on "click"}}`, where the event is
     * trailing noise. It is wrong here: ButtonListener calls
     * `buttonEvent('speakMenuSelect', button_id, event)` and the event IS the third
     * parameter — `button_event(event, button, full_event)`. So ctrlAction ate `full_event`
     * on every single speak-menu tap, and any handler that read it got `undefined`:
     * `menu_repair_button` and `menu_repeat_button` both do, and both threw
     * "Cannot read properties of undefined (reading 'swipe_direction')" before doing
     * anything at all. Repairs and Repeats were dead controls.
     *
     * Passing the arguments through also revives the swipe gestures those two read off
     * `full_event.swipe_direction` (raw_events.js sets it on the CustomEvent) — they had
     * been silently unreachable for as long as the event was being popped.
     *
     * `buildEventAction` is the existing primitive for exactly this — utils/event_action.js
     * documents the same ctrlAction-eats-the-event problem for keydown/input/paste/drag —
     * so this uses it rather than keeping a bespoke copy alongside.
     */
    this.eventAction = buildEventAction(self);
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    // Components cannot use inject.controller; owner lookup is the supported pattern.
    this.set('applicationController', getOwner(this).lookup('controller:application'));
  },

  sharing_allowed: computed(
    'appState.currentUser',
    'appState.currentUser.preferences.sharing',
    function() {
      return (!this.get('appState.currentUser') && window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.sharing) || this.get('appState.currentUser.preferences.sharing');
    }
  ),
  working_vocalization_text: computed('stashes.working_vocalization', function() {
    var buttons = this.stashes.get('working_vocalization') || [{ label: 'no text' }];
    return buttons.map(function(b) { return b.label; }).join(' ');
  }),
  contraction: computed('working_vocalization_text', function() {
    var res = utterance.contraction();
    return res || { clearback: 0, label: "don't" };
  }),

  localeBoardModel: computed('appState.controller.model', 'applicationController.board.model', function() {
    var c = this.get('appState.controller');
    if (c && c.get && c.get('model')) {
      var m = c.get('model');
      var locs = m.get('readable_locales');
      if (locs && locs.length) { return m; }
    }
    var app = this.get('applicationController');
    if (app && app.get('board.model')) {
      var bm = app.get('board.model');
      if (bm && bm.get('readable_locales') && bm.get('readable_locales').length) {
        return bm;
      }
    }
    return null;
  }),

  showSpeakLocaleSection: computed(
    'app_state.speak_mode_possible',
    'app_state.currentBoardState.translatable',
    'localeBoardModel',
    function() {
      var sm = this.get('app_state.speak_mode_possible');
      var loc = this.get('app_state.currentBoardState.translatable') && this.get('localeBoardModel');
      return !!(sm || loc);
    }
  ),

  // Per-level color palette — keep in sync with
  // controllers/user/board-detail.js#level_color_map and
  // utils/button.js#level_badge_color so the same palette appears
  // in every level UI surface.
  level_color_map: computed(function() {
    return {
      '1':  '#0EA5E9',
      '2':  '#3B82F6',
      '3':  '#6366F1',
      '4':  '#8B5CF6',
      '5':  '#A855F7',
      '6':  '#EC4899',
      '7':  '#F43F5E',
      '8':  '#F97316',
      '9':  '#F59E0B',
      '10': '#10B981'
    };
  }),
  // 1-10 as strings so {{get level_color_map level}} works in the
  // template lookup.
  speak_level_options: computed(function() {
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  }),
  // Currently-active board level — read from stashes (the same
  // source board/index.js#current_level reads from), falling back
  // to the board's default_level, then 10.
  current_speak_level: computed(
    'stashes.board_level',
    'app_state.currentBoardState.default_level',
    function() {
      var lvl = this.get('stashes.board_level');
      if(lvl) { return String(lvl); }
      var def = this.get('app_state.currentBoardState.default_level');
      if(def) { return String(def); }
      return '10';
    }
  ),

  /* NOTHING until asked for. The section used to open with a three-row shortcut (the parked
     entries plus the most recent saved phrase); it now shows only "Create Phrases" and the
     "Show My Phrases" expander, and the library appears on request.
     NOTE for whoever reads this next: the parked entries — "Resume:" / "Swap back:", which
     exist nowhere else in the app — are part of this list, so they sit behind the expander
     too. They are its FIRST rows, so one activation reveals them. */
  all_phrases: computed('_phrase_parked', '_phrase_saved', 'phrases_expanded', function() {
    if (!this.get('phrases_expanded')) { return []; }
    return (this.get('_phrase_parked') || []).concat(this.get('_phrase_saved') || []);
  }),

  /* Is there anything to reveal? Gates the expander — offering to open a library that is
     empty is worse than saying nothing. Counted off the raw lists, NOT `all_phrases`, which
     is deliberately empty while collapsed. */
  phrase_total: computed('_phrase_parked', '_phrase_saved', function() {
    return (this.get('_phrase_parked') || []).length + (this.get('_phrase_saved') || []).length;
  }),

  /*
   * Bring the top of the phrase library into view after it is revealed.
   *
   * The list is hidden until "Show My Phrases", so expanding can add four rows plus the
   * pager below the fold of the menu's own scroll box. Scrolling to it is the difference
   * between the control working and appearing to do nothing.
   *
   * Adjusts the MENU's scrollTop directly rather than calling `scrollIntoView()`, which
   * walks every scrollable ancestor including the document and could move the page behind
   * the modal. Deferred by rAF because the rows do not exist in the DOM until Ember has
   * rendered the newly non-empty list; retries once, then gives up rather than looping.
   */
  scroll_phrases_into_view(attempt) {
    if (this.isDestroyed || this.isDestroying) { return; }
    var _this = this;
    this._phrase_scroll_frame = window.requestAnimationFrame(function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      var menu = document.querySelector('#speak_menu');
      var list = menu && menu.querySelector('.md-speak-menu__phrase-list');
      if (!list) {
        if (!attempt) { _this.scroll_phrases_into_view(1); }
        return;
      }
      var margin = 8;
      var menu_rect = menu.getBoundingClientRect();
      var list_rect = list.getBoundingClientRect();
      menu.scrollTop += (list_rect.top - menu_rect.top) - margin;
    });
  },

  phrase_page_count: computed('all_phrases', 'phrase_page_size', function() {
    var size = this.get('phrase_page_size') || PHRASE_PAGE_SIZE_DEFAULT;
    return Math.max(1, Math.ceil((this.get('all_phrases') || []).length / size));
  }),
  /* Only worth showing the pager when there is more than one page. */
  phrase_paging: computed('phrase_page_count', function() {
    return this.get('phrase_page_count') > 1;
  }),
  phrase_page_first: computed('phrase_page', function() {
    return (this.get('phrase_page') || 0) <= 0;
  }),
  phrase_page_last: computed('phrase_page', 'phrase_page_count', function() {
    return (this.get('phrase_page') || 0) >= this.get('phrase_page_count') - 1;
  }),
  phrase_page_human: computed('phrase_page', function() {
    return (this.get('phrase_page') || 0) + 1;
  }),

  /*
   * PAGED, not scrolled — one page of `all_phrases` at a time.
   *
   * The expanded list used to drop its max-height and let the panel grow, falling back on
   * .md-speak-menu's own scroll past the viewport. That is unusable for the people this
   * menu is for: scanner.js highlights targets it cannot bring into view (now mitigated by
   * scanner#scroll_into_view, but only for SWITCH users), and an eye-gaze user driving by
   * dwell has no way to scroll anything at all — there is no gaze gesture and no scroll
   * control. Content in a scroll region is content some users cannot reach.
   *
   * Slicing the array means the list is never taller than one page, so no scroll container
   * exists to be trapped by, and Up/Down are ordinary buttons anyone can select. Same
   * reasoning as the Big Button modal's Up/Down, which is the precedent in this app.
   *
   * The index in `menu_remembered_<i>` is an index into THIS array, and button_event reads
   * it back from the same one, so paging cannot desynchronise selection from what is drawn.
   */
  rememberedUtterances: computed('all_phrases', 'phrase_page', 'phrase_page_size', function() {
    var all = this.get('all_phrases') || [];
    var size = this.get('phrase_page_size') || PHRASE_PAGE_SIZE_DEFAULT;
    if (all.length <= size) { return all; }
    var start = (this.get('phrase_page') || 0) * size;
    return all.slice(start, start + size);
  }),

  /*
   * How many phrases actually fit on this screen.
   *
   * Fixed page sizes waste the space the phrases-only view exists to give back: with the
   * other sections hidden there is usually room for far more than four, and on a short
   * screen there is room for fewer. Measured rather than guessed, and re-measured on
   * resize.
   *
   * `menu.scrollTop = 0` first: `above` is the distance from the top of the menu's visible
   * box to the list, which only equals "content above the list" when the box is unscrolled.
   * In this view everything is meant to fit anyway, so resetting is both safe and the state
   * being measured for.
   *
   * Two passes, because the pager's own height changes the answer: work out what fits with
   * no pager, and if that already covers every phrase there IS no pager and we are done.
   * Otherwise reserve its height and recompute — otherwise the last row would sit under it.
   */
  recompute_phrase_page_size() {
    if (this.isDestroyed || this.isDestroying) { return; }
    if (!this.get('phrases_expanded')) { return; }
    var menu = document.querySelector('#speak_menu');
    var list = menu && menu.querySelector('.md-speak-menu__phrase-list');
    if (!menu || !list) { return; }
    menu.scrollTop = 0;
    var menu_rect = menu.getBoundingClientRect();
    var list_rect = list.getBoundingClientRect();
    var above = list_rect.top - menu_rect.top;
    var bottom_bar = menu.querySelector('.md-speak-menu__bottom');
    var below = (bottom_bar ? bottom_bar.getBoundingClientRect().height + 8 : 0) +
                (parseFloat(window.getComputedStyle(menu).paddingBottom) || 0);
    var fits = function(space) {
      return Math.max(1, Math.floor((space + PHRASE_ROW_GAP) / (PHRASE_ROW_H + PHRASE_ROW_GAP)));
    };
    /* MAX-height, not clientHeight. The menu shrinks to fit its content, so with a small
       page already rendered `clientHeight` is just the space that page occupies — measuring
       it produced a self-fulfilling answer that never grew past the starting size (4 rows
       at every viewport from 640 to 1100, measured). The max-height is what the panel is
       ALLOWED to grow to (`calc(100vh - --sm-menu-top - 16px)`), which is the real budget.
       `above` and `below` are unaffected by the menu's own height, so they stay measured. */
    var cap = parseFloat(window.getComputedStyle(menu).maxHeight);
    if (!isFinite(cap)) { cap = menu.clientHeight; }
    var available = cap - above - below;
    var total = this.get('phrase_total') || 0;
    var size = fits(available);
    if (size < total) { size = fits(available - PHRASE_PAGER_H); }
    this.apply_phrase_page_size(size);
  },

  /*
   * Apply a page size, then VERIFY it actually fits and shrink until it does.
   *
   * The arithmetic above is a good estimate, not a guarantee: `above` and `below` are
   * measured while the previous page is still rendered, and section margins collapse
   * differently once the list changes height. Measured overshoot of exactly one row at
   * some viewports (9 rows at 900px, which then scrolled). Rather than tune a fudge
   * constant that would be wrong at the next viewport, check the real outcome and step
   * down — the browser is the authority on whether it fits.
   *
   * Bounded to PHRASE_FIT_TRIES so a layout that can never satisfy the check (a viewport
   * too short for even one row plus chrome) cannot spin.
   */
  apply_phrase_page_size(size, tries) {
    if (this.isDestroyed || this.isDestroying) { return; }
    var total = this.get('phrase_total') || 0;
    if (size !== this.get('phrase_page_size')) {
      this.set('phrase_page_size', size);
      /* A smaller page can strand the view past the last page. */
      var last = Math.max(0, Math.ceil(total / size) - 1);
      if ((this.get('phrase_page') || 0) > last) { this.set('phrase_page', last); }
    }
    var attempt = tries || 0;
    if (attempt >= PHRASE_FIT_TRIES || size <= 1) { return; }
    var _this = this;
    this._phrase_fit_frame = window.requestAnimationFrame(function() {
      if (_this.isDestroyed || _this.isDestroying || !_this.get('phrases_expanded')) { return; }
      var menu = document.querySelector('#speak_menu');
      if (!menu) { return; }
      if (menu.scrollHeight > menu.clientHeight + 1) {
        _this.apply_phrase_page_size(size - 1, attempt + 1);
      }
    });
  },

  actions: {
    toggle_phrases() {
      this.toggleProperty('phrases_expanded');
      /* Back to page 1: collapsing and re-expanding should not resume mid-library. */
      this.set('phrase_page', 0);
      if (this.get('phrases_expanded')) {
        /* Measure BEFORE scrolling: the page size decides how tall the list is, and the
           scroll target depends on that. Both are deferred to a frame so the newly
           non-empty list exists to be measured. */
        this._phrase_fit_frame = window.requestAnimationFrame(() => {
          this.recompute_phrase_page_size();
          this.scroll_phrases_into_view();
        });
      }
    },
    phrase_page_move(direction) {
      var page = this.get('phrase_page') || 0;
      var last = this.get('phrase_page_count') - 1;
      this.set('phrase_page', direction === 'up' ? Math.max(0, page - 1) : Math.min(last, page + 1));
    },
    opening() {
      this.get('modal').setComponent(this);
      /*
       * What the front of the menu shows: everything PARKED, and one saved phrase.
       *
       * The parked entries earn their place — a held thought (Resume:) or a sentence the
       * app bumped to make room (Swap back:) exists in exactly one slot, is not saved
       * anywhere, and is lost if the user does not pick it up. There is nowhere else to
       * find it.
       *
       * Saved phrases are the opposite: they are a library, they persist, and the Phrases
       * button directly above opens all of them with filtering and categories. Listing the
       * whole library here made the menu long and buried the parked entries at the top of
       * it. Only the MOST RECENT is shown, as a shortcut to the thing most likely wanted
       * again; the rest are one tap away, and the note under the list says so.
       *
       * `vocalizations` is newest-first — app_state#save_phrase unshifts — so element 0 is
       * genuinely the most recent, not merely the first stored.
       */
      var all_remembered = this.stashes.get('remembered_vocalizations') || [];
      var parked = all_remembered.filter(function(u) { return u.stash; }).slice(0, 2);
      var saved = [];
      if (this.appState.get('currentUser')) {
        saved = (this.appState.get('currentUser.vocalizations') || [])
          .filter(function(v) { return v && v.list && (!v.category || v.category === 'default'); })
          .map(function(u) {
            return {
              sentence: u.list.map(function(v) { return v.label; }).join(' '),
              vocalizations: u.list,
              stash: false
            };
          });
      } else {
        /* Signed out, saved phrases live in the same stash array as the parked ones, told
           apart by the flag — see app_state#save_phrase's fallback branch.

           REVERSED, because the newest-first assumption above holds only for the signed-in
           record: `vocalizations` is unshifted, but stashes#remember PUSHES, so element 0
           here is the OLDEST. Without this the shortcut permanently surfaced the user's
           very first saved phrase and never any of the later ones. */
        saved = all_remembered.filter(function(u) { return u && !u.stash; }).slice().reverse();
      }
      this.set('model', {});
      this.set('repeat_menu', false);
      /* Both lists are kept whole; what the panel SHOWS is derived from them plus
         `phrases_expanded` (see the computed below), so the More Phrases expander does not
         have to re-read the stash. Collapsed each time the menu opens. */
      this.set('_phrase_parked', parked);
      this.set('_phrase_saved', saved);
      this.set('phrases_expanded', false);
      this.set('phrase_page', 0);
      this.set('phrase_page_size', PHRASE_PAGE_SIZE_DEFAULT);
      /* Re-fit on resize: rotating a tablet or resizing the window changes how many
         phrases the screen holds, and a stale page size either wastes space or overflows.
         Bound once per open; torn down in willDestroyElement. */
      if (!this._phrase_fit_on_resize) {
        this._phrase_fit_on_resize = () => this.recompute_phrase_page_size();
        window.addEventListener('resize', this._phrase_fit_on_resize);
      }
      /*
       * Sit the menu just under the sentence bar.
       *
       * `header_height` is NOT a measurement of the rendered header -- it is the
       * VOCALIZATION SIZE preference, 90/100/150/200 straight out of
       * display_prefs#vocalizationHeightPx. So the old `height - 40` spent up to 160px of
       * offset on a viewport it had never looked at, and .md-speak-menu carries
       * `overflow: hidden` with no max-height, so whatever fell past the bottom was
       * CLIPPED rather than scrollable. On a short or narrow screen that hid the end of
       * the menu outright, and it got worse as the menu gained sections.
       *
       * Clamped to a quarter of the viewport, and never less than 8px. The preference
       * still leads on a normal screen (100 -> 60px, unchanged); it only stops mattering
       * where there is no room for it to matter.
       *
       * The value is also published as a custom property so the stylesheet can size the
       * menu against the space actually left below it -- see the `max-height` on
       * .md-speak-menu, which reads --sm-menu-top. Keeping the number in one place is the
       * point: a CSS-side guess at this offset would drift the moment this line changed.
       */
      /* Pinned to the TOP of the page, 4px down.
         It used to be offset by `header_height - 40`, and `header_height` is the
         VOCALIZATION SIZE preference (90/100/150/200 from display_prefs) — not a
         measurement of anything on screen and nothing to do with the viewport. On the
         larger settings that pushed the menu 160px down for no reason anyone could see,
         and on a short screen it cost the panel most of its room.

         A constant, because the intent is a constant: sit at the very top of the page.
         `Math.max(0, …)` is the part that matters — the offset must never go negative,
         since a modal whose header is above the viewport cannot be closed or read, and
         nothing scrolls up to reach it. */
      var place = () => {
        var $el = $('#speak_menu').closest('.modal-dialog');
        if (!$el.length) { return; }
        var top = Math.max(0, SPEAK_MENU_TOP_PX);
        $el.css('top', top + 'px');
        /* Published so the stylesheet can size the panel against the space actually left
           below it — see the max-height on .md-speak-menu, which reads --sm-menu-top. */
        if ($el[0] && $el[0].style) { $el[0].style.setProperty('--sm-menu-top', top + 'px'); }
      };
      runLater(place, 0);
      runLater(place, 100);
    },
    closing() {},
    selectButton(button) {
      this.get('modal').close();
      if (button === 'remember') {
        this.appState.save_phrase(this.stashes.get('working_vocalization'));
      } else if (button === 'share') {
        if (this.stashes.get('working_vocalization.length')) {
          modalUtil.open('share-utterance', { utterance: this.stashes.get('working_vocalization') });
        }
      } else if (button === 'sayLouder') {
        this.appState.say_louder();
      } else {
        var existing = [].concat(this.stashes.get('working_vocalization') || []);
        var ids = existing.map(function(b) { return b.button_id + ':' + (b.board || {}).id; }).join('::');
        var already_there = (this.stashes.get('remembered_vocalizations') || []).find(function(list) {
          return ids === (list.vocalizations || []).map(function(b) { return b.button_id + ':' + (b.board || {}).id; }).join('::');
        });
        if (button.stash) {
          utterance.set('rawButtonList', button.vocalizations);
          utterance.set('list_vocalized', false);
          /* `||`, not `&&`. Keep everything that is not a stash, plus any stash that is not
             the one being resumed. With `&&` this also dropped any NON-stash entry whose
             wording matched — i.e. it deleted one of the user's SAVED PHRASES as a side
             effect of resuming a held thought. Inert for a signed-in user, whose saved
             phrases live on `user.vocalizations` and never enter this array; real for a
             signed-out one, where app_state#save_phrase falls back to stashes#remember and
             they do. components/phrases.js has always had the `||` version. */
          var list = (this.stashes.get('remembered_vocalizations') || []).filter(function(v) { return !v.stash || v.sentence !== button.sentence; });
          this.stashes.persist('remembered_vocalizations', list);
          if (existing.length > 0 && !already_there) {
            /* The swap the original comment describes: what was in the bar takes the slot
               the resumed thought just left. `swapped` marks it as bumped rather than
               parked, so the row can say so instead of claiming the user chose it. */
            this.stashes.remember({ override: existing, stash: true, swapped: true });
          }
        } else {
          if (existing.length > 0 && !(this.stashes.get('remembered_vocalizations') || []).find(function(v) { return v.stash; })) {
            // Also a bump, not a deliberate park — the user asked to say a saved phrase.
            this.stashes.remember({ override: existing, stash: true, swapped: true });
          }
          this.appState.set_and_say_buttons(button.vocalizations);
        }
      }
    },
    end_insertion() {
      this.appState.set('insertion', null);
      this.get('modal').close();
    },
    reply_note() {
      if (this.appState.get('reply_note')) {
        var user = this.appState.get('reply_note.author');
        if (user) {
          emberSet(user, 'user_name', user.user_name || user.name);
          emberSet(user, 'avatar_url', user.avatar_url || user.image_url);
          var voc = this.stashes.get('working_vocalization') || [];
          var sentence = voc.map(function(v) { return v.label; }).join(' ');
          modalUtil.open('confirm-notify-user', { user: user, reply_id: this.appState.get('reply_note.id'), raw: this.stashes.get('working_vocalization'), sentence: sentence, utterance: null, scannable: true });
        }
      }
    },
    flip_text() {
      this.appState.flip_text();
      this.get('modal').close();
    },
    button_event(event, button, full_event) {
      /* Defaulted, not assumed. The swipe branches below read `full_event.swipe_direction`
         directly, so a caller that passes only two arguments used to take the whole handler
         down with a TypeError before any button ran. */
      full_event = full_event || {};
      if (event === 'speakMenuSelect') {
        var _this = this;
        var click = function() {
          if (_this.appState.get('currentUser.preferences.click_buttons') && _this.appState.get('speak_mode')) {
            speecher.click();
          }
          if (_this.appState.get('currentUser.preferences.vibrate_buttons') && _this.appState.get('speak_mode')) {
            capabilities.vibrate();
          }
        };
        /* A saved phrase or held thought, selected by SCANNING.
         *
         * The rows are <button> elements, so a pointer tap reaches their Ember click
         * handler directly (raw_events.js dispatches a passthrough click for BUTTON tags)
         * and never arrives here. The scanner has no such branch: scanner.js:698-700 sees
         * `.md-speak-menu__bottom-btn`, reads `dom.attr('id')` and fires speakmenuselect
         * with it. With no id on the row that was `button === undefined`, which fell past
         * every branch below — after the close above had already run. A switch user
         * scanned to `Resume: "I need help"`, selected it, and the menu shut with the
         * sentence bar untouched. Invisible to mouse testing.
         *
         * Handled before the close so `selectButton` owns the closing, and indexed rather
         * than matched on text because two saved phrases may legitimately read the same. */
        /* The More Phrases expander, selected by SCANNING. Handled BEFORE the generic
           close below and returns without closing: expanding a list and immediately
           dismissing the panel that shows it would be useless. Same shape as the
           menu_repeat_button exception further down. */
        if (button === 'menu_more_phrases_button') {
          click();
          _this.send('toggle_phrases');
          return;
        }
        /* Phrase paging, selected by SCANNING. Like the expander above these must NOT close
           the menu — paging a list and dismissing the panel showing it is useless. */
        if (button === 'menu_phrase_up_button' || button === 'menu_phrase_down_button') {
          click();
          _this.send('phrase_page_move', button === 'menu_phrase_up_button' ? 'up' : 'down');
          return;
        }
        if (button && button.indexOf('menu_remembered_') === 0) {
          var idx = parseInt(button.slice('menu_remembered_'.length), 10);
          var picked = (_this.get('rememberedUtterances') || [])[idx];
          if (picked) {
            click();
            _this.send('selectButton', picked);
          } else {
            _this.get('modal').close();
          }
          return;
        }
        /* Do NOT close on an id this menu does not know. Closing first and matching second
           meant any unrecognised id shut the menu and did nothing — the failure above, and
           the failure any future unlabelled control would hit. */
        var known = ['menu_share_button', 'menu_repeat_button', 'menu_repeat_louder',
          'menu_repeat_quieter', 'menu_repeat_text', 'menu_repeat_flip', 'menu_repeat_gif',
          'menu_hold_thought_button', 'menu_phrases_button', 'menu_inbox_button',
          'menu_repair_button', 'menu_contraction_button'];
        if (button && known.indexOf(button) === -1 && button.indexOf('menu_') === 0 &&
            !button.match(/^menu_(period|comma|question|exclamation|quote|colon)_button$/)) {
          return;
        }
        // menu_repeat_button toggles the repeat/volume group in place, so it must not
        // close the menu. (menu_punctuation_button used to be the other exception; the
        // punctuation submenu it toggled is gone -- all punctuation is one row now.)
        if (button !== 'menu_repeat_button') {
          _this.get('modal').close();
        }
        if (button === 'menu_share_button') {
          modalUtil.open('share-utterance', { utterance: _this.stashes.get('working_vocalization'), inactivity_timeout: true, scannable: true });
          click();
        } else if (button === 'menu_repeat_button') {
          if (full_event.swipe_direction) {
            _this.get('modal').close();
            if (full_event.swipe_direction === 'e') {
              _this.appState.say_louder();
            } else if (full_event.swipe_direction === 'w') {
              _this.appState.say_louder(0.3);
            } else if (full_event.swipe_direction === 'n') {
              click();
              _this.appState.flip_text();
            } else if (full_event.swipe_direction === 's') {
              click();
              modalUtil.open('modals/big-button', { text: _this.get('working_vocalization_text'), text_only: _this.appState.get('referenced_user.preferences.device.button_text_position') === 'text_only' });
            }
          } else {
            _this.set('repeat_menu', !_this.get('repeat_menu'));
          }
        } else if (button === 'menu_repeat_louder') {
          _this.appState.say_louder();
        } else if (button === 'menu_repeat_quieter') {
          _this.appState.say_louder(0.3);
        } else if (button === 'menu_repeat_text') {
          click();
          modalUtil.open('modals/big-button', { text: _this.get('working_vocalization_text'), text_only: _this.appState.get('referenced_user.preferences.device.button_text_position') === 'text_only' });
        } else if (button === 'menu_repeat_flip') {
          click();
          _this.appState.flip_text();
        } else if (button === 'menu_repeat_gif') {
          click();
          modalUtil.open('modals/gif');
        } else if (button === 'menu_hold_thought_button') {
          _this.stashes.remember({ stash: true });
          utterance.clear();
          click();
        } else if (button === 'menu_phrases_button') {
          modalUtil.open('modals/phrases', { inactivity_timeout: true, scannable: true });
          click();
        } else if (button === 'menu_inbox_button') {
          modalUtil.open('modals/inbox', { inactivity_timeout: true, scannable: true });
          click();
        } else if (button === 'menu_repair_button') {
          if (full_event.swipe_direction) {
            _this.get('modal').close();
            if (full_event.swipe_direction === 'n') {
              speecher.oops();
            }
          } else {
            modalUtil.open('modals/repairs', { inactivity_timeout: true, scannable: true });
            click();
          }
        } else if (button === 'menu_contraction_button') {
          var contraction = _this.get('contraction');
          if (contraction) {
            utterance.apply_contraction(contraction);
          }
        } else if (button === 'menu_quote_button') {
          _this.appState.activate_button({ vocalization: '+"' }, { label: ',', vocalization: '+"', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_colon_button') {
          _this.appState.activate_button({ vocalization: '+:' }, { label: ',', vocalization: '+:', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_exclamation_button') {
          _this.appState.activate_button({ vocalization: '+!' }, { label: '!', vocalization: '+!', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_comma_button') {
          _this.appState.activate_button({ vocalization: '+,' }, { label: ',', vocalization: '+,', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_question_button') {
          _this.appState.activate_button({ vocalization: '+?' }, { label: '?', vocalization: '+?', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_period_button') {
          if (full_event.swipe_direction === 'e') {
            _this.appState.activate_button({ vocalization: '+!' }, { label: '!', vocalization: '+!', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          } else if (full_event.swipe_direction === 'w') {
            _this.appState.activate_button({ vocalization: '+,' }, { label: ',', vocalization: '+,', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          } else if (full_event.swipe_direction === 'n') {
            _this.appState.activate_button({ vocalization: '+?' }, { label: '?', vocalization: '+?', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          } else {
            _this.appState.activate_button({ vocalization: '+.' }, { label: '.', vocalization: '+.', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          }
        } else {
          console.error('unrecognized button', button);
        }
      }
    },
    close() {
      modalUtil.set('speak_menu_last_closed', Date.now());
      this.get('modal').close();
    },

    set_board_locale(locale) {
      this.get('applicationController').send('set_locale', locale);
    },

    speak_mode_toggle(decision) {
      var app_state = this.get('app_state');
      var exiting = app_state && app_state.get('speak_mode') && decision !== 'off';
      this.get('modal').close();

      if(exiting) {
        var router = getOwner(this).lookup('service:router');
        var routeName = (router && router.get('currentRouteName')) || '';
        var onBoardDetail = routeName.indexOf('board-detail') !== -1;

        if(onBoardDetail) {
          // Board-detail: send exit_to_home to the board-detail
          // controller — the SAME action the options-menu "Exit Speak
          // Mode" uses. Ember resolves the nested controller under the
          // SLASHED key; the dotted-only lookup returned undefined, so
          // this Exit button silently no-op'd. Use the dotted||slashed
          // fallback (matches voice-output.js / app-state.js).
          var detailCtrl = getOwner(this).lookup('controller:user.board-detail') ||
            getOwner(this).lookup('controller:user/board-detail');
          if(detailCtrl) {
            detailCtrl.send('exit_to_home');
          } else {
            // No board-detail controller resolvable — fall back to the
            // classic exit so the button always works.
            this.get('applicationController').send('toggleSpeakMode', decision);
          }
        } else {
          // Board-alt: default toggleSpeakMode returns to normal mode
          this.get('applicationController').send('toggleSpeakMode', decision);
        }
      } else {
        this.get('applicationController').send('toggleSpeakMode', decision);
      }
    },

    set_speak_mode_user(id, type) {
      this.get('applicationController').send('setSpeakModeUser', id, type);
      this.get('modal').close();
    },

    pick_speak_mode_user(type) {
      this.get('applicationController').send('pickSpeakModeUser', type);
      this.get('modal').close();
    },

    set_speak_level(level) {
      // Mirror what set-as-home / add-to-sidebar / app-state do for
      // changing the active board level: write to stashes.board_level.
      // The board/index.js#current_level computed reads from there
      // (preview_level || stashes.board_level || model.default_level || 10),
      // so writing here flips the live render.
      // Available to anyone in speak mode regardless of edit permission —
      // levels are a viewing concern, not an editing one.
      var n = parseInt(level, 10);
      if(!n || n < 1 || n > 10) { return; }
      this.stashes.persist('board_level', n);
      // Notify so any board controller observing board_level reruns
      // current_level and triggers a re-render of the grid.
      var ctrl = this.get('app_state.controller');
      if(ctrl && ctrl.notifyPropertyChange) {
        ctrl.notifyPropertyChange('current_level');
      }
    }
  },

  /* The phrase-fit machinery is the only thing on this component holding a frame and a
     window listener, so this hook exists for it. */
  willDestroyElement() {
    if (this._phrase_scroll_frame) {
      window.cancelAnimationFrame(this._phrase_scroll_frame);
      this._phrase_scroll_frame = null;
    }
    if (this._phrase_fit_frame) {
      window.cancelAnimationFrame(this._phrase_fit_frame);
      this._phrase_fit_frame = null;
    }
    if (this._phrase_fit_on_resize) {
      window.removeEventListener('resize', this._phrase_fit_on_resize);
      this._phrase_fit_on_resize = null;
    }
    this._super(...arguments);
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    // Ember 5.12 modal migration: the service-based modal system does not
    // auto-invoke opening() (this.onOpening is vestigial), so build modal state
    // here on insert. Without this, opening() never runs. See assessment-settings.
    self.send('opening');
},

});

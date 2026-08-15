import { htmlSafe } from '@ember/template';
import Component from '@ember/component';
import LingoLinq from '../app';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import paint_view_switch_overlay from '../utils/view_switch_overlay';
import { board_view_route } from '../utils/board_view';
import warm_board_preview from '../utils/board_preview_warmer';
import buildEventAction from '../utils/event_action';
import { boardAttributionOwner } from '../utils/board_attribution';

export default Component.extend({
  appState: service('app-state'),
  router: service('router'),
  /** Drives the full-screen "Loading Board Preview" overlay rendered
   *  at the bottom of board-icon.hbs. Set to true on board_preview
   *  and cleared after a short delay so the spinner shows while the
   *  modal materializes. */
  loadingPreview: false,
  /** Opt-in (default off): when true, hovering/focusing/touching the tile
   *  pre-warms this board's preview record + symbol images so the Preview
   *  modal renders fast. Only the board-picker passes this (board-picker.hbs)
   *  so the shared component's behavior is unchanged everywhere else. */
  prefetchPreview: false,
  /* Pre-warm on user intent. Passive (no preventDefault) so it can't
     interfere with the tile's click/drag/keyboard handling; best-effort and
     deduped inside the warmer. */
  _maybe_prefetch_preview: function() {
    if (!this.get('prefetchPreview')) { return; }
    warm_board_preview(this.get('board_record') || this.get('board'));
  },
  // `mouseEnter` as a component method is deprecated in Ember 4.x
  // (component.mouseenter-leave-move), so attach the hover prefetch listener to
  // the element directly instead. focusIn/touchStart stay as event methods —
  // those are NOT part of that deprecation.
  didInsertElement: function() {
    this._super(...arguments);
    var _this = this;
    this._onMouseEnter = function() { _this._maybe_prefetch_preview(); };
    if (this.element) { this.element.addEventListener('mouseenter', this._onMouseEnter); }
    this._observeCompactNameWidth();
  },
  didRender: function() {
    this._super(...arguments);
    this._syncCompactNameSize();
  },
  willDestroyElement: function() {
    if (this._onMouseEnter && this.element) {
      this.element.removeEventListener('mouseenter', this._onMouseEnter);
    }
    if (this._nameResizeObserver) {
      this._nameResizeObserver.disconnect();
      this._nameResizeObserver = null;
    }
    this._super(...arguments);
  },
  /* Compact picker rows only: when a board name is long enough to hit the
     two-line clamp, step it down to 14px so more of the name is readable before
     the ellipsis (styles/_board_picker.scss, `.board-icon__name--clamped`). CSS
     has no way to ask "is this text clamped?", so it is measured after layout
     and the answer carried as a class. The full name is still on the tile's
     aria-label and the .name title attribute either way. */
  _syncCompactNameSize: function() {
    if (this.isDestroyed || this.isDestroying) { return; }
    if (!this.get('compactRow') || !this.element) { return; }
    var el = this.element.querySelector('.name');
    if (!el) { return; }
    /* Measure at the BASE size: dropping the class first means a name that now
       fits — wider card after a resize, or a different board — returns to 16px
       instead of latching small forever. Reading scrollHeight right after
       flushes the style change, so the comparison is against 16px. */
    el.classList.remove('board-icon__name--clamped');
    if (el.scrollHeight > el.clientHeight + 1) {
      el.classList.add('board-icon__name--clamped');
    }
  },
  _observeCompactNameWidth: function() {
    var _this = this;
    if (!this.get('compactRow') || !this.element || typeof ResizeObserver === 'undefined') { return; }
    var el = this.element.querySelector('.name');
    if (!el) { return; }
    var last_width = null;
    /* WIDTH only. The class this callback toggles changes the element's HEIGHT,
       so reacting to height would re-enter the observer on every toggle. Width
       is what actually decides whether the name still clamps — it changes at the
       one/two-column breakpoint and on any window resize. */
    this._nameResizeObserver = new ResizeObserver(function(entries) {
      var entry = entries && entries[0];
      var width = entry && entry.contentRect ? Math.round(entry.contentRect.width) : null;
      if (width === last_width) { return; }
      last_width = width;
      _this._syncCompactNameSize();
    });
    this._nameResizeObserver.observe(el);
  },
  focusIn: function() { this._maybe_prefetch_preview(); },
  touchStart: function() { this._maybe_prefetch_preview(); },
  triggerExternalAction: function(actionName) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.get(actionName);
    if (action && typeof action === 'function') {
      return action.apply(null, args);
    }

    var targetActionName = typeof action === 'string' ? action : actionName;
    var target = this.get('targetObject');
    if (targetActionName && target && typeof target.send === 'function') {
      return target.send.apply(target, [targetActionName].concat(args));
    }
  },
  willInsertElement: function() {
    this.set_board_record();
  },
  // Note: 'board.id' dependency only works for Ember Data models, not plain objects.
  // Plain objects don't support computed property observation, so changes to board.id
  // won't trigger this observer for plain objects. The 'board' dependency will catch
  // board replacements, which is sufficient for most cases.
  set_board_record: observer('board', 'board.key', 'board.children', 'board.children.length', function() {
    var board = this.get('board');
    if(!board) { return; }
    if(board.children) {
      this.set('children', board.children);
      board = board.board;
    }
    // Check if board is already an Ember Data model (has get method)
    var isEmberDataModel = board && typeof board.get === 'function';
    var boardKey = isEmberDataModel ? board.get('key') : board.key;
    var boardId = isEmberDataModel ? board.get('id') : board.id;
    var boardReload = isEmberDataModel ? board.get('reload') : board.reload;
    
    if(!boardReload && boardKey) {
      var _this = this;
      var b = LingoLinq.store.peekRecord('board', boardId);
      var found_board = function() {
          // If specified as a hash {key: '', locale: ''}
          // then use that locale to set the display name
          if(_this.get('locale') || (isEmberDataModel ? board.get('locale') : board.locale)) {
            b.set('localized_locale', _this.get('locale') || (isEmberDataModel ? board.get('locale') : board.locale));
            _this.set('localized', true);
          }
          _this.set('board_record', b);
      };
      if(!b) {
        LingoLinq.store.findRecord('board', boardId || boardKey).then(function(brd) {
          b = brd;
          found_board();
        }, function() { });  
      } else {
        found_board();
      }
    } else {
      // If a localized name wasn't sent from the server
      // then use the specified locale for displaying the name.
      // Only call .get() when board is an Ember Data model; use plain property for plain objects.
      var needsLocalized = isEmberDataModel ? !board.get('localized_name') : !board.localized_name;
      if (this.get('locale') && needsLocalized) {
        if (isEmberDataModel) {
          board.set('localized_locale', this.get('locale'));
        } else {
          board.localized_locale = this.get('locale');
        }
        this.set('localized', true);
      }
      this.set('board_record', board);
    }
  }),
  best_name: computed('board_record.name', 'board_record.translations.board_name', 'board_record.localized_name', 'localized', 'allow_style', 'board_record.style', function() {
    if(this.get('allow_style') && this.get('board_record.style.options')) {
      return this.get('board_record.style.name');
    } else if(this.get('localized')) {
      if(this.get('board_record.translations')) {
        var names = this.get('board_record.translations.board_name') || {};
        if(names[this.get('board_record.localized_locale')]) {
          return names[this.get('board_record.localized_locale')];
        }
      } else if(this.get('board_record.localized_name')) {
        return this.get('board_record.localized_name');
      }
    }
    return this.get('board_record.name');
  }),
  /* Owner credit for the tile footer — always shown (leaf and folder
     boards). Maps the canonical lingolinq publisher slug to the
     OpenAAC brand; otherwise prefers user_name, then key prefix. */
  board_attribution_owner: computed('board_record.user_name', 'board_record.key', function() {
    return boardAttributionOwner(this.get('board_record'));
  }),
  long_username: computed('board_attribution_owner', function() {
    var name = this.get('board_attribution_owner') || '';
    return name.length > 25;
  }),
  display_class: computed('children', function() {
    var e = this.element;
    var bounds = e.getBoundingClientRect();
    var res ='btn simple_board_icon btn-default';
    if(bounds.width < 120) {
      res = res + ' tiny';
    } else if(bounds.width < 150) {
      res = res + ' short';
    } else if(bounds.width < 180) {
      res = res + ' medium';
    }
    if(this.get('children')) {
      res = res + ' folder';
    }
    if(this.get('noop')) {
      res = res + ' unlinked';
    }

    return htmlSafe(res);
  }),
  override_count: computed('allow_style', 'board_record.style.options', function() {
    return this.get('allow_style') && (this.get('board_record.style.options') || []).length;
  }),
  isReady: computed('board_record', 'board_record.key', 'board_record.id', function() {
    var board_record = this.get('board_record');
    if (!board_record) { return false; }
    // Check if board_record has a key or id (indicating it's a valid board).
    // Use explicit ternary so falsy key/id (e.g. '', 0) still counts as "present" when the property exists.
    var hasKey = typeof board_record.get === 'function' ? board_record.get('key') : board_record.key;
    var hasId = typeof board_record.get === 'function' ? board_record.get('id') : board_record.id;
    return hasKey != null || hasId != null;
  }),
  cursor_style: computed('isReady', function() {
    if(this.get('isReady')) {
      return htmlSafe('cursor: pointer;');
    } else {
      return htmlSafe('cursor: default; opacity: 0.6; pointer-events: none;');
    }
  }),
  /* Translated-language marker for the tile. Returns the readable
     language name (e.g. "Spanish", "Polish") when the board has been
     translated to a non-English locale OR has multiple locales
     available; null otherwise. The board's `locale` field reflects
     the CURRENT default locale (set when a translation is accepted
     as default), so a Spanish-translated board has `locale = 'es'`
     even if the board name itself is still the original English.
     Multi-locale boards still mark with the current locale so the
     user can tell at a glance which language they'd be picking. */
  translated_language_label: computed('board_record.locale', 'board_record.locales.length', function() {
    var board = this.get('board_record');
    if (!board || !board.get) { return null; }
    var locale = board.get('locale');
    var locales = board.get('locales') || [];
    var hasMultiple = locales && locales.length > 1;
    var nonDefault = locale && locale !== 'en' && locale !== 'en-US';
    if (!hasMultiple && !nonDefault) { return null; }
    if (!locale) { return null; }
    return i18n.readable_language(locale);
  }),
  tile_aria_label: computed('best_name', 'translated_language_label', function() {
    var name = this.get('best_name') || '';
    var lang = this.get('translated_language_label');
    if(lang) {
      return name + ', ' + lang;
    }
    return name;
  }),
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
    // For keydown/drag bindings whose handlers need the raw event and do
    // their own preventDefault (5.12 upgrade #490 dropped it). ctrlAction
    // above is unchanged for clicks.
    this.eventAction = buildEventAction(this);
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  actions: {
    /* Keyboard activation for the role="button" div that wraps the
       card body — Enter and Space mirror the click handler so the
       tile remains keyboard-operable now that it's not a native
       <button> (a real button would block the parent's drag). */
    pickKeydown: function(event) {
      if (!event) { return; }
      var key = event.key;
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        event.preventDefault();
        this.send('pick_board', this.get('board_record'));
      }
    },
    board_preview: function(board) {
      var _this = this;
      /* Flip the loading flag immediately so the overlay paints on
         this same render tick — the modal opens synchronously below
         but the data it needs (locale defaults, board record
         hydration) can hold up the visual modal for a noticeable
         beat. The overlay covers that gap. Cleared after 1.2s,
         which is comfortably past the typical modal-open time. */
      _this.set('loadingPreview', true);
      runLater(_this, function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('loadingPreview', false);
      }, 1200);
      board.preview_option = _this.get('preview_option') || null;
      if(_this.get('localized')) {
        board.preview_locale = this.get('board_record.localized_locale');
      }
      /* Forward the parent's remove context (label/icon/type/callback)
         onto the board so the preview modal can render a touch-friendly
         delete affordance. The hover-only `.board_action` button on the
         tile is unreachable on touch devices; this carries the same
         contextual remove (delete / unlike / unshare / untag) into the
         modal. Only set when the parent supplied a callback — contexts
         without remove permission (public browse, style-picker drill)
         leave it null and the modal hides the button. */
      var removeCallback = _this.get('removeCallback');
      if(removeCallback) {
        board.preview_remove = {
          type: _this.get('removeType'),
          label: _this.get('removeLabel'),
          icon: _this.get('removeIcon'),
          callback: removeCallback
        };
      } else {
        board.preview_remove = null;
      }
      if(_this.onActionOverride && typeof _this.onActionOverride === 'function') {
        _this.onActionOverride(this.get('board_record.key'));
      } else if(_this.get('action_override')) {
        _this.triggerExternalAction('action_override', this.get('board_record.key'));
      } else {
        modal.board_preview(board, board.preview_locale, this.get('allow_style'), function() {
          _this.send('pick_board', board);
        });
      }
    },
    pick_board: function(board) {
      var _this = this;
      // Use board_record if available, otherwise use the parameter
      var board_record = this.get('board_record') || board;

      // If board_record is not available, the action should not have been triggered
      // (template should guard against this), but return early as a safety check
      if(!board_record) {
        return;
      }

      /* Compact board-picker rows: the WHOLE card is the preview target, and the
         board is chosen from inside the preview ("Pick this Board"). Routing here
         rather than in the template keeps one activation path for click, Enter and
         Space. Opt-in via @compactRow — every other surface (dashboard, boards
         page, search, detailed picker cards) is untouched and still picks
         directly. */
      if(_this.get('compactRow')) {
        _this.send('board_preview', board_record);
        return;
      }

      if(_this.get('noop')) {
        return;
      } else if(_this.onActionOverride && typeof _this.onActionOverride === 'function') {
        var key = board_record.get ? board_record.get('key') : board_record.key;
        _this.onActionOverride(key);
      } else if(_this.get('action_override')) {
        var key = board_record.get ? board_record.get('key') : board_record.key;
        _this.triggerExternalAction('action_override', key);
      } else if(_this.onAction && typeof _this.onAction === 'function') {
        // Copy-cluster folders are passed in as a { board, children }
        // wrapper, and load_children needs that wrapper intact (board_list
        // reads parent_object.board / parent_object.children when drilling
        // in). set_board_record unwraps `board` down to the inner record
        // for display, so when this icon represents a children cluster
        // hand back the ORIGINAL wrapper; otherwise (e.g. find-a-board's
        // selectFoundBoard, which has no children) keep the unwrapped
        // record so that behavior is unchanged.
        var orig = _this.get('board');
        if(_this.get('children') && orig && orig.children) {
          _this.onAction(orig);
        } else {
          _this.onAction(board_record);
        }
      } else if(this.get('children')) {
        _this.triggerExternalAction('action', board_record);
      } else if(this.get('option') == 'select') {
        board_record.preview_option = 'select';
        if(_this.get('localized')) {
          board_record.preview_locale = board_record.get ? board_record.get('localized_locale') : board_record.localized_locale;
        }
        modal.board_preview(board_record, board_record.preview_locale, this.get('allow_style'), function() {
          if (_this.onAction && typeof _this.onAction === 'function') {
            _this.onAction(board_record);
          } else {
            _this.triggerExternalAction('action', board_record);
          }
        });
      } else if(_this.get('allow_style') && _this.get('override_count')) {
        if(_this.get('localized')) {
          board_record.preview_locale = board_record.get ? board_record.get('localized_locale') : board_record.localized_locale;
        }
        modal.board_preview(board_record, board_record.preview_locale, this.get('allow_style'), function() {
        });
      } else if(_this.get('appState.tour_board_picker_active')) {
        // Inside the board-picker guided-tour modal (tour-board-picker.js sets
        // this flag while open), a card tap must open the board PREVIEW — whose
        // CTA becomes "Pick this Board" while tour_board_picker_active (see
        // board-preview.js#tour_pick → board-preview-overlay.js#pick_for_home) —
        // NOT navigate the user away to Speak Mode / board-detail and abandon the
        // tour. Delegates to the same preview path as the tile's Preview pill.
        _this.send('board_preview', board_record);
      } else {
        var key = board_record.get ? board_record.get('key') : board_record.key;
        var parts = key ? key.split('/') : [];
        if(parts.length === 2) {
          // Card click → board-detail. Paint the shared "Preparing your
          // Board" overlay (same one Classic ↔ Modern uses) so the
          // route load is masked instead of flashing source-page chrome.
          // Theme detection mirrors go_to_modern: default dark, flip to
          // light only on an explicit non-dark themeMode signal.
          var routerSvc = _this.router;
          var appStateService = _this.appState;
          var isDark = true;
          if (appStateService && typeof appStateService.get === 'function') {
            var themeMode = appStateService.get('themeMode');
            if (themeMode === 'light' || themeMode === 'midDay' || themeMode === 'default') {
              isDark = false;
            }
          }
          paint_view_switch_overlay({
            routerSvc: routerSvc,
            isDark: isDark,
            accentLight: false,
            transition: function() {
              // board-detail (modern) by default; board-alt (classic) only when
              // the user's board_view_style preference is 'classic'.
              var user = appStateService && appStateService.get && appStateService.get('currentUser');
              return routerSvc.transitionTo(board_view_route(user), parts[0], parts[1]);
            }
          });
        } else {
          var id = board_record.get ? board_record.get('id') : board_record.id;
          var opts = {force_board_state: {key: key, id: id}};
          if(_this.get('localized')) {
            opts.force_board_state.locale = board_record.get ? board_record.get('localized_locale') : board_record.localized_locale;
          }
          // Keyed-board path is an in-app state flip via
          // home_in_speak_mode, not a route load — no overlay (it would
          // just flash and dismiss with nothing to mask).
          _this.appState.home_in_speak_mode(opts);
        }
      }
    }
  }
});

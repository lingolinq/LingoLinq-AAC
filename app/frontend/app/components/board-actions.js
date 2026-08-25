import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modalUtil from '../utils/modal';
import editManager from '../utils/edit_manager';
import paint_view_switch_overlay from '../utils/view_switch_overlay';

/**
 * Board Actions Modal Component
 *
 * Converted from modals/board-actions template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    const modalService = this.get('modal');
    const template = 'modals/board-actions';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  cannot_edit: computed('model.board.permissions.edit', function() {
    const board = this.get('model.board');
    return !board || !board.permissions || !board.permissions.edit;
  }),

  cannot_categorize: computed('appState.currentUser', function() {
    return !this.get('appState.currentUser');
  }),

  /* Already-home boards do not offer "Set as Home Board". Same subject rule and
     same key comparison as controllers/user/board-detail.js#is_subject_home_board
     and components/board-collection.js#_subjectHomeKey — referenced_user (the
     communicator this board is being viewed for) falling back to the signed-in
     user. Both sides must be non-empty: a user with NO home board has
     `home_board.key` undefined, and `undefined === undefined` would report every
     board as already-home and withhold the row from exactly the people who have
     not set one yet. */
  is_subject_home_board: computed(
    'model.board.key',
    'appState.referenced_user',
    'appState.referenced_user.preferences.home_board.key',
    'appState.currentUser',
    'appState.currentUser.preferences.home_board.key',
    function() {
      const board = this.get('model.board');
      const key = board && (board.get ? board.get('key') : board.key);
      if (!key) { return false; }
      const subject = this.get('appState.referenced_user') || this.get('appState.currentUser');
      const home = subject && subject.get('preferences.home_board.key');
      return !!home && home === key;
    }
  ),

  can_set_as_home: computed('appState.currentUser', 'is_subject_home_board', function() {
    if (!this.get('appState.currentUser')) { return false; }
    return !this.get('is_subject_home_board');
  }),

  // True when the persisted board view style is Modern (the default). Drives the
  // View Style toggle's active segment + thumb position.
  is_modern: computed('appState.currentUser.preferences.board_view_style', function() {
    return this.get('appState.currentUser.preferences.board_view_style') !== 'classic';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    closing() {},
    privacy() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('modals/board-privacy', { board: model.board, button_set: model.board.button_set });
    },
    categorize() {
      const model = this.get('model');
      if (!model || !model.board || !this.get('appState')) { return; }
      modalUtil.open('modals/tag-board', { board: model.board, user: this.appState.get('currentUser') });
    },
    langs() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('modals/slice-locales', { board: model.board, button_set: model.board.button_set });
    },
    translate() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('translation-select', { board: model.board, button_set: model.board.button_set });
    },
    swap_images() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('swap-images', { board: model.board, button_set: model.board.button_set });
    },
    download() {
      const _this = this;
      const model = this.get('model');
      if (!model || !model.board || !this.get('appState')) { return; }
      this.appState.assert_source().then(function() {
        if (!_this.get('model') || !_this.get('model.board')) { return; }
        const board = _this.get('model.board');
        const linked = board.get && board.get('linked_boards');
        const has_links = !!(linked && linked.length > 0);
        const board_id = (board.get && (board.get('key') || board.get('id'))) || board.id;
        modalUtil.open('download-board', { type: 'obf', has_links: has_links, id: board_id });
      }, function() {});
    },
    batch_recording() {
      const _this = this;
      const model = this.get('model');
      if (!model || !model.board || !this.get('appState')) { return; }
      modalUtil.open('batch-recording', { user: this.appState.get('currentUser'), board: model.board }).then(function() {
        if (!_this.get('model')) { return; }
        _this.get('model').reload().then(function() {
          if (_this.get('model')) {
            _this.get('model').load_button_set(true);
            editManager.process_for_displaying();
          }
        });
      });
    },
    board_layout() {
      var user = this.get('appState.currentUser');
      if (!user) { return; }
      var user_id = user.get('id');
      var board_key = this.get('model.board.key') || this.get('model.board.id');
      this.get('modal').close();
      this.get('appState').set('board_layout_mode', board_key);
      this.get('router').transitionTo('setup', { queryParams: { page: 'symbols', user_id: user_id, mode: 'layout' } });
    },
    delete() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('confirm-delete-board', { board: model.board, redirect: true });
    },
    /* The three rows relocated from the board-detail edit panel. Each mirrors the
       controller action it replaces (controllers/user/board-detail.js), because
       this modal handles its own rows rather than delegating — see the siblings
       above. Keep them in step if either side changes. */
    suggestions() {
      const model = this.get('model');
      if (!model || !model.board || !this.get('appState')) { return; }
      modalUtil.open('button-suggestions', { board: model.board, user: this.appState.get('currentUser') });
    },
    open_button_stash() {
      /* The controller's version cleared its own `paint_mode` UI flag first, so
         the stash does not open with a paint brush still armed. That flag is
         board-detail controller state this component cannot reach; clearing the
         shared editManager paint mode is the half that actually governs what a
         click on a button DOES, so it is the half worth carrying over. */
      editManager.clear_paint_mode();
      modalUtil.open('button-stash');
    },
    set_as_home() {
      const model = this.get('model');
      if (!model || !model.board) { return; }
      modalUtil.open('set-as-home', { board: model.board });
    },
    // View Style toggle (Modern panels ↔ Classic full-device grid). Persists the
    // preference and navigates to the matching board page through the shared
    // "Preparing your Board" overlay — mirrors go_to_classic/go_to_modern. No-op
    // when already on the chosen style.
    set_view_style(style) {
      var user = this.get('appState.currentUser');
      var board = this.get('model.board');
      if (!user || !board) { return; }
      var current = this.get('appState.currentUser.preferences.board_view_style') || 'modern';
      if (current === style) { return; }
      user.set('preferences.board_view_style', style);
      if (user.save) {
        user.set('preferences.device.updated', true);
        user.save();
      }
      var key = (board.get ? board.get('key') : board.key) || '';
      var routerSvc = this.get('router');
      this.get('modal').close();
      if (key.indexOf('/') === -1) { return; }
      var parts = key.split('/');
      var userName = parts[0];
      var boardname = parts.slice(1).join('/');
      var appStateService = this.get('appState');
      var isDark = true;
      var themeMode = appStateService && appStateService.get('themeMode');
      if (themeMode === 'light' || themeMode === 'midDay' || themeMode === 'default') { isDark = false; }
      paint_view_switch_overlay({
        routerSvc: routerSvc,
        isDark: isDark,
        accentLight: (style === 'classic'),
        transition: function() {
          var route = (style === 'classic') ? 'user.board-alt' : 'user.board-detail';
          return routerSvc.transitionTo(route, userName, boardname);
        }
      });
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});

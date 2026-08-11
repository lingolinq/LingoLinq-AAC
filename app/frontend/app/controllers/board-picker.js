import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import openRecommendedHomeBoard from '../utils/recommended_home_board';
import { assignVocalFlair84AsHome } from '../utils/assign-vocal-flair-home';
import LingoLinq from '../app';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

// Standalone home-board picker. Mirrors setup's `user_id` / `setup_user` resolution so
// supervisors can pick a communicatee's home board without the setup wizard.
export default Controller.extend({
  router: service('router'),
  appState: service('app-state'),
  persistence: service('persistence'),
  queryParams: ['user_id'],
  user_id: null,
  setup_user: null,
  other_user: null,
  assigning_home_board: false,

  for_self: computed('appState.currentUser.id', 'setup_user.id', function() {
    var su = this.get('setup_user');
    if (!su || !this.appState) { return true; }
    return su.get('id') == this.appState.get('currentUser.id');
  }),

  boardPickerHeader: computed('for_self', 'setup_user.user_name', function() {
    if (this.get('for_self')) {
      return i18n.t('board_picker_header', "Pick Your Home Board");
    }
    var name = this.get('setup_user.user_name') || '';
    return i18n.t('board_picker_header_for_user', "Choose a home board for %{name}", { name: name });
  }),

  assignHomeButtonLabel: computed('for_self', function() {
    if (this.get('for_self')) {
      return i18n.t('assign_home_board_for_me', "Assign a Home Board For Me");
    }
    return i18n.t('pick_a_home_board', "Pick a home board");
  }),

  boardsBackUserName: computed('for_self', 'setup_user.user_name', 'appState.currentUser.user_name', function() {
    if (this.get('for_self')) {
      return this.appState.get('currentUser.user_name');
    }
    return this.get('setup_user.user_name') || this.appState.get('currentUser.user_name');
  }),

  // Resolve `setup_user` from the optional `user_id` query param, falling back to the
  // current user for the self flow.
  //
  // This is a plain method, called BOTH from the observer below and directly from
  // routes/board-picker#setupController, because the observer alone cannot cover
  // route entry: opening /board-picker with no `user_id` changes neither `user_id`
  // (null -> null) nor `appState.currentUser` (already assigned), so Ember never
  // notifies and `setup_user` stayed null. "Assign a Home Board For Me" then hit the
  // `!user.save` guard in assign_default_home_board and showed "Home board update
  // failed unexpectedly". The supervisor flow (?user_id=X) was unaffected, which is
  // why the QA script — which only exercises --supervisee — passed 27/27 over it.
  _resolve_setup_user: function() {
    var _this = this;
    if (!_this.appState || !_this.appState.controller) { return; }

    var new_setup_user_id = _this.get('user_id');
    if (_this.appState.controller.get('setup_user_id') !== new_setup_user_id) {
      _this.appState.controller.set('setup_user_id', new_setup_user_id);
    }

    if (_this.get('user_id')) {
      if (_this.get('user_id') != _this.get('setup_user.id')) {
        _this.set('other_user', { loading: true });
        _this.set('setup_user', null);
        _this.appState.set('setup_user', null);
        LingoLinq.store.findRecord('user', _this.get('user_id')).then(function(user) {
          if (user.get('permissions.edit') || user.get('permissions.supervise')) {
            _this.set('other_user', null);
            _this.set('setup_user', user);
            _this.appState.set('setup_user', user);
          } else {
            _this.appState.controller.set('setup_user_id', null);
            _this.set('other_user', { error: true, user_id: _this.get('user_id') });
          }
        }, function() {
          _this.appState.controller.set('setup_user_id', null);
          _this.set('other_user', { error: true, user_id: _this.get('user_id') });
        });
      }
    } else {
      _this.set('other_user', null);
      var current = _this.appState.get('currentUser');
      _this.set('setup_user', current);
      _this.appState.set('setup_user', current);
    }
  },

  resolveSetupUser: observer('user_id', 'appState.currentUser', function() {
    this._resolve_setup_user();
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  _afterHomeBoardAssigned: function(user) {
    var _this = this;
    if (_this.get('persistence') && _this.get('persistence').get('online') && _this.get('persistence').get('auto_sync')) {
      _this.get('persistence').sync('self', null, null, 'home_board_changed').then(null, function() { });
    }
    if (_this.get('for_self')) {
      _this.appState.return_to_index();
      return;
    }
    modal.success(i18n.t('board_set_as_home', "Great! This is now the user's home board!"), true);
    var userName = user && user.get && user.get('user_name');
    if (userName) {
      _this.get('router').transitionTo('user.boards', userName);
    } else {
      _this.appState.return_to_index();
    }
  },

  actions: {
    assign_default_home_board: function() {
      var _this = this;
      var user = this.get('setup_user');
      if (!user || !user.save) {
        modal.error(i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
        return;
      }
      if (_this.get('for_self')) {
        _this.set('assigning_home_board', true);
        var done = function() { _this.set('assigning_home_board', false); };
        openRecommendedHomeBoard().then(done, done);
        return;
      }
      _this.set('assigning_home_board', true);
      assignVocalFlair84AsHome(user, {
        locale: _this.appState.get('label_locale'),
        onSuccess: function() {
          _this.set('assigning_home_board', false);
          _this._afterHomeBoardAssigned(user);
        }
      }).catch(function() {
        _this.set('assigning_home_board', false);
      });
    },
    create_new_board: function() {
      var _this = this;
      var go = function() { _this.get('router').transitionTo('create-board-new'); };
      if (_this.appState && _this.appState.check_for_needing_purchase) {
        _this.appState.check_for_needing_purchase().then(go, go);
      } else {
        go();
      }
    }
  }
});

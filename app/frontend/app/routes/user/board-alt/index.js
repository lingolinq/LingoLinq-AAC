import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import editManager from '../../../utils/edit_manager';
import modal from '../../../utils/modal';
import i18n from '../../../utils/i18n';
import LingoLinq from '../../../app';
import contentGrabbers from '../../../utils/content_grabbers';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Route.extend({
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),
  templateName: 'board/index',
  controllerName: 'board.index',
  model: function() {
    LingoLinq.log.track('getting model');
    var res = this.modelFor('user.board-alt');
    if ((this.appState.get('board_reloads') || {})[res.get('id')]) {
      res.set('should_reload', true);
    }
    if (res.get('should_reload')) {
      var do_reloads = this.appState.get('board_reloads') || {};
      delete do_reloads[res.get('id')];
      this.appState.set('board_reloads', do_reloads);
      res.set('should_reload', false);
      LingoLinq.log.track('reloading');
      res.reload(!this.appState.get('speak_mode'));
    }
    return res;
  },
  setupController: function(controller, model) {
    LingoLinq.log.track('setting up controller');
    var _this = this;
    _this.set('board', model);
    controller.set('model', model);
    controller.set('ordered_buttons', null);
    controller.set('preview_level', null);
    model.set('show_history', false);
    model.set('focus_id', _this.appState.get('focus_words.focus_id'));
    if (model.get('valid_id') && !model.get('integration')) {
      model.load_button_set();
    }
    _this.appState.set('currentBoardState', {
      id: model.get('global_id') || model.get('id'),
      key: model.get('key'),
      parent_id: model.get('parent_board_id'),
      name: model.get('name'),
      has_fallbacks: model.get('has_fallbacks'),
      extra_back: model.get('local_only') && model.get('extra_back'),
      default_locale: model.get('locale'),
      copy_version: model.get('copy_version'),
      integration_name: model.get('integration') && model.get('integration_name'),
      parent_key: model.get('parent_board_key'),
      text_direction: i18n.text_direction(model.get('locale')),
      translatable: (model.get('locales') || []).length > 1
    });
    if (_this.appState.get('meta_home.unassigned') && _this.appState.get('meta_home.new_key') == model.get('key')) {
      var state = Object.assign({}, _this.appState.get('currentBoardState'));
      state.meta_home = _this.appState.get('meta_home.state');
      _this.stashes.persist('root_board_state', state);
      _this.appState.set('meta_home.unassigned', false);
    }

    if (_this.stashes.get('root_board_state.id') == _this.appState.get('currentBoardState.id')) {
      if (!_this.stashes.get('root_board_state.text_direction')) {
        _this.stashes.set('root_board_state.text_direction', _this.appState.get('currentBoardState.text_direction'));
      }
    }
    if (_this.appState.get('speak_mode') && _this.stashes.get('board_level')) {
      _this.appState.set('currentBoardState.level', _this.stashes.get('board_level'));
    }
    var board_langs = (model.get('locales') || []);
    var stripped_langs = board_langs.map(function (l) { return l.split(/-|_/)[0]; });
    var loc_types = ['label_locale', 'vocalization_locale'];
    loc_types.forEach(function(loc_type) {
      if (_this.stashes.get(loc_type)) {
        var preferred_lang = _this.stashes.get(loc_type);
        var preferred_stripped_lang = preferred_lang.split(/-|_/)[0];
        if (stripped_langs.indexOf(preferred_stripped_lang) == -1) {
          _this.appState.set(loc_type, model.get('locale'));
        } else if (board_langs.indexOf(preferred_lang) == -1) {
          _this.appState.set(loc_type, preferred_stripped_lang);
        } else {
          _this.appState.set(loc_type, _this.stashes.get(loc_type));
        }
      } else {
        _this.appState.set(loc_type, model.get('locale'));
      }
    });
    if (LingoLinq.embedded && !_this.appState.get('speak_mode')) {
      var state = _this.appState.get('currentBoardState');
      _this.appState.toggle_mode('speak', { override_state: state });
      if (_this.appState.get('currentUser.preferences.home_board')) {
        _this.appState.toggle_home_lock(true);
      }
      emberSet(state, 'level', emberGet(state, 'default_level'));
      emberSet(state, 'locale', _this.appState.get('label_locale'));
      _this.stashes.persist('root_board_state', state);
      _this.stashes.persist('board_level', state.level);
      _this.stashes.persist('temporary_root_board_state', null);
      _this.appState.set('temporary_root_board_key', null);
    }
    editManager.setup(controller, this.appState, this.persistence, this.stashes);
    _this.appState.set('board_virtual_dom.triggerAction', function (action, id, extra) {
      controller.send(action, id, extra);
    });
    contentGrabbers.board_controller = controller;
    var prior_revision = model.get('current_revision');
    LingoLinq.log.track('processing buttons without lookups');
    _this.set('load_state', { retrieved: true });
    try {
      model.without_lookups(function() {
        try {
          controller.processButtons();
        } catch (e) {
          throw e;
        }
      });
    } catch (e) {
    }
    model.prefetch_linked_boards();

    if (model.get('integration')) { return; }

    controller.get('valid_fast_html');
    var insufficient_data = model.get('id') && (!controller.get('has_rendered_material') || (!model.get('pseudo_board') && model.get('permissions') === undefined));
    if (model.get('background.prompt') && this.appState.get('speak_mode')) {
      runLater(function() {
        if (model && typeof model.prompt === 'function') { model.prompt(); }
      }, 100);
    }
    if (!model.get('valid_id')) {
    } else if ((_this.persistence && _this.persistence.get('online')) || insufficient_data) {
      LingoLinq.log.track('considering reload');
      _this.set('load_state', { not_local: true });
      var reload = RSVP.resolve(model);
      if (_this.persistence && _this.persistence.get('online') && !model.get('local_only')) {
        var force_fetch = !_this.appState.get('speak_mode');
        if (_this.persistence && _this.persistence.get('syncing') && !insufficient_data) { force_fetch = false; }
        _this.set('load_state', { remote_reload: true });
        reload = model.reload(force_fetch).then(null, function(err) {
          _this.set('load_state', { remote_reload_local_reload: true });
          if (!force_fetch && controller.get('has_rendered_material')) {
            return RSVP.resolve(model);
          } else {
            return model.reload(false);
          }
        });
      } else if (!controller.get('has_rendered_material') && !model.get('local_only')) {
        _this.set('load_state', { local_reload: true });
        reload = model.reload(false).then(null, function (err) {
          _this.set('load_state', { local_reload_local_reload: true });
          return model.reload(false);
        });
      }

      reload.then(function(updated) {
        if (!controller.get('has_rendered_material') || updated.get('current_revision') != prior_revision || insufficient_data) {
          LingoLinq.log.track('processing buttons again');
          controller.processButtons(true);
        }
      }, function(error) {
        if (!controller.get('has_rendered_material') || !_this.appState.get('speak_mode')) {
          _this.send('error', error);
        }
      });
    } else {
    }
  },
  error_message: computed('load_state', 'load_state.has_permissions', 'model.id', function () {
    if (this.get('model.id')) {
      return i18n.t('unexpected_board_error', "This board should have loaded, but there was an unexpected problem");
    } else {
      var error = this.get('load_state.error');
      if (error && error.errors) {
        error = error.errors[0];
      }
      if (this.persistence && this.persistence.get('online')) {
        if (error && error.unauthorized) {
          return i18n.t('error_unauthorized', "You don't have permission to access this board.");
        } else if (error && error.never_existed) {
          return i18n.t('error_nonexistent', "This board doesn't exist.");
        } else if (error && error.status >= 400) {
          return i18n.t('error_bad_status', "There was an unexpected error retrieving this board.");
        } else if (this.get('load_state.retrieved')) {
          return i18n.t('error_retrieved_only', "The resources for this board could not be retrieved.");
        } else if (this.get('load_state.not_local')) {
          return i18n.t('error_not_local', "The resources for this board were not available locally, so it could not be loaded.");
        } else if (this.get('load_state.remote_reload')) {
          return i18n.t('error_no_remote', "This board could not be retrieved from the cloud.");
        } else if (this.get('load_state.remote_reload_local_reload')) {
          return i18n.t('error_no_remote_or_local', "This board could not be retrieved from the cloud and hasn't been synced for offline use.");
        } else if (this.get('load_state.local_reload')) {
          return i18n.t('error_no_local', "This board is not available offline.");
        } else if (this.get('load_state.local_reload_remote_reload')) {
          return i18n.t('error_really_no_local', "This board has not been synced and is not available currently.");
        } else {
          return i18n.t('error_not_available', "This board is not currently available.");
        }
      } else {
        if (this.get('load_state.retrieved')) {
          return i18n.t('error_retrieved_only_offline', "The resources for this board could not be retrieved while offline.");
        } else if (this.get('load_state.not_local')) {
          return i18n.t('error_not_local_offline', "The resources for this board were not available locally while offline, so it could not be loaded.");
        } else if (this.get('load_state.remote_reload')) {
          return i18n.t('error_no_remote_offline', "The resources for this board could not be retrieved while offline.");
        } else if (this.get('load_state.remote_reload_local_reload')) {
          return i18n.t('error_not_anywhere_offline', "This board could not be retrieved while offline and hasn't been synced for offline use.");
        } else if (this.get('load_state.local_reload')) {
          return i18n.t('error_no_local_offline', "This board is not available while offline.");
        } else if (this.get('load_state.local_reload_remote_reload')) {
          return i18n.t('error_really_no_local_offline', "This board has not been synced and is not available while offline.");
        } else {
          return i18n.t('error_not_available_offline', "This board is not currently available while offline.");
        }
      }
    }
  }),
  actions: {
    willTransition: function (transition) {
      if (this.get('board')) {
        this.get('board').prompt('clear');
      }
      if (this.appState.get('edit_mode') && !this.appState.get('board_layout_mode')) {
        modal.warning(i18n.t('save_or_cancel_changes_first', "Save or cancel your changes before leaving this board!"));
        transition.abort();
      }
      return true;
    },
    refreshData: function () {
      this.refresh();
    },
    error: function (error, transition) {
      if (this.get('load_state')) {
        this.set('load_state.has_permissions', !!this.get('model.permissions'));
        this.set('load_state.error', error);
      }
      this.get('controller').set('model', LingoLinq.store.createRecord('board', {}));
    },
  },
  resetController: function(controller, isExiting) {
    if (isExiting && editManager.controller === controller) {
      editManager.controller = null;
    }
  }
});

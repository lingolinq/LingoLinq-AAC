import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import editManager from '../../utils/edit_manager';
import stashes from '../../utils/_stashes';
import modal from '../../utils/modal';
import app_state from '../../utils/app_state';
import i18n from '../../utils/i18n';
import CoughDrop from '../../app';
import contentGrabbers from '../../utils/content_grabbers';
import persistence from '../../utils/persistence';
import speecher from '../../utils/speecher';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { computed } from '@ember/object';

export default Route.extend({
  model: function(params) {
    CoughDrop.log.track('getting model');
    var res = this.modelFor('board');
    if(res.get('should_reload')) {
      res.set('should_reload', false);
      CoughDrop.log.track('reloading');
      res.reload(!app_state.get('speak_mode'));
    }
    return res;
  },
  setupController: function(controller, model) {
    CoughDrop.log.track('setting up controller');
    var _this = this;
    _this.set('board', model);
    controller.set('model', model);
    controller.set('ordered_buttons', null);
    controller.set('preview_level', null);
    model.set('show_history', false);
    model.load_button_set();
    app_state.set('currentBoardState', {
      id: model.get('id'),
      key: model.get('key'),
      parent_id: model.get('parent_board_id'),
      name: model.get('name'),
      has_fallbacks: model.get('has_fallbacks'),
      default_locale: model.get('locale'),
      copy_version: model.get('copy_version'),
      integration_name: model.get('integration') && model.get('integration_name'),
      parent_key: model.get('parent_board_key'),
      text_direction: i18n.text_direction(model.get('locale')),
      translatable: (model.get('locales') || []).length > 1
    });
    if(stashes.get('root_board_state.id') == app_state.get('currentBoardState.id')) {
      if(!stashes.get('root_board_state.text_direction')) {
        stashes.set('root_board_state.text_direction', app_state.get('currentBoardState.text_direction'));
      }
    }
    // By default use whatever locale is set for the board, but
    // if the user has explicitly set a preferred locale then try
    // to use that
    if(stashes.get('label_locale')) {
      var preferred_lang = stashes.get('label_locale').split(/-|_/)[0];
      var board_langs = model.get('locales').map(function(l) { return l.split(/-|_/)[0]; });
      if(board_langs.indexOf(preferred_lang) == -1) {
        app_state.set('label_locale', model.get('locale'));
      } else {
        app_state.set('label_locale', stashes.get('label_locale'));
      }
    } else {
      app_state.set('label_locale', model.get('locale'));
    }
    if(stashes.get('vocalization_locale')) {
      var preferred_lang = stashes.get('vocalization_locale').split(/-|_/)[0];
      var board_langs = model.get('locales').map(function(l) { return l.split(/-|_/)[0]; });
      if(board_langs.indexOf(preferred_lang) == -1) {
        app_state.set('vocalization_locale', model.get('locale'));
      } else {
        app_state.set('vocalization_locale', stashes.get('vocalization_locale'));
      }
    } else {
      app_state.set('vocalization_locale', model.get('locale'));
    }
    if(CoughDrop.embedded && !app_state.get('speak_mode')) {
      // Embedded mode should only operate in Speak Mode, so force it
      var state = app_state.get('currentBoardState');
      app_state.toggle_mode('speak', {override_state: state});
      if(app_state.get('currentUser.preferences.home_board')) {
        app_state.toggle_home_lock(true);
      }
      emberSet(state, 'level', emberGet(state, 'default_level'));
      stashes.persist('root_board_state', state);
      stashes.persist('board_level', state.level);
      stashes.persist('temporary_root_board_state', null);
      app_state.set('temporary_root_board_key', null);
    }
    editManager.setup(controller);
    app_state.set('board_virtual_dom.sendAction', function(action, id, extra) {
      controller.send(action, id, extra);
    });
    contentGrabbers.board_controller = controller;
    var prior_revision = model.get('current_revision');
    CoughDrop.log.track('processing buttons without lookups');
    _this.set('load_state', {retrieved: true});
    model.without_lookups(function() {
      controller.processButtons();
    });
    model.prefetch_linked_boards();

    // if you have the model.id but not permissions, that means you got it from an /index
    // call and it doesn't actually have all the information you need to render, so you
    // better reload. if ordered_buttons isn't set then that just means we need some
    // additional lookups
    if(model.get('integration')) { return; }

    controller.get('valid_fast_html');
    var insufficient_data = model.get('id') && (!controller.get('has_rendered_material') || (!model.get('pseudo_board') && model.get('permissions') === undefined));
    if(model.get('background.prompt') && app_state.get('speak_mode')) {
      // TODO: is there a way to wait until current speaking has
      // finished to activate the prompt?
      runLater(function() {
        model.prompt();
      }, 100);
    }
    if(!model.get('valid_id')) {
    } else if(persistence.get('online') || insufficient_data) {
      CoughDrop.log.track('considering reload');
      _this.set('load_state', {not_local: true});
      var reload = RSVP.resolve(model);
      // if we're online then we should reload, but do it softly if we're in speak mode
      if(persistence.get('online') && !model.get('local_only')) {
        // reload(false) says "hey, reload but you can use the local copy if you need to"
        // reload(true) says "definitely ping the server" (same as reload() )
        // TODO: this is failing when the board is available locally but the image isn't available locally
        // looks like this (usually, handle both cases) happens if it's stored in the local db but not
        // yet loaded into ember-data
        var force_fetch = !app_state.get('speak_mode');
        if(persistence.get('syncing') && !insufficient_data) { force_fetch = false; }
        _this.set('load_state', {remote_reload: true});
        reload = model.reload(force_fetch).then(null, function(err) {
          _this.set('load_state', {remote_reload_local_reload: true});
          if(!force_fetch && controller.get('has_rendered_material')) {
            // If you think you're online but you're not really,
            // then it'll barf on a failed lookup
            return RSVP.resolve(model)
          } else {
            return model.reload(false);
          }
        });
      // if we're offline, then we should only reload if we absolutely have to (i.e. ordered_buttons isn't set)
      } else if(!controller.get('has_rendered_material') && !model.get('local_only')) {
        _this.set('load_state', {local_reload: true});
        reload = model.reload(false).then(null, function(err) {
          _this.set('load_state', {local_reload_local_reload: true});
          return model.reload(false);
        });
      }

      reload.then(function(updated) {
        if(!controller.get('has_rendered_material') || updated.get('current_revision') != prior_revision || insufficient_data) {
          CoughDrop.log.track('processing buttons again');
          controller.processButtons(true);
        }
      }, function(error) {
        if(!controller.get('has_rendered_material') || !app_state.get('speak_mode')) {
          _this.send('error', error);
        }
      });
    }
  },
  error_message: computed('load_state', 'load_state.has_permissions', 'model.id', function() {
    if(this.get('model.id')) {
      return i18n.t('unexpected_error', "This board should have loaded, but there was an unexpected problem");
    } else {
      var error = this.get('load_state.error');
      if(error && error.errors) {
        error = error.errors[0];
      }
      if(persistence.get('online')) {
        // retrieved, not_local, remote_reload, remote_reload_local_reload, local_reload, local_reload_remote_reload
        if(error && error.unauthorized) {
          return i18n.t('error_unauthorized', "You don't have permission to access this board.");
        } else if(error && error.never_existed) {
          return i18n.t('error_nonexistent', "This board doesn't exist.");
        } else if(error && error.status >= 400) {
          return i18n.t('error_bad_status', "There was an unexpected error retrieving this board.");
        } else if(this.get('load_state.retrieved')) {
          return i18n.t('error_retrieved_only', "The resources for this board could not be retrieved.");
        } else if(this.get('load_state.not_local')) {
          return i18n.t('error_not_local', "The resources for this board were not available locally, so it could not be loaded.");
        } else if(this.get('load_state.remote_reload')) {
          return i18n.t('error_no_remote', "This board could not be retrieved from the cloud.");
        } else if(this.get('load_state.remote_reload_local_reload')) {
          return i18n.t('error_no_remote_or_local', "This board could not be retrieved from the cloud and hasn't been synced for offline use.");
        } else if(this.get('load_state.local_reload')) {
          return i18n.t('error_no_local', "This board is not available offline.");
        } else if(this.get('load_state.local_reload_remote_reload')) {
          return i18n.t('error_really_no_local', "This board has not been synced and is not available currently.");
        } else {
          return i18n.t('error_not_available', "This board is not currently available.");
        }
      } else {
        if(this.get('load_state.retrieved')) {
          return i18n.t('error_retrieved_only_offline', "The resources for this board could not be retrieved while offline.");
        } else if(this.get('load_state.not_local')) {
          return i18n.t('error_not_local_offline', "The resources for this board were not available locally while offline, so it could not be loaded.");
        } else if(this.get('load_state.remote_reload')) {
          return i18n.t('error_no_remote_offline', "This board could not be retrieved while offline.");
        } else if(this.get('load_state.remote_reload_local_reload')) {
          return i18n.t('error_not_anywhere_offline', "This board could not be retrieved while offline and hasn't been synced for offline use.");
        } else if(this.get('load_state.local_reload')) {
          return i18n.t('error_no_local_offline', "This board is not available while offline.");
        } else if(this.get('load_state.local_reload_remote_reload')) {
          return i18n.t('error_really_no_local_offline', "This board has not been synced and is not available while offline.");
        } else {
          return i18n.t('error_not_available_offline', "This board is not currently available while offline.");
        }
      }
//      return i18n.t('error_with_board', "There was a problem retrieving this board.");
    }
  }),
  actions: {
    willTransition: function(transition) {
      if(this.get('board')) {
        this.get('board').prompt('clear');
      }
      if(app_state.get('edit_mode')) {
        modal.warning(i18n.t('save_or_cancel_changes_first', "Save or cancel your changes before leaving this board!"));
        transition.abort();
      }
      return true;
    },
    refreshData: function() {
      this.refresh();
    },
    error: function(error, transition) {
      if(this.get('load_state')) {
        this.set('load_state.has_permissions', !!this.get('model.permissions'));
        this.set('load_state.error', error);
      }
      this.get('controller').set('model', CoughDrop.store.createRecord('board', {}));
    },
  }
});

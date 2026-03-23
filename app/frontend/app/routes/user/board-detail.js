import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';
import speecher from '../../utils/speecher';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';
import persistence from '../../utils/persistence';

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

    // Load via persistence.ajax to get raw board data reliably
    // Then also resolve the Ember Data model for editManager
    return new RSVP.Promise(function(resolve) {
      persistence.ajax('/api/v1/boards/' + board_key, { type: 'GET' }).then(function(data) {
        if(data && data.board) {
          // Save raw data BEFORE normalize (normalize may mutate the input)
          var raw_copy = JSON.parse(JSON.stringify(data.board));
          _this.set('_raw_board_data', raw_copy);
          // Push into store to get Ember Data record with correct ID
          var store = _this.store;
          var normalized = store.normalize('board', data.board);
          var record = store.push(normalized);
          resolve(record);
        } else {
          resolve({ error: true, boardname: params.boardname });
        }
      }, function() {
        resolve({ error: true, boardname: params.boardname });
      });
    });
  },

  setupController: function(controller, model) {
    var _this = this;
    var user = this.modelFor('user');

    controller.set('model', model);
    controller.set('user', user);
    controller.set('boardname', (model.get ? model.get('key') : '').split('/').slice(1).join('/') || '');
    controller.set('ordered_buttons', null);
    controller.set('preview_level', null);

    // Default panels to collapsed (unexpanded)
    controller.set('panels_collapsed', true);

    // Initialize the user's saved voice for speech synthesis
    if(user && user.get && user.get('preferences.device.voice')) {
      user.update_voice_uri();
      speecher.set_voice(
        user.get('preferences.device.voice'),
        user.get('preferences.device.alternate_voice')
      );
    }

    if(!model || model.error) { return; }

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

    // Set up editManager for edit mode operations
    controller.set('ordered_buttons', null);
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

    // Prefetch linked boards
    if(model.prefetch_linked_boards) {
      model.prefetch_linked_boards();
    }
  },

  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.set('ordered_buttons', null);
      controller.set('active_category', 'all');
      controller.set('sentence_parts', []);
      controller.set('edit_mode', false);
      controller.set('paint_mode', null);
      controller.set('color_picker_button', null);
      if(editManager.controller === controller) {
        editManager.controller = null;
      }
    }
  }
});

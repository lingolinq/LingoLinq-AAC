import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import i18n from '../utils/i18n';
import stashes from '../utils/_stashes';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import progress_tracker from '../utils/progress_tracker';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),
  stashes: service(),
  modal: service(),

  opening: function() {
    var _this = this;
    _this.set('hierarchy', {loading: true});
    _this.set('status', null);
    BoardHierarchy.load_with_button_set(this.get('model.board'), {deselect_on_different: true, prevent_keyboard: true, prevent_different: true}).then(function(hierarchy) {
      _this.set('hierarchy', hierarchy);
    }, function(err) {
      _this.set('hierarchy', {error: true});
    });
    _this.set('premium_symbols_enabled', this.appState.get('currentUser.subscription.extras_enabled'));
    (this.appState.get('currentUser.supervisees') || []).forEach(function(sup) {
      if(sup.user_name == _this.get('model.board.user_name') && sup.extras_enabled) {
        _this.set('premium_symbols_enabled', true);
      }
    });
    if(this.get('model.library')) { this.set('library', this.get('model.library')); }
    this.appState.get('currentUser').find_integration('lessonpix', this.get('model.board.user_name')).then(function(res) {
      _this.set('lessonpix_enabled', true);
      if(this.stashes.get('last_image_library') == 'lessonpix') { _this.set('image_library', 'lessonpix'); }
    }, function(err) { });
  },
  libraries: computed('lessonpix_enabled', 'premium_symbols_enabled', function() {
    var res = [];
    res.push({id: 'opensymbols', name: i18n.t('opensymbols', 'OpenSymbols.org')});
    res.push({id: 'arasaac', name: i18n.t('arasaac', 'ArasAAC')});
    res.push({id: 'twemoji', name: i18n.t('twemoji', 'Twitter Emoji')});
    res.push({id: 'noun-project', name: i18n.t('noun_project', 'Noun Project')});
    res.push({id: 'sclera', name: i18n.t('sclera', 'Sclera (High Contrast)')});
    res.push({id: 'mulberry', name: i18n.t('mulberry', 'Mulberry')});
    res.push({id: 'tawasol', name: i18n.t('tawasol', 'Tawasol (Arabic)')});
    res.push({id: 'pixabay_photos', name: i18n.t('pixabay_photos', 'Pixabay Photos')});
    res.push({id: 'pixabay_vectors', name: i18n.t('pixabay_vectors', 'Pixabay Vector Images')});
    if(this.get('lessonpix_enabled')) {
      res.push({id: 'lessonpix', name: i18n.t('lessonpix', "LessonPix")});
    }
    if(this.get('premium_symbols_enabled')) {
      res.push({id: 'pcs', name: i18n.t('pcs_images', "PCS (BoardMaker) Symbols by Tobii Dynavox")});
      res.push({id: 'symbolstix', name: i18n.t('symbolstix_images', "SymbolStix Symbols")});
      if(!this.get('lessonpix_enabled')) {
        res.push({id: 'lessonpix', name: i18n.t('lessonpix', "LessonPix")});
      }
    }
    return res;
  }),
  premium_symbol_library: computed('library', function() {
    return ['lessonpix', 'pcs', 'symbolstix'].indexOf(this.get('library')) != -1;
  }),
  actions: {
    swap: function() {
      var _this = this;
      var board_ids_to_include = null;
      if(this.get('hierarchy') && this.get('hierarchy').selected_board_ids) {
        board_ids_to_include = this.get('hierarchy').selected_board_ids();
      }

      _this.set('status', {loading: true});
      this.persistence.ajax('/api/v1/boards/' + _this.get('model.board.id') + '/swap_images', {
        type: 'POST',
        data: {
          library: _this.get('library'),
          board_ids_to_convert: board_ids_to_include
        }
      }).then(function(res) {
        progress_tracker.track(res.progress, function(event) {
          if(event.status == 'errored') {
            _this.set('status', {error: true});
          } else if(event.status == 'finished') {
            _this.set('status', {finished: true});
            _this.get('model.board').reload(true).then(function() {
              this.appState.set('board_reload_key', Math.random() + "-" + (new Date()).getTime());
              this.modal.close('swap-images');
            }, function() {
            });
          }
        });
      }, function(res) {
        _this.set('status', {error: true});
      });
    }
  }
});

import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import editManager from '../utils/edit_manager';
import { observer } from '@ember/object';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('results', null);
    _this.set('searchString', '');
    if(_this.get('model.board')) {
      _this.get('model.board').load_button_set().then(function(bs) {
        _this.set('button_set', bs);
      }, function() {
        _this.set('button_set', null);
        // try one more time, seems like it fails temporarily sometimes
        runLater(function() {
          _this.get('model.board').load_button_set().then(function(bs) {
            _this.set('button_set', bs);
          }, function() { });
        }, 1000);
      });
    }
    runLater(function() {
      $("#button_search_string").focus();
    }, 100);
  },
  search: observer('searchString', 'button_set', function() {
    var board = modal.settings_for['find-button'].board;
    if(this.get('searchString')) {
      var _this = this;
      if(!_this.get('results')) {
        _this.set('loading', true);
      }
      _this.set('error', null);
      // TODO: only show other boards if in speak mode!
      var include_other_boards = this.get('model.include_other_boards');
      if(board.get('button_set')) {
        var user = app_state.get('currentUser');
        var include_home = app_state.get('speak_mode');
        var search = null;
        var now = (new Date()).getTime();
        var search_id = Math.random() + "-" + now;
        _this.set('search_id', search_id);
        var interval = this.get('search_interval') || (capabilities.system == 'iOS' ? 400 : null);
        // on iOS the search process is really slow, somehow
        // the promises take longer to resolve, so we try to
        // debounce them a little and see if that helps
        runLater(function() {
          if(_this.get('search_id') != search_id) { _this.set('loading', true); return; }
          var results = null;
          if(app_state.get('feature_flags.find_multiple_buttons')) {
            search = board.get('button_set').find_sequence(_this.get('searchString'), board.get('id'), user, include_home);
          } else {
            search = board.get('button_set').find_buttons(_this.get('searchString'), board.get('id'), user, include_home);
          }
          search.then(function(results) {
            var timing = (new Date()).getTime() - now;
            console.log("results!", results, timing, _this.get('search_interval'));
            if(timing > interval + 200) {
              // If the search takes too long, assume subsequent searches
              // will also be slow and debounce accordingly
              _this.set('search_interval', Math.min(interval + 200, 1000));
            }
            if(persistence.get('online')) {
              _this.set('results', results);
              _this.set('loading', false);
            } else {
              var new_results = [];
              var promises = [];
              results.forEach(function(b) {
                var images = [b.image];
                if(b.sequence) {
                  images = b.steps.map(function(s) { return s.button.image; });
                }
                var missing_image = images.find(function(i) { return !i || LingoLinq.remote_url(i); });
                if(!missing_image) {
                  new_results.push(b);
                } else { }
              });
              RSVP.all_wait(promises).then(null, function() { return RSVP.resolve(); }).then(function() {
                _this.set('results', new_results);
                _this.set('loading', false);
              });
            }
            _this.set('results', results);
            _this.set('loading', false);
          }, function(err) {
            _this.set('loading', false);
            _this.set('error', err.error);
          });
        }, interval);
      } else {
        _this.set('loading', false);
        _this.set('error', i18n.t('button_set_not_found', "Button set not downloaded, please try syncing or going online and reopening this board"));
      }
    } else {
      this.set('results', null);
    }
  }),
  actions: {
    pick_result: function(result) {
      if(!result) {
        result = this.get('results')[0];
      }
      if(!result) { return; }
      if(result.board_id == editManager.controller.get('model.id')) {
        var $button = $(".button[data-id='" + result.id + "']");
        var _this = this;
        modal.highlight($button, {highlight_type: 'button_search'}).then(function() {
          var button = editManager.find_button(result.id);
          var board = editManager.controller.get('model');
          app_state.controller.activateButton(button, {board: board, trigger_source: 'click'});
        }, function() { });
      } else {
        var buttons = result.pre_buttons || [];
        if(result.pre_action == 'home') {
          buttons.unshift('home');
        }
        if(result.sequence) {
          result.steps.forEach(function(step) {
            if(step.sequence.pre == 'true_home') {
              buttons.push({pre: 'true_home'});
            }
            step.sequence.buttons.forEach(function(btn) {
              buttons.push(btn);
            });
            buttons.push(step.button);
          });
        } else {
          buttons.push(result);
        }
        app_state.controller.highlight_button(buttons, this.get('button_set'));
      }
    }
  }
});

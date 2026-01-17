import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import stashes from '../../utils/_stashes';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import LingoLinq from '../../app';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),
  stashes: service(),
  modal: service(),

  opening: function() {
    // which step are we on?
    var step = this.get('model.step') || 0;
    this.set('current_step', (this.get('model.board.intro.sections') || [])[step]);

    // as part of the intro, set the board to level 10 and
    // make it the root board to keep everything consistent
    var state = {
      id: this.get('model.board.id'),
      key: this.get('model.board.key'),
      level: 10
    };
    this.stashes.set('root_board_state', state);
    this.stashes.set('board_level', state.level);
    this.stashes.set('temporary_root_board_state', null);
    this.appState.set('temporary_root_board_key', null);

    var user = this.appState.get('currentUser');
    var intros = this.appState.get('currentUser.preferences.progress.board_intros') || [];
    if(intros.indexOf(this.get('model.board.id')) == -1) {
      intros.push(this.get('model.board.id'));
    }
    if(user) {
      user.set('preferences.progress.board_intros', intros);
      user.save();
    }
  },
  next_step: computed('model.step', function() {
    var step = (this.get('model.step') || 0);
    var section = (this.get('model.board.intro.sections') || [])[step];
    return !!section;
  }),
  actions: {
    close: function() {
      // clear step and modal.close
      this.modal.close();
    },
    next: function() {
      var step = (this.get('model.step') || 0) + 1;
      var section = this.get('model.board.intro.sections')[step];
      this.set('current_step', section);
      if(section) {
        this.set('model.step', step);
      }
    },
    start: function() {
      var board = this.get('model.board');
      utterance.clear();
      var _this = this;
      if(!this.get('current_step.prompt')) {
        this.send('next');
        return;
      }
      if(board.get('button_set')) {
        var user = this.appState.get('currentUser');
        var search = null;
        var prompt = _this.get('current_step.prompt');
        var level = _this.get('current_step.level');
        var re = /^Lvl:(\d+)\s*/;
        if(prompt.match(re)) {
          var lvl = parseInt(prompt.match(re)[1], 10);
          if(lvl && lvl <= 10) {
            level = lvl;
          }
          prompt = prompt.replace(re, '');
        }
        var search = board.get('button_set').find_sequence(prompt, board.get('id'), user, false);
        var show_sequence = function(result) {
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

          // Allow setting the level as part of the steps
          this.stashes.set('board_level', level || 10);
          app_state.controller.highlight_button(buttons, board.get('button_set'), {wait_to_prompt: true}).then(function() {
            // re-open the modal at the next step
            this.modal.open('modals/board-intro', {board: _this.get('model.board'), step: (_this.get('model.step') + 1)});
          }, function() {
            // should only happen if the user cancels out of the help
            debugger
          });
        };
        search.then(function(results) {
          if(window.this.persistence.get('online')) {
            show_sequence(results[0]);
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
              show_sequence(new_results[0]);
            });
          }
        }, function(err) {
          alert('nopety nope');
        });
      } else {
        board.load_button_set().then(function() {
          _this.send('start');
        }, function() {
          alert('nopety nope');
        });
      }
    }
  }
});

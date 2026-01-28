import modal from '../../utils/modal';
import { inject as service } from '@ember/service';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import LingoLinq from '../../app';

export default class BoardIntroController extends modal.ModalController {
  @service('app-state') appState;
  @service persistence;
  @service stashes;

  @tracked current_step;

  opening() {
    // which step are we on?
    var step = this.model.step || 0;
    var sections = this.model.board.intro ? (this.model.board.intro.sections || []) : [];
    this.current_step = sections[step];

    // as part of the intro, set the board to level 10 and
    // make it the root board to keep everything consistent
    var state = {
      id: this.model.board.id,
      key: this.model.board.key,
      level: 10
    };
    this.stashes.set('root_board_state', state);
    this.stashes.set('board_level', state.level);
    this.stashes.set('temporary_root_board_state', null);
    this.appState.set('temporary_root_board_key', null);

    var user = this.appState.currentUser;
    var intros = (user && user.preferences && user.preferences.progress && user.preferences.progress.board_intros) || [];
    if(intros.indexOf(this.model.board.id) == -1) {
      intros.push(this.model.board.id);
    }
    if(user) {
      if (!user.preferences) { user.set('preferences', {}); }
      if (!user.preferences.progress) { user.set('preferences.progress', {}); }
      user.set('preferences.progress.board_intros', intros);
      user.save();
    }
  }

  get next_step() {
    var step = (this.model.step || 0);
    var sections = this.model.board.intro ? (this.model.board.intro.sections || []) : [];
    var section = sections[step];
    return !!section;
  }

  @action
  close() {
    // clear step and modal.close
    modal.close();
  }

  @action
  next() {
    var step = (this.model.step || 0) + 1;
    var sections = this.model.board.intro ? (this.model.board.intro.sections || []) : [];
    var section = sections[step];
    this.current_step = section;
    if(section) {
      // we need to set this on the model because the modal re-opens itself with incremented step
      // effectively state is passed via model
      // but here we are just setting it on the current model object? 
      // The original code was: this.set('model.step', step);
      // model is likely a hash or object passed to the controller
      if (this.model && typeof this.model.set === 'function') {
          this.model.set('step', step);
      } else {
          this.model.step = step;
      }
    }
  }

  @action
  start() {
    var board = this.model.board;
    utterance.clear();
    var _this = this;
    if(!this.current_step || !this.current_step.prompt) {
      this.send('next');
      return;
    }
    if(board.get('button_set')) {
      var user = _this.appState.currentUser;
      var prompt = _this.current_step.prompt;
      var level = _this.current_step.level;
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
        _this.stashes.set('board_level', level || 10);
        _this.appState.controller.highlight_button(buttons, board.get('button_set'), {wait_to_prompt: true}).then(function() {
          // re-open the modal at the next step
          modal.open('modals/board-intro', {board: _this.model.board, step: (_this.model.step + 1)});
        }, function() {
          // should only happen if the user cancels out of the help
          // debugger
        });
      };
      search.then(function(results) {
        if(_this.persistence.online) {
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

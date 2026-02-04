import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modalUtil from '../utils/modal';
import utterance from '../utils/utterance';
import RSVP from 'rsvp';
import LingoLinq from '../app';

/**
 * Board Intro Modal Component
 *
 * Converted from modals/board-intro template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistence: service('persistence'),
  stashes: service('stashes'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/board-intro';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('current_step', null);
  },

  next_step: computed('model.step', 'model.board.intro', function() {
    const step = this.get('model.step') || 0;
    const board = this.get('model.board');
    const sections = (board && board.intro && board.intro.sections) || [];
    const section = sections[step];
    return !!section;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      const component = this;
      this.get('modal').setComponent(component);
      const model = this.get('model');
      let step = model.step || 0;
      const sections = model.board && model.board.intro ? (model.board.intro.sections || []) : [];
      this.set('current_step', sections[step]);

      const state = {
        id: model.board.id,
        key: model.board.key,
        level: 10
      };
      this.stashes.set('root_board_state', state);
      this.stashes.set('board_level', state.level);
      this.stashes.set('temporary_root_board_state', null);
      this.appState.set('temporary_root_board_key', null);

      const user = this.appState.get('currentUser');
      let intros = (user && user.preferences && user.preferences.progress && user.preferences.progress.board_intros) || [];
      if (intros.indexOf(model.board.id) === -1) {
        intros.push(model.board.id);
      }
      if (user) {
        if (!user.preferences) { user.set('preferences', {}); }
        if (!user.preferences.progress) { user.set('preferences.progress', {}); }
        user.set('preferences.progress.board_intros', intros);
        user.save();
      }
    },
    closing() {},
    next() {
      const model = this.get('model');
      const step = (model.step || 0) + 1;
      const sections = model.board && model.board.intro ? (model.board.intro.sections || []) : [];
      const section = sections[step];
      this.set('current_step', section);
      if (section) {
        if (model && typeof model.set === 'function') {
          model.set('step', step);
        } else {
          model.step = step;
        }
      }
    },
    start() {
      const board = this.get('model.board');
      const currentStep = this.get('current_step');
      utterance.clear();
      const _this = this;
      if (!currentStep || !currentStep.prompt) {
        this.send('next');
        return;
      }
      if (board.get('button_set')) {
        const user = _this.appState.get('currentUser');
        let prompt = currentStep.prompt;
        let level = currentStep.level;
        const re = /^Lvl:(\d+)\s*/;
        if (prompt.match(re)) {
          const lvl = parseInt(prompt.match(re)[1], 10);
          if (lvl && lvl <= 10) {
            level = lvl;
          }
          prompt = prompt.replace(re, '');
        }
        const search = board.get('button_set').find_sequence(prompt, board.get('id'), user, false);
        const show_sequence = function(result) {
          const buttons = result.pre_buttons || [];
          if (result.pre_action === 'home') {
            buttons.unshift('home');
          }
          if (result.sequence) {
            result.steps.forEach(function(step) {
              if (step.sequence.pre === 'true_home') {
                buttons.push({ pre: 'true_home' });
              }
              step.sequence.buttons.forEach(function(btn) {
                buttons.push(btn);
              });
              buttons.push(step.button);
            });
          } else {
            buttons.push(result);
          }
          _this.stashes.set('board_level', level || 10);
          _this.appState.controller.highlight_button(buttons, board.get('button_set'), { wait_to_prompt: true }).then(function() {
            modalUtil.open('modals/board-intro', { board: _this.get('model.board'), step: (_this.get('model.step') + 1) });
          }, function() {});
        };
        search.then(function(results) {
          if (_this.persistence.get('online')) {
            show_sequence(results[0]);
          } else {
            const new_results = [];
            results.forEach(function(b) {
              const images = [b.image];
              if (b.sequence) {
                images.push.apply(images, b.steps.map(function(s) { return s.button.image; }));
              }
              const missing_image = images.find(function(i) { return !i || LingoLinq.remote_url(i); });
              if (!missing_image) {
                new_results.push(b);
              }
            });
            RSVP.all_wait([]).then(null, function() { return RSVP.resolve(); }).then(function() {
              show_sequence(new_results[0]);
            });
          }
        }, function() {
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

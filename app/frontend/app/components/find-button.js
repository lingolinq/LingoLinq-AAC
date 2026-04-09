import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';
import LingoLinq from '../app';

/**
 * Find Button modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'find-button';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  willDestroy() {
    this._super(...arguments);
    this.set('_findButtonOpeningSetupDone', false);
  },

  /**
   * Tagless component (tagName: '') — didInsertElement never runs. Run setup on
   * first didRender and/or when modal-dialog invokes opening() (same guard).
   */
  ensureFindButtonOpeningOnce() {
    if (this.get('_findButtonOpeningSetupDone')) {
      return;
    }
    this.set('_findButtonOpeningSetupDone', true);
    this.runOpeningSetup();
  },

  didRender() {
    this._super(...arguments);
    this.ensureFindButtonOpeningOnce();
  },

  /**
   * Resets search state, loads the board button set, and focuses the search field.
   */
  runOpeningSetup() {
    this.set('results', null);
    this.set('searchString', '');
    const board = this.get('model.board');
    if (board) {
      board.load_button_set().then((bs) => {
        if (this.isDestroyed || this.isDestroying) { return; }
        this.set('button_set', bs);
      }, () => {
        if (this.isDestroyed || this.isDestroying) { return; }
        this.set('button_set', null);
        runLater(() => {
          if (this.isDestroyed || this.isDestroying) { return; }
          board.load_button_set().then((bs) => {
            if (this.isDestroyed || this.isDestroying) { return; }
            this.set('button_set', bs);
          }, () => {});
        }, 1000);
      });
    }
    runLater(() => {
      if (this.isDestroyed || this.isDestroying) { return; }
      const el = document.getElementById('button_search_string');
      if (el) { el.focus(); }
    }, 100);
  },

  search: observer('searchString', 'button_set', function() {
    const board = this.get('model.board');
    if (!board) {
      this.set('results', null);
      return;
    }
    if (this.get('searchString')) {
      const _this = this;
      if (!_this.get('results')) {
        _this.set('loading', true);
      }
      _this.set('error', null);
      const include_other_boards = this.get('model.include_other_boards');
      var bs = this.get('button_set') || board.get('button_set');
      if (board && bs) {
        if (!board.get('button_set')) { board.set('button_set', bs); }
        const user = this.get('appState').get('currentUser');
        const include_home = this.get('appState').get('speak_mode');
        const now = (new Date()).getTime();
        const search_id = Math.random() + '-' + now;
        _this.set('search_id', search_id);
        const interval = this.get('search_interval') || (capabilities.system === 'iOS' ? 400 : null);
        runLater(function() {
          if (_this.get('search_id') !== search_id) { _this.set('loading', true); return; }
          let search = null;
          if (_this.get('appState').get('feature_flags.find_multiple_buttons')) {
            search = board.get('button_set').find_sequence(_this.get('searchString'), board.get('id'), user, include_home);
          } else {
            search = board.get('button_set').find_buttons(_this.get('searchString'), board.get('id'), user, include_home);
          }
          search.then(function(results) {
            const timing = (new Date()).getTime() - now;
            if (timing > interval + 200) {
              _this.set('search_interval', Math.min(interval + 200, 1000));
            }
            if (persistence.get('online')) {
              _this.set('results', results);
              _this.set('loading', false);
            } else {
              const new_results = [];
              results.forEach(function(b) {
                const images = [b.image];
                if (b.sequence) {
                  b.steps.forEach(function(s) { images.push(s.button.image); });
                }
                const missing_image = images.find(function(i) { return !i || LingoLinq.remote_url(i); });
                if (!missing_image) {
                  new_results.push(b);
                }
              });
              RSVP.all_wait([]).then(null, function() { return RSVP.resolve(); }).then(function() {
                _this.set('results', new_results);
                _this.set('loading', false);
              });
            }
            // Offline: show full matches immediately, then the promise above narrows to
            // buttons with local images. Online: same assignments as the branch above.
            _this.set('results', results);
            _this.set('loading', false);
          }, function(err) {
            _this.set('loading', false);
            _this.set('error', err && err.error);
          });
        }, interval);
      } else {
        this.set('loading', false);
        this.set('error', i18n.t('button_set_not_found', 'Button set not downloaded, please try syncing or going online and reopening this board'));
      }
    } else {
      this.set('results', null);
    }
  }),

  actions: {
    opening() {
      var modalService = this.get('modal');
      if (modalService && modalService.setComponent) {
        modalService.setComponent(this);
      }
      var template = 'find-button';
      var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
      this.set('model', options);
      this.set('_findButtonOpeningSetupDone', false);
      this.runOpeningSetup();
    },
    close() {
      this.get('modal').close();
    },
    closing() {},
    pick_result(result) {
      if (!result) {
        result = this.get('results')[0];
      }
      if (!result) { return; }
      const appState = this.get('appState');
      const controller = appState.get('controller');
      const boardController = editManager && editManager.controller;
      const currentBoard = boardController && boardController.get && boardController.get('model');
      const onCurrentBoard = currentBoard && result.board_id === currentBoard.get('id');
      if (onCurrentBoard) {
        const board = currentBoard;
        const $button = $(".button[data-id='" + result.id + "']");
        modal.highlight($button, { highlight_type: 'button_search' }).then(function() {
          const button = editManager && editManager.find_button(result.id);
          if (controller && controller.activateButton && button && board) {
            controller.activateButton(button, { board: board, trigger_source: 'click' });
          }
        }, function() {});
      } else {
        let buttons = result.pre_buttons || [];
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
        if (controller && controller.highlight_button) {
          controller.highlight_button(buttons, this.get('button_set'));
        }
      }
    }
  }
});

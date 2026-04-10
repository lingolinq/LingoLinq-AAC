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
    console.log('[FIND-BTN] init() called');
    this._loadModelFromService();
    console.log('[FIND-BTN] init() model.board =', this.get('model.board'), 'model.board.id =', this.get('model.board.id'));
  },

  _loadModelFromService() {
    const modalService = this.get('modal');
    const template = 'find-button';
    var options = null;
    console.log('[FIND-BTN] _loadModelFromService: modalService.settingsFor =', modalService && modalService.settingsFor);
    console.log('[FIND-BTN] _loadModelFromService: modal.settings_for =', modal && modal.settings_for);
    if (modalService && modalService.settingsFor && modalService.settingsFor[template]) {
      options = modalService.settingsFor[template];
      console.log('[FIND-BTN] _loadModelFromService: got options from modalService.settingsFor');
    }
    if (!options) {
      var legacyModal = modal;
      if (legacyModal && legacyModal.settings_for && legacyModal.settings_for[template]) {
        options = legacyModal.settings_for[template];
        console.log('[FIND-BTN] _loadModelFromService: got options from legacy modal.settings_for');
      }
    }
    if (!options) {
      options = this.get('model') || {};
      console.log('[FIND-BTN] _loadModelFromService: fell back to this.get("model")');
    }
    console.log('[FIND-BTN] _loadModelFromService: options =', options, 'options.board =', options && options.board, 'options.board.id =', options && options.board && options.board.get && options.board.get('id'));
    this.set('model', options);
  },

  willDestroy() {
    this._super(...arguments);
    this.set('_findButtonOpeningSetupDone', false);
  },

  ensureFindButtonOpeningOnce() {
    if (this.get('_findButtonOpeningSetupDone')) {
      console.log('[FIND-BTN] ensureFindButtonOpeningOnce: already done, skipping');
      return;
    }
    console.log('[FIND-BTN] ensureFindButtonOpeningOnce: running setup');
    this.set('_findButtonOpeningSetupDone', true);
    this.runOpeningSetup();
  },

  didRender() {
    this._super(...arguments);
    console.log('[FIND-BTN] didRender() called');
    this.ensureFindButtonOpeningOnce();
  },

  runOpeningSetup() {
    console.log('[FIND-BTN] runOpeningSetup() called');
    this.set('results', null);
    this.set('searchString', '');
    var _this = this;
    const board = this.get('model.board');
    console.log('[FIND-BTN] runOpeningSetup: board =', board, 'board.id =', board && board.get && board.get('id'));
    if (board) {
      console.log('[FIND-BTN] runOpeningSetup: calling board.load_button_set(true)');
      board.load_button_set(true).then(function(bs) {
        console.log('[FIND-BTN] runOpeningSetup: load_button_set resolved, bs =', bs);
        console.log('[FIND-BTN] runOpeningSetup: bs.buttons =', bs && bs.get && bs.get('buttons'));
        console.log('[FIND-BTN] runOpeningSetup: bs.buttons.length =', bs && bs.get && bs.get('buttons') && bs.get('buttons').length);
        console.log('[FIND-BTN] runOpeningSetup: bs.root_url =', bs && bs.get && bs.get('root_url'));
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (bs) {
          console.log('[FIND-BTN] runOpeningSetup: calling bs.load_buttons(true)');
          return bs.load_buttons(true).then(function() {
            console.log('[FIND-BTN] runOpeningSetup: load_buttons resolved');
            console.log('[FIND-BTN] runOpeningSetup: bs.buttons after load =', bs.get('buttons'));
            console.log('[FIND-BTN] runOpeningSetup: bs.buttons.length after load =', bs.get('buttons') && bs.get('buttons').length);
            if (_this.isDestroyed || _this.isDestroying) { return; }
            _this.set('button_set', bs);
            console.log('[FIND-BTN] runOpeningSetup: component button_set set');
          });
        }
      }, function(err) {
        console.log('[FIND-BTN] runOpeningSetup: load_button_set REJECTED', err);
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('button_set', null);
        runLater(function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          board.load_button_set(true).then(function(bs) {
            if (_this.isDestroyed || _this.isDestroying) { return; }
            if (bs) {
              return bs.load_buttons(true).then(function() {
                if (_this.isDestroyed || _this.isDestroying) { return; }
                _this.set('button_set', bs);
                console.log('[FIND-BTN] retry: button_set set');
              });
            }
          }, function(err2) { console.log('[FIND-BTN] retry also failed', err2); });
        }, 1000);
      });
    } else {
      console.log('[FIND-BTN] runOpeningSetup: NO BOARD - model =', this.get('model'));
    }
    runLater(() => {
      if (this.isDestroyed || this.isDestroying) { return; }
      const el = document.getElementById('button_search_string');
      if (el) { el.focus(); }
    }, 100);
  },

  search: observer('searchString', 'button_set', function() {
    const board = this.get('model.board');
    console.log('[FIND-BTN] search observer fired: searchString =', this.get('searchString'), 'board =', !!board);
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
      console.log('[FIND-BTN] search: bs =', bs, 'bs.buttons.length =', bs && bs.get && bs.get('buttons') && bs.get('buttons').length);
      console.log('[FIND-BTN] search: board.button_set =', board.get('button_set'));
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
          console.log('[FIND-BTN] search: calling find_buttons with', _this.get('searchString'), 'board.id =', board.get('id'));
          if (_this.get('appState').get('feature_flags.find_multiple_buttons')) {
            search = board.get('button_set').find_sequence(_this.get('searchString'), board.get('id'), user, include_home);
          } else {
            search = board.get('button_set').find_buttons(_this.get('searchString'), board.get('id'), user, include_home);
          }
          search.then(function(results) {
            console.log('[FIND-BTN] search: got results', results && results.length, results);
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
            _this.set('results', results);
            _this.set('loading', false);
          }, function(err) {
            console.log('[FIND-BTN] search: find_buttons REJECTED', err);
            _this.set('loading', false);
            _this.set('error', err && err.error);
          });
        }, interval);
      } else {
        console.log('[FIND-BTN] search: NO BUTTON SET - board.button_set =', board.get('button_set'), 'component button_set =', this.get('button_set'));
        this.set('loading', false);
        this.set('error', i18n.t('button_set_not_found', 'Button set not downloaded, please try syncing or going online and reopening this board'));
      }
    } else {
      this.set('results', null);
    }
  }),

  actions: {
    opening() {
      console.log('[FIND-BTN] opening() action called');
      var modalService = this.get('modal');
      if (modalService && modalService.setComponent) {
        modalService.setComponent(this);
      }
      this._loadModelFromService();
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

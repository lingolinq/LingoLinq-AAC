import Component from '@ember/component';
import LingoLinq from '../app';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Component.extend({
  modal: service(),
  willInsertElement: function () {
    this.set('include_canvas', window.outerWidth > 800);
    this.set('app_state', app_state);
    this.set('model', { loading: true });
    var _this = this;
    if (_this.get('key')) {
      LingoLinq.store.findRecord('board', _this.get('key')).then(function (board) {
        if (!board.get('permissions')) {
          board.reload(false).then(function (board) {
            _this.set('model', board);
          });
        } else {
          _this.set('model', board);
        }
      }, function (err) {
        _this.set('model', { error: true });
      });
    }
  },
  multiple_locales: computed('model.locales', function () {
    return (this.get('model.locales') || []).length > 1;
  }),
  languages: computed('model.locales', function () {
    return (this.get('model.locales') || []).map(function (l) { return i18n.readable_language(l); }).join(', ');
  }),
  language: computed('model.locale', function () {
    return i18n.readable_language(this.get('model.locale'));
  }),
  select_option: computed('option', function () {
    return this.get('option') == 'select';
  }),
  actions: {
    select: function () {
      this.sendAction();
    },
    close: function () {
      this.modal.close_board_preview();
    },
    visit: function () {
      app_state.set('referenced_board', { id: this.get('model.id'), key: this.get('model.key'), locale: this.get('locale') });
      app_state.controller.transitionToRoute('board', this.get('model.key'));
    },
    copy: function () {
      var oldBoard = this.get('model');
      this.modal.close_board_preview();
      this.modal.open('copy-board', { board: oldBoard, for_editing: false }).then(function (decision) {
        decision = decision || {};
        decision.user = decision.user || app_state.get('currentUser');
        decision.action = decision.action || "nothing";
        oldBoard.set('copy_name', decision.board_name);
        oldBoard.set('copy_prefix', decision.board_prefix);
        return this.modal.open('copying-board', {
          board: oldBoard,
          action: decision.action,
          user: decision.user,
          shares: decision.shares,
          symbol_library: decision.symbol_library,
          make_public: decision.make_public,
          default_locale: decision.default_locale,
          translate_locale: decision.translate_locale,
          disconnect: decision.disconnect,
          new_owner: decision.new_owner
        });
      });

    }
  }
});

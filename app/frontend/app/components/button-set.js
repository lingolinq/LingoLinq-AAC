import { set as emberSet, get as emberGet } from '@ember/object';
import RSVP from 'rsvp';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import Component from '@ember/component';
import { inject as service } from '@ember/service';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import progress_tracker from '../utils/progress_tracker';
import LingoLinq from '../app';
import { observer, computed } from '@ember/object';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'button-set';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('saving_translations', null);
    this.set('error_saving_translations', null);
    if (persistence.get('online') && this.get('model.button_set')) {
      this.get('model.button_set').reload();
    }
    this.set('translating', null);

    if (this.get('model.locale') && this.get('model.button_set')) {
      var _this = this;
      _this.set('translating', { loading: true });

      var lists = [];
      var list = [];
      list.push({ label: this.get('model.board.name') });
      (this.get('model.button_set.buttons') || []).forEach(function(b) {
        if (b.locale !== _this.get('model.locale')) {
          list.push(b);
        }
        if (list.length >= 100) {
          lists.push(list);
          list = [];
        }
      });
      _this.set('translations', {});
      if (list.length > 0) { lists.push(list); }

      var promises = [];
      lists.forEach(function(buttons, idx) {
        var words = [];
        buttons.forEach(function(b) {
          if (b.label) { words.push(b.label); }
          if (b.vocalization && b.vocalization !== b.label) { words.push(b.vocalization); }
        });
        promises.push(new RSVP.Promise(function(res, rej) {
          runLater(function() {
            persistence.ajax('/api/v1/users/self/translate', {
              type: 'POST',
              data: {
                words: words,
                destination_lang: _this.get('model.locale'),
                source_lang: _this.get('model.board.locale') || 'en'
              }
            }).then(function(data) {
              var trans = _this.get('translations');
              for (var key in data.translations) {
                trans[key] = data.translations[key];
              }
              _this.set('translation_index', (_this.get('translation_index') || 0) + 1);
              res(data);
            }, function(err) {
              rej(err);
            });
          }, idx * 1000);
        }));
      });
      RSVP.all_wait(promises).then(function() {
        _this.set('translating', { done: true });
      }, function() {
        _this.set('translating', { error: true });
      });
    }
  },

  destination_language: computed('model.locale', function() {
    return i18n.readable_language(this.get('model.locale'));
  }),
  source_language: computed('model.board.locale', function() {
    return i18n.readable_language(this.get('model.board.locale'));
  }),
  sorted_buttons: computed(
    'model.button_set.buttons',
    'model.locale',
    'model.board_ids',
    function() {
      var words = (this.get('model.button_set.buttons') || []).slice();
      // Only merge board.buttons when button_set hasn't loaded yet (fallback).
      // When both exist, button_set.buttons already contains the board's buttons;
      // merging causes duplicates when board_id/id comparison fails (e.g. type mismatch).
      if (this.get('model.board.buttons') && (!words || words.length === 0)) {
        var _this = this;
        var board_id = this.get('model.board.global_id') || this.get('model.board.id');
        this.get('model.board.buttons').forEach(function(button) {
          if (!words.find(function(b) { return b.board_id === board_id && b.id === button.id; })) {
            words.push($.extend({}, button, {
              board_id: board_id,
              board_key: _this.get('model.board.key'),
              depth: 0
            }));
          }
        });
      }
      var res = [];
      var locale = this.get('model.locale');
      var board_ids = this.get('model.old_board_ids_to_translate');
      var translations = this.get('translations') || {};
      var original_board_id = this.get('model.board.global_id') || this.get('model.board.id');
      var translating = !!(this.get('translating'));
      words.forEach(function(b, idx) {
        if (translating) {
          if (locale && b.locale && b.locale === locale) { return; }
          if (board_ids && board_ids.indexOf(b.board_id) === -1) { return; }
          if (!board_ids && b.board_id !== original_board_id) { return; }
        }
        emberSet(b, 'voc_or_label', b.vocalization || b.label);
        words.forEach(function(b2, idx2) {
          b2.voc_or_label = b2.vocalization || b2.label;
          if (b.voc_or_label.toLowerCase() === b2.voc_or_label.toLowerCase() && idx !== idx2) {
            b.repeat = true;
          }
        });
        res.push(b);
      });
      res = res.sort(function(a, b) {
        if (a.label.toLowerCase() < b.label.toLowerCase()) { return -1; }
        if (a.label.toLowerCase() > b.label.toLowerCase()) { return 1; }
        return 0;
      });
      return res;
    }
  ),
  update_sorted_buttons: observer('sorted_buttons', 'translation_index', 'translating.done', function() {
    var _this = this;
    var translations = _this.get('translations') || {};
    if (translations[_this.get('model.board.name')]) {
      _this.set('model.board.translated_name', translations[_this.get('model.board.name')]);
    }
    (_this.get('sorted_buttons') || []).forEach(function(b) {
      if (translations[b.label]) {
        emberSet(b, 'translation', translations[b.label]);
      }
      if (b.vocalization && b.vocalization !== b.label && translations[b.vocalization]) {
        emberSet(b, 'secondary_translation', translations[b.vocalization]);
      }
    });
  }),
  sorted_filtered_buttons: computed('sorted_buttons', 'filter', function() {
    var list = this.get('sorted_buttons') || [];
    if (this.get('filter') === 'repeats') {
      return list.filter(function(w) { return w.repeat; });
    }
    return list;
  }),
  show_all: computed('filter', function() {
    return this.get('filter') !== 'repeats';
  }),
  show_repeats: computed('filter', function() {
    return this.get('filter') === 'repeats';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    download_list() {
      var element = document.createElement('a');
      var words = this.get('sorted_filtered_buttons').mapBy('label').uniq();
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(words.join('\n')));
      element.setAttribute('download', this.get('model.board.key').replace(/\//, '-') + '-words.txt');
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    },
    filter(type) {
      this.set('filter', type);
    },
    save_translations() {
      var _this = this;
      _this.set('saving_translations', true);
      _this.set('error_saving_translations', null);
      var translations = {};
      if (_this.get('model.board.translated_name')) {
        translations[_this.get('model.board.name')] = _this.get('model.board.translated_name');
      }
      _this.get('sorted_buttons').forEach(function(b) {
        if (emberGet(b, 'translation')) {
          translations[emberGet(b, 'label')] = emberGet(b, 'translation');
        }
        if (emberGet(b, 'secondary_translation')) {
          translations[emberGet(b, 'vocalization')] = emberGet(b, 'secondary_translation');
        }
      });
      persistence.ajax('/api/v1/boards/' + _this.get('model.copy.id') + '/translate', {
        type: 'POST',
        data: {
          source_lang: _this.get('model.board.locale'),
          destination_lang: _this.get('model.locale'),
          set_as_default: _this.get('model.default_language'),
          translations: translations,
          board_ids_to_translate: _this.get('model.new_board_ids_to_translate')
        }
      }).then(function(res) {
        progress_tracker.track(res.progress, function(event) {
          if (event.status === 'errored' || (event.status === 'finished' && event.result && event.result.translated === false)) {
            _this.set('saving_translations', null);
            LingoLinq.track_error('translation save fail - ' + JSON.stringify(event), event);
            _this.set('error_saving_translations', true);
          } else if (event.status === 'finished') {
            _this.set('saving_translations', null);
            _this.set('error_saving_translations', null);
            _this.get('modal').close({ translated: true });
          }
        });
      }, function(res) {
        LingoLinq.track_error('translation fail - ' + JSON.stringify(res), res);
        _this.set('saving_translations', null);
        _this.set('error_saving_translations', true);
      });
    }
  }
});

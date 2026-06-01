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
import app_state from '../utils/app_state';
import modal from '../utils/modal';
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
    var _this = this;
    _this.set('saving_translations', null);
    _this.set('error_saving_translations', null);
    _this.set('translating', null);

    /* Ensure button_set.buttons is fresh from the server before we
       partition the list. Two prior issues:
        1. The previous `buttonSet.reload()` only refetched the Ember
           Data record's METADATA (root_url, full_set_revision, …) —
           it did NOT refetch the buttons array, which is stored in
           S3 and fetched separately via `load_buttons(true)`.
        2. Even that wrong call was fire-and-forget, so the partition
           below ran against whatever was in memory regardless.
       The visible symptom was an empty Re-Translate modal: the
       client still had a button_set generated BEFORE the first
       translation, with every button tagged `locale: 'en'`. The
       old `b.locale !== model.locale` filter then excluded every
       button when the user re-translated back to English. We now
       drop that filter entirely (over-optimization — auto-
       translating an already-target-locale button is harmless) AND
       force-fresh the buttons via load_buttons so any subsequent
       use of button_set.buttons sees current data. */
    var buttonSet = _this.get('model.button_set');
    var prepButtons = function() {
      if (persistence.get('online') && buttonSet && typeof buttonSet.load_buttons === 'function') {
        return buttonSet.load_buttons(true).then(function() {}, function() {});
      }
      return RSVP.resolve();
    };

    if (_this.get('model.locale') && _this.get('model.button_set')) {
      _this.set('translating', { loading: true });
      prepButtons().then(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this._startTranslating();
      });
    }
  },

  _startTranslating() {
    var _this = this;
    var dest_lang = _this.get('model.locale');
    var board_locale = _this.get('model.board.locale') || 'en';

    /* Group buttons by their OWN locale so each translate batch uses
       the actual source language. Buttons in a button_set can have
       mixed locales — e.g. a Spanish parent board linking to English
       children whose buttons were never translated. Sending all words
       with a single source_lang (the parent's locale) meant the
       translate API couldn't reliably translate buttons from other
       locales, so the right-side fields stayed empty. The board
       name uses the board's locale. */
    var by_locale = {};
    var push_word = function(locale, word) {
      if (!word) { return; }
      locale = locale || board_locale;
      by_locale[locale] = by_locale[locale] || [];
      if (by_locale[locale].indexOf(word) === -1) {
        by_locale[locale].push(word);
      }
    };

    push_word(board_locale, _this.get('model.board.name'));
    (_this.get('model.button_set.buttons') || []).forEach(function(b) {
      var loc = b.locale || board_locale;
      if (b.label) { push_word(loc, b.label); }
      if (b.vocalization && b.vocalization !== b.label) { push_word(loc, b.vocalization); }
    });

    /* Chunk each locale's words into batches of <= 100 so big board
       sets still respect the translate endpoint's batch ceiling. */
    var batches = [];
    Object.keys(by_locale).forEach(function(src_lang) {
      var words = by_locale[src_lang].filter(function(word) {
        return !(_this.get('translations') || {})[word];
      });
      for (var i = 0; i < words.length; i += 100) {
        batches.push({ src: src_lang, words: words.slice(i, i + 100) });
      }
    });

    _this.set('translations', {});

    if (batches.length === 0) {
      _this.set('translating', { done: true });
      return;
    }

    var promises = batches.map(function(batch, idx) {
      return new RSVP.Promise(function(resolve, reject) {
        runLater(function() {
          if (_this.isDestroyed || _this.isDestroying) { resolve(); return; }
          persistence.ajax('/api/v1/users/self/translate', {
            type: 'POST',
            data: {
              words: batch.words,
              destination_lang: dest_lang,
              source_lang: batch.src
            }
          }).then(function(data) {
            if (_this.isDestroyed || _this.isDestroying) { resolve(); return; }
            var trans = _this.get('translations');
            for (var key in (data && data.translations) || {}) {
              /* Only accept translations that actually differ from
                 the source word — Google sometimes echoes the input
                 unchanged when source_lang doesn't match the actual
                 word language, and an echo-translation in the input
                 would mislead the user into thinking it was
                 reviewed. */
              if (data.translations[key] && data.translations[key] !== key) {
                trans[key] = data.translations[key];
              }
            }
            _this.set('translation_index', (_this.get('translation_index') || 0) + 1);
            resolve(data);
          }, function(err) {
            reject(err);
          });
        }, idx * 1000);
      });
    });

    RSVP.all_wait(promises).then(function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('translating', { done: true });
    }, function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('translating', { error: true });
    });
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
      if (this.get('model.board.buttons') && words.length === 0) {
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
      var board_ids = this.get('model.old_board_ids_to_translate');
      var translations = this.get('translations') || {};
      var original_board_id = this.get('model.board.global_id') || this.get('model.board.id');
      var translating = !!(this.get('translating'));
      words.forEach(function(b, idx) {
        if (translating) {
          /* No more `b.locale === model.locale` skip — see the matching
             comment in didInsertElement. Buttons whose locale field is
             stale (still tagged with the original locale after a
             translation round-trip) need to render in the editor so
             the user can review/overwrite them. */
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
        app_state.set('board_translate_in_progress', true);
        modal.flash(i18n.t('applying_translations', "Applying Translations..."), 'notice', false, true);
        progress_tracker.track(res.progress, function(event) {
          if (event.status === 'finished' || event.status === 'errored') {
            app_state.set('board_translate_in_progress', false);
            modal.close('flash');
          }
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

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
import { shouldTranslateVocalization } from '../utils/special_vocalization';

function boardIdStr(id) {
  if (id == null) { return ''; }
  return String(id);
}

function boardIdIncluded(boardIds, boardId) {
  if (!boardIds || !boardIds.length) { return false; }
  var bid = boardIdStr(boardId);
  return boardIds.some(function(id) { return boardIdStr(id) === bid; });
}

function rootBoardIdMatches(boardId, rootBoardId, altBoardId) {
  var bid = boardIdStr(boardId);
  return bid === boardIdStr(rootBoardId) || bid === boardIdStr(altBoardId);
}

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    const modalService = this.get('modal');
    const template = 'button-set';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  _root_board_id: function() {
    return this.get('model.board.global_id') || this.get('model.board.id');
  },

  _selected_board_ids: function() {
    return this.get('model.old_board_ids_to_translate') || null;
  },

  _selection_includes_linked_boards: function() {
    var board_ids = this._selected_board_ids();
    if (!board_ids || !board_ids.length) { return false; }
    var root_board_id = this._root_board_id();
    var alt_id = this.get('model.board.id');
    return board_ids.some(function(id) {
      return !rootBoardIdMatches(id, root_board_id, alt_id);
    });
  },

  _source_translate_buttons: function() {
    var fetched = this.get('fetched_translate_buttons');
    if (fetched && fetched.length) { return fetched.slice(); }
    return (this.get('model.button_set.buttons') || []).slice();
  },

  _has_linked_translate_labels: function() {
    var root_board_id = this._root_board_id();
    var alt_board_id = this.get('model.board.id');
    return this._source_translate_buttons().some(function(b) {
      return b && b.label && !rootBoardIdMatches(b.board_id, root_board_id, alt_board_id);
    });
  },

  /* Single source for review rows and /users/self/translate batches. */
  _buttons_for_translate: function() {
    var _this = this;
    var root_board_id = _this._root_board_id();
    var alt_board_id = _this.get('model.board.id');
    var words = _this._source_translate_buttons();
    var board_ids = _this._selected_board_ids();
    var has_set_labels = words.some(function(b) { return !!(b && b.label); });

    /* Hierarchy can paint a tree from board.linked_boards even when the
       button set never loaded labels. Previously that returned [] for a
       linked selection and the review modal died on load_error. Use the
       root board's own buttons instead (the copy the error already names). */
    if (!has_set_labels) {
      words = [];
      (_this.get('model.board.buttons') || []).forEach(function(button) {
        words.push($.extend({}, button, {
          board_id: root_board_id,
          board_key: _this.get('model.board.key'),
          depth: 0
        }));
      });
    }

    if (_this.get('root_only_fallback') || !board_ids || !board_ids.length) {
      words = words.filter(function(b) {
        return rootBoardIdMatches(b.board_id, root_board_id, alt_board_id);
      });
    } else {
      words = words.filter(function(b) { return boardIdIncluded(board_ids, b.board_id); });
    }
    return words;
  },

  _board_ids_for_save: function() {
    if (this.get('root_only_fallback')) {
      var id = this._root_board_id();
      return id ? [id] : this.get('model.new_board_ids_to_translate');
    }
    return this.get('model.new_board_ids_to_translate');
  },

  /* Hierarchy already populated this set with labels. A force reload
     (`load_buttons(true)`) can wipe `root_url` and leave buttons empty
     (`root url not available`), which then surfaces as "Linked board
     labels could not be loaded" even though the Translate Boards tree
     had just rendered those boards. */
  _button_set_has_labels: function() {
    var list = emberGet(this.get('model.button_set'), 'buttons') || [];
    return list.some(function(b) { return !!(b && b.label); });
  },

  _board_record_for_id: function(id) {
    var store = LingoLinq.store;
    if (!store || !id) { return RSVP.resolve(null); }
    var peeked = null;
    if (typeof store.peekRecord === 'function') {
      try { peeked = store.peekRecord('board', id); } catch(e) { peeked = null; }
    }
    var peekedButtons = peeked ? (emberGet(peeked, 'buttons') || []) : [];
    if (peekedButtons.length) { return RSVP.resolve(peeked); }
    if (peeked && typeof peeked.reload === 'function') {
      return peeked.reload().then(null, function() { return peeked; });
    }
    if (typeof store.findRecord === 'function') {
      return store.findRecord('board', id).then(null, function() { return peeked || null; });
    }
    return RSVP.resolve(peeked);
  },

  /* Button-set JSON can be empty while the Translate Boards tree still
     lists linked boards (from board.linked_boards). Load each selected
     board record and collect its labeled buttons so review/save are not
     stuck on the root board. */
  _load_selected_board_labels: function() {
    var _this = this;
    var root_id = _this._root_board_id();
    var alt_id = _this.get('model.board.id');
    var ids = (_this._selected_board_ids() || []).slice();
    var collected = [];
    var seen = {};

    var push_record = function(record, fallbackId) {
      if (!record) { return; }
      var bid = emberGet(record, 'global_id') || emberGet(record, 'id') || fallbackId;
      var key = emberGet(record, 'key');
      (emberGet(record, 'buttons') || []).forEach(function(button) {
        if (!button) { return; }
        collected.push($.extend({}, button, {
          board_id: bid,
          board_key: key
        }));
      });
    };

    var rootBoard = _this.get('model.board');
    if (rootBoard) {
      push_record(rootBoard, root_id);
      seen[boardIdStr(root_id)] = true;
      if (alt_id) { seen[boardIdStr(alt_id)] = true; }
    }

    var others = ids.filter(function(id) { return !seen[boardIdStr(id)]; });
    var finish = function() {
      if (collected.some(function(b) { return !!(b && b.label); })) {
        _this.set('fetched_translate_buttons', collected);
      }
      return true;
    };

    if (!others.length) { return RSVP.resolve(finish()); }

    return RSVP.all(others.map(function(id) {
      return _this._board_record_for_id(id).then(function(record) {
        push_record(record, id);
      });
    })).then(finish, finish);
  },

  _prep_buttons_for_translate: function() {
    var _this = this;
    var after_set_load = function() {
      if (_this._button_set_has_labels() || _this._has_linked_translate_labels()) {
        return RSVP.resolve(true);
      }
      if (_this._selection_includes_linked_boards()) {
        return _this._load_selected_board_labels();
      }
      return RSVP.resolve(true);
    };
    if (this._button_set_has_labels()) {
      return RSVP.resolve(true);
    }
    var buttonSet = this.get('model.button_set');
    if (persistence.get('online') && buttonSet && typeof buttonSet.load_buttons === 'function') {
      return buttonSet.load_buttons().then(after_set_load, after_set_load);
    }
    return after_set_load();
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    var _this = this;
    _this.set('saving_translations', null);
    _this.set('error_saving_translations', null);
    _this.set('translating', null);

    if (_this.get('model.locale') && _this.get('model.button_set')) {
      _this.set('translating', { loading: true });
      _this._prep_buttons_for_translate().then(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this._startTranslating();
      }, function(err) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        LingoLinq.track_error('button-set load_buttons failed - ' + JSON.stringify(err), err);
        _this._startTranslating();
      });
    }
  },

  _startTranslating() {
    var _this = this;
    var dest_lang = _this.get('model.locale');
    var board_locale = _this.get('model.source_locale') || _this.get('model.board.locale') || 'en';
    var root_board_id = _this._root_board_id();
    var dest_root = (dest_lang || '').split(/-|_/)[0];
    var force_update_default = _this.get('model.force_update_default');

    var source_lang_for_button = function(b) {
      var bid = b.board_id;
      if (rootBoardIdMatches(bid, root_board_id, _this.get('model.board.id'))) {
        return board_locale;
      }
      var brd = LingoLinq.store.peekRecord('board', bid);
      if (force_update_default && brd && brd.get('translations.default')) {
        return brd.get('translations.default');
      }
      if (brd && brd.get('locale')) {
        return brd.get('locale');
      }
      var btn_loc = b.locale || board_locale;
      var btn_root = btn_loc.split(/-|_/)[0];
      if (dest_root && btn_root === dest_root && board_locale.split(/-|_/)[0] !== dest_root) {
        return board_locale;
      }
      return btn_loc;
    };

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

    _this.set('translations', {});

    if (_this._selection_includes_linked_boards() && !_this._has_linked_translate_labels()) {
      _this.set('root_only_fallback', true);
    } else {
      _this.set('root_only_fallback', false);
    }

    var words = _this._buttons_for_translate();
    if (words.length === 0) {
      _this.set('translating', { error: true, load_error: true });
      return;
    }

    words.forEach(function(b) {
      var loc = source_lang_for_button(b);
      if (b.label) { push_word(loc, b.label); }
      if (shouldTranslateVocalization(b.vocalization, b.label)) { push_word(loc, b.vocalization); }
    });

    var batches = [];
    Object.keys(by_locale).forEach(function(src_lang) {
      var batch_words = by_locale[src_lang];
      for (var i = 0; i < batch_words.length; i += 100) {
        batches.push({ src: src_lang, words: batch_words.slice(i, i + 100) });
      }
    });

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
            if (data && data.external_ai_processing === false) {
              _this.set('translating', { done: true, not_enabled: true });
              resolve(data);
              return;
            }
            var trans = _this.get('translations');
            for (var key in (data && data.translations) || {}) {
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
      if (_this.get('translating.not_enabled')) {
        _this.set('translating', { done: true, not_enabled: true });
      } else {
        _this.set('translating', { done: true });
      }
    }, function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('translating', { error: true });
    });
  },

  _build_save_translations_map: function() {
    var _this = this;
    var translations = {};
    var auto = _this.get('translations') || {};
    var boardName = _this.get('model.board.name');
    var translatedName = _this.get('model.board.translated_name');
    if (translatedName) {
      translations[boardName] = translatedName;
    } else if (boardName && auto[boardName]) {
      translations[boardName] = auto[boardName];
    }
    (_this.get('sorted_buttons') || []).forEach(function(b) {
      var label = emberGet(b, 'label');
      var rowTrans = emberGet(b, 'translation');
      if (rowTrans && label) {
        translations[label] = rowTrans;
      } else if (label && auto[label]) {
        translations[label] = auto[label];
      }
      var voc = emberGet(b, 'vocalization');
      var vocTrans = emberGet(b, 'secondary_translation');
      if (shouldTranslateVocalization(voc, label)) {
        if (vocTrans && voc) {
          translations[voc] = vocTrans;
        } else if (voc && auto[voc]) {
          translations[voc] = auto[voc];
        }
      }
    });
    return translations;
  },

  destination_language: computed('model.locale', function() {
    return i18n.readable_language(this.get('model.locale'));
  }),
  source_language: computed('model.source_locale', 'model.board.locale', function() {
    return i18n.readable_language(this.get('model.source_locale') || this.get('model.board.locale'));
  }),
  sorted_buttons: computed(
    'model.button_set.buttons',
    'model.board.buttons',
    'model.old_board_ids_to_translate',
    'model.locale',
    'translating',
    'fetched_translate_buttons',
    'root_only_fallback',
    function() {
      var words = this._buttons_for_translate();
      var res = [];
      var board_ids = this._selected_board_ids();
      var original_board_id = this._root_board_id();
      var alt_board_id = this.get('model.board.id');
      var translating = !!(this.get('translating'));
      words.forEach(function(b, idx) {
        if (translating) {
          if (board_ids && board_ids.length && !boardIdIncluded(board_ids, b.board_id)) { return; }
          if (!board_ids || !board_ids.length) {
            if (!rootBoardIdMatches(b.board_id, original_board_id, alt_board_id)) { return; }
          }
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
      var label_trans = translations[b.label] || (b.label && translations[b.label.trim()]);
      if (label_trans) {
        emberSet(b, 'translation', label_trans);
      }
      if (shouldTranslateVocalization(b.vocalization, b.label)) {
        var voc_trans = translations[b.vocalization] || (b.vocalization && translations[b.vocalization.trim()]);
        if (voc_trans) {
          emberSet(b, 'secondary_translation', voc_trans);
        }
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
      var words = [...new Set(this.get('sorted_filtered_buttons').map(function(o) { return emberGet(o, 'label'); }))];
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
      var translations = _this._build_save_translations_map();
      var boardName = _this.get('model.board.name');
      var buttonKeyCount = 0;
      Object.keys(translations).forEach(function(key) {
        if (key !== boardName) { buttonKeyCount++; }
      });
      if (buttonKeyCount === 0) {
        _this.set('saving_translations', null);
        _this.set('error_saving_translations', true);
        modal.flash(i18n.t('no_translations_to_save', "No button translations to save. Wait for auto-translate to finish or enter translations manually."), 'error');
        return;
      }
      persistence.ajax('/api/v1/boards/' + _this.get('model.copy.id') + '/translate', {
        type: 'POST',
        data: {
          source_lang: _this.get('model.source_locale') || _this.get('model.board.locale'),
          destination_lang: _this.get('model.locale'),
          set_as_default: _this.get('model.default_language'),
          force_update_default: _this.get('model.force_update_default') || false,
          translations: translations,
          board_ids_to_translate: _this._board_ids_for_save()
        }
      }).then(function(res) {
        app_state.set('board_translate_in_progress', true);
        modal.flash(i18n.t('applying_translations', "Applying Translations..."), 'notice', false, true);
        var track_id = null;
        track_id = progress_tracker.track(res.progress, function(event) {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          if (progress_tracker.is_terminal(event)) {
            app_state.set('board_translate_in_progress', false);
            modal.close('flash');
            progress_tracker.untrack(track_id);
          }
          if (progress_tracker.is_errored(event) || (progress_tracker.is_finished(event) && event.result && event.result.translated === false)) {
            _this.set('saving_translations', null);
            LingoLinq.track_error('translation save fail - ' + JSON.stringify(event), event);
            _this.set('error_saving_translations', true);
          } else if (progress_tracker.is_finished(event)) {
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

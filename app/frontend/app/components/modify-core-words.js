import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import { observer, computed } from '@ember/object';
import { htmlSafe } from '@ember/template';

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
    const template = 'modify-core-words';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    var _this = this;
    _this.set('state', null);
    var found = false;
    var words = this.get('model.user.core_lists.for_user') || [];
    var words_json = JSON.stringify(words);
    (this.get('model.user.core_lists.defaults') || []).forEach(function(list) {
      if (JSON.stringify(list.words) === words_json) {
        found = true;
        _this.set('core_list', list.id);
      }
    });
    if (!found && words.length > 0) {
      _this.set('core_list', 'custom');
      _this.set('words', words);
    }
  },

  default_core_list: computed('core_list', function() {
    return this.get('core_list') && this.get('core_list') !== 'new' && this.get('core_list') !== 'custom';
  }),
  update_on_change: observer('core_list', function() {
    if (this.get('core_list') === 'custom') {
      this.set('words', []);
      this.set('editing', true);
    } else if (this.get('core_list')) {
      this.set('editing', false);
      var _this = this;
      (this.get('model.user.core_lists.defaults') || []).forEach(function(list) {
        if (list.id === _this.get('core_list')) {
          _this.set('words', list.words);
        }
      });
    }
  }),
  // Writable: the word-list textarea two-way-binds @value to this property via
  // (set-field this "word_lines"). A get-only computed crashes on every keystroke
  // in Ember 5 (setting a setter-less computed throws; pre-4.0 it silently
  // clobbered the computed, which is how this originally worked). Same pattern as
  // controllers/user/preferences.js substitution_string.
  word_lines: computed('words', {
    get() {
      var cached = this.get('_word_lines');
      if(cached !== undefined && cached !== null) {
        return cached;
      }
      return (this.get('words') || []).join('\n');
    },
    set(key, value) {
      this.set('_word_lines', value);
      return value;
    }
  }),
  raw_words_list: computed('words', function() {
    var div = document.createElement('div');
    (this.get('words') || []).forEach(function(w) {
      var span = document.createElement('span');
      span.innerText = w;
      div.appendChild(span);
    });
    return htmlSafe(div.innerHTML);
  }),
  parsed_words: computed('word_lines', function() {
    var words = (this.get('word_lines') || '').split(/[\n,]/).filter(function(w) { return w && w.length > 0; });
    return words;
  }),
  core_lists: computed('model.user.core_lists.defaults', function() {
    var res = [];
    res.push({ name: i18n.t('chose_list', "[Choose List]"), id: '' });
    (this.get('model.user.core_lists.defaults') || []).forEach(function(list) {
      res.push({ name: list.name, id: list.id });
    });
    res.push({ name: i18n.t('customized_list', "Customized List"), id: 'custom' });
    return res;
  }),
  save_disabled: computed('state.saving', 'words', function() {
    return !!(this.get('state.saving') || (this.get('words') || []).length === 0);
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    updateCoreList(value) {
      this.set('core_list', value);
    },
    modify_list() {
      var words = this.get('words');
      this.set('core_list', 'custom');
      this.set('words', words);
    },
    save() {
      var words = this.get('parsed_words');
      if (words.length === 0) { return; }
      var data = {
        _method: 'PUT',
        id: this.get('core_list'),
        words: words
      };
      var _this = this;
      _this.set('state', { saving: true });
      persistence.ajax('/api/v1/users/' + _this.get('model.user.id') + '/core_list', {
        type: 'POST',
        data: data
      }).then(function(res) {
        _this.set('state', null);
        _this.get('modal').close();
      }, function(err) {
        _this.set('state', { error: true });
      });
    }
  }
});

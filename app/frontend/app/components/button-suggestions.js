import { set as emberSet } from '@ember/object';
import $ from 'jquery';
import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer, computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import editManager from '../utils/edit_manager';
import contentGrabbers from '../utils/content_grabbers';
import i18n from '../utils/i18n';
import Utils from '../utils/misc';
import LingoLinq from '../app';
import RSVP from 'rsvp';

/**
 * Button Suggestions (Board Ideas) modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'button-suggestions';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('list_type', 'core');
    this.set('core_promise', null);
    this.set('user', this.get('model.user') || app_state.get('currentUser'));
    this.set('category', null);
    this.check_availability();
    this.update_list();
  },

  check_availability() {
    const rows = editManager.controller.get('ordered_buttons');
    let empty = 0;
    rows.forEach(function(row) {
      row.forEach(function(col) {
        if (col.empty) { empty++; }
      });
    });
    this.set('full', empty === 0);
    this.set('empty', empty);
  },

  set_list(val, type) {
    if (this.get('list_type') === type) {
      if (val && val.items) {
        emberSet(val, 'total', val.items.length);
        emberSet(val, 'used', val.items.filter(function(i) { return i.used; }).length);
      } else if (val && val.categories) {
        let total = 0;
        let used = 0;
        val.categories.forEach(function(cat) {
          if (cat.items) {
            emberSet(cat, 'total', cat.items.length);
            emberSet(cat, 'used', cat.items.filter(function(i) { return i.used; }).length);
            total = total + cat.total;
            used = used + cat.used;
          }
        });
        emberSet(val, 'total', total);
        emberSet(val, 'used', used);
      }
      this.set('list', val);
      this.set('category', null);
    }
  },

  on_board(opts) {
    let found = false;
    const ordered_buttons = editManager.controller.get('ordered_buttons') || [];
    ordered_buttons.forEach(function(row) {
      (row || []).forEach(function(button) {
        if (opts.label && button.label && button.label.toLowerCase() === opts.label.toLowerCase()) {
          found = true;
        } else if (opts.sound_id && button.sound_id === opts.sound_id) {
          found = true;
        } else if (opts.external_id && button.external_id === opts.external_id) {
          found = true;
        }
      });
    });
    if (!found && (opts.label || opts.external_id)) {
      const buttons = this.get('model.board.button_set.buttons');
      if (buttons) {
        buttons.forEach(function(btn) {
          if (btn.label && opts.label && btn.label.toLowerCase() === opts.label.toLowerCase()) {
            found = true;
          } else if (btn.external_id && opts.external_id === btn.external_id) {
            found = true;
          }
        });
      }
    }
    return found;
  },

  has_supervisees: computed('appState.currentUser.supervisees', 'appState.currentUser.managed_orgs', function() {
    return app_state.get('currentUser.supervisees.length') > 0 || app_state.get('currentUser.managed_orgs.length') > 0;
  }),

  update_user: observer('for_user_id', 'user', function() {
    const _this = this;
    _this.set('premium_ideas', false);
    if (app_state.get('currentUser.currently_premium')) {
      _this.set('premium_ideas', true);
    }
    let user = null;
    if (app_state.get('currentUser.known_supervisees')) {
      app_state.get('currentUser.known_supervisees').forEach(function(sup) {
        if (sup.id === _this.get('for_user_id')) {
          user = sup;
        }
        if (sup.premium) { _this.set('premium_ideas', true); }
      });
    }
    const for_user_id = _this.get('for_user_id');
    user = user || (for_user_id ? LingoLinq.store.peekRecord('user', for_user_id) : null);
    user = user || (for_user_id ? (app_state.get('quick_users') || {})[for_user_id] : null);
    _this.set('user', user);
  }),

  update_list: observer('list_type', 'user', function() {
    const type = this.get('list_type');
    this.set('core', false);
    this.set('fringe', false);
    this.set('recordings', false);
    this.set('requests', false);
    this.set('extras', false);
    if (!this.get('user.id') || !this.get('list_type')) { return; }
    this.set(type, true);
    const _this = this;
    if (type === 'core' || type === 'fringe' || type === 'requests') {
      this.set_list({ loading: true }, type);
      if (_this.get('core_promise.user_id') !== _this.get('user.id')) { _this.set('core_promise', null); }
      if (_this.get('user.core_lists')) {
        _this.set('core_promise', RSVP.resolve(_this.get('user.core_lists')));
      } else if (!_this.get('core_promise')) {
        _this.set('core_promise', persistence.ajax('/api/v1/users/' + this.get('user.id') + '/core_lists', { type: 'GET' }));
      }
      _this.set('core_promise.user_id', _this.get('user.id'));
      _this.get('core_promise').then(function(res) {
        if (type === 'core') {
          const items = res.for_user.map(function(str) {
            const item = { text: str };
            if (res.reachable_for_user.indexOf(str.toLowerCase()) >= 0) { item.used = true; }
            else if (_this.on_board({ label: str })) { item.used = true; }
            return item;
          });
          const list = { items: items };
          _this.set_list(list, type);
          _this.set('category', list);
        } else if (type === 'requests') {
          const items = (res.requested_phrases_for_user || []).map(function(phrase) {
            const item = { text: phrase.text, used: phrase.used };
            if (_this.on_board({ label: phrase.text })) { item.used = true; }
            return item;
          });
          const list = { items: items };
          _this.set_list(list, type);
          _this.set('category', list);
        } else {
          const list = res.fringe[0];
          list.categories.forEach(function(cat, idx) {
            let items = [];
            cat.words.forEach(function(str) {
              const item = { text: str };
              if (res.reachable_fringe_for_user.indexOf(str.toLowerCase()) >= 0) { item.used = true; }
              else if (_this.on_board({ label: str })) { item.used = true; }
              items.push(item);
            });
            list.categories[idx] = $.extend({}, list.categories[idx], { items: items });
          });
          _this.set_list(list, type);
        }
      }, function() {
        _this.set_list({ error: true }, type);
        _this.set('core_promise', null);
      });
    } else if (type === 'recordings') {
      _this.set_list({ loading: true }, 'recordings');
      Utils.all_pages('buttonset', { user_id: _this.get('user.id') }, function() {}).then(function(sets) {
        const sound_ids = {};
        sets.forEach(function(button_set) {
          button_set.get('buttons').forEach(function(button) {
            if (button.sound_id) {
              sound_ids[button.sound_id] = true;
            }
          });
        });
        Utils.all_pages('sound', { user_id: _this.get('user.id') }, function() {}).then(function(sounds) {
          const sounds_hash = {};
          sounds.forEach(function(s) {
            (s.get('tags') || []).forEach(function(tag) {
              sounds_hash[tag] = s;
            });
          });
          persistence.ajax('/api/v1/users/' + _this.get('user.id') + '/message_bank_suggestions', { type: 'GET' }).then(function(lists) {
            const list = lists[0];
            const res = { id: 'all_recordings', name: "Recordings", categories: [] };
            const used_sounds = {};
            list.categories.forEach(function(category) {
              const items = [];
              category.phrases.forEach(function(phrase) {
                const tag = list.id + ':' + category.id + ':' + phrase.id;
                if (sounds_hash[tag]) {
                  used_sounds[sounds_hash[tag].get('id')] = true;
                  const item = { text: phrase.text, sound: sounds_hash[tag] };
                  if (sound_ids[sounds_hash[tag].get('id')]) { item.used = true; }
                  else if (_this.on_board({ sound_id: sounds_hash[tag].get('id') })) { item.used = true; }
                  items.push(item);
                }
              });
              if (items.length > 0) {
                res.categories.push({
                  name: category.name,
                  id: category.id,
                  items: items
                });
              }
            });
            const extras = [];
            sounds.forEach(function(sound) {
              if (!used_sounds[sound.get('id')]) {
                const item = { text: sound.get('transcription') || sound.get('name'), sound: sound };
                if (sound_ids[sound.get('id')]) { item.used = true; }
                else if (_this.on_board({ sound_id: sound.get('id') })) { item.used = true; }
                extras.push(item);
              }
            });
            if (extras.length > 0) {
              res.categories.unshift({
                name: "Other Recordings",
                id: 'other_recordings',
                items: extras
              });
            }
            _this.set_list(res, 'recordings');
          }, function() {
            _this.set_list({ error: true }, 'recordings');
          });
        }, function() {
          _this.set_list({ error: true }, 'recordings');
        });
      }, function() {
        _this.set_list({ error: true }, 'recordings');
      });
    }
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    updateForUserId(value) {
      this.set('for_user_id', value);
    },
    select_list(list) {
      this.set('category', null);
      this.set('list_type', list);
    },
    select_category(category) {
      this.set('category', category);
      if (category && category.pending_items) {
        this.set('category.items', { loading: true });
        const _this = this;
        persistence.ajax("/api/v1/search/external_resources?source=" + encodeURIComponent(category.source) + "&q=" + encodeURIComponent(category.id), { type: 'GET' }).then(function(list) {
          const res = [];
          list.forEach(function(item) {
            const tag = _this.get('list.id') + ':' + category.id + ':' + item.id;
            const row = { text: item.title, image: item.image, external_id: tag, image_author: item.image_author, image_attribution: item.image_attribution };
            if (_this.on_board({ external_id: tag })) { row.used = true; }
            res.push(row);
          });
          _this.set('category.items', res);
          _this.set('category.pending_items', false);
        }, function() {
          _this.set('category.items', { error: true });
        });
      }
    },
    add_item(item) {
      if (this.get('full')) { return; }
      const board = this.get('model.board');
      const button = editManager.find_button('empty');
      if (button) {
        editManager.change_button(button.id, {
          label: item.text,
          sound: item.sound,
          sound_id: (item.sound && item.sound.get('id')),
          external_id: item.external_id
        });
        this.update_list();
        if (item.image) {
          const proxy = persistence.ajax('/api/v1/search/proxy?url=' + encodeURIComponent(item.image), { type: 'GET' }).then(function(data) {
            return {
              url: data.data,
              content_type: data.content_type,
              source_url: item.image
            };
          });
          const save = proxy.then(function(data) {
            return contentGrabbers.pictureGrabber.save_image_preview({
              url: data.url,
              content_type: data.content_type,
              license: {
                type: 'CC-Unspecified',
                copyright_notice_url: item.image_attribution,
                source_url: item.url,
                author_name: item.image_author,
                uneditable: true
              },
              protected: false
            });
          });
          save.then(function(image) {
            editManager.change_button(button.id, {
              'image': image,
              'image_id': image.id
            });
          }, function() {
            modal.error(i18n.t('error_adding_image', "There was an unexpected error adding the image"));
          });
        } else {
          editManager.lucky_symbol(button.id);
        }
      }
      emberSet(item, 'used', true);
      this.check_availability();
    },
    search_extras() {
      const str = this.get('extras_search');
      const _this = this;
      if (str) {
        this.set('category', null);
        this.set_list({ loading: true }, 'extras');
        persistence.ajax("/api/v1/search/external_resources?source=tarheel&q=" + encodeURIComponent(str), { type: 'GET' }).then(function(list) {
          const res = { id: 'tarheel_search', name: "Tarheel Reader Search Results", categories: [] };
          list.forEach(function(item) {
            res.categories.push({
              name: item.title,
              sub_name: item.author,
              id: item.id,
              image: item.image,
              pending_items: true,
              source: 'tarheel_book',
              items: []
            });
          });
          _this.set_list(res, 'extras');
        }, function() {
          _this.set_list({ error: true }, 'extras');
        });
      }
    }
  }
});

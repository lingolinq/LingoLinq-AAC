import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import LingoLinq from '../app';

/**
 * Program NFC Tag Modal Component
 *
 * Converted from modals/program-nfc template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/program-nfc';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    const button = this.get('model.button');
    const tag = this.get('store').createRecord('tag');
    const _this = this;
    _this.set('status', { loading: true });
    _this.set('label', null);
    _this.set('button', null);
    _this.set('update_tag_id', null);
    capabilities.nfc.available().then(function(res) {
      if (res.can_write) {
        _this.set('can_write', true);
        _this.set('write_tag', true);
        _this.set('public', false);
      }
      if (button) {
        const btn = button.raw();
        btn.image_url = button.get('image_url');
        tag.set('button', btn);
        _this.set('label', btn.vocalization || btn.label);
      } else {
        _this.set('label', _this.get('model.label') || '');
      }
      tag.save().then(function() {
        if (!_this.get('model.listen')) {
          _this.set('status', null);
        }
        _this.set('tag', tag);
        if (_this.get('model.listen')) {
          _this.send('program');
        }
      }, function() {
        _this.set('status', { error: true });
      });
    }, function() {
      _this.set('status', { no_nfc: true });
    });
  },

  not_programmable: computed(
    'status.loading',
    'status.error',
    'status.no_nfc',
    'status.saving',
    'status.programming',
    'status.saved',
    function() {
      return !!(this.get('status.loading') || this.get('status.error') || this.get('status.no_nfc') || this.get('status.saving') || this.get('status.programming')) || this.get('status.saved');
    }
  ),

  listening_without_tag_id: computed('model.listen', 'update_tag_id', function() {
    return this.get('model.listen') && !this.get('update_tag_id');
  }),

  save_tag(tag_id) {
    const _this = this;
    const tag_object = _this.get('tag');
    tag_object.set('tag_id', tag_id);
    tag_object.set('public', !!_this.get('public'));
    _this.set('status', { saving: true });
    tag_object.save().then(function() {
      _this.set('status', { saved: true });
      runLater(function() {
        modal.close();
      }, 3000);
    }, function() {
      _this.set('status', { error_saving: true });
    });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    save() {
      const _this = this;
      if (_this.get('label')) {
        _this.get('tag').set('label', _this.get('label'));
        _this.save_tag(_this.get('update_tag_id'));
      }
    },
    program() {
      const _this = this;
      _this.set('status', { programming: true });
      const tag_object = _this.get('tag');
      capabilities.nfc.prompt().then(function() {
        const close_tag = function() {
          capabilities.nfc.stop_listening('programming');
          capabilities.nfc.end_prompt();
        };
        let handled = false;
        capabilities.nfc.listen('programming', function(tag) {
          if (handled) { return; }
          handled = true;
          if (!_this.get('label') && _this.get('model.listen')) {
            let tag_id = JSON.stringify(tag.id);
            if (tag.uri) {
              const tag_uri_id = (tag.uri.match(/^cough:\/\/tag\/([^/]+)$/) || [])[1];
              if (tag_uri_id) { tag_id = tag_uri_id; }
            }
            LingoLinq.store.findRecord('tag', tag_id).then(function(tag_obj) {
              if (tag_obj.get('label') || tag_obj.get('button')) {
                const tag_ids = [].concat(_this.get('model.user.preferences.tag_ids') || []);
                tag_ids.push(tag_obj.get('id'));
                _this.set('model.user.preferences.tag_ids', tag_ids);
                _this.get('model.user').save();
                _this.set('status', { saved: true });
              } else {
                _this.set('tag', tag_obj);
                _this.set('update_tag_id', tag_id);
                _this.set('status', null);
              }
            }, function() {
              _this.set('update_tag_id', tag_id);
              _this.set('status', null);
            });
            close_tag();
          } else {
            const finish_tag = function() {
              _this.save_tag(JSON.stringify(tag.id));
              close_tag();
            };
            if (tag.writeable && _this.get('write_tag') && (_this.get('label') || _this.get('button'))) {
              const opts = {
                uri: 'cough://tag/' + tag_object.get('id')
              };
              if (tag.size) {
                if (opts.uri.length + (_this.get('label') || '').length < tag.size * 0.85) {
                  opts.text = _this.get('label');
                }
              }
              capabilities.nfc.write(opts).then(function() {
                finish_tag();
              }, function() {
                _this.set('status', { error_writing: true });
              });
            } else {
              finish_tag();
            }
          }
        });
        runLater(function() {
          if (handled) { return; }
          handled = true;
          capabilities.nfc.stop_listening('programming');
          capabilities.nfc.end_prompt();
          _this.set('status', { read_timeout: true });
        }, 10000);
      });
    }
  }
});

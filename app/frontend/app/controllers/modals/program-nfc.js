import modal from '../../utils/modal';
import { later as runLater } from '@ember/runloop';
import capabilities from '../../utils/capabilities';
import LingoLinq from '../../app';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    // check if NFC is available
    // if so, check if it's programmable
    // if so, ask if they want to save data to the NFC tag if possible
    // text box for the label/vocalization, otherwise button render
    // program button at the bottom that starts listening
    var button = this.get('model.button');
    var tag = this.store.createRecord('tag');
    var _this = this;
    _this.set('status', {loading: true});
    _this.set('label', null);
    _this.set('button', null);
    _this.set('update_tag_id', null);
    capabilities.nfc.available().then(function(res) {
      if(res.can_write) {
        _this.set('can_write', true);
        _this.set('write_tag', true);
        _this.set('public', false);
      }
      if(button) {
        var btn = button.raw();
        btn.image_url = button.get('image_url');
        tag.set('button', btn);
        _this.set('label', btn.vocalization || btn.label);
      } else {
        _this.set('label', _this.get('model.label') || "");
      }
      if(_this.get('model.listen')) {
        _this.send('program');
      }
      tag.save().then(function() {
        if(!_this.get('model.listen')) {
          _this.set('status', null);
        }
        _this.set('tag', tag);
      }, function() {
        _this.set('status', {error: true});
      });
    }, function() {
      _this.set('status', {no_nfc: true});
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
  save_tag: function(tag_id) {
    var _this = this;
    var tag_object = _this.get('tag');
    tag_object.set('tag_id', tag_id);
    tag_object.set('public', !!_this.get('public'));
    _this.set('status', {saving: true});
    tag_object.save().then(function() {
      _this.set('status', {saved: true});
      runLater(function() {
        modal.close();
      }, 3000);
    }, function() {
      _this.set('status', {error_saving: true});
    });
  },
  listening_without_tag_id: computed('model.listen', 'update_tag_id', function() {
    return this.get('model.listen') && !this.get('update_tag_id');
  }),
  actions: {
    save: function() {
      var _this = this;
      if(_this.get('label')) {
        _this.set('tag.label', _this.get('label'));
        _this.save_tag(_this.get('update_tag_id'));
      }
    },
    program: function() {
      var _this = this;
      _this.set('status', {programming: true});
      var tag_object = _this.get('tag');
      capabilities.nfc.prompt().then(function() {
        var close_tag = function() {
          capabilities.nfc.stop_listening('programming');
          capabilities.nfc.end_prompt();
        };
        var handled = false;
        capabilities.nfc.listen('programming', function(tag) {
          if(handled) { return; }
          handled = true;
          if(!_this.get('label') && _this.get('model.listen')) {
            var tag_id = JSON.stringify(tag.id);
            if(tag.uri) {
              var tag_uri_id = (tag.uri.match(/^cough:\/\/tag\/([^\/]+)$/) || [])[1];
              if(tag_uri_id) { tag_id = tag_uri_id; }
            }
            LingoLinq.store.findRecord('tag', tag_id).then(function(tag_object) {
              if(tag_object.get('label') || tag_object.get('button')) {
                // save tag to user and close
                var tag_ids = [].concact(_this.get('model.user.preferences.tag_ids') || []);
                tag_ids.push(tag_object.get('id'));
                _this.set('model.user.preferences.tag_ids', tag_ids);
                _this.get('model.user').save();
                _this.set('status', {saved: true});
              } else {
                _this.set('tag', tag_object);
                _this.set('update_tag_id', tag_id);
                _this.set('status', null);
              }
            }, function() {
              _this.set('update_tag_id', tag_id);
              _this.set('status', null);
              // prompt for label and save
            });
            close_tag();
          // ajax lookup
          } else {
            var finish_tag = function() {
              _this.save_tag(JSON.stringify(tag.id));
              close_tag();
            };
            if(tag.writeable && _this.get('write_tag') && (_this.get('label') || _this.get('button'))) {
              var opts = {
                uri: "cough://tag/" + tag_object.get('id')
              };
              if(tag.size) {
                // Program in the label as well if there's room
                if(opts.uri.length + (_this.get('label') || '').length < tag.size * 0.85) {
                  opts.text = _this.get('label');
                }
              }
              capabilities.nfc.write(opts).then(function() {
                finish_tag();
              }, function() {
                _this.set('status', {error_writing: true});
              });
            } else {
              finish_tag();
            }
          }
        });
        runLater(function() {
          if(handled) { return; }
          handled = true;
          capabilities.nfc.stop_listening('programming');
          capabilities.nfc.end_prompt();
          _this.set('status', {read_timeout: true});
        }, 10000);
      });
    }
  }
});

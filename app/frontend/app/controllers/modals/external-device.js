import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { later as runLater } from '@ember/runloop';
import { computed } from '@ember/object';
import persistence from '../../utils/persistence';
import session from '../../utils/session';
import progress_tracker from '../../utils/progress_tracker';
import LingoLinq from '../../app';

export default modal.ModalController.extend({
  opening: function() {
    this.set('status', null);
    this.set('system', this.get('model.user.external_device') ? 'other' : 'default');
    this.set('external_device', this.get('model.user.external_device.device_name'));
    this.set('external_vocab', this.get('model.user.external_device.vocab_name'));
    this.set('external_vocab_size', this.get('model.user.external_device.size'));
    this.set('external_access_method', this.get('model.user.external_device.access_method'));
  },
  access_methods: computed(function() {
    return [
      {name: i18n.t('touch', "Touch"), id: 'touch'},
      {name: i18n.t('partner_assisted_scanning', "Partner-Assisted Scanning"), id: 'partner_scanning'},
      {name: i18n.t('auditory_or_visual_scanning', "Auditory/Visual Scanning"), id: 'scanning'},
      {name: i18n.t('head_tracking', "Head Tracking"), id: 'head'},
      {name: i18n.t('eye_gaze_tracking', "Eye Gaze Tracking"), id: 'gaze'},
      {name: i18n.t('other', "Other"), id: 'other'},
    ];
  }),
  device_options: computed(function() {
    return [].concat(LingoLinq.User.devices).concat({id: 'other', name: i18n.t('other', "Other")});
  }),
  vocab_options: computed('external_device', function() {
    var str = this.get('external_device');
    var device = LingoLinq.User.devices.find(function(d) { return d.name == str; });
    var res = [];
    if(device && device.vocabs && device.vocabs.length > 0) {
      res = res.concat(device.vocabs);
    }
    return res.concat([{id: 'custom', name: i18n.t('custom_vocab', "Custom Vocabulary")}]);
  }),
  default_system: computed('system', function() {
    return this.get('system') == 'default';
  }),
  other_system: computed('system', function() {
    return this.get('system') != 'default';
  }),
  actions: {
    clear_home_board: function() {
      var user = this.get('model.user');
      if(user) {
        user.set('preferences.home_board', {id: 'none'});
        user.save();
      }
    },
    set_system: function(id) {
      this.set('system', id);
    },
    set_device: function(device) {
      this.set('external_device', device.name);
    },
    set_vocab: function(vocab) {
      this.set('external_vocab', vocab.name);
      if(vocab.buttons) {
        this.set('external_vocab_size', vocab.buttons);
      }
    },
    update: function() {
      var user = this.get('model.user');
      if(this.get('other_system')) {
        var str = this.get('external_device');
        var device = {device_name: this.get('external_device')};
        var found_device = LingoLinq.User.devices.find(function(d) { return d.name == str; });
        if(found_device) {
          device.device_id = found_device.id;
        }
        if(this.get('external_vocab')) {
          var str = this.get('external_vocab');
          device.vocab_name = str;
          var vocabs = (found_device || {vocabs: []}).vocabs || [];
          var vocab = vocabs.find(function(v) { return v.name == str; });
          if(vocab) {
            device.vocab_id = vocab.id;
          }
        }
        if(this.get('external_vocab_size')) {
          device.size = parseInt(this.get('external_vocab_size'), 10);
          if(!device.size) { delete device['size']; }
        }
        if(this.get('external_access_method')) {
          device.access_method = this.get('external_access_method');
        }
        user.set('external_device', device);
      } else {
        user.set('external_device', false);
      }
      var _this = this;
      _this.set('status', {loading: true});
      user.save().then(function() {
        _this.set('status', null);
        modal.close();
      }, function(err) { 
        _this.set('status', {error: true});
      });
    }
  }
});

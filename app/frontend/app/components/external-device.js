import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import LingoLinq from '../app';

/**
 * External Device Modal Component
 *
 * Converted from modals/external-device template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/external-device';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('system', 'default');
    this.set('external_device', '');
    this.set('external_vocab', '');
    this.set('external_vocab_size', '');
    this.set('external_access_method', '');
    this.set('status', null);
  },

  access_methods: computed(function() {
    return [
      { name: i18n.t('touch', "Touch"), id: 'touch' },
      { name: i18n.t('partner_assisted_scanning', "Partner-Assisted Scanning"), id: 'partner_scanning' },
      { name: i18n.t('auditory_or_visual_scanning', "Auditory/Visual Scanning"), id: 'scanning' },
      { name: i18n.t('head_tracking', "Head Tracking"), id: 'head' },
      { name: i18n.t('eye_gaze_tracking', "Eye Gaze Tracking"), id: 'gaze' },
      { name: i18n.t('other', "Other"), id: 'other' }
    ];
  }),

  device_options: computed(function() {
    const devices = (LingoLinq.User && LingoLinq.User.devices) ? LingoLinq.User.devices.slice() : [];
    return devices.concat({ id: 'other', name: i18n.t('other', "Other") });
  }),

  vocab_options: computed('external_device', function() {
    const str = this.get('external_device');
    const devices = (LingoLinq.User && LingoLinq.User.devices) || [];
    const device = devices.find(function(d) { return d.name === str; });
    let res = [];
    if (device && device.vocabs && device.vocabs.length > 0) {
      res = res.concat(device.vocabs);
    }
    return res.concat([{ id: 'custom', name: i18n.t('custom_vocab', "Custom Vocabulary") }]);
  }),

  default_system: computed('system', function() {
    return this.get('system') === 'default';
  }),

  other_system: computed('system', function() {
    return this.get('system') !== 'default';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('status', null);
      const ext = this.get('model.user.external_device');
      this.set('system', ext ? 'other' : 'default');
      if (ext) {
        this.set('external_device', ext.device_name || '');
        this.set('external_vocab', ext.vocab_name || '');
        this.set('external_vocab_size', ext.size || '');
        this.set('external_access_method', ext.access_method || '');
      } else {
        this.set('external_device', '');
        this.set('external_vocab', '');
        this.set('external_vocab_size', '');
        this.set('external_access_method', '');
      }
    },
    closing() {},
    nothing() {},
    clear_home_board() {
      const user = this.get('model.user');
      if (user) {
        user.set('preferences.home_board', { id: 'none' });
        user.save();
      }
    },
    set_system(id) {
      this.set('system', id);
    },
    set_device(device) {
      this.set('external_device', device.name);
    },
    set_vocab(vocab) {
      this.set('external_vocab', vocab.name);
      if (vocab.buttons) {
        this.set('external_vocab_size', vocab.buttons);
      }
    },
    update() {
      const _this = this;
      const user = this.get('model.user');
      if (this.get('other_system')) {
        const str = this.get('external_device');
        const device = { device_name: str };
        const devices = (LingoLinq.User && LingoLinq.User.devices) || [];
        const found_device = devices.find(function(d) { return d.name === str; });
        if (found_device) {
          device.device_id = found_device.id;
        }
        if (this.get('external_vocab')) {
          device.vocab_name = this.get('external_vocab');
          const vocabs = (found_device || {}).vocabs || [];
          const vocab = vocabs.find(function(v) { return v.name === _this.get('external_vocab'); });
          if (vocab) {
            device.vocab_id = vocab.id;
          }
        }
        const sizeVal = parseInt(this.get('external_vocab_size'), 10);
        if (sizeVal) {
          device.size = sizeVal;
        }
        if (this.get('external_access_method')) {
          device.access_method = this.get('external_access_method');
        }
        user.set('external_device', device);
      } else {
        user.set('external_device', false);
      }
      this.set('status', { loading: true });
      user.save().then(function() {
        _this.set('status', null);
        _this.get('modal').close();
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});

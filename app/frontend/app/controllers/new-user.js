import LingoLinq from '../app';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    var user = LingoLinq.store.createRecord('user', {
      preferences: {
        registration_type: 'manually-added-org-user',
        preferred_symbols: this.get('model.org.preferred_symbols') || 'original'
      },
      authored_organization_id: this.get('model.organization_id'),
      org_management_action: 'add_manager'
    });
    this.set('external_device', null);
    this.set('external_vocab', null);
    this.set('external_vocab_size', null);
    this.set('external_access_method', null);

    this.set('linking', false);
    this.set('error', null);
    user.set('watch_user_name_and_cookies', true);
    this.set('model.user', user);
    this.set('model.user.org_management_action', this.get('model.default_org_management_action'));
  },
  user_types: computed('model.no_licenses', 'model.no_supervisor_licenses', 'model.no_eval_licenses', function() {
    var res = [];
    res.push({id: '', name: i18n.t('select_user_type', "[ Add This User As ]")});
    if(this.get('model.no_licenses')) {
      res.push({id: 'add_user', disabled: true, name: i18n.t('add_sponsored_used', "Add this User As a Sponsored Communicator")});
      if(this.get('model.user.org_management_action') == 'add_user') {
        this.set_unsponsored_action();
      }
    } else {
      res.push({id: 'add_user', name: i18n.t('add_sponsored_used', "Add this User As a Sponsored Communicator")});
    }
    res.push({id: 'add_unsponsored_user', name: i18n.t('add_unsponsored_used', "Add this User As an Unsponsored Communicator")});
    if(this.get('model.premium')) {
      res.push({id: 'add_external_user', name: i18n.t('add_third_party_user', "Add this User As an Third-Party App Communicator")});
    }
    if(this.get('model.no_supervisor_licenses')) {
      res.push({id: 'add_premium_supervisor', disabled: true, name: i18n.t('add_as_premium_supervisor', "Add this User As a Premium Supervisor")});
      if(this.get('model.user.org_management_action') == 'add_premium_supervisor') {
        this.set_unsponsored_action('supervisor');
      }
    } else {
      res.push({id: 'add_premium_supervisor', name: i18n.t('add_as_premium_supervisor', "Add this User As a Premium Supervisor")});
    }
    res.push({id: 'add_supervisor', name: i18n.t('add_as_supervisor', "Add this User As a Supervisor")});
    res.push({id: 'add_manager', name: i18n.t('add_as_manager', "Add this User As a Full Manager")});
    res.push({id: 'add_assistant', name: i18n.t('add_as_assistant', "Add this User As a Management Assistant")});
    if(this.get('model.no_eval_licenses')) {
      res.push({id: 'add_eval', disabled: true, name: i18n.t('add_paid_eval', "Add this User As a Paid Eval Account")});
      if(this.get('model.user.org_management_action') == 'add_eval') {
        this.set_unsponsored_action();
      }
    } else {
      res.push({id: 'add_eval', name: i18n.t('add_paid_eval', "Add this User As a Paid Eval Account")});
    }
    return res;
  }),
  locale_list: computed(function() {
    var list = i18n.get('locales');
    var res = [{name: i18n.t('english_default', "English (default)"), id: 'en'}];
    for(var key in list) {
      if(!key.match(/-|_/)) {
        var str = /* i18n.locales_localized[key] ||*/ i18n.locales[key] || key;
        res.push({name: str, id: key});
      }
    }
    return res;
  }),
  access_methods: computed(function() {
    return [
      {name: i18n.t('touch', "Touch"), id: 'touch'},
      {name: i18n.t('partner_assisted_scanning', "Partner-Assisted Scanning"), id: 'partner_scanning'},
      {name: i18n.t('auditory_or_visual_scanning', "Auditory/Visual Scanning"), id: 'scanning'},
      {name: i18n.t('head_tracking', "Head Tracking"), id: 'head'},
      {name: i18n.t('eye_gaze_tracking', "Eye Gaze Tracking"), id: 'gaze'},
      {name: i18n.t('other', "Other"), id: 'other'},
    ]
  }),
  symbols_list: computed(function() {
    var list = [
      {name: i18n.t('original_symbols', "Use the board's original symbols"), id: 'original'},
      {name: i18n.t('use_opensymbols', "Opensymbols.org free symbol libraries"), id: 'opensymbols'},

      {name: i18n.t('use_lessonpix', "LessonPix symbol library"), id: 'lessonpix'},
      {name: i18n.t('use_symbolstix', "SymbolStix Symbols"), id: 'symbolstix'},
      {name: i18n.t('use_pcs', "PCS Symbols by Tobii Dynavox"), id: 'pcs'},

      {name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji'},
      {name: i18n.t('use_noun-project', "The Noun Project black outlines"), id: 'noun-project'},
      {name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac'},
      {name: i18n.t('use_tawasol', "Tawasol symbol library"), id: 'tawasol'},
    ];
    return list;
  }),
  premium_symbol_library: computed('symbols_list', 'model.user.preferences.preferred_symbols', function() {
    return ['pcs', 'lessonpix', 'symbolstix'].indexOf(this.get('model.user.preferences.preferred_symbols')) != -1;
  }),
  third_party_new_user: computed('model.user.org_management_action', function() {
    return this.get('model.user.org_management_action') == 'add_external_user';
  }),
  boarded_new_user: computed('model.user.org_management_action', function() {
    var action = this.get('model.user.org_management_action');
    return ['add_user', 'add_unsponsored_user', 'add_supervisor', 'add_premium_supervisor', 'add_eval'].indexOf(action) != -1;
  }),
  board_options: computed('model.org.home_board_keys', 'boarded_new_user', function() {
    if(!this.get('boarded_new_user')) { return null; }
    var res = [];
    (this.get('model.org.home_board_keys') || []).forEach(function(key) {
      res.push({
        name: i18n.t('copy_of_key', "Copy of %{key}", {key: key}),
        id: key
      })
    });
    res.push({
      name: i18n.t('no_board_now', "[ Don't Set a Home Board Now ]"),
      id: 'none'
    });
    return res;
  }),
  board_will_copy: computed('model.user.home_board_template', function() {
    var template = this.get('model.user.home_board_template') || ((this.get('board_options') || [])[0] || {}).id;
    return template != 'none';
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
  set_unsponsored_action(type) {
    if(type == 'supervisor') {
      this.set('model.user.org_management_action', 'add_supervisor');      
    } else {
      this.set('model.user.org_management_action', 'add_unsponsored_user');
    }
  },
  linking_or_exists: computed('linking', 'model.user.user_name_check.exists', function() {
    return this.get('linking') || this.get('model.user.user_name_check.exists');
  }),
  actions: {
    set_device: function(device) {
      this.set('external_device', device.name);
    },
    set_vocab: function(vocab) {
      this.set('external_vocab', vocab.name);
      if(vocab.buttons) {
        this.set('external_vocab_size', vocab.buttons);
      }
    },
    add: function() {
      var controller = this;
      controller.set('linking', true);
      var user = this.get('model.user');
      if(!user.get('user_name') || user.get('user_name').length < 2) {
        controller.set('linking', false);
        return;
      }

      if(this.get('external_device')) {
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
      }

      user.set('watch_user_name_and_cookies', false);

      if(this.get('third_party_new_user') && this.get('external_device.name')) {
        var dev = this.get('external_device');
        dev.vocab_id = this.get('external_vocab.id');
        dev.vocab = this.get('external_vocab.name');
        dev.vocab_size = parseInt(this.get('external_vocab_size'), 10) || null;
        user.set('external_device', dev);
      }
      var home_board = null;
      var symbols = null;
      if(this.get('board_options.length')) {
        home_board = user.get('home_board_template') || this.get('board_options')[0].id;
        symbols = user.get('preferences.preferred_symbols');
      }
      var add_symbols = user.get('add_symbols') && this.get('model.org.extras_available');
      var action = user.get('org_management_action');
      var get_user_name = user.save().then(function(user) {
        return user.get('user_name');
      }, function() {
        return RSVP.reject(i18n.t('creating_user_failed', "Failed to create a new user with the given settings"));
      });

      get_user_name.then(function(user_name) {
        var user = controller.get('model.user');
        if(add_symbols) {
          action = action + "-plus_extras";
        }
        user.set('org_management_action', action);
        user.set('home_board_template', home_board);
        user.set('home_board_symbols', symbols);
        if(controller.get('model.org') && add_symbols) {
          controller.get('model.org').reload();
        }
        modal.close({
          created: true,
          user: user
        });
      }, function(err) {
          controller.set('linking', false);
          controller.set('error', err);
      });
    }
  }
});

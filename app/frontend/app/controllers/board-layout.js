import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import modal from '../utils/modal';

export default Controller.extend({
  appState: service('app-state'),
  app_state: computed.alias('appState'),
  router: service('router'),

  mode: 'layout',
  showing_more_symbols: false,
  setup_user: computed.alias('appState.currentUser'),

  text_position: computed('setup_user.preferences.device.button_text_position', function() {
    var res = {};
    var user = this.get('setup_user');
    if (!user) { return res; }
    var val = user.get('preferences.device.button_text_position');
    if (val === 'top') { res.text_on_top = true; }
    else if (val === 'bottom') { res.text_on_bottom = true; }
    else if (val === 'text_only') { res.text_only = true; }
    else { res.text_on_top = true; }
    return res;
  }),

  symbols: computed('setup_user.preferences.preferred_symbols', function() {
    var res = {};
    var user = this.get('setup_user');
    if (!user) { return res; }
    var val = user.get('preferences.preferred_symbols');
    if (val) {
      res[val.replace(/-/, '_')] = true;
      res['value'] = [val.replace(/-/, '_')];
    } else {
      res.opensymbols = true;
    }
    return res;
  }),

  skin: computed('setup_user.preferences.skin', function() {
    var res = {};
    var user = this.get('setup_user');
    if (!user) { return res; }
    var skinVal = user.get('preferences.skin');
    if (skinVal) {
      if (['default', 'dark', 'medium-dark', 'medium', 'medium-light', 'light'].indexOf(skinVal) !== -1) {
        res.value = skinVal;
        res[res.value] = true;
      } else {
        var parts = skinVal.split(/::/);
        if (parts[0] === 'mix_only' || parts[0] === 'mix_prefer') {
          res.options = [
            {label: i18n.t('default_skin_tones', "Pale"), id: 'default'},
            {label: i18n.t('dark_skin_tone', "Dark"), id: 'dark'},
            {label: i18n.t('medium_dark_skin_tone', "Medium-Dark"), id: 'medium_dark'},
            {label: i18n.t('medium_skin_tone', "Medium"), id: 'medium'},
            {label: i18n.t('medium_light_skin_tone', "Medium-Light"), id: 'medium_light'},
            {label: i18n.t('light_skin_tone', "Light"), id: 'light'}
          ];
          if (parts[2]) {
            var rules = parts[2].split(/-/).pop();
            for (var idx = 0; idx < 6; idx++) {
              var v = parseInt(rules[idx] || '0', 10);
              if (parts[0] === 'mix_only') { res.options[idx].checked = v > 0; }
              else { res.options[idx].checked = v > 1; }
            }
          }
          if (parts[0] === 'mix_only') { res.limit = true; res.value = 'limit'; }
          else { res.prefer = true; res.value = 'prefer'; }
        } else {
          res.mix = true;
          res.value = 'mix';
        }
      }
    } else {
      res.mix = true;
      res.value = 'mix';
    }
    return res;
  }),

  utterance_layout: computed('setup_user.preferences.device.utterance_text_only', function() {
    var res = {};
    var user = this.get('setup_user');
    if (!user) { return res; }
    if (user.get('preferences.device.utterance_text_only')) {
      res.text_only = true;
    } else {
      res.text_with_symbols = true;
    }
    return res;
  }),

  background: computed('setup_user.preferences.device.symbol_background', 'setup_user.preferences.high_contrast', function() {
    var res = {};
    var user = this.get('setup_user');
    if (!user) { return res; }
    var bg = user.get('preferences.device.symbol_background');
    if (bg === 'clear') { res.clear = true; }
    else if (bg === 'white') { res.white = true; }
    else if (bg === 'black') {
      if (user.get('preferences.high_contrast') === true) { res.black_with_high_contrast = true; }
      else { res.black = true; }
    } else { res.clear = true; }
    return res;
  }),

  image_preview_class: computed('background', function() {
    var res = 'symbol_preview ';
    var bg = this.get('background');
    if (bg && bg.black_with_high_contrast) { res += 'high_contrast '; }
    if (bg && bg.white) { res += 'white '; }
    else if (bg && (bg.black || bg.black_with_high_contrast)) { res += 'black '; }
    return res;
  }),

  current_symbol_value: computed('setup_user.preferences.preferred_symbols', function() {
    var user = this.get('setup_user');
    return user ? (user.get('preferences.preferred_symbols') || 'opensymbols') : 'opensymbols';
  }),

  symbol_library_options: computed('symbols', 'showing_more_symbols', 'setup_user.subscription.extras_enabled', function() {
    var opts = [];
    opts.push({ value: 'original', label: i18n.t('use_original_symbols', "Default symbols") });
    opts.push({ value: 'opensymbols', label: i18n.t('opensymbols', "Opensymbols.org") });
    if (this.get('setup_user') && this.get('setup_user.subscription.extras_enabled')) {
      opts.push({ value: 'lessonpix', label: i18n.t('lessonpix_library', "LessonPix symbol library") });
      opts.push({ value: 'symbolstix', label: i18n.t('symbolstix_images', "SymbolStix Symbols") });
      opts.push({ value: 'pcs', label: i18n.t('pcs', "PCS Symbols by Tobii Dynavox") });
    }
    if (this.get('showing_more_symbols')) {
      opts.push({ value: 'twemoji', label: i18n.t('twemoji', "Emoji icons (authored by Twitter)") });
      opts.push({ value: 'noun-project', label: i18n.t('noun_project', "Noun Project black outlines") });
      opts.push({ value: 'arasaac', label: i18n.t('arasaac', "ARASAAC free symbols") });
      opts.push({ value: 'tawasol', label: i18n.t('tawasol_library', "Tawasol") });
    } else {
      opts.push({ expand: true, label: i18n.t('show_more_libraries', "Show more libraries...") });
    }
    return opts;
  }),

  skin_option_list: computed(function() {
    return [
      { value: 'mix', label: i18n.t('mix_of_skin_tones', "Mix of Tones"), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f308.svg' },
      { value: 'dark', label: i18n.t('dark_skin_tone', "Dark"), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3ff-200d-1f9b2.svg' },
      { value: 'medium-dark', label: i18n.t('medium_dark_skin_tone', "Medium-Dark"), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fe-200d-1f9b2.svg' },
      { value: 'medium', label: i18n.t('medium_skin_tone', "Medium"), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fd-200d-1f9b2.svg' },
      { value: 'medium-light', label: i18n.t('medium_light_skin_tone', "Medium-Light"), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fc-200d-1f9b2.svg' },
      { value: 'light', label: i18n.t('light_skin_tone', "Light"), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fb-200d-1f9b2.svg' },
      { value: 'default', label: i18n.t('default_skin_tones', "Pale"), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fb-200d-1f9b2.svg', image_class: 'setup-symbols-pill__img--pale' },
      { value: 'limit', label: i18n.t('limit_tones_to', "Limit Tones To..."), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2705.svg' }
    ];
  }),

  hello_skin_url: computed('symbols', 'skin', function() {
    var hash = {
      twemoji: { dark: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3ff.svg', 'medium-dark': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fe.svg', medium: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fd.svg', 'medium-light': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fc.svg', light: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fb.svg', default: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-varxxxUNI.svg' },
      other: { dark: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-dark.png', 'medium-dark': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-medium-dark.png', medium: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-medium.png', 'medium-light': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-medium-light.png', light: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-light.png', default: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.varianted-skin.png' }
    };
    var skin = this.get('skin.value');
    if (skin === 'mix') { skin = 'medium'; }
    var obj = hash[this.get('symbols.value')] || hash['other'];
    return obj[skin] || obj['default'];
  }),

  premium_but_not_allowed: computed('setup_user.subscription.extras_enabled', 'symbols.pcs', 'symbols.symbolstix', function() {
    return (this.get('symbols.pcs') || this.get('symbols.symbolstix')) && !this.get('setup_user.subscription.extras_enabled');
  }),

  lessonpix_but_not_allowed: computed('symbols.lessonpix', 'setup_user.subscription.extras_enabled', function() {
    return this.get('symbols.lessonpix') && !this.get('setup_user.subscription.extras_enabled');
  }),

  _saveTimer: null,

  _scheduleUserSave: function(user) {
    if (this._saveTimer) { clearTimeout(this._saveTimer); }
    var _this = this;
    this._saveTimer = setTimeout(function() {
      _this._saveTimer = null;
      if (user && user.save) {
        user.save().then(null, function() {});
      }
    }, 500);
  },

  actions: {
    set_preference: function(preference, value) {
      var user = this.get('setup_user');
      if (!user) { return; }
      if (preference === 'preferred_symbols') {
        user.set('preferences.' + preference, value);
        user.notifyPropertyChange('preferences');
      } else if (preference === 'device.symbol_background') {
        var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
        prefs.device = prefs.device || {};
        prefs.device.symbol_background = value === 'black_with_high_contrast' ? 'black' : value;
        prefs.high_contrast = value === 'black_with_high_contrast';
        user.set('preferences', prefs);
        user.notifyPropertyChange('preferences');
      } else if (preference === 'device.utterance_text_only') {
        var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
        prefs.device = prefs.device || {};
        prefs.device.utterance_text_only = value;
        prefs.device.updated = true;
        user.set('preferences', prefs);
        user.notifyPropertyChange('preferences');
      } else if (preference.indexOf('.') !== -1) {
        var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
        var parts = preference.split('.');
        var target = prefs;
        for (var i = 0; i < parts.length - 1; i++) {
          target[parts[i]] = target[parts[i]] || {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
        user.set('preferences', prefs);
        user.notifyPropertyChange('preferences');
      } else {
        user.set('preferences.' + preference, value);
        user.notifyPropertyChange('preferences');
      }
      this._scheduleUserSave(user);
    },

    show_more_symbols: function() {
      this.set('showing_more_symbols', true);
    },

    close_layout: function() {
      var boardKey = this.get('model.board_key');
      if (boardKey) {
        var parts = boardKey.split('/');
        if (parts.length === 2) {
          this.get('router').transitionTo('user.board-detail.edit', parts[0], parts[1]);
          return;
        }
      }
      this.get('router').transitionTo('index');
    }
  }
});

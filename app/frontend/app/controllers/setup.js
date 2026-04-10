import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import { inject as service } from '@ember/service';
import $ from 'jquery';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import modal from '../utils/modal';
import speecher from '../utils/speecher';
import utterance from '../utils/utterance';
import Utils from '../utils/misc';
import Stats from '../utils/stats';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';

var order = ['intro', 'usage', 'board_category', 'core', 'access', 'voice', 'logging', 'supervisors', 'done'];
var extra_order = ['extra-dashboard', 'extra-home-boards', 'extra-speak-mode', 'extra-folders', 'extra-exit-speak-mode', 'extra-modeling', 'extra-supervisors', 'extra-reports', 'extra-logs', 'extra-done'];
export default Controller.extend({
  router: service('router'),
  appState: service('app-state'),
  app_state: alias('appState'),
  persistence: service('persistence'),
  speecher: speecher,
  title: computed(function() {
    return i18n.t('account_setup', "Account Setup");
  }),
  queryParams: [{ page: { defaultValue: 'intro' } }, 'finish', 'user_id', 'mode'],
  mode: null,
  order: order,
  extra_order: extra_order,
  setup_index: computed('page', 'appState.controller.setup_index', function() {
    var ctrl = this.appState && this.appState.get('controller');
    return ctrl ? ctrl.get('setup_index') : 1;
  }),
  setup_order_length: computed('page', 'appState.controller.setup_order', function() {
    var ctrl = this.appState && this.appState.get('controller');
    var o = ctrl && ctrl.get('setup_order');
    return o && o.length ? o.length : order.length;
  }),
  setup_previous: computed('page', 'appState.controller.setup_previous', function() {
    var ctrl = this.appState && this.appState.get('controller');
    return ctrl ? ctrl.get('setup_previous') : false;
  }),
  setup_next: computed('page', 'appState.controller.setup_next', function() {
    var ctrl = this.appState && this.appState.get('controller');
    return ctrl ? ctrl.get('setup_next') : false;
  }),
  setupProgressPercent: computed('setup_index', 'setup_order_length', function() {
    var len = this.get('setup_order_length');
    if(!len) { return 0; }
    return Math.round((this.get('setup_index') / len) * 100);
  }),
  setupProgressStyle: computed('setupProgressPercent', function() {
    var pct = this.get('setupProgressPercent');
    return (pct !== undefined && pct !== null) ? ('width: ' + pct + '%') : 'width: 0%';
  }),
  setupComponent: computed('page', function() {
    var page = this.get('page');
    var pages = order.concat(extra_order);
    if(page && page.match(/^extra/) && this.appState && this.appState.controller) {
      this.appState.controller.set('setup_order', order.concat(extra_order));
    }
    if(pages.indexOf(page) != -1) {
      return 'setup/' + page;
    } else {
      return 'setup/intro';
    }
  }),
  utterance_layout: computed(
    'fake_user.preferences.device.utterance_text_only',
    'setup_user.preferences.device.utterance_text_only',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.device.utterance_text_only')) {
        res.text_only = true;
      } else {
        res.text_with_symbols = true;
      }
      return res;
    }
  ),
  text_position: computed(
    'fake_user.preferences.device.button_text_position',
    'setup_user.preferences.device.button_text_position',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.device.button_text_position') == 'top') {
        res.text_on_top = true;
      } else if(user.get('preferences.device.button_text_position') == 'bottom') {
        res.text_on_bottom = true;
      } else if(user.get('preferences.device.button_text_position') == 'text_only') {
        res.text_only = true;
      } else {
        res.text_on_top = true;
      }
      return res;
    }
  ),
  text_position_label: computed('text_position', function() {
    if(this.get('text_position.text_on_top')) { return i18n.t('text_above_pictures', 'Pictures with text above'); }
    if(this.get('text_position.text_only')) { return i18n.t('no_pictures', 'Text only (no pictures)'); }
    if(this.get('text_position.text_on_bottom')) { return i18n.t('text_below_pictures', 'Pictures with text below'); }
    return i18n.t('text_above_pictures', 'Pictures with text above');
  }),
  skin: computed(
    'fake_user.preferences.skin',
    'setup_user.preferences.skin',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.skin')) {
        if(['default', 'dark', 'medium-dark', 'medium', 'medium-light', 'light'].indexOf(user.get('preferences.skin')) != -1) {
          res.value = user.get('preferences.skin');
          res[res.value] = true
        } else {
          var parts = user.get('preferences.skin').split(/::/);
          if(parts[0] == 'mix_only' || parts[0] == 'mix_prefer') {
            res.options = [
              {label: i18n.t('default_skin_tones', "Pale"), id: 'default', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fb.svg'},
              {label: i18n.t('dark_skin_tone', "Dark"), id: 'dark', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3ff.svg'},
              {label: i18n.t('medium_dark_skin_tone', "Medium-Dark"), id: 'medium_dark', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fe.svg'},
              {label: i18n.t('medium_skin_tone', "Medium"), id: 'medium', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fd.svg'},
              {label: i18n.t('medium_light_skin_tone', "Medium-Light"), id: 'medium_light', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fc.svg'},
              {label: i18n.t('light_skin_tone', "Light"), id: 'light', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fb.svg'},
            ];
            if(parts[2]) {
              var rules = parts[2].split(/-/).pop();
              for(var idx = 0; idx < 6; idx++) {
                var val =  parseInt(rules[idx] || '0', 10)
                if(parts[0] == 'mix_only') {
                  res.options[idx].checked = val > 0;
                } else if(parts[0] == 'mix_prefer') {
                  res.options[idx].checked = val > 1;
                }
              }
            }
            if(parts[0] == 'mix_only') {
              res.limit = true;
              res.value = 'limit';
            } else {
              res.prefer = true;
              res.value = 'prefer';
            }
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
    }
  ),
  update_skin_pref: observer(
    'skin.prefer', 'skin.limit',
    'skin.options.@each.checked',
    function() {
      var opts = this.get('skin.options');
      if(!opts) { return; }
      var user = this.get('setup_user') || this.get('fake_user');
      var str = 'mix_only::' + user.get('id') + '::limit-';
      if(this.get('skin.prefer')) {
        str = 'mix_prefer::' + user.get('id') + '::limit-';
      }
      opts.forEach(function(opt) {
        str = str + (opt.checked ? '1' : '0');
      })
      if(str != user.get('preferences.skin') && user.get('preferences.skin')) {
        this.send('set_preference', 'skin', str);
      }
    }
  ),
  hello_skin_url: computed(
    'symbols', 'skin',
    function() {
      var hash = {
        twemoji: {
          dark: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3ff.svg',
          'medium-dark': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fe.svg',
          medium: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fd.svg',
          'medium-light': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fc.svg',
          light: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-1f3fb.svg',
          default: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44b-varxxxUNI.svg'
        },
        pcs: {
          dark: 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03601/773cfc7cdbfa6770803a334b3089deff6eafca6d003d81bb21b08ae6ea75665c898bccbb25e46eed03592ca2d9b3e471bcd54fc7b4395e06984357e1a0bd976e/03601.svg.variant-dark.svg',
          'medium-dark': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03601/773cfc7cdbfa6770803a334b3089deff6eafca6d003d81bb21b08ae6ea75665c898bccbb25e46eed03592ca2d9b3e471bcd54fc7b4395e06984357e1a0bd976e/03601.svg.variant-medium-dark.svg',
          medium: 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03601/773cfc7cdbfa6770803a334b3089deff6eafca6d003d81bb21b08ae6ea75665c898bccbb25e46eed03592ca2d9b3e471bcd54fc7b4395e06984357e1a0bd976e/03601.svg.variant-medium.svg',
          'medium-light': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03601/773cfc7cdbfa6770803a334b3089deff6eafca6d003d81bb21b08ae6ea75665c898bccbb25e46eed03592ca2d9b3e471bcd54fc7b4395e06984357e1a0bd976e/03601.svg.variant-medium-light.svg',
          light: 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03601/773cfc7cdbfa6770803a334b3089deff6eafca6d003d81bb21b08ae6ea75665c898bccbb25e46eed03592ca2d9b3e471bcd54fc7b4395e06984357e1a0bd976e/03601.svg.variant-light.svg',
          default: 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03601/773cfc7cdbfa6770803a334b3089deff6eafca6d003d81bb21b08ae6ea75665c898bccbb25e46eed03592ca2d9b3e471bcd54fc7b4395e06984357e1a0bd976e/03601.svg.varianted-skin.svg'
        },
        symbolstix: {
          dark: 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002179/37435d6da02be17899925a5d98edf9e3c1974bb4f1d016ddd548af90d3b071f5a8eca4971ac0d563076ea3f8b205f88b8e5fd818fea4468292da60a4348e8e43/c-communication-greetings_Wrap_ups-hello.png.variant-dark.png',
          'medium-dark': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002179/37435d6da02be17899925a5d98edf9e3c1974bb4f1d016ddd548af90d3b071f5a8eca4971ac0d563076ea3f8b205f88b8e5fd818fea4468292da60a4348e8e43/c-communication-greetings_Wrap_ups-hello.png.variant-medium-dark.png',
          medium: 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002179/37435d6da02be17899925a5d98edf9e3c1974bb4f1d016ddd548af90d3b071f5a8eca4971ac0d563076ea3f8b205f88b8e5fd818fea4468292da60a4348e8e43/c-communication-greetings_Wrap_ups-hello.png.variant-medium.png',
          'medium-light': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002179/37435d6da02be17899925a5d98edf9e3c1974bb4f1d016ddd548af90d3b071f5a8eca4971ac0d563076ea3f8b205f88b8e5fd818fea4468292da60a4348e8e43/c-communication-greetings_Wrap_ups-hello.png.variant-medium-light.png',
          light: 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002179/37435d6da02be17899925a5d98edf9e3c1974bb4f1d016ddd548af90d3b071f5a8eca4971ac0d563076ea3f8b205f88b8e5fd818fea4468292da60a4348e8e43/c-communication-greetings_Wrap_ups-hello.png.variant-light.png',
          default: 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002179/37435d6da02be17899925a5d98edf9e3c1974bb4f1d016ddd548af90d3b071f5a8eca4971ac0d563076ea3f8b205f88b8e5fd818fea4468292da60a4348e8e43/c-communication-greetings_Wrap_ups-hello.png.varianted-skin.png'
        },
        other: {
          dark: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-dark.png',
          'medium-dark': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-medium-dark.png',
          medium: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-medium.png',
          'medium-light': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-medium-light.png',
          light: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.variant-light.png',
          default: 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hello.png.varianted-skin.png'
        }
      };
      var skin = this.get('skin.value');
      if(this.get('skin.value') == 'mix') {
        skin = 'medium';
      } else if(this.get('skin.limit')) {
        // which_skinner
      } else if(this.get('skin.prefer')) {

      }
      var obj = hash[this.get('symbols.value')] || hash['other'];
      return obj[skin] || obj['default'];
    }
  ),
  image_preview_class: computed(
    'fake_user.preferences.high_contrast',
    'setup_user.preferences.high_contrast',
    'background',
    function() {
      var res = 'symbol_preview ';
      var bg = this.get('background');
      if(bg && bg.black_with_high_contrast) {
        res = res + 'high_contrast ';
      }
      if(bg && bg.white) {
        res = res + 'white ';
      } else if(bg && (bg.black || bg.black_with_high_contrast)) {
        res = res + 'black ';
      }
      return res;
    }
  ),
  background: computed(
    'fake_user.preferences.device.symbol_background',
    'setup_user.preferences.device.symbol_background',
    'fake_user.preferences.high_contrast',
    'setup_user.preferences.high_contrast',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.device.symbol_background') == 'clear') {
        res.clear = true;
      } else if(user.get('preferences.device.symbol_background') == 'white') {
        res.white = true;
      } else if(user.get('preferences.device.symbol_background') == 'black') {
        if(user.get('preferences.high_contrast') === true) {
          res.black_with_high_contrast = true;
        } else {
          res.black = true;
        }

      } else {
        res.clear = true;
      }
      return res;
    }
  ),
  access: computed(
    'fake_user.preferences.device.dwell',
    'setup_user.preferences.device.dwell',
    'fake_user.preferences.device.scanning',
    'setup_user.preferences.device.scanning',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.device.dwell')) {
        res.dwell = true;
      } else if(user.get('preferences.device.scanning')) {
        res.scanning = true;
      } else {
        res.touch = true;
      }
      return res;
    }
  ),
  home_return: computed(
    'fake_user.preferences.auto_home_return',
    'setup_user.preferences.auto_home_return',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.auto_home_return')) {
        res.auto_return = true;
      } else {
        res.stay = true;
      }
      return res;
    }
  ),
  symbols: computed(
    'fake_user.preferences.preferred_symbols',
    'setup_user.preferences.preferred_symbols',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.preferred_symbols')) {
        res[user.get('preferences.preferred_symbols').replace(/-/, '_')] = true;
        res['value'] = [user.get('preferences.preferred_symbols').replace(/-/, '_')];
      } else {
        res.original = true;
      }
      return res;
    }
  ),
  current_symbol_value: computed('setup_user.preferences.preferred_symbols', 'fake_user.preferences.preferred_symbols', function() {
    var user = this.get('setup_user') || this.get('fake_user');
    return (user.get('preferences.preferred_symbols') || 'original');
  }),
  symbol_library_label: computed('symbols', function() {
    var labels = {
      original: i18n.t('use_original_symbols', "Default symbols"),
      opensymbols: i18n.t('opensymbols', 'Opensymbols.org'),
      twemoji: i18n.t('twemoji', 'Emoji icons (authored by Twitter)'),
      noun_project: i18n.t('noun_project', 'Noun Project black outlines'),
      arasaac: i18n.t('arasaac', 'ARASAAC free symbols'),
      tawasol: i18n.t('tawasol_library', 'Tawasol'),
      lessonpix: i18n.t('lessonpix_library', 'LessonPix symbol library'),
      symbolstix: i18n.t('symbolstix_images', 'SymbolStix Symbols'),
      pcs: i18n.t('pcs', 'PCS Symbols by Tobii Dynavox')
    };
    if(this.get('symbols.original')) { return labels.original; }
    if(this.get('symbols.opensymbols')) { return labels.opensymbols; }
    if(this.get('symbols.twemoji')) { return labels.twemoji; }
    if(this.get('symbols.noun_project')) { return labels.noun_project; }
    if(this.get('symbols.arasaac')) { return labels.arasaac; }
    if(this.get('symbols.tawasol')) { return labels.tawasol; }
    if(this.get('symbols.lessonpix')) { return labels.lessonpix; }
    if(this.get('symbols.symbolstix')) { return labels.symbolstix; }
    if(this.get('symbols.pcs')) { return labels.pcs; }
    return labels.original;
  }),
  symbol_library_options: computed('symbols', 'showing_more_symbols', 'setup_user.subscription.extras_enabled', 'setup_user', function() {
    var opts = [];
    opts.push({ value: 'original', label: i18n.t('use_original_symbols', "Default symbols") });
    opts.push({ value: 'opensymbols', label: i18n.t('opensymbols', 'Opensymbols.org') });
    if(this.get('setup_user') && this.get('setup_user.subscription.extras_enabled')) {
      opts.push({ value: 'lessonpix', label: i18n.t('lessonpix_library', 'LessonPix symbol library'), subNote: this.get('setup_user.subscription.grace_trial_period') ? i18n.t('extra_fee_at_purchase', '(requires extra fee after trial period)') : null });
      opts.push({ value: 'symbolstix', label: i18n.t('symbolstix_images', 'SymbolStix Symbols'), subNote: this.get('setup_user.subscription.grace_trial_period') ? i18n.t('extra_fee_at_purchase', '(requires extra fee after trial period)') : null });
      opts.push({ value: 'pcs', label: i18n.t('pcs', 'PCS Symbols by Tobii Dynavox'), subNote: this.get('setup_user.subscription.grace_trial_period') ? i18n.t('extra_fee_at_purchase', '(requires extra fee after trial period)') : null });
    }
    if(this.get('showing_more_symbols')) {
      opts.push({ value: 'twemoji', label: i18n.t('twemoji', 'Emoji icons (authored by Twitter)') });
      opts.push({ value: 'noun-project', label: i18n.t('noun_project', 'Noun Project black outlines') });
      opts.push({ value: 'arasaac', label: i18n.t('arasaac', 'ARASAAC free symbols') });
      opts.push({ value: 'tawasol', label: i18n.t('tawasol_library', 'Tawasol') });
    } else {
      opts.push({ expand: true, label: i18n.t('show_more_libraries', 'Show more libraries...') });
    }
    return opts;
  }),
  utterance_layout_label: computed('utterance_layout', function() {
    return this.get('utterance_layout.text_only')
      ? i18n.t('show_words', 'Words only')
      : i18n.t('show_symbols', 'Symbol buttons');
  }),
  background_label: computed('background', function() {
    if(this.get('background.clear')) { return i18n.t('clear_background', 'Color background'); }
    if(this.get('background.white')) { return i18n.t('always_white_background', 'White background'); }
    if(this.get('background.black')) { return i18n.t('always_black_background', 'Black background'); }
    if(this.get('background.black_with_high_contrast')) { return i18n.t('high_contrast_black_background', 'High contrast'); }
    return i18n.t('clear_background', 'Color background');
  }),
  skin_option_list: computed(function() {
    return [
      { value: 'mix', label: i18n.t('mix_of_skin_tones', 'Mix of Tones'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f308.svg' },
      { value: 'dark', label: i18n.t('dark_skin_tone', 'Dark'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3ff-200d-1f9b2.svg' },
      { value: 'medium-dark', label: i18n.t('medium_dark_skin_tone', 'Medium-Dark'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fe-200d-1f9b2.svg' },
      { value: 'medium', label: i18n.t('medium_skin_tone', 'Medium'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fd-200d-1f9b2.svg' },
      { value: 'medium-light', label: i18n.t('medium_light_skin_tone', 'Medium-Light'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fc-200d-1f9b2.svg' },
      { value: 'light', label: i18n.t('light_skin_tone', 'Light'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fb-200d-1f9b2.svg' },
      { value: 'default', label: i18n.t('default_skin_tones', 'Pale'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f468-1f3fb-200d-1f9b2.svg', image_class: 'setup-symbols-pill__img--pale' },
      { value: 'limit', label: i18n.t('limit_tones_to', 'Limit Tones To...'), image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2705.svg' }
    ];
  }),
  skin_label: computed('skin', function() {
    var s = this.get('skin');
    if(!s) { return i18n.t('default_skin_tones', 'Pale'); }
    if(s.default) { return i18n.t('default_skin_tones', 'Pale'); }
    if(s.mix) { return i18n.t('mix_of_skin_tones', 'Mix of Tones'); }
    if(s.dark) { return i18n.t('dark_skin_tone', 'Dark'); }
    if(s['medium-dark']) { return i18n.t('medium_dark_skin_tone', 'Medium-Dark'); }
    if(s.medium) { return i18n.t('medium_skin_tone', 'Medium'); }
    if(s['medium-light']) { return i18n.t('medium_light_skin_tone', 'Medium-Light'); }
    if(s.light) { return i18n.t('light_skin_tone', 'Light'); }
    if(s.limit) { return i18n.t('limit_tones_to', 'Limit Tones To...'); }
    if(s.prefer) { return i18n.t('show_tones_preference_for', 'Show Preference For...'); }
    return i18n.t('default_skin_tones', 'Pale');
  }),
  premium_but_not_allowed: computed(
    'setup_user.subscription.extras_enabled',
    'symbols.pcs',
    'symbols.symbolstix',
    function() {
      return (this.get('symbols.pcs') || this.get('symbols.symbolstix')) && !this.get('setup_user.subscription.extras_enabled');
    }
  ),
  lessonpix_but_not_allowed: computed('symbols.lessonpix', 'lessonpix_enabled', function() {
    return this.get('symbols.lessonpix') && !this.get('lessonpix_enabled');
  }),
  no_scroll: computed(
    'advanced',
    'page',
    'appState.feature_flags.board_levels',
    'scroll_disableable',
    function() {
      if(this.appState.get('feature_flags.board_levels') && this.get('scroll_disableable')) {
        return !this.get('advanced') && this.get('page') == 'board_category'; 
      } else {
        return false;
      }
    }
  ),
  notification: computed(
    'fake_user.preferences.notification_frequency',
    'setup_user.preferences.notification_frequency',
    'fake_user.preferences.share_notifications',
    'setup_user.preferences.share_notifications',
    function() {
      var res = {};
      var user = this.get('setup_user') || this.get('fake_user');
      if(user.get('preferences.notification_frequency') == '1_week') {
        res['1_week'] = true;
      } else if(user.get('preferences.notification_frequency') == '2_weeks') {
        res['2_weeks'] = true;
      } else if(user.get('preferences.notification_frequency') == '1_month') {
        res['1_month'] = true;
      } else {
        res['none'] = true;
      }
      if(user.get('preferences.share_notifications') == 'email') {
        res.email = true;
      } else if(user.get('preferences.share_notifications') == 'text') {
        res.text = true;
      } else if(user.get('preferences.share_notifications') == 'app') {
        res.app = true;
      } else {
        res.email = true;
      }
      return res;
    }
  ),
  update_cell: observer(
    'cell',
    'fake_user.cell_phone',
    'setup_user.cell_phone',
    function(o, change) {
      if(!this.appState || !this.appState.controller || !this.appState.controller.get('setup_footer')) { return; }
      var user = this.get('setup_user') || this.get('fake_user');
      if(!this.get('cell') && user.get('cell_phone')) {
        this.set('cell', user.get('cell_phone'));
      } else if(change == 'setup_user.cell_phone') {
        this.set('cell', user.get('cell_phone'));
      } else if(this.get('cell') && user.get('cell_phone') !== this.get('cell')) {
        user.set('cell_phone', this.get('cell'));
        this.send('set_preference', 'cell_phone', this.get('cell'));
      }
    }
  ),
  update_pin: observer(
    'pin',
    'fake_user.preferences.require_speak_mode_pin',
    'setup_user.preferences.require_speak_mode_pin',
    'fake_user.preferences.speak_mode_pin',
    'setup_user.preferences.speak_mode_pin',
    function(o, change) {
      if(!this.appState || !this.appState.controller || !this.appState.controller.get('setup_footer')) { return; }
      var user = this.get('setup_user') || this.get('fake_user');
      if(!this.get('pin') && user.get('preferences.speak_mode_pin') && user.get('preferences.require_speak_mode_pin')) {
        this.set('pin', user.get('preferences.speak_mode_pin') || "");
      } else if(change == 'setup_user.preferences.speak_mode_pin' || change == 'setup_user.preferences.require_speak_mode_pin') {
        this.set('pin', user.get('preferences.speak_mode_pin') || "");
      } else {
        var pin = (parseInt(this.get('pin'), 10) || "").toString().substring(0, 4);
        var _this = this;
        runLater(function() {
          if(pin != _this.get('pin')) {
            _this.set('pin', pin);
          }
        }, 10);
        var pinChanged = pin.length == 4 && (!user.get('preferences.require_speak_mode_pin') || pin != user.get('preferences.speak_mode_pin'));
        var requireOff = pin.length != 4 && user.get('preferences.require_speak_mode_pin');
        if(pinChanged) {
          user.set('preferences.require_speak_mode_pin', true);
          this.send('set_preference', 'speak_mode_pin', this.get('pin'));
        } else if(requireOff) {
          this.send('set_preference', 'require_speak_mode_pin', false);
        }
      }
    }
  ),
  update_checkbox_preferences: observer(
    'fake_user.preferences.vocalize_buttons',
    'setup_user.preferences.vocalize_buttons',
    'vocalize_buttons',
    'fake_user.preferences.vocalize_linked_buttons',
    'setup_user.preferences.vocalize_linked_buttons',
    'vocalize_linked_buttons',
    'fake_user.preferences.auto_home_return',
    'setup_user.preferences.auto_home_return',
    'auto_home_return',
    function(a, b, c) {
      if(!this.appState || !this.appState.controller || !this.appState.controller.get('setup_footer')) { return; }
      var do_update = false;
      var _this = this;
      if(_this.get('ignore_update')) { return; }

      var user = this.get('setup_user') || this.get('fake_user');
      ['vocalize_buttons', 'vocalize_linked_buttons', 'auto_home_return'].forEach(function(pref) {
        if(b && b.match(/fake_user|setup_user/) /*_this.get(pref) == null*/ && user.get('preferences.' + pref) != null) {
          _this.set('ignore_update', true);
          _this.set(pref, user.get('preferences.' + pref));
          _this.set('ignore_update', false);
        } else if(_this.get(pref) != null && _this.get(pref) != user.get('preferences.' + pref)) {
          user.set('preferences.' + pref, _this.get(pref));
          do_update = true;
        }
      });

      if(do_update) {
        this.send('set_preference', 'extra', true);
      }
    }
  ),
  user_voice_list: computed(
    'speecher.voiceList',
    'setup_user.premium_voices.claimed',
    'fake_user.preferences.device.voice.voice_uri',
    'setup_user.preferences.device.voice.voice_uris',
    function() {
      var list = speecher.get('voiceList');
      var result = [];
      var user = this.get('setup_user') || this.get('fake_user');
      var premium_voice_ids = (user.get('premium_voices.claimed') || []).map(function(id) { return "extra:" + id; });
      var voice_uri = user.get('preferences.device.voice.voice_uri');
      var found = false;
      list.forEach(function(voice) {
        voice = $.extend({}, voice);
        voice.selected = voice.id == voice_uri;
        if(voice.selected) { found = true; }
        if(voice.voiceURI && voice.voiceURI.match(/^extra/)) {
          if(premium_voice_ids.indexOf(voice.voiceURI) >= 0) {
            result.push(voice);
          }
        } else {
          result.push(voice);
        }
      });
      if(result.length > 1) {
        result.push({
          id: 'force_default',
          name: i18n.t('system_default_voice', "System Default Voice"),
          selected: !found
        });
      }
      return result;
    }
  ),
  for_self: computed('appState.currentUser.id', 'setup_user.id', function() {
    var _this = this;
    if(!_this.appState) { return false; }
    return this.get('setup_user') && this.get('setup_user.id') == _this.appState.get('currentUser.id');
  }),
  _update_on_page_change_last_keys: null,
  update_on_page_change: observer('page', 'user_id', 'appState.currentUser', 'setup_user', function() {
    var _this = this;
    if(!_this.appState || !_this.appState.controller) { return; }
    var page = _this.get('page');
    var user_id = _this.get('user_id');
    var setup_user_id = _this.get('setup_user.id');
    var keys = page + '|' + user_id + '|' + (setup_user_id || '');
    var lastKeys = _this.get('_update_on_page_change_last_keys');
    var pageOrUserChanged = lastKeys !== keys;
    _this.set('_update_on_page_change_last_keys', keys);
    if(!_this.get('fake_user')) {
      _this.set('fake_user', EmberObject.create({
        preferences:
        {
          device: {voice: {}, dwell: false, scanning: false},
          vocalize_buttons: true,
          auto_home_return: true
        }
      }));
    }
    if(_this.appState && _this.appState.controller) {
      var new_setup_user_id = _this.get('user_id');
      if(_this.appState.controller.get('setup_user_id') !== new_setup_user_id) {
        _this.appState.controller.set('setup_user_id', new_setup_user_id);
      }
    }
    if(_this.get('user_id')) {
      if(_this.get('user_id') != _this.get('setup_user.id')) {
        _this.set('other_user', {loading: true});
        _this.set('setup_user', null);
        _this.appState.set('setup_user', null);
        LingoLinq.store.findRecord('user', _this.get('user_id')).then(function(user) {
          if(user.get('permissions.edit')) {
            _this.set('other_user', null);
            _this.set('setup_user', user);  
            _this.appState.set('setup_user', user);
          } else {
            if(_this.appState && _this.appState.controller) {
              _this.appState.controller.set('setup_user_id', null);
            }
            _this.set('other_user', {error: true, user_id: _this.get('user_id')});  
          }
        }, function(err) {
          if(_this.appState && _this.appState.controller) {
            _this.appState.controller.set('setup_user_id', null);
          }
          _this.set('other_user', {error: true, user_id: _this.get('user_id')});
        });  
      }
    } else {
      _this.set('other_user', null);
      _this.set('setup_user', _this.appState.get('currentUser') || _this.get('fake_user'));
      _this.appState.set('setup_user', _this.appState.get('currentUser'));
    }
    if(_this.get('setup_user')) {
      _this.set('cell', _this.get('setup_user.cell_phone'));
      ['vocalize_buttons', 'vocalize_linked_buttons', 'auto_home_return'].forEach(function(pref) {
        _this.set(pref, _this.get('setup_user.preferences.' + pref));
      });

      if(_this.get('page') == 'symbols' && _this.get('setup_user').find_integration) {
        _this.get('setup_user').find_integration('lessonpix').then(function(res) {
          _this.set('lessonpix_enabled', true);
        }, function(err) { });
      }
    }
    if(_this.appState && _this.appState.controller) {
      var new_setup_page = _this.get('page');
      if(_this.appState.controller.get('setup_page') !== new_setup_page) {
        _this.appState.controller.set('setup_page', new_setup_page);
      }
    }
    if(_this.get('page') != 'board_category') {
      _this.set('advanced', false);
    }
    speecher.stop('all');
    _this.set('reading', false);
    if(_this.get('reading_enabled')) {
      runLater(function() {
        _this.read_step();
      }, 500);
    }
    if(pageOrUserChanged) {
      $('html,body').scrollTop(0);
    }
  }),
  read_step: function() {
    var _this = this;
    var prompts = [];
    $("#setup_container .prompt").each(function() {
      var sentences = this.innerText.split(/\.\s/);
      sentences.forEach(function(s) {
        if(s) {
          s = s + ".";
          var more_splits = s.split(/\?\s/);
          more_splits.forEach(function(t) {
            prompts.push({text: t + "?"});
          })
        }
      })
      prompts.push({wait: 500});
    });
    console.log("prompt", prompts);
    speecher.stop('all');
    _this.set('reading', true);
    speecher.speak_collection(prompts, "setup-prompt" + Math.random()).then(function() {
      _this.set('reading', false);
    }, function() {
      if(speecher.speaking_from_collection && speecher.speaking_from_collection.match(/^setup-prompt/)) {
      } else {
        _this.set('reading', false);
      }
    });
  },
  already_have_board: computed('setup_user.preferences.home_board', 'do_find_board', function() {
    return this.get('setup_user.preferences.home_board') && !this.get('do_find_board');
  }),
  _save_user_timer: null,
  _pending_utterance_text_only: null,
  _schedule_user_save: function(user) {
    var _this = this;
    if(this._save_user_timer) {
      runCancel(this._save_user_timer);
    }
    this._save_user_timer = runLater(function() {
      _this._save_user_timer = null;
      _this._do_user_save(user);
    }, 400);
  },
  _do_user_save: function(user) {
    var _this = this;
    if(!user || !user.save) { return; }
    // Snapshot preferences before save so we can restore after server response
    var prefsSnapshot = JSON.parse(JSON.stringify(user.get('preferences') || {}));
    if(this.appState && this.appState.controller) {
      this.appState.controller.set('footer_status', {message: i18n.t('updating_user', "Updating User...")});
    }
    user.save().then(function() {
      // Server response may have overwritten in-memory changes made while
      // the save was in flight. Re-apply the snapshot to preserve them.
      var serverPrefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
      var merged = JSON.parse(JSON.stringify(serverPrefs));
      // Merge device preferences from snapshot over server response
      merged.device = Object.assign({}, serverPrefs.device || {}, prefsSnapshot.device || {});
      // Merge top-level preferences from snapshot
      var topKeys = ['preferred_symbols', 'high_contrast', 'auto_home_return', 'skin'];
      topKeys.forEach(function(key) {
        if(prefsSnapshot[key] !== undefined) {
          merged[key] = prefsSnapshot[key];
        }
      });
      var changed = JSON.stringify(merged) !== JSON.stringify(serverPrefs);
      if(changed) {
        user.set('preferences', merged);
        user.notifyPropertyChange('preferences');
      }
      _this.set('_pending_utterance_text_only', null);
      _this.set('_pending_symbol_background', null);
      _this.set('_pending_access', null);
      _this.set('_pending_home_return', null);
      runLater(function() {
        if(_this.appState && _this.appState.controller && !_this._save_user_timer) {
          _this.appState.controller.set('footer_status', null);
        }
      }, 150);
    }, function(err) {
      // On error, restore snapshot so UI stays consistent
      user.set('preferences', prefsSnapshot);
      user.notifyPropertyChange('preferences');
      _this.set('_pending_utterance_text_only', null);
      _this.set('_pending_symbol_background', null);
      _this.set('_pending_access', null);
      _this.set('_pending_home_return', null);
      if(_this.appState && _this.appState.controller) {
        _this.appState.controller.set('footer_status', {error: i18n.t('error_updating_user', "Error Updating User")});
      }
    });
  },
  flush_pending_save: function() {
    var user = this.get('setup_user') || this.get('fake_user');
    if(this._save_user_timer && user && user.save) {
      runCancel(this._save_user_timer);
      this._save_user_timer = null;
      this._do_user_save(user);
    } else if(this._save_user_timer) {
      runCancel(this._save_user_timer);
      this._save_user_timer = null;
    }
  },
  actions: {
    noop: function() {

    },
    close_board_layout: function() {
      var _this = this;
      var board_key = this.appState.get('board_layout_mode');
      if (board_key) {
        var parts = board_key.split('/');
        if (parts.length === 2) {
          this.router.transitionTo('user.board-detail.edit', parts[0], parts[1]).then(function() {
            _this.appState.set('board_layout_mode', null);
          });
        } else {
          this.appState.set('board_layout_mode', null);
          this.router.transitionTo('index');
        }
      } else {
        this.appState.set('board_layout_mode', null);
        this.router.transitionTo('index');
      }
    },
    setup_go: function(direction) {
      var ctrl = this.appState && this.appState.get('controller');
      if(ctrl && typeof ctrl.send === 'function') {
        ctrl.send('setup_go', direction);
      }
    },
    find_new_board: function() {
      this.set('do_find_board', true);
    },
    set_preference: function(preference, value) {
      var user = this.get('setup_user') || this.get('fake_user');
      if(preference == 'access') {
        this.set('_pending_access', value);
        var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
        prefs.device = prefs.device || {};
        if(value == 'touch') {
          prefs.device.dwell = false;
          prefs.device.scanning = false;
        } else if(value == 'dwell') {
          prefs.device.dwell = true;
          prefs.device.scanning = false;
        } else if(value == 'scanning') {
          prefs.device.dwell = false;
          prefs.device.scanning = true;
        }
        user.set('preferences', prefs);
        user.notifyPropertyChange('preferences');
      } else if(preference == 'home_return') {
        this.set('_pending_home_return', value);
        var wantAutoReturn = value === 'auto_return';
        var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
        prefs.auto_home_return = wantAutoReturn;
        user.set('preferences', prefs);
        user.notifyPropertyChange('preferences');
      } else if(preference == 'preferred_symbols') {
        if(!user.get('original_preferred_symbols')) {
          user.set('original_preferred_symbols', user.get('preferences.preferred_symbols') || 'original')
        }
        user.set('preferences.' + preference, value);
        user.notifyPropertyChange('preferences');
        user.set('preferred_symbols_changed', user.get('preferred_symbols') != user.get('original_preferred_symbols'));
        this.appState.set('setup_user', user);
      } else if(preference == 'device.symbol_background') {
        this.set('_pending_symbol_background', value === 'black_with_high_contrast' ? 'black_with_high_contrast' : null);
        var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
        prefs.device = prefs.device || {};
        prefs.device.symbol_background = value === 'black_with_high_contrast' ? 'black' : value;
        prefs.high_contrast = value === 'black_with_high_contrast';
        user.set('preferences', prefs);
        user.notifyPropertyChange('preferences');
      } else if(preference == 'device.utterance_text_only') {
        this.set('_pending_utterance_text_only', value);
        var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
        prefs.device = prefs.device || {};
        prefs.device.utterance_text_only = value;
        prefs.device.updated = true;
        user.set('preferences', prefs);
        user.notifyPropertyChange('preferences');
      } else {
        if(preference.indexOf('.') !== -1) {
          var prefs = JSON.parse(JSON.stringify(user.get('preferences') || {}));
          var parts = preference.split('.');
          var target = prefs;
          for(var i = 0; i < parts.length - 1; i++) {
            var key = parts[i];
            target[key] = target[key] || {};
            target = target[key];
          }
          target[parts[parts.length - 1]] = value;
          user.set('preferences', prefs);
          user.notifyPropertyChange('preferences');
        } else {
          user.set('preferences.' + preference, value);
          user.notifyPropertyChange('preferences');
        }
      }
      var _this = this;
      if(preference == 'logging' && value === true && _this.get('setup_user')) {
        modal.open('enable-logging', {save: true, user: _this.get('setup_user')});
      }
      if(user.save) {
        // Debounce saves to avoid excessive PUT/GET when clicking through options
        _this._schedule_user_save(user);
      }
    },
    update_scroll: function(val) {
      this.set('scroll_disableable', val);
    },
    toggle_speaking: function() {
      if(this.get('reading')) {
        speecher.stop('all');
        this.set('reading_enabled', false);
        this.set('reading', false);
      } else {
        this.set('reading_enabled', true);
        this.read_step();
      }
    },
    home: function(plus_video) {
      this.appState.return_to_index();
      if(plus_video) {
        modal.open('inline-video', {video: {type: 'youtube', id: "TSlGz7g9LIs"}, hide_overlay: true});
        if(window.ga) {
          window.ga('send', 'event', 'Setup', 'video', 'Setup Video Launched');
        }
      } else {
        if(window.ga) {
          window.ga('send', 'event', 'Setup', 'exit', 'Setup Concluded');
        }
      }
    },
    test_voice: function() {
      var user = this.get('setup_user') || this.get('fake_user');
      var voice_uri = user.get('preferences.device.voice.voice_uri');
      utterance.test_voice(voice_uri, this.get('setup_user.preferences.device.voice.rate'), this.get('setup_user.preferences.device.voice.pitch'), this.get('setup_user.preferences.device.voice.volume'));
    },
    manage_supervision: function() {
      modal.open('supervision-settings', {user: this.get('setup_user')});
    },
    premium_voices: function() {
      var _this = this;
      modal.open('premium-voices', {user: this.get('setup_user')});
    },
    extra: function() {
      var _this = this;
      if(this.appState && this.appState.controller) {
        this.appState.controller.set('setup_order', order.concat(extra_order));
      }
      if(window.ga) {
        window.ga('send', 'event', 'Setup', 'extra', 'Extra Setup Pursued');
      }
      runLater(function() {
        if(_this.appState && _this.appState.controller) {
          _this.appState.controller.send('setup_go', 'forward');
        }
      });
    },
    choose_board: function() {
      if(window.ga) {
        window.ga('send', 'event', 'Setup', 'skip', 'Extra Setup Pursued');
      }
      this.router.transitionTo('home-boards');
    },
    done: function() {
      this.appState.return_to_index();
    },
    show_advanced: function() {
      this.set('advanced_mine', false);
      this.set('advanced', true);
    },
    show_mine: function() {
      this.set('advanced_mine', true);
      this.set('advanced', true);
    },
    select_board: function(board) {
      if(this.appState && this.appState.controller) {
        this.appState.controller.send('setup_go', 'forward');
      }
    },
    show_more_symbols: function() {
      this.set('showing_more_symbols', true);
    }
  }
});

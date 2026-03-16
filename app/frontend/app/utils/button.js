import EmberObject from '@ember/object';
import templateHelpers from './template_helpers';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import RSVP from 'rsvp';
import LingoLinq from '../app';
import boundClasses from './bound_classes';
import app_state from './app_state';
import modal from './modal';
import speecher from './speecher';
import utterance from './utterance';
import persistence from './persistence';
import capabilities from './capabilities';
import i18n from './i18n';
import stashes from './_stashes';
import progress_tracker from './progress_tracker';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

var clean_url = function(str) {
  str = str || "";
  return str.replace(/"/g, "%22");
};
var dom = document.createElement('div');
var clean_text = function(str) {
  str = str || "";
  if(str.cleaned) { return str; }
  dom.textContent = str;
  var res = new String(dom.innerHTML);
  res.cleaned = true;
  return res;
};

var Button = EmberObject.extend({
  init: function() {
    this.updateAction();
    this.update_add_vocalization();
    this.add_classes();
    this.set_video_url();
    this.findContentLocally();
    this.set('stashes', stashes);
  },
  init_services: function(appStateService, persistenceService, stashesService) {
    // Accept services as parameters for explicit injection
    // Fall back to imported utilities for backward compatibility
    this.appState = appStateService || app_state;
    this.persistence = persistenceService || persistence;
    this.stashes = stashesService || stashes;
    
    // Also register services statically for use in static methods
    if(appStateService || persistenceService || stashesService) {
      Button.register_services(appStateService, persistenceService, stashesService);
    }
  },
  buttonAction: 'talk',
  updateAction: observer(
    'load_board',
    'url',
    'apps',
    'integration',
    'video',
    'book',
    'link_disabled',
    function() {
      if(this.get('load_board')) {
        this.set('buttonAction', 'folder');
      } else if(this.get('integration') != null) {
        this.set('buttonAction', 'integration');
        if(this.get('integration.action_type') == 'webhook') {
          this.set('integrationAction', 'webhook');
        } else {
          this.set('integrationAction', 'render');
        }
      } else if(this.get('url') != null) {
        this.set('buttonAction', 'link');
      } else if(this.get('apps') != null) {
        this.set('buttonAction', 'app');
      } else {
        this.set('buttonAction', 'talk');
      }
    }
  ),
  update_add_vocalization: observer('add_vocalization', 'add_to_vocalization', function() {
    if(this.get('add_vocalization') === true  || this.get('add_vocalization') === false) {
      this.set('prevent_adding_to_vocalization', !this.get('add_vocalization'));
      this.set('force_add_to_vocalization', !!this.get('add_vocalization'));
    } else if(this.get('add_to_vocalization') !== null) {
      this.set('prevent_adding_to_vocalization', false);
      this.set('force_add_to_vocalization', !!this.get('add_to_vocalization'));
    }
  }),
  talkAction: computed('buttonAction', function() {
    return this.get('buttonAction') == 'talk';
  }),
  folderAction: computed('buttonAction', function() {
    return this.get('buttonAction') == 'folder';
  }),
  integrationAction: computed('buttonAction', 'integrationAction', function() {
    return this.get('buttonAction') == 'integration' && this.get('integrationAction') == 'render';
  }),
  integrationOrWebhookAction: computed('buttonAction', function() {
    return this.get('buttonAction') == 'integration';
  }),
  webhookAction: computed('buttonAction', 'integrationAction', function() {
    return this.get('buttonAction') == 'integration' && this.get('integrationAction') == 'webhook';
  }),
  action_styling: computed(
    'buttonAction',
    'home_lock',
    'book.popup',
    'video.popup',
    'action_status',
    'action_status.pending',
    'action_status.errored',
    'action_status.completed',
    'integration.action_type',
    function() {
      return Button.action_styling(this.get('buttonAction'), this);
    }
  ),
  action_class: computed('action_styling', function() {
    return htmlSafe(this.get('action_styling.action_class'));
  }),
  action_image: computed('action_styling', function() {
    return this.get('action_styling.action_image');
  }),
  action_alt: computed('action_styling', function() {
    return this.get('action_styling.action_alt');
  }),
  resource_from_url: observer('url', function() {
    var url = this.get('url');
    var resource = Button.resource_from_url(url);
    if(resource && resource.type == 'video' && resource.video_type == 'youtube') {
      if(this.get('video.id') != resource.id) {
        this.set('video', {
          type: 'youtube',
          id: resource.id,
          popup: true,
          start: "",
          end: ""
        });
      }
    } else {
      if(resource && resource.type == 'book' && resource.book_type == 'tarheel') {
        if(this.get('book.id') != resource.id) {
          this.set('book', {
            type: 'tarheel',
            id: resource.id,
            popup: true,
            speech: false,
            utterance: true,
            background: 'white',
            base_url: url,
            position: 'text_below',
            links: 'large'
          });
        }
      } else {
        this.set('book', null);
      }
      this.set('video', null);
    }
  }),
  set_book_url: observer(
    'book.popup',
    'book.type',
    'book.base_url',
    'book.id',
    'book.speech',
    'book.background',
    'book.links',
    function() {
      if(this.get('book.type') == 'tarheel' && this.get('book.popup') && this.get('book.base_url')) {
        var book = this.get('book');
        var new_url = this.get('book.base_url').split(/\?/)[0] + "?";
        if(book.speech) {
          new_url = new_url + "voice=browser";
        } else {
          new_url = new_url + "voice=silent";
        }
        if(book.background == 'black') {
          new_url = new_url + "&pageColor=000&textColor=fff";
        } else {
          new_url = new_url + "&pageColor=fff&textColor=000";
        }
        if(book.links == 'small') {
          new_url = new_url + "&biglinks=0";
        } else {
          new_url = new_url + "&biglinks=2";
        }
        this.set('book.url', new_url);
      }
    }
  ),
  set_video_url: observer(
    'video.popup',
    'video.type',
    'video.id',
    'video.start',
    'video.end',
    function() {
      if(this.get('video.type') == 'youtube' && this.get('video.popup') && this.get('video.id')) {
        var video = this.get('video');
        var new_url = "https://www.youtube.com/embed/" + video.id + "?rel=0&showinfo=0&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
        if(video.start) {
          new_url = new_url + "&start=" + video.start;
        }
        if(video.end) {
          new_url = new_url + "&end=" + video.end;
        }
        this.set('video.url', new_url + "&autoplay=1&controls=0");
        this.set('video.thumbnail_url', "https://img.youtube.com/vi/" + this.get('video.id') + "/hqdefault.jpg");
        this.set('video.thumbnail_content_type', 'image/jpeg');
        this.set('video.test_url', new_url + "&autoplay=0");
      }
    }
  ),
  videoAction: computed('buttonAction', 'video.popup', function() {
    return this.get('buttonAction') == 'link' && this.get('video.popup');
  }),
  linkAction: computed('buttonAction', function() {
    return this.get('buttonAction') == 'link';
  }),
  appAction: computed('buttonAction', function() {
    return this.get('buttonAction') == 'app';
  }),
  empty_or_hidden: computed('empty', 'hidden', 'stashes.all_buttons_enabled', function() {
    return !!(this.get('empty') || (this.get('hidden') && !this.get('stashes.all_buttons_enabled')));
  }),
  add_classes: observer(
    'background_color',
    'border_color',
    'empty',
    'hidden',
    'link_disabled',
    function() {
      boundClasses.add_rule(this);
      boundClasses.add_classes(this);
    }
  ),
  link: computed('load_board.key', function() {
    if(this.get('load_board.key')) {
      return "/" + this.get('load_board.key');
    }
    return "";
  }),
  icon: computed('load_board.key', function() {
    if(this.get('load_board.key')) {
      return "/" + this.get('load_board.key') + "/icon";
    }
    return "";
  }),
  fixed_url: computed('url', function() {
    var url = this.get('url');
    if(url && !url.match(/^http/) && !url.match(/^book:/)) {
      url = "https://" + url;
    }
    return url;
  }),
  fixed_app_url: computed('apps.web.launch_url', function() {
    var url = this.get('apps.web.launch_url');
    if(url && !url.match(/^http/)) {
      url = "https://" + url;
    }
    return url;
  }),
  levels_list: computed('level_modifications', function() {
    var levels = [];
    var mods = this.get('level_modifications') || {};
    for(var idx in mods) {
      if(parseInt(idx, 10) > 0) {
        levels.push(parseInt(idx, 10));
      }
    }
    levels = levels.sort();
    var str = "";
    if(mods.override) {
      str = "*";
    }
    if(levels.length > 0) {
      return str + "L" + levels.join(' ');
    } else {
      return str || null;
    }
  }),
  apply_level: function(level) {
    var mods = this.get('level_modifications') || {};
    var _this = this;
    var keys = ['pre'];
    for(var idx = 0; idx <= level; idx++) { keys.push(idx); }
    keys.push('override');
    keys.forEach(function(key) {
      if(mods[key]) {
        for(var attr in mods[key]) {
          _this.set(attr, mods[key][attr]);
        }
      }
    });
  },
  set_val(key, val) {
    this.set(key, val);
  },
  fast_html: computed(
    'refresh_token',
    'positioning',
    'computed_style',
    'computed_class',
    'label',
    'action_class',
    'action_image',
    'action_alt',
    'image_holder_style',
    'text_only',
    'local_image_url',
    'image_style',
    'local_sound_url',
    'sound.url',
    'hide_label',
    'level_modifications',
    'board.display_level',
    function() {
      var res = "";
      if(this.get('board.display_level') && this.get('level_modifications')) {
        if(this.get('board.display_level') == this.get('board.default_level')) {
        } else {
          var mods = this.get('level_modifications');
          var level = this.get('board.display_level');
          if(mods.override) {
            for(var key in mods.override) {
              this.set_val(key, mods.override[key]);
            }
          }
          if(mods.pre) {
            for(var key in mods.pre) {
              if(!mods.override || mods.override[key] === null || mods.override[key] === undefined) {
                this.set_val(key, mods.pre[key]);
              }
            }
          }
          for(var idx = 1; idx <= level; idx++) {
            if(mods[idx]) {
              for(var key in mods[idx]) {
                if(!mods.override || mods.override[key] === null || mods.override[key] === undefined) {
                  this.set_val(key, mods[idx][key]);
                }
              }
            }
          }
        }
      }
      res = res + "<a href='#' style='" + this.get('computed_style') + "' class='" + this.get('computed_class') + "' data-id='" + this.get('id') + "' tabindex='0'>";
      if(this.get('pending')) {
        res = res + "<div class='pending'><img src='" + templateHelpers.path('images/spinner.gif') + "' draggable='false' /></div>";
      }
      res = res + "<div class='" + this.get('action_class') + "'>";
      res = res + "<span class='action'>";
      res = res + "<img src='" + this.get('action_image') + "' alt='" + this.get('action_alt') + "' draggable='false' />";
      res = res + "</span>";
      res = res + "</div>";

      var appState = this.appState || app_state;
      res = res + "<span style='" + this.get('image_holder_style') + "'>";
      if(!appState.get('currentUser.hide_symbols') && this.get('local_image_url') && !this.get('board.text_only') && !this.get('text_only')) {
        res = res + "<img src=\"" + clean_url(this.get('local_image_url')) + "\" rel=\"" + clean_url(this.get('original_image_url') || this.get('image.url')) + "\" onerror='button_broken_image(this);' draggable='false' style='" + this.get('image_style') + "' class='symbol" + (this.get('hc_image') ? ' hc' : '') + "' />";
      }
      res = res + "</span>";
      if(this.get('sound')) {
        res = res + "<audio style='display: none;' preload='auto' src=\"" + clean_url(this.get('local_sound_url')) + "\" rel=\"" + clean_url(this.get('sound.url')) + "\"></audio>";
      }
      var button_class = this.get('text_only') ? appState.get('text_only_button_symbol_class') : appState.get('button_symbol_class');
      var txt = clean_text(this.get('label'));
      var text_style = '';
      var holder_style = '';
      if(this.get('text_only')) {
        // TODO: use correct font family
        var fit = capabilities.fit_text(txt, this.get('positioning.font_family') || 'Arial', this.get('positioning.width'), this.get('positioning.height'), 10);
        if(fit.any_fit) {
          text_style = "style='font-size: " + fit.size + "px;'";
          holder_style = "style='position: absolute;'";
        }
      }
      res = res + "<div class='" + button_class + "' " + holder_style + ">";
      res = res + "<span " + text_style + " class='" + (this.get('hide_label') ? "button-label hide-label" : "button-label") + "'>" + txt + "</span>";
      res = res + "</div>";

      res = res + "</a>";
      return htmlSafe(res);
    }
  ),
  image_holder_style: computed(
    'positioning',
    'positioning.image_height',
    'positioning.image_top_margin',
    'positioning.image_square',
    'text_only',
    function() {
      var pos = this.get('positioning');
      return htmlSafe(Button.image_holder_style(pos, this.get('text_only')));
    }
  ),
  image_style: computed(
    'positioning',
    'positioning.image_height',
    'positioning.image_square',
    function() {
      var pos = this.get('positioning');
      return htmlSafe(Button.image_style(pos));
    }
  ),
  computed_style: computed(
    'positioning',
    'positioning.height',
    'positioning.width',
    'positioning.left',
    'positioning.top',
    function() {
      var pos = this.get('positioning');
      if(!pos) { return htmlSafe(""); }
      return Button.computed_style(pos);
    }
  ),
  computed_class: computed('display_class', 'board.text_size', 'for_swap', function() {
    var res = this.get('display_class') + " ";
    if(this.get('board.text_size')) {
      res = res + this.get('board.text_size') + " ";
    }
    if(this.get('for_swap')) {
      res = res + "swapping ";
    }
    return res;
  }),
  pending: computed('pending_image', 'pending_sound', function() {
    return this.get('pending_image') || this.get('pending_sound');
  }),
  everything_local: function() {
    if(this.image_id && this.image_url && persistence.url_cache && persistence.url_cache[this.image_url] && (!persistence.url_uncache || !persistence.url_uncache[this.image_url])) {
    } else if(this.image_id && !this.get('image')) {
      var rec = LingoLinq.store.peekRecord('image', this.image_id);
      if(!rec || !rec.get('isLoaded')) { /* console.log("missing image for", this.get('label')); */ return false; }
    }
    if(this.sound_id && this.sound_url && persistence.url_cache && persistence.url_cache[this.sound_url] && (!persistence.url_uncache || !persistence.url_uncache[this.sound_url])) {
    } else if(this.sound_id && !this.get('sound')) {
      var rec = LingoLinq.store.peekRecord('sound', this.sound_id);
      if(!rec || !rec.get('isLoaded')) { /* console.log("missing sound for", this.get('label')); */ return false; }
    }
    return true;
  },
  load_image: function(preference) {
    var _this = this;
    if(!_this.image_id) { return RSVP.resolve(); }
    var image = LingoLinq.store.peekRecord('image', _this.image_id);
    if(image && (!image.get('isLoaded') || !image.get('best_url'))) { image = null; }
    if(preference == 'remote' && image && !image.get('permissions')) { image = null; }
    _this.set('image', image);
    if(image && image.get('hc')) { _this.set('hc_image', true); }
    var check_image = function(image) {
      var best = image.get('best_url');
      if(best && (best.match(/^https?:\/\//) || best.match(/^data:/) || best.match(/^blob:/))) {
        _this.set('local_image_url', best);
      }
      _this.set('original_image_url', image.get('url'));
      if(image.get('hc')) { _this.set('hc_image', true); }
      return image.checkForDataURL().then(function() {
        var url = image.get('best_url');
        if(url && (url.match(/^https?:\/\//) || url.match(/^data:/) || url.match(/^blob:/))) {
          _this.set('local_image_url', url);
        }
        return image;
      }, function() { return RSVP.resolve(image); });
    };
    if(!image) {
      var image_urls = this.get('board.image_urls');
      var hc = (_this.get('board.hc_image_ids') || {})[_this.image_id];
      if(hc) { _this.set('hc_image', true); }
      var url_val = (image_urls && image_urls[_this.image_id]) ? image_urls[_this.image_id] : _this.image_url;
      if(url_val && preference != 'remote') {
        var looks_like_url = (typeof url_val === 'string') && (url_val.match(/^https?:\/\//) || url_val.match(/^data:/));
        if(looks_like_url) {
          var img = LingoLinq.store.peekRecord('image', _this.image_id);
          if(!img) {
            img = LingoLinq.store.createRecord('image', {
              url: url_val
            });
            img.set('id', _this.image_id);
            img.set('incomplete', true);
            var alts = null;
            for(var key in image_urls) {
              if(key.match(_this.image_id + '-')) {
                var lib = key.split(/-/).pop();
                alts = alts || [];
                alts.push({library: lib, url: image_urls[key]});
              }
            }
            if(alts) { img.set('alternates', alts); }
          }
          _this.set('image', img);
          return check_image(img);
        }
      }
      if(_this.get('no_lookups')) {
        return RSVP.reject('no image lookups');
      } else {
        if(!(_this.image_id || '').match(/^tmp/) && preference != 'remote') {
          console.warn("had to revert to image record lookup");
        }
        var find = LingoLinq.store.findRecord('image', _this.image_id).then(function(image) {
          _this.set('image', image);
          if(image.get('incomplete')) {
            image.reload().then(function() {
              check_image(image);
            }, function(err) { });
          }
          return check_image(image);
        });
        if(preference == 'local') {
          return RSVP.reject('no image lookups');
        } else {
          return find;
        }
      }
    } else {
      if(!image.get('incomplete')) {
        console.info("used retrieved image", image.get('url'));
      }
      return check_image(image);
    }
  },
  update_local_image_url: observer('image.best_url', function() {
    var best = this.get('image.best_url');
    if(best && (best.match(/^https?:\/\//) || best.match(/^data:/) || best.match(/^blob:/))) {
      this.set('local_image_url', best);
    }
  }),
  load_sound: function(preference) {
    var _this = this;
    if(!_this.sound_id) { return RSVP.resolve(); }
    var sound = LingoLinq.store.peekRecord('sound', _this.sound_id);
    if(sound && (!sound.get('isLoaded') || !sound.get('best_url'))) { sound = null; }
    _this.set('sound', sound);
    var check_sound = function(sound) {
      _this.set('local_sound_url', sound.get('best_url'));
      return sound.checkForDataURL().then(function() {
        _this.set('local_sound_url', sound.get('best_url'));
        return sound;
      }, function() { return RSVP.resolve(sound); });
    };
    if(!sound) {
      var sound_urls = _this.get('board.sound_urls');
      if(sound_urls && sound_urls[_this.sound_id] && preference != 'remote') {
        var snd = LingoLinq.store.createRecord('sound', {
          url: sound_urls[_this.sound_id]
        })
        snd.set('id', _this.sound_id);
        snd.set('incomplete', true);
        _this.set('sound', snd);
        return check_sound(snd);
      }
      if(_this.get('no_lookups')) {
        return RSVP.reject('no sound lookups');
      } else {
        var find = LingoLinq.store.findRecord('sound', _this.sound_id).then(function(sound) {
          _this.set('sound', sound);
          return check_sound(sound);
        });
        if(preference == 'local') {
          return RSVP.reject('no sound lookups');
        } else {
          return find;
        }
      }
    } else {
      return check_sound(sound);
    }
  },
  update_local_sound_url: observer('image.best_url', function() {
    if(this.get('sound.best_url')) {
      this.set('local_sound_url', this.get('sound.best_url'));
    }
  }),
  update_translations: observer('translations_hash', 'label', 'vocalization', function() {
    var appState = this.appState || app_state;
    var label_locale = appState.get('label_locale') || this.get('board.translations.current_label') || this.get('board.locale') || 'en';
    var vocalization_locale = appState.get('vocalization_locale') || this.get('board.translations.current_vocalization') || this.get('board.locale') || 'en';
    var _this = this;
    var res = _this.get('translations') || [];
    var hash = _this.get('translations_hash') || {};
    var idx = 0;
    for(var code in hash) {
      if(Object.keys(hash[code]).length > 0 || !code.match(/-|_/) || code == label_locale) {
        var label = hash[code].label || this.get('label');
        if(label_locale == code) { label = _this.get('label'); }
        var vocalization = hash[code].vocalization;
        if(vocalization_locale == code) { vocalization = _this.get('vocalization'); }
        var inflections = hash[code].inflections;
        var rules = hash[code].rules;
        if(res[idx]) {
          emberSet(res[idx], 'label', label);
          emberSet(res[idx], 'vocalization', vocalization);
          emberSet(res[idx], 'inflections', inflections);
          emberSet(res[idx], 'rules', rules);
        } else {
          res.push({
            code: code,
            locale: code,
            label: label,
            inflections: inflections,
            vocalization: vocalization,
            rules: rules
          });
        }
        idx++;
      }
    }
    this.set('translations', res);
  }),
  update_settings_from_translations: observer(
    'translations.@each.label',
    'translations.@each.vocalization',
    function() {
      var appState = this.appState || app_state;
      var label_locale = appState.get('label_locale') || this.get('board.translations.current_label') || this.get('board.locale') || 'en';
      var vocalization_locale = appState.get('vocalization_locale') || this.get('board.translations.current_vocalization') || this.get('board.locale') || 'en';
      var _this = this;
      (this.get('translations') || []).forEach(function(locale) {
        if(locale.code == label_locale && locale.label) {
          _this.set('label', locale.label);
        }
        if(locale.code == vocalization_locale && locale.vocalization) {
          _this.set('vocalization', locale.vocalization);
        }
      });
    }
  ),
  findContentLocally: observer('image_id', 'sound_id', function() {
    var _this = this;
    if((!this.image_id || this.get('local_image_url')) && (!this.sound_id || this.get('local_sound_url'))) {
      _this.set('content_status', 'ready');
      return RSVP.resolve(true);
    }
    this.set('content_status', 'pending');
    if(!_this.image_url && _this.get('board') && _this.image_id) {
      _this.image_url = (_this.get('board.image_urls') || {})[_this.image_id];
    }
    if(!_this.sound_url && _this.get('board') && _this.sound_id) {
      _this.sound_url = (_this.get('board.sound_urls') || {})[_this.sound_id];
    }
    return new RSVP.Promise(function(resolve, reject) {
      var promises = [];
      if(_this.image_id && _this.image_url && persistence.url_cache && persistence.url_cache[_this.image_url] && (!persistence.url_uncache || !persistence.url_uncache[_this.image_url])) {
        var unvarianted_image_url = _this.image_url.replace(/\.variant-.+\.(png|svg)$/, '');
        _this.set('local_image_url', persistence.url_cache[_this.image_url] || persistence.url_cache[unvarianted_image_url]);
        _this.set('original_image_url', _this.image_url);
        promises.push(RSVP.resolve());
      } else if(_this.image_id) {
        if(_this.image_url && (_this.image_url.match(/^https?:\/\//) || _this.image_url.match(/^data:/))) {
          _this.set('local_image_url', _this.image_url);
          _this.set('original_image_url', _this.image_url);
        }
        promises.push(_this.load_image('local'));
      }
      if(_this.sound_id && _this.sound_url && persistence.url_cache && persistence.url_cache[_this.sound_url] && (!persistence.url_uncache || !persistence.url_uncache[_this.sound_url])) {
        _this.set('local_sound_url', persistence.url_cache[_this.sound_url]);
        _this.set('original_sound_url', _this.sound_url);
        promises.push(RSVP.resolve());
      } else if(_this.sound_id) {
        promises.push(_this.load_sound('local'));
      }

      RSVP.all(promises).then(function() {
        _this.set('content_status', 'ready');
        resolve(true);
      }, function(err) {
        if(_this.get('no_lookups')) {
          _this.set('content_status', 'missing');
        } else {
          _this.set('content_status', 'errored');
        }
        resolve(false);
        return RSVP.resolve();
      });

      promises.forEach(function(p) { p.then(null, function() { }); });
    });
  }),
  check_for_parts_of_speech: function() {
    var appState = this.appState || app_state;
    var persistenceService = this.persistence || persistence;
    if(appState.get('edit_mode') && !this.get('empty') && this.get('label')) {
      var text = this.get('vocalization') || this.get('label');
      var _this = this;
      persistenceService.ajax('/api/v1/search/parts_of_speech', {type: 'GET', data: {q: text}}).then(function(res) {
        if(!_this.get('background_color') && !_this.get('border_color') && res && res.types) {
          var found = false;
          _this.set('parts_of_speech_matching_word', res.word);
          res.types.forEach(function(type) {
            if(!found) {
              LingoLinq.keyed_colors.forEach(function(color) {
                if(!found && color.types && color.types.indexOf(type) >= 0) {
                  _this.set('background_color', color.fill);
                  _this.set('border_color', color.border);
                  _this.set('part_of_speech', type);
                  _this.set('suggested_part_of_speech', type);
                  boundClasses.add_rule(_this);
                  boundClasses.add_classes(_this);
                  found = true;
                }
              });
            }
          });
        }
      }, function() { });
    }
  },
  raw: function() {
    var attrs = [];
    var ret = {};
    for(var key in this) {
      if (!this.hasOwnProperty(key)) { continue; }

      // Prevents browsers that don't respect non-enumerability from
      // copying internal Ember properties
      if (key.substring(0,2) === '__') { continue; }

      if (this.constructor.prototype[key]) { continue; }

      if (Button.attributes.includes(key)) {
        ret[key] = this.get(key);
      }
    }
    return ret;
  }
});
Button.attributes = ['label', 'background_color', 'border_color', 'image_id', 'sound_id', 'load_board',
            'hide_label', 'completion', 'hidden', 'link_disabled', 'vocalization', 'url', 'apps',
            'integration', 'video', 'book', 'part_of_speech', 'external_id', 'add_to_vocalization',
            'add_vocalization', 'text_only', 'no_skin',
            'home_lock', 'blocking_speech', 'level_modifications', 'inflections', 'ref_id', 'rules'];

// Static service registry for use in static methods
Button._services = {
  appState: null,
  persistence: null,
  stashes: null
};
Button.register_services = function(appStateService, persistenceService, stashesService) {
  if(appStateService) { Button._services.appState = appStateService; }
  if(persistenceService) { Button._services.persistence = persistenceService; }
  if(stashesService) { Button._services.stashes = stashesService; }
};
Button.get_app_state = function() {
  return Button._services.appState || app_state;
};
Button.get_persistence = function() {
  return Button._services.persistence || persistence;
};
Button.get_stashes = function() {
  return Button._services.stashes || stashes;
};

Button.style = function(style) {
  var res = {};

  style = style || "";
  if(style.match(/caps$/)) {
    res.upper = true;
  } else if(style.match(/small$/)) {
    res.lower = true;
  }
  res.font_family = "serif";
  res.font_class = 'serif';
  if(style.match(/^comic_sans/)) {
    res.font_class = "comic_sans";
    res.font_family = "Comic Sans MS";
  } else if(style.match(/open_dyslexic/)) {
    res.font_class = "open_dyslexic";
    res.font_family = "OpenDyslexic";
  } else if(style.match(/arial/)) {
    res.font_class = "arial";
    res.font_family = "Arial";
  } else if(style.match(/architects_daughter/)) {
    res.font_class = "architects_daughter";
    res.font_family = "ArchitectsDaughter";
  }

  return res;
};

Button.computed_style = function(pos) {
    var str = "";
    if(pos && pos.top !== undefined && pos.left !== undefined) {
      str = str + "position: absolute;";
      str = str + "left: " + pos.left + "px;";
      str = str + "top: " + pos.top + "px;";
    }
    if(pos.width) {
      str = str + "width: " + Math.max(pos.width, 20) + "px;";
    }
    if(pos.height) {
      str = str + "height: " + Math.max(pos.height, 20) + "px;";
    }
    return htmlSafe(str);
};
Button.action_styling = function(action, button) {
  if(!action) {
    if(button.load_board) {
      action = 'folder';
    } else if(button.url != null) {
      action = 'link';
    } else if(button.apps != null) {
      action = 'app';
    } else if(button.integration != null) {
      if(button.integration.action_type == 'webhook') {
        action = 'webhook';
      } else {
        action = 'integration';
      }
    } else {
      action = 'talk';
    }
  } else if(action == 'integration' && button.integration && button.integration.action_type == 'webhook') {
    action = 'webhook'
  }
  var res = {};
  res.action_class = 'action_container ';
  if(action) { res.action_class = res.action_class + action + " "; }
  if(button.home_lock) { res.action_class = res.action_class + "home "; }

  var path = templateHelpers.path;
  if(action == 'folder') {
    if(button.home_lock) {
      res.action_image = path('images/folder_home.png');
    } else {
      res.action_image = path('images/folder.png');
    }
  } else if(action == 'integration' || action == 'webhook') {
    var state = button.action_status || {};
    if(button.integration && button.integration.action_type == 'render') {
      res.action_image = path('images/folder_integration.png');
    } else if(state.pending) {
      res.action_image = path('images/clock.png');
      res.action_class = res.action_class + "pending ";
    } else if(state.errored) {
      res.action_image = path('images/error.png');
      res.action_class = res.action_class + "errored ";
    } else if(state.completed) {
      res.action_image = path('images/check.png');
      res.action_class = res.action_class + "succeeded ";
    } else {
      res.action_image = path('images/action.png');
      res.action_class = res.action_class + "ready ";
    }
  } else if(action == 'talk') {
    res.action_image = path('images/talk.png');
  } else if(action == 'link') {
    if(button.video && button.video.popup) {
      res.action_image = path('images/video.svg');
    } else if(button.book && button.book.popup) {
      res.action_image = path('images/book.svg');
    } else {
      res.action_image = path('images/link.png');
    }
  } else if(action == 'app') {
    res.action_image = path('images/app.png');
  } else {
    res.action_image = path('images/unknown_action.png');
  }

  if(action == 'folder') {
    res.action_alt = i18n.t('folder_lower', "folder");
  } else if(action == 'talk') {
    res.action_alt = i18n.t('talk_lower', "talk");
  } else if(action == 'link') {
    if(button.video && button.video.popup) {
      res.action_alt = i18n.t('video_lower', "video");
    } else if(button.book && button.book.popup) {
      res.action_alt = i18n.t('book_lower', "book");
    } else {
      res.action_alt = i18n.t('link_lower', "link");
    }
  } else if(action == 'app') {
    res.action_alt = i18n.t('app_lower', "app");
  } else if(action == 'integration') {
    res.action_alt = i18n.t('integration_lower', "integration");
  } else {
    res.action_alt = i18n.t('unknown_action_lower', "unknown action");
  }

  return res;
};
Button.image_holder_style = function(pos, text_only) {
  if(!pos || !pos.image_height) { return ""; }
  return "margin-top: " + (text_only ? 0 : pos.image_top_margin) + "px; vertical-align: top; display: inline-block; width: " + pos.image_square + "px; height: " + pos.image_height + "px; line-height: " + pos.image_height + "px;";
};
Button.image_style = function(pos) {
  if(!pos || !pos.image_height) { return ""; }
  return "width: 100%; vertical-align: middle; max-height: " + pos.image_square + "px;";
};
Button.clean_url = function(str) { return clean_url(str); };

Button.button_styling = function(button, board, pos) {
  var res = {};
  res.button_class = emberGet(button, 'display_class');
  if(board.get('text_size')) {
    res.button_class = res.button_class + " " + board.get('text_size') + " ";
  }
  // TODO: sanitize all these for safety?
  res.button_style = Button.computed_style(pos);
  var action = Button.action_styling(null, button);
  res.action_class = action.action_class; //"action_container talk"; // TODO
  res.action_image = action.action_image; //templateHelpers.path('images/folder.png'); // TODO
  var style = Button.style(res.button_class);
  res.font_family = style.font_family;
  res.action_alt = action.action_alt; //"alt"; // TODO
  res.image_holder_style = Button.image_holder_style(pos, emberGet(button, 'text_only'));
  res.image_style = Button.image_style(pos);
  res.label = clean_text(button.label);

  return res;
};

Button.broken_image = function(image, skip_server_reattempt) {
  image.already_broken = image.already_broken || {};
  if(image.already_broken[image.src]) { return; }
  if(capabilities.installed_app && image.src && image.src.match(/localhost/) && !skip_server_reattempt) {
    // Apparently the local server just returns a blank response
    // sometimes, even though there's data there
    var tmp_image = new Image();
    tmp_image.onload = function() {
      tmp_image.done = true;
      // Got an error cached
      image.src = tmp_image.src;
    };
    tmp_image.onerror = function() {
      if(tmp_image.done) { return; }
      tmp_image.done = true;
      Button.broken_image(image, true);
    };
    setTimeout(function() {
      if(tmp_image.done) { return; }
      tmp_image.done = true;
      Button.broken_image(image, true);
    }, 2000);
    tmp_image.src = capabilities.storage.fix_url(image.src, false) + "?cr=" + Math.random();
    return;
  }
  image.already_broken[image.src] = true;
  var original_fallback = templateHelpers.path('images/square.svg');
  var fallback = original_fallback;
  var error_listen = function(img, callback) {
    if(!img) { return; }
    img.setAttribute('onerror', '');
    if(img.error_listener) {
      img.removeEventListener('error', img.error_listener);
      img.error_listener = null;
    }
    if(callback) {
      img.error_listener = callback;
      img.addEventListener('error', img.error_listener);
    }
  };
  error_listen(image, null);
  if(image.src && image.src != fallback && !image.src.match(/^data/)) {
    var bad_src = image.src;
    LingoLinq.track_error("bad image url: " + bad_src);
    if(!image.getAttribute('rel-url')) {
      image.setAttribute('rel-url', image.src);
    }
    image.classList.add('broken_image');
    var original_error = function() { };
    if(image.getAttribute('data-fallback')) {
      var original_fallback = fallback;
      fallback = image.getAttribute('data-fallback');
      original_error = function() {
        LingoLinq.track_error("failed to retrieve defined fallback:" + fallback);
        image.src = original_fallback;
        if(find_fallback) {
          find_fallback();
        }
      };
    } else {
      LingoLinq.track_error("bad data uri or fallback: " + bad_src);
      original_error = function() {
        LingoLinq.track_error("failed to retrieve image:" + fallback + " - " + image.src);
      };
    }
    error_listen(image, original_error);
    if(window.cordova && window.cordova.file && window.cordova.file.dataDirectory) {
      LingoLinq.track_error("image failure on app, current directory:\n" + window.cordova.file.dataDirectory);
      LingoLinq.track_error("tried to load:\n" + image.src);
    }
    image.src = fallback;
    var find_fallback = function() {
      error_listen(image, null);
      image.src = fallback;
      persistence.find_url(fallback).then(function(data_uri) {
        if(image.src == fallback) {
          error_listen(image, function() {
            LingoLinq.track_error("failed to render local image fallback");
          });
          image.src = data_uri;
        }

        var now = (new Date()).getTime() / 1000;
        if((now - persistence.get('last_sync_at')) < (1 * 24 * 60 * 60)) {
          if(image.classList.contains('symbol') && !Button.image_fail_reported) {
            Button.image_fail_reported = true;
  
            var error = {
              error: 'image_failed',
              type: 'image_failed',
              url: bad_src,
              sync_stale: now - persistence.get('last_sync_at')
            };
            stashes.log(error);
          }  
        }
      }, function() {
        if(fallback != original_fallback) {
          LingoLinq.track_error("failed to find local image fallback:\n" + image.getAttribute('rel'));
        }
      });  
    };

    if(!(bad_src || '').match(/^http/) && (image.getAttribute('data-fallback') || '').match(/^http/)) {
      var fb = image.getAttribute('data-fallback');
      error_listen(image, function() {
        if(image.src == fb) {
          LingoLinq.track_error("failed to load remote alternate after local version failed");
          find_fallback();
        }
      });
      image.src = fb;
    }
    // try to recover from files disappearing from local storage
    var store_key = function(key) {
      persistence.url_cache[key] = false;
      persistence.store_url(key, 'image', false, true).then(function(data) {
        error_listen(image, function() {
          error_listen(image, original_error);
          image.src = key;
        });
        image.src = data.local_url || data.data_uri;
      }, function() {
        // Error handling for bad image URLs should be handled
        // by error catches, this is just to note that the file store failed
        LingoLinq.track_error("failed to store cached local image:\n" + key);
      });
    };
    if(bad_src.match(/^file/) || bad_src.match(/^localhost/)) {
      LingoLinq.track_error("missing expected local image:\n" + bad_src);
      var found = false;
      for(var key in persistence.url_cache) {
        if(!found && bad_src == persistence.url_cache[key] && persistence.get('online')) {
          error_listen(image, function() {
            if(image.src == key) {
              LingoLinq.track_error("failed on remote source from cached local image:\n" + key + "\n" + bad_src);
              find_fallback();
            }
          });
          // If the image was local but not found, but you have a remote
          // URL, then try loading that and then trying to save it locally
          image.src = key;
          store_key(key);
          found = true;
        }
      }
      if(!found) {
        find_fallback();
      }
    } else {
      // Look for local references
      persistence.find_url(bad_src).then(function(data_uri) {
        if(!data_uri) {
          store_key(key);
        } else {
          if(image.getAttribute('rel') == bad_src) {
            error_listen(image, function() {
              LingoLinq.track_error("failed to retrieve cached image:\n" + image.src + "\n" + bad_src);
              find_fallback();
            });
            image.src = data_uri;
          } else {
            LingoLinq.track_error("image changed while looking up fallback");
            find_fallback();
          }
        }
      }, function() {
        LingoLinq.track_error("no local copy found, trying fallback", bad_src, fallback);
        find_fallback();
      });
    }
  }
};


var youtube_regex = (/(?:https?:\/\/)?(?:www\.)?youtu(?:be\.com\/watch\?(?:.*?&(?:amp;)?)?v=|\.be\/)([\w \-]+)(?:&(?:amp;)?[\w\?=]*)?/);
var tarheel_reader_regex = (/(?:https?:\/\/)?(?:www\.)?tarheelreader\.org\/\d+\/\d+\/\d+\/([\w-]+)\/?/);
var book_regex = (/^book:(https?:\/\/.+)$/);
Button.resource_from_url = function(url) {
  var youtube_match = url && url.match(youtube_regex);
  var tarheel_match = url && url.match(tarheel_reader_regex);
  var book_match = url && url.match(book_regex);
  var youtube_id = youtube_match && youtube_match[1];
  var tarheel_id = tarheel_match && tarheel_match[1];
  var book_id = book_match && book_match[1];
  if(book_id && book_id.match(/www\.dropbox\.com/) && book_id.match(/\?dl=0$/)) {
    book_id = book_id.replace(/\?dl=0$/, '?dl=1');
  }
  if(youtube_id) {
    return {
      type: 'video',
      video_type: 'youtube',
      id: youtube_id
    };
  } else {
    var book_or_tarheel_id = tarheel_id || book_id;
    if(book_or_tarheel_id) {
      return {
        type: 'book',
        book_type: 'tarheel',
        id: book_or_tarheel_id
      };
    }
  }
  return null;
};
Button.set_attribute = function(button, attribute, value) {
  emberSet(button, attribute, value);
  var mods = emberGet(button, 'level_modifications');
  if(!mods) { return; }
  var mods = $.extend({}, mods || {});
  for(var key in mods) {
    var preset_key = parseInt(key, 10) > 0 || key == 'pre'
    if(preset_key && mods[key] && mods[key][attribute] != undefined) {
      mods.override = $.extend({}, mods.override);
      mods.override[attribute] = value;
    }
  }
  emberSet(button, 'level_modifications', mods);
};

Button.extra_actions = function(button) {
  if(button && button.integration && button.integration.action_type == 'webhook') {
    var action_state_id = Math.random();
    var update_state = function(obj) {
     if(!button.get('action_status') || button.get('action_status.state') == action_state_id) {
        if(obj) {
          obj.state = action_state_id;
        }
        button.set('action_status', obj);
        // Necessary to do fast-html caching
        runLater(function() {
          var $button = $(".board[data-id='" + board_id + "']").find(".button[data-id='" + button.get('id') + "']");
          if($button.length) {
            $button.find(".action_container").removeClass('pending').removeClass('errored').removeClass('succeeded');
            if(obj && obj.pending) {
              $button.find(".action_container").addClass('pending');
            } else if(obj && obj.errored) {
              $button.find(".action_container").addClass('errored');
            } else if(obj && obj.completed) {
              $button.find(".action_container").addClass('succeeded');
            }
          }
        }, 100);
        if(obj && (obj.errored || obj.completed)) {
          runLater(function() {
            update_state(null);
          }, 10000);
        }
     }
    };

    if(button.integration.local_url) {
      // Local URLs can be requested by the device, instead of as a webhook
      update_state(null);
      update_state({pending: true});
      var url = button.integration.local_url || "https://www.example.com";
      url = url.replace(/\{code\}/g, encodeURIComponent(button.integration.action));
      Button.get_persistence().ajax(url, {
        type: 'POST',
        data: {
          action: button.integration.action
        }
      }).then(function(res) {
        update_state({completed: true});
      }, function(err) {
        if(err && err._result) { err = err._result; }
        if(err && err.fakeXHR && err.fakeXHR.status === 0) {
          // TODO: create an iframe to do a local form post
          if(!document.getElementById('button_action_post_frame')) {
            var frame = document.createElement('iframe');
            frame.style.position = 'absolute';
            frame.style.left = '-1000px';
            frame.style.top = '10px';
            frame.style.width = '100px';
            frame.sandbox = '';
            frame.id = 'button_action_post_frame';
            frame.name = frame.id;
            document.body.appendChild(frame);
          }
          var form = document.createElement('form');
          form.style.position = 'absolute';
          form.style.left = '-1000px';
          form.action = url;
          form.method = 'POST';
          form.target = 'button_action_post_frame';
          form.id = 'button_action_post';
          var input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'action';
          input.value = button.integration.action;
          form.appendChild(input);
          var btn = document.createElement('button');
          btn.type = 'submit';
          form.appendChild(btn);
          document.body.appendChild(form);
          runLater(function() {
            form.submit();
            update_state({completed: true});
          }, 500);
        } else {
          update_state({errored: true});
        }
      });
    } else {
      var user_id = app_state.get('currentUser.id') || 'nobody';
      var board_id = app_state.get('currentBoardState.id');
      if(user_id && board_id) {
        if(!persistence.get('online')) {
          console.log("button failed because offline");
          update_state({errored: true});
        } else {
          update_state(null);
          update_state({pending: true});
          runLater(function() {
            Button.get_persistence().ajax('/api/v1/users/' + user_id + '/activate_button', {
              type: 'POST',
              data: {
                board_id: board_id,
                button_id: button.get('id'),
                associated_user_id: app_state.get('referenced_speak_mode_user.id')
              }
            }).then(function(res) {
              if(!res.progress) {
                console.log("button failed because didn't get a progress object");
                update_state({errored: true});
              } else {
                progress_tracker.track(res.progress, function(event) {
                  if(event.status == 'errored') {
                    console.log("button failed because of progress result error");
                    update_state({errored: true});
                  } else if(event.status == 'finished') {
                    if(event.result && event.result.length > 0) {
                      var all_valid = true;
                      var any_code = false;
                      event.result.forEach(function(result) {
                        if(result && result.response_code) {
                          any_code = true;
                          if(result.response_code < 200 || result.response_code >= 300) {
                            all_valid = false;
                          }
                        }
                      });
                      if(!all_valid) {
                        console.log("button failed with error response from notification");
                        update_state({errored: true});
                      } else if(!any_code) {
                        console.log("button failed with no webhook responses recorded");
                        update_state({errored: true});
                      } else {
                        update_state({completed: true});
                      }
                    } else {
                      console.log("button failed with notification failure");
                      update_state({errored: true});
                    }
                  }
                }, {success_wait: 500, error_wait: 1000});
              }
            }, function(err) {
              console.log("button failed because of ajax error");
              update_state({errored: true});
            });
          });
        }
      }
    }
  }
};
var sample = function(range) {
  return Math.ceil(Math.random() * (range - .01) + .01);
};

Button.load_actions = function() {
  if(!LingoLinq || LingoLinq.special_actions) { return; }
  LingoLinq.find_special_action = function(mod) {
    var res = null;
    LingoLinq.special_actions.forEach(function(action) {
      if(res || !mod) { return; }
      if(action.action == mod) { 
        res = action;
      } else if(action.match) {
        var match = mod.match(action.match);
        if(match) {
          res = $.extend({}, action);
          res.last_match = match;
        }
      }
    });
    return res;
  };
  LingoLinq.special_actions = [
    {
      action: ':clear',
      description: i18n.t('clear_utterance', "Clear the current utterance"),
      trigger: function() { app_state.controller.send('clear', {button_triggered: true, skip_click: true}); }
    },
    {
      action: ':home',
      description: i18n.t('jump_to_current_home', "Jump to the current home board"),
      trigger: function() {
        app_state.controller.send('home', {button_triggered: true, skip_click: true});
        return {already_navigating: true};
      }
    },
    {
      action: ':back',
      description: i18n.t('go_back_one_board', "Go back one board"),
      trigger: function() {
        app_state.controller.send('back', {button_triggered: true, skip_click: true});
        return {already_navigating: true};
      }
    },
    {
      action: ':backspace',
      description: i18n.t('erase_last_button', "Erase the last button from the utterance"),
      trigger: function() {
        app_state.controller.send('backspace', {button_triggered: true, skip_click: true});      
      }
    },
    {
      action: ':beep',
      description: i18n.t('beep', "Beep"),
      has_sound: true,
      trigger: function() {
        app_state.controller.send('alert', {button_triggered: true, skip_click: true});      
      }
    },
    {
      action: ':speak',
      description: i18n.t('speak_full_utterance', "Speak the full utterance"),
      has_sound: true,
      trigger: function() {
        app_state.controller.send('vocalize', {button_triggered: true});      
      }
    },
    {
      action: ':hush',
      description: i18n.t('stop_speaking', "Stop speaking"),
      trigger: function() {
        speecher.stop('all');      
      }
    },
    {
      action: ':find',
      description: i18n.t('find_buttons', "Open the Find Buttons window"),
      trigger: function() {
        app_state.controller.send('find_button');      
      }
    },
    {
      action: ':share',
      description: i18n.t('share_window', "Open the Share window"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          modal.open('share-utterance', {utterance: stashes.get('working_vocalization')});
        }    
      }
    },
    {
      action: ':copy',
      description: i18n.t('copy_sentence', "Copy what's in the sentence box to the clipboard"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          var voc = stashes.get('working_vocalization') || [];
          var sentence = voc.map(function(v) { return v.label; }).join(' ');
          var res = capabilities.sharing.copy_text(sentence);
          if(res) {
            modal.notice(i18n.t('text_copied', "Sentence box copied to the clipboard!"));
          } else {
            modal.error(i18n.t('text_failed', "Nothing copied to the clipboard"));
          }
        }    
      }
    },
    {
      action: ':paste',
      description: i18n.t('past_sentence', "Paste the text contents of the clipbooard to the sentence box"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          try {
            navigator.clipboard.readText().then(function(text) {
              utterance.add_button({label: text});
            }, function(err) {
              modal.error(i18n.t('paste_failed', "Failed to retrieve clipboard contents"));
            });
          } catch(e) {
            modal.error(i18n.t('paste_failed', "Failed to retrieve clipboard contents"));
          }
          return {auto_return_possible: true};
        }    
      }
    },
    {
      action: ':alerts',
      description: i18n.t('alerts_window', "Open the Alerts window"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          modal.open('modals/inbox', {inactivity_timeout: true});
        }    
      }
    },
    {
      action: ':repairs',
      description: i18n.t('repairs_window', "Open the Repairs window"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          modal.open('modals/repairs', {inactivity_timeout: true});
        }
      }
    },
    {
      action: ':shout',
      description: i18n.t('speak_louder', "Speak the current utterance, louder"),
      has_sound: true,
      trigger: function() {
        app_state.say_louder();
      }
    },
    {
      action: ':whisper',
      description: i18n.t('speak_quieter', "Speak the current utterance, quieter"),
      has_sound: true,
      trigger: function() {
        app_state.say_louder(0.5);
      }
    },
    {
      action: ':phrases',
      description: i18n.t('phrases_window', "Open the Phrases window"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          modal.open('modals/phrases', {inactivity_timeout: true});
        }    
      }
    },
    {
      action: ':hold-thought',
      description: i18n.t('hold_that_thought', "Hold That Thought"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          stashes.remember({stash: true});
          utterance.clear();
        }    
      }
    },
    {
      action: ':board-lock',
      description: i18n.t('toggle_board_lock', "Toggle Board Lock"),
      trigger: function() {
        if(app_state.get('speak_mode')) {
          app_state.controller.send('toggle_sticky_board');
        }    
      }
    },
    {
      action: ':click',
      description: i18n.t('toggle_shift', "Make a Click Sound"),
      trigger: function() {
      }
    },
    {
      action: ':shift',
      description: i18n.t('toggle_shift', "Toggle Shift State (capitalization)"),
      trigger: function() {
        Button.get_app_state().set('shift', !Button.get_app_state().get('shift'));
        Button.get_app_state().set('suggestion_id', null);
        app_state.refresh_suggestions();
      }
    },
    {
      action: ':space',
      completion: true,
      trigger: function() {
        return {auto_return_possible: true};
      },
      alter: function(text, prior_text, prior_label, altered, addition) {
        if(altered.vocalization) { altered.vocalization = altered.vocalization + " " }
        if(addition.suggestion_image) {
          altered.image = addition.suggestion_image;
          altered.image_license = addition.suggestion_image_license;
        }
        altered.label = (altered.label || '') + " ";
        altered.in_progress = false;
      }
    },
    {
      action: ':complete',
      completion: true,
      trigger: function() {
        return {auto_return_possible: true};
      },
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = addition.completion;
        altered.label = addition.completion;
        if(addition.image) { altered.image = addition.image; }
        altered.in_progress = false;
      }
    },
    {
      action: ':predict',
      completion: true,
      trigger: function() {
        return {auto_return_possible: true};
      },
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = addition.completion;
        altered.label = addition.completion;
        if(addition.image) { altered.image = addition.image; }
        altered.in_progress = false;
      }
    },
    {
      action: ':suggestion',
      description: i18n.t('suggestion', "Show a suggestion word in this button space"),
      trigger: function() {
        return {auto_return_possible: true};
      }
    },
    {
      action: ':plural',
      modifier: true,
      description: i18n.t('pluralize', "Make the word plural"),
      types: ['noun'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        // TODO: first check for inflection_overrides
        altered.vocalization = i18n.pluralize(prior_text);
        altered.label = i18n.pluralize(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':singular',
      modifier: true,
      description: i18n.t('singularize', "Make the word singular"),
      types: ['noun'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.singularize(prior_text);
        altered.label = i18n.singularize(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':comparative',
      modifier: true,
      description: i18n.t('add_comparative', "Add \"more\" or \"-er\" (comparative)"),
      types: ['adjective', 'adverb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.comparative(prior_text);
        altered.label = i18n.comparative(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':er',
      modifier: true,
      description: i18n.t('add_comparative', "Add \"more\" or \"-er\" (comparative)"),
      types: ['adjective', 'adverb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.comparative(prior_text);
        altered.label = i18n.comparative(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':superlative',
      modifier: true,
      description: i18n.t('add_superlative', "Add \"most\" or \"-est\" (superlative)"),
      types: ['adjective', 'adverb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.superlative(prior_text);
        altered.label = i18n.superlative(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':ordinal',
      modifier: true,
      description: i18n.t('ordinal', "Add \"st\", \"nd\",\"th\", etc. (1st, 2nd, 3rd) to a number (ordinal)"),
      types: ['number'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.ordinal(prior_text);
        altered.label = i18n.ordinal(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':est',
      modifier: true,
      description: i18n.t('add_superlative', "Add \"most\" or \"-est\" (superlative)"),
      types: ['adjective', 'adverb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.superlative(prior_text);
        altered.label = i18n.superlative(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':verb-negation',
      modifier: true,
      description: i18n.t('negate_the_word', "Negate the word"),
      types: ['verb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.verb_negation(prior_text);
        altered.label = i18n.verb_negation(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':possessive',
      modifier: true,
      description: i18n.t('add_possessive', "Add \"s\" (possessive)"),
      types: ['noun', 'pronoun'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.possessive(prior_text);
        altered.label = i18n.possessive(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':\'s',
      modifier: true,
      description: i18n.t('add_possessive', "Add \"s\" (possessive)"),
      types: ['noun', 'pronoun'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.possessive(prior_text);
        altered.label = i18n.possessive(prior_label);
        altered.in_progress = false;
      }
    },
    {
      action: ':past',
      modifier: true,
      description: i18n.t('past_tense', "Make the verb past tense"),
      types: ['verb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.tense(prior_text, {simple_past: true});
        altered.label = i18n.tense(prior_label, {simple_past: true});
        altered.in_progress = false;
      }
    },
    {
      action: ':ed',
      modifier: true,
      description: i18n.t('past_tense', "Make the verb past tense"),
      types: ['verb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.tense(prior_text, {simple_past: true});
        altered.label = i18n.tense(prior_label, {simple_past: true});
        altered.in_progress = false;
      }
    },
    {
      action: ':present-participle',
      modifier: true,
      description: i18n.t('make_present_participle', "Make the verb present participle"),
      types: ['verb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.tense(prior_text, {present_participle: true});
        altered.label = i18n.tense(prior_label, {present_participle: true});
        altered.in_progress = false;
      }
    },
    {
      action: ':ing',
      modifier: true,
      description: i18n.t('make_present_participle', "Make the verb present participle"),
      types: ['verb'],
      alter: function(text, prior_text, prior_label, altered, addition) {
        altered.vocalization = i18n.tense(prior_text, {present_participle: true});
        altered.label = i18n.tense(prior_label, {present_participle: true});
        altered.in_progress = false;
      }
    },
    {
      action: ':bleep',
      inline: true,
      inline_description: "bleep",
      description: i18n.t('beep_sound', "Play a beep sound inline"),
      content: function() {
        return [{sound_url: 'bleep_url', text: "bleep"}];
      }
    },
    {
      action: ':current-date',
      inline: true,
      inline_description: "date",
      description: i18n.t('current_calendar_date', "Speak the current calendar date"),
      content: function() {
        var now = window.moment();
        return [{text: templateHelpers.date(now, 'day')}];
      }
    },
    {
      action: ':current-time',
      inline: true,
      inline_description: "now",
      description: i18n.t('current_time', "Speak the current time"),
      content: function() {
        var now = window.moment();
        return [{text: templateHelpers.time(now, 'day')}];
      }
    },
    {
      action: ':current-day',
      inline: true,
      inline_description: "day",
      description: i18n.t('current_day', "Speak the current day of the week"),
      content: function() {
        var now = window.moment();
        return [{text: now.format('dddd')}];
      }
    },
    {
      action: ':yesterday-date',
      inline: true,
      inline_description: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        return "date " + n_days + " day(s) ago";
      },
      match: /^:yesterday-date\((\d+)\)/,
      description: i18n.t('yesterday_calendar_date', "Speak yesterday's calendar date"),
      content: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        var now = window.moment().add(-1 * n_days, 'day');
        return [{text: templateHelpers.date(now, 'day')}];
      }
    },
    {
      action: ':yesterday-day',
      inline: true,
      match: /^:yesterday-day\((\d+)\)/,
      description: i18n.t('yesterday_day', "Speak the day of the week for yesterday"),
      inline_description: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        return "day " + n_days + " day(s) ago";
      },
      content: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        var now = window.moment().add(-1 * n_days, 'day');
        return [{text: now.format('dddd')}];
      }
    },
    {
      action: ':tomorrow-date',
      inline: true,
      match: /^:tomorrow-date\((\d+)\)/,
      description: i18n.t('tomorrow_calendar_date', "Speak tomorrow's calendar date"),
      inline_description: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        return "date " + n_days + " day(s) from now";
      },
      content: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        var now = window.moment().add(n_days, 'day');
        return [{text: templateHelpers.date(now, 'day')}];
      }
    },
    {
      action: ':tomorrow-day',
      inline: true,
      match: /^:tomorrow-day\((\d+)\)/,
      description: i18n.t('tomorrow_day', "Speak the day of the week for tomorrow"),
      inline_description: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        return "day " + n_days + " day(s) from now";
      },
      content: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        var now = window.moment().add(-1 * n_days, 'day');
        return [{text: now.format('dddd')}];
      }
    },
    {
      action: ':current-month',
      inline: true,
      inline_description: "this month",
      description: i18n.t('current_month', "Speak the name of the current month"),
      content: function() {
        return "DATE";
      }
    },
    {
      action: ':next-month',
      inline: true,
      match: /^:next-month\((\d+)\)/,
      description: i18n.t('next_month', "Speak the name of the next month"),
      inline_description: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        return n_days + " month(s) from now";
      },
      content: function(match) {
        var n_months = (match && parseInt(match[1], 10)) || 1;
        var now = window.moment().add(n_months, 'month');
        return [{text: now.format('MMMM')}];
      }
    },
    {
      action: ':last-month',
      inline: true,
      match: /^:last-month\((\d+)\)/,
      description: i18n.t('last_month', "Speak the name of the previous month"),
      inline_description: function(match) {
        var n_days = (match && parseInt(match[1], 10)) || 1;
        return n_days + " months(s) ago";
      },
      content: function(match) {
        var n_months = (match && parseInt(match[1], 10)) || 1;
        var now = window.moment().add(-1 * n_months, 'month');
        return [{text: now.format('MMMM')}];
      }
    },
    {
      action: ':battery-level',
      inline: true,
      inline_description: "battery",
      description: i18n.t('battery_level', "Speak the current battery level"),
      content: function() {
        return (app_state.get('battery') || i18n.t('unknown', "Unknown")) + " " + i18n.t('percent_battery_left', "percent battery left");
      }
    },
    {
      action: ':gif-search',
      description: i18n.t('gif_search_description', "Search online GIFs that match the current contents of the sentence"),
      trigger: function() {
        modal.open('modals/gif');
      }
    },
    {
      action: ':gif-lucky',
      description: i18n.t('gif_lucky_description', "Show the first online GIF that matches the current contents of the sentence"),
      trigger: function() {
        modal.open('modals/gif', {lucky: true});
      }
    },
    {
      action: ':inflection',
      match: /^:inflection\((\w+)\)/,
      description: i18n.t('set_inflection', "Set button inflections to match a certain rule"),
      inline_description: function(match) {
        var rule = match && match[1];
        return "update to inflection rule: " + rule;
      },
      trigger: function(match) {
        var rule = match && match[1];

        if(app_state.get('inflection_shift') == rule) {
          Button.get_app_state().set('inflection_shift', false);
        } else {
          Button.get_app_state().set('inflection_shift', rule);
        }
        Button.get_app_state().set('suggestion_id', null);
        app_state.refresh_suggestions();
      }
    },
    {
      action: ':volume',
      match: /^:volume\((\d+|up|down)\)/,
      description: i18n.t('set_volume', "Set the device volume (up, down, or ##)"),
      trigger: function(match) { 
        var action = null;
        if(match[1] == 'up' || match[1] == 'down') {
          var act = match[1] == 'up' ? '+' : '-';
          action = match[1];
          capabilities.set_volume(act).then(function(res) {
            runLater(function() {
              speecher.beep();
            }, 500);
          }, function(err) {
            modal.error(i18n.t('volume_change_failed', "Device volume change failed"));
          });
        } else {
          var num = parseInt(match[1], 10);
          action = num;
          capabilities.set_volume(num / 100).then(function(res) {
            runLater(function() {
              speecher.beep();
            }, 500);
          }, function(err) {
            modal.error(i18n.t('volume_change_failed', "Device volume change failed"));
          });
        }
      }
    },
    {
      action: ':roll-dice',
      match: /^:roll-dice\((\d+)\)/,
      inline: true,
      description: i18n.t('random_dice_number', "Play a dice rolling sound and then speak a random number from 1 to n"),
      inline_description: function(match) {
        var n = (match && parseInt(match[1], 10)) || 6;
        return "roll " + n + "-sided die";
      },
      content: function(match) {
        var range = (match && parseInt(match[1], 10)) || 6;
        return [{sound_url: 'dice_url', text: "... rolling ..."}, {text: sample(range).toString() + ","}];
      }
    },
    {
      action: ':random',
      match: /^:random\((\d+)\)/,
      inline: true,
      description: i18n.t('pick_random_number', "Speak a random number from 1 to n"),
      inline_description: function(match) {
        var n = (match && parseInt(match[1], 10)) || 10;
        return "pick 1-" + n;
      },
      content: function(match) {
        var range = (match && parseInt(match[1], 10)) || 10;
        return [{text: sample(range).toString() + ","}];
      }
    },
    {
      action: ':spinner',
      match: /^:spinner\((\d+)\)/,
      inline: true,
      description: i18n.t('random_spinner_number', "Play a spinner sound and then speak a random number from 1 to n"),
      inline_description: function(match) {
        var n = (match && parseInt(match[1], 10)) || 4;
        return "spin from " + n + " choices";
      },
      content: function(match) {
        var range = (match && parseInt(match[1], 10)) || 4;
        return [{sound_url: 'spinner_url', text: "... spinning ..."}, {text: sample(range).toString() + ","}];
      }
    },
    {
      action: ':native-keyboard',
      description: i18n.t('launch_native_keyboard', "Open the native keyboard if available")
    },
    {
      action: ':timer',
      match: /^:timer\((\d+)s\)/,
      description_callback: function(match) {
        var seconds = match ? parseInt(match[1], 10) : 30;
        var duration = templateHelpers.seconds_ago(seconds);
        return i18n.t('set_timer', "Set a timer for %{duration}", {duration: duration});
      },
      trigger: function(match) {
        var seconds = match ? parseInt(match[1], 10) : 30;
        var duration = templateHelpers.seconds_ago(seconds);
        modal.success(i18n.t('timer_started', "Timer Started:") + " " + duration, true);
        var start = (new Date()).getTime();
        var tick = function() {
          if(app_state.get('speak_mode')) {
            var now = (new Date()).getTime();
            if(now - start > (seconds * 1000)) {
              speecher.beep();
              runLater(function() {
                speecher.beep();
              }, 1500);
              modal.open('modals/timer');
            } else {
              runLater(tick, 500);
            }
          }
        };
        runLater(tick, 500);    
      }
    },
    {
      action: ':say',
      has_sound: true,
      match: /^:say\((.+)\)/,
      description_callback: function(match) {
        var phrase = (match && match[1]) || "nothing";
        return i18n.t('say', "Say: ") + phrase;
      },
      trigger: function(match) {
        if(app_state.get('speak_mode') && match) {
          var phrase = match[1];
          speecher.speak_text(phrase);
          // TODO: this will be easier for people to find as a 
          // button setting, yo
        }    
      }
    },
  ];
};
Button.clean_text = clean_text;

window.button_broken_image = Button.broken_image;

export default Button;

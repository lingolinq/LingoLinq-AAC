import templateHelpers from '../utils/template_helpers';
import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import { attr, hasMany } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import modal from '../utils/modal';
import Button from '../utils/button';
import editManager from '../utils/edit_manager';
import speecher from '../utils/speecher';
import capabilities from '../utils/capabilities';
import boundClasses from '../utils/bound_classes';
import word_suggestions from '../utils/word_suggestions';
import Buttonset from '../models/buttonset';
import Utils from '../utils/misc';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { set as emberSet } from '@ember/object';
import EmberObject from '@ember/object';
import utterance from '../utils/utterance';
import { inject as service } from '@ember/service';
import rewriteBrokenSymbolUrl from '../utils/symbol-url';

// Curated vocab boards (Quick Core / Vocal Flair / Sequoia) ship with our
// own branded tile art under /images/. The board records still carry the
// old ARASAAC library URL in image_url, so without this the find-a-board
// list and the copies handed to new users on signup render the generic
// ARASAAC icon. We override by the board-key SLUG (the segment after the
// username) so it applies both to the originals
// (sampleorganization_user_1/quick-core-112) and to the per-user copies
// (some_user/quick-core-112) — verified to preserve the same slug. Only
// slugs whose PNG we actually ship are listed, so we never trade a
// working icon for a broken one. To add another: drop the PNG in
// public/images/ and add its slug here.
var VOCAB_ICON_OVERRIDES = {
  'quick-core-24': '/images/quick-core-24.png',
  'quick-core-40': '/images/quick-core-40.png',
  'quick-core-60': '/images/quick-core-60.png',
  'quick-core-84': '/images/quick-core-84.png',
  'quick-core-112': '/images/quick-core-112.png',
  'vocal-flair-24': '/images/vocal-flair-24.png',
  'vocal-flair-40': '/images/vocal-flair-40.png',
  'vocal-flair-60': '/images/vocal-flair-60.png',
  'vocal-flair-84': '/images/vocal-flair-84.png',
  'vocal-flair-112': '/images/vocal-flair-112.png',
  'sequoia-15': '/images/sequoia-15.png'
};
// Sort vocab keys longest-first so that, e.g., "quick-core-112" wins
// over any shorter prefix in a substring match.
var VOCAB_ICON_KEYS_BY_LENGTH = Object.keys(VOCAB_ICON_OVERRIDES).sort(function(a, b) {
  return b.length - a.length;
});
// Variant-root suffixes: alternate forms of a family root (NOT topical
// sub-boards). A slug like `vocal-flair-84-w-keyboard` or
// `district-quick-core-112-template` is a variant root and should
// inherit the family tile. Topical sub-boards like
// `vocal-flair-40-vehicles` or `sequoia-15-my-streets` must keep their
// own icons, so we DO NOT do a generic "contains" match — only this
// curated allowlist. The optional `_<digits>` tail covers the
// "_1" / "_2" duplicate-slug pattern Ember-side keys use.
var VARIANT_ROOT_SUFFIXES = ['keyboard', 'w-keyboard', 'template', 'minimal', 'lite', 'light', 'legacy'];
function vocab_icon_for_key(key) {
  if(!key || typeof key !== 'string') { return null; }
  var slug = key.split('/').pop();
  // 1. Pure root match (quick-core-112, vocal-flair-84, sequoia-15)
  if(VOCAB_ICON_OVERRIDES[slug]) { return VOCAB_ICON_OVERRIDES[slug]; }
  // 2. Variant-root match: family+size followed by an allowlisted
  // variant suffix at the end of the slug, with an optional leading
  // qualifier (e.g. "district-"). Keys/suffixes are static lowercase
  // letters / digits / hyphens — no regex meta chars, so no escape needed.
  for(var i = 0; i < VOCAB_ICON_KEYS_BY_LENGTH.length; i++) {
    var vocabKey = VOCAB_ICON_KEYS_BY_LENGTH[i];
    for(var j = 0; j < VARIANT_ROOT_SUFFIXES.length; j++) {
      var suffix = VARIANT_ROOT_SUFFIXES[j];
      var re = new RegExp('(^|-)' + vocabKey + '-' + suffix + '(_\\d+)?$');
      if(re.test(slug)) { return VOCAB_ICON_OVERRIDES[vocabKey]; }
    }
  }
  return null;
}

// Classic boards use `.button-label`; board-detail uses
// `.md-board-detail-symbol-card__label`. Word-prediction buttons
// update the DOM directly, so both selectors must be supported.
function suggestion_label_element(button_elem) {
  if(!button_elem || !button_elem.getElementsByClassName) { return null; }
  return button_elem.getElementsByClassName('button-label')[0] ||
    button_elem.getElementsByClassName('md-board-detail-symbol-card__label')[0];
}

function is_suggestion_label(elem) {
  return elem && (elem.classList.contains('button-label') ||
    elem.classList.contains('md-board-detail-symbol-card__label'));
}

function word_predictions_visible(appState) {
  if(!appState || typeof appState.get !== 'function') { return false; }
  if(appState.get('speak_mode')) { return true; }
  if(typeof appState.board_detail_inflections_active === 'function') {
    return appState.board_detail_inflections_active();
  }
  return false;
}

function utterance_part_of_speech(entry) {
  if(!entry) { return null; }
  if(typeof entry.get === 'function') {
    return entry.get('part_of_speech') || entry.get('painted_part_of_speech') || entry.get('suggested_part_of_speech') || null;
  }
  return entry.part_of_speech || entry.painted_part_of_speech || entry.suggested_part_of_speech || null;
}

// Verb-board "-s" buttons are often stored as vocalization "+s" (append) rather
// than ":plural"; treat both as the same inflection modifier for previews.
function inflection_action_for_button(button) {
  if(!button || !LingoLinq.special_actions) { return null; }
  var voc = (button.vocalization || '').trim();
  var act = LingoLinq.special_actions.find(function(a) { return a.action == voc && a.types; });
  if(act) { return act; }
  var label = (button.label || '').trim().toLowerCase();
  if(voc.match(/^\+s$/i) || label === '-s' || label === 's' || label === '+s') {
    return LingoLinq.special_actions.find(function(a) { return a.action == ':plural'; });
  }
  return null;
}

function is_inflection_modifier_button(button) {
  return !!inflection_action_for_button(button);
}

LingoLinq.Board = BaseModel.extend({
  persistence: service('persistence'),
  appState: service('app-state'),
  stashes: service('stashes'),
  
  init() {
    this._super(...arguments);
    this.check_for_copy();
  },
  // Clean license when license attribute is loaded
  // This replicates the old didLoad() behavior since init() runs before data is loaded
  onLicenseLoad: observer('license', function() {
    this.clean_license();
  }),
  // Reset fetched flag when board is updated from server
  // Observer on key attributes that change on update
  resetFetchedOnUpdate: observer('retrieved', 'current_revision', function() {
    this.set('fetched', false);
  }),
  name: attr('string'),
  key: attr('string'),
  prefix: attr('string'),
  description: attr('string'),
  created: attr('date'),
  updated: attr('date'),
  user_name: attr('string'),
  locale: attr('string'),
  localized_name: attr('string'),
  localized_locale: attr('string'),
  button_locale: attr('string'),
  translated_locales: attr('raw'),
  full_set_revision: attr('string'),
  current_revision: attr('string'),
  for_user_id: attr('string'),
  copy_id: attr('string'),
  sort_score: attr('number'),
  copy_key: attr('string'),
  new_owner: attr('boolean'),
  disconnect: attr('boolean'),
  dim_header: attr('boolean'),
  small_header: attr('boolean'),
  update_visibility_downstream: attr('boolean'),
  source_id: attr('string'),
  current_library: attr('string'),
  image_urls: attr('raw'),
  sound_urls: attr('raw'),
  hc_image_ids: attr('raw'),
  cascade_invalidations: attr('raw'),
  translations: attr('raw'),
  intro: attr('raw'),
  style: attr('raw'),
  categories: attr('raw'),
  home_board: attr('boolean'),
  has_fallbacks: attr('boolean'),
  // EU AI Act Article 50(2) signed provenance marker, set from the AI label-generation
  // response and round-tripped on save so the server can verify and persist it.
  ai_generated: attr('raw'),
  /** When loaded by key, the API returns global_id as id; we normalize to key and store backend id here. */
  _actual_id: attr('string'),
  /** Backend global_id for comparisons (e.g. preferences.home_board.id). Use this when comparing with server ids. */
  global_id: computed('id', '_actual_id', function() {
    return this.get('_actual_id') || this.get('id');
  }),
  valid_id: computed('id', function() {
    return !!(this.get('id') && this.get('id') != 'bad');
  }),
  could_be_in_use: computed('non_author_uses', 'public', 'brand_new', 'stars', function() {
    // no longer using (this.get('public') && this.get('brand_new'))
    return this.get('non_author_uses') > 0 || this.get('non_author_starred');
  }),
  definitely_in_use: computed('non_author_uses', 'stars', function() {
    return this.get('non_author_uses') > 0 || this.get('stars') > 0;
  }),
  fallback_image_url: "/images/lingolinq-board-icon.png",
  key_placeholder: computed('name', function() {
    var key = (this.get('name') || "my-board").replace(/^\s+/, '').replace(/\s+$/, '');
    var ref = key;
    while(key.length < 4) {
      key = key + ref;
    }
    key = key.toLowerCase().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+$/, '').replace(/-+/g, '-');
    return key;
  }),
  icon_url_with_fallback: computed('image_url', 'image_data_uri', 'key', function() {
    // Curated vocab boards use our shipped branded tile art instead of the
    // stale ARASAAC image_url. /images/ assets are bundled with the app, so
    // this is safe online and offline and intentionally takes precedence
    // over image_data_uri/image_url to keep the icon consistent everywhere
    // (find-a-board list, dashboard previews, per-user copies at signup).
    var vocab = vocab_icon_for_key(this && this.get && this.get('key'));
    if(vocab) { return vocab; }
    // TODO: way to fall back to something other than a broken image when disconnected
    if(!this || !this.persistence || typeof this.persistence.get !== 'function') {
      return this && (this.get('image_data_uri') || this.fallback_image_url) || '';
    }
    if(this.persistence.get('online')) {
      return rewriteBrokenSymbolUrl(this.get('image_data_uri') || this.get('image_url') || this.fallback_image_url);
    } else {
      return rewriteBrokenSymbolUrl(this.get('image_data_uri') || this.fallback_image_url);
    }
  }),
  // True when this board uses one of our shipped vocab tile icons
  // (Quick Core / Vocal Flair / Sequoia, including variant roots like
  // -keyboard / -template). Surfaces the same detection used by
  // icon_url_with_fallback so templates can opt in to vocab-only
  // decorations (e.g. the "CC-By OpenAAC" credit under the tile).
  has_vocab_icon: computed('key', function() {
    return !!vocab_icon_for_key(this && this.get && this.get('key'));
  }),
  shareable: computed('public', 'permissions.edit', function() {
    return this.get('public') || this.get('permissions.edit');
  }),
  used_buttons: computed('buttons', 'grid', function() {
    var result = [];
    var grid = this.get('grid');
    var buttons = this.get('buttons');
    if(!grid || !buttons || !grid.order || !Array.isArray(grid.order) || !grid.order.length || !grid.order[0] || !Array.isArray(grid.order[0])) { return []; }
    for(var idx = 0; idx < grid.order[0].length; idx++) {
      for(var jdx = 0; jdx < grid.order.length; jdx++) {
        var id = grid.order[jdx][idx];
        if(id) {
          var button = null;
          for(var kdx = 0; kdx < buttons.length; kdx++) {
            if(buttons[kdx].id == id) {
              result.push(buttons[kdx]);
            }
          }
        }
      }
    }
    return result;
  }),
  labels: computed('buttons', 'grid', function() {
    var list = [];
    this.get('used_buttons').forEach(function(button) {
      if(button && button.label) {
        list.push(button.label);
      }
    });
    return list.join(', ');
  }),
  copy_version: computed('key', function() {
    var key = this.get('key');
    if(key.match(/_\d+$/)) {
      return key.split(/_/).pop();
    } else {
      return null;
    }
  }),
  nothing_visible: computed('buttons', 'grid', function() {
    var found_visible = false;
    this.get('used_buttons').forEach(function(button) {
      if(button && !button.hidden) {
        found_visible = true;
      }
    });
    return !found_visible;
  }),
  variant_image_urls: function(skin) {
    if(!this || !this.persistence) {
      return this ? (this.get('image_urls') || {}) : {};
    }
    var local_map = this.get('image_urls') || {};
    var unskins = {};
    this.get('buttons').forEach(function(btn) {
      if(btn && btn.no_skin && btn.image_id) {
        unskins[btn.image_id] = true;
      }
    });
    return LingoLinq.Board.skin_image_map(local_map, skin, {
      unskins: unskins,
      persistence: this.persistence
    });
  },
  map_image_urls: function(map, skins, symbols) {
    map = map || {};
    var res = [];
    var _this = this;
    var locals = _this.get('local_images_with_license');
    var added_urls = {};
    var add_img = function(id, url, skin, sym) {
      if(!added_urls[url]) {
        var obj = {id: id, url: url, skins: [skin], library: sym};
        added_urls[url] = obj;
        res.push(obj);
      } else {
        added_urls[url].skins.push(skin);
      }
    };
    skins.forEach(function(skin) {
      var local_map = _this.variant_image_urls(skin || 'default') || {};
      _this.get('used_buttons').forEach(function(button) {
        if(button && button.image_id) {
          if(button.no_skin && local_map['ns_' + button.image_id]) {
            add_img(button.image_id, local_map['ns_' + button.image_id], skin);
            symbols.forEach(function(sym) {
              if(local_map['ns_' + button.image_id + '-' + sym]) {
                add_img(button.image_id, local_map['ns_' + button.image_id + '-' + sym] || local_map['ns_' + button.image_id], skin, sym);
              }
            });
          } else if(local_map[button.image_id]) {
            add_img(button.image_id, local_map[button.image_id], skin);
            symbols.forEach(function(sym) {
              if(local_map[button.image_id + '-' + sym]) {
                add_img(button.image_id, local_map[button.image_id + '-' + sym] || local_map[button.image_id], skin, sym);
              }
            });
          } else if(map[button.image_id]) {
            add_img(button.image_id, map[button.image_id], skin);
            symbols.forEach(function(sym) {
              if(map[button.image_id + '-' + sym]) {
                add_img(button.image_id, map[button.image_id + '-' + sym] || map[button.image_id], skin, sym);
              }
            });
          } else {
            var img = button.image_id && locals.find(function(l) { return l.get('id') == button.image_id; });
            if(img) {
              add_img(button.image_id, img.get('url'), skin);
            } else {
              res.some_missing = true;
            }
          }
        }
      });
    });
    return res;
  },
  local_images_with_license: computed('grid', 'buttons', function() {
    var images = LingoLinq.store.peekAll('image');
    var result = [];
    var seen_ids = {};
    var missing = false;
    var fallbacks = this.get('fallback_images') || [];
    this.get('used_buttons').forEach(function(button) {
      if(button && button.image_id) {
        var image = images.find(function(img) { return img.get('id') === button.image_id.toString(); });
        if(image) {
          if(!image.get('license')) {
            var fb = fallbacks.find(function(i) { return i.url == image.get('url'); });
            if(fb && fb.license) {
              image.set('license', fb.license);
            } else {
              LingoLinq.store.findRecord('image', button.image_id).then(function(img) {
                image.set('license', img.get('license'));
              });
            }
          }
          // Only include each unique image once; alternates share the same license
          if(!seen_ids[image.get('id')]) {
            seen_ids[image.get('id')] = true;
            result.push(image);
          }
        } else {
//          console.log('missing image ' + button.image_id);
          missing = true;
        }
      }
    });
    result.some_missing = missing;
    return result;
  }),
  map_sound_urls: function(map) {
    map = map || {};
    var res = [];
    var locals = this.get('local_sounds_with_license');
    var local_map = this.get('sound_urls') || {};
    this.get('used_buttons').forEach(function(button) {
      if(button && button.sound_id) {
        if(local_map[button.sound_id]) {
          res.push({id: button.sound_id, url: local_map[button.sound_id]});
        } else if(map[button.sound_id]) {
          res.push({id: button.sound_id, url: map[button.sound_id]});
        } else {
          var snd = locals.find(function(l) { return l.get('id') == button.sound_id; });
          if(snd) {
            res.push({id: button.sound_id, url: snd.get('url')});
          } else {
            res.some_missing = true;
          }
        }
      }
    });
    return res;
  },
  local_sounds_with_license: computed('grid', 'buttons', function() {
    var sounds = LingoLinq.store.peekAll('sound');
    var result = [];
    var missing = false;
    var fallbacks = this.get('fallback_sounds') || [];
    this.get('used_buttons').forEach(function(button) {
      if(button && button.sound_id) {
        var sound = sounds.find(function(snd) { return snd.get('id') === button.sound_id.toString(); });
        if(sound) {
          if(!sound.get('license')) {
            var fb = fallbacks.find(function(i) { return i.url == sound.get('url'); });
            if(fb && fb.license) {
              sound.set('license', fb.license);
            } else {
              LingoLinq.store.findRecord('sound', button.sound_id).then(function(snd) {
                sound.set('license', snd.get('license'));
              });    

            }
          }
          result.push(sound);
        } else {
//          console.log('missing sound ' + button.sound_id);
          missing = true;
        }
      }
    });
    result = Utils.uniq(result, function(r) { return r.get('id'); });
    result.some_missing = missing;
    return result;
  }),
  levels: computed('buttons.@each.level_modifications', function() {
    return !!(this.get('buttons') || []).find(function(b) { return b.level_modifications; });
  }),
  has_overrides: computed('buttons.@each.level_modifications', function() {
    return !!this.get('buttons').find(function(b) { return b.level_modifications && b.level_modifications.override; });
  }),
  clear_overrides: function() {
    this.get('buttons').forEach(function(button) {
      if(button && button.level_modifications && button.level_modifications.override) {
        delete button.level_modifications.override;
      }
    })
    return this.save();
  },
  without_lookups: function(callback) {
    this.set('no_lookups', true);
    callback();
    this.set('no_lookups', false);
  },
  multiple_locales: computed('locales', function() {
    return (this.get('locales') || []).length > 1;
  }),
  readable_locales: computed('locales', function() {
    var res = [];
    var _this = this;
    (this.get('locales') || []).forEach(function(loc) {
      var str = (i18n.locales_localized[loc] || i18n.locales[loc] || loc) + (_this.get('locale') == loc ? '*' : '') + " (" + loc + ")";
      res.push({
        string: str,
        id: loc,
        name: str,
        locale: loc
      })
    });
    return res;
  }),
  locales: computed('translations', 'translated_locales', function() {
    var res = [];
    var localeRe = /^[a-z]{2,3}([_-][A-Za-z0-9]+)?$/i;
    var addLang = function(lang) {
      if(!lang || !String(lang).match(localeRe)) { return; }
      if(res.indexOf(lang) == -1) { res.push(lang); }
    };
    (this.get('translated_locales') || []).forEach(addLang);
    var button_ids = (this.get('translations') || {});
    for(var button_id in button_ids) {
      if(typeof button_ids[button_id] !== 'string') {
        Object.keys(button_ids[button_id] || {}).forEach(addLang);
      }
    }
    return res;
  }),
  translations_for_button: function(button_id) {
    // necessary otherwise button that wasn't translated at first will never be translatable
    // Copy so source_part_of_speech (a string sibling of en/es) is not treated as a locale
    var trans = Object.assign({}, (this.get('translations') || {})[button_id] || {});
    delete trans.source_part_of_speech;
    (this.get('locales') || []).forEach(function(locale) {
      trans[locale] = trans[locale] || {};
    });
    return trans;
  },
  apply_button_level: function(button, level) {
    var mods = button.level_modifications || {};
    var keys = ['pre'];
    for(var idx = 0; idx <= level; idx++) { keys.push(idx); }
    keys.push('override');
    keys.forEach(function(key) {
      if(mods[key]) {
        for(var attr in mods[key]) {
          button[attr] = mods[key][attr];
        }
      }
    });
    return button;
  },
  _translation_entry: function(translations, button_id, locale) {
    var trans = translations || {};
    var entry = trans[button_id];
    if(!entry && button_id != null) {
      entry = trans[String(button_id)];
    }
    if(!entry || !locale) { return null; }
    return entry[locale] || entry[locale.split(/-|_/)[0]] || null;
  },
  translated_buttons: function(label_locale, vocalization_locale) {
    var res = [];
    var trans = this.get('translations');
    var buttons = this.get('buttons') || [];
    if(!trans) { return buttons; }
    var current_locale = this.get('locale') || 'en';
    var current_root = current_locale.split(/-|_/)[0];
    label_locale = label_locale || trans.current_label || this.get('locale') || 'en';
    vocalization_locale = vocalization_locale || trans.current_vocalization || this.get('locale') || 'en';
    var label_root = label_locale.split(/-|_/)[0];
    var vocalization_root = vocalization_locale.split(/-|_/)[0];
    var level = this.get('display_level');
    var _this = this;
    buttons.forEach(function(button) {
      var b = $.extend({}, button);
      var has_special_vocalization = !!(button.vocalization && String(button.vocalization).match(/^[:+]/));
      var label_trans = _this._translation_entry(trans, button.id, label_locale);
      var vocalization_trans = _this._translation_entry(trans, button.id, vocalization_locale);
      if(label_trans && label_trans.label) {
        // Overlay when viewing a non-default language, or when live button
        // text is out of sync with the translations blob (common after
        // translate_set updates locale metadata before raw buttons reload).
        if(label_root !== current_root || label_trans.label !== button.label) {
          b.label = label_trans.label;
        }
      }
      if(has_special_vocalization) {
        b.vocalization = button.vocalization;
      } else if(vocalization_root !== current_root) {
        if(vocalization_trans && (vocalization_trans.vocalization || vocalization_trans.label)) {
          b.vocalization = (vocalization_trans.vocalization || vocalization_trans.label);
        } else if(vocalization_root !== current_root) {
          delete b['vocalization'];
        }
      } else if(label_locale === vocalization_locale && b.label !== button.label) {
        if(vocalization_trans && (vocalization_trans.vocalization || vocalization_trans.label)) {
          b.vocalization = vocalization_trans.vocalization || vocalization_trans.label;
        } else if(!button.vocalization || button.vocalization === button.label) {
          b.vocalization = b.label;
        }
      }
      // When label and speak locales match, ensure TTS follows the
      // translated label instead of a stale English vocalization field.
      var should_follow_translated_label = !has_special_vocalization &&
        label_locale === vocalization_locale &&
        b.label &&
        b.label !== button.label &&
        (!b.vocalization || b.vocalization === button.vocalization || b.vocalization === button.label);
      if(should_follow_translated_label) {
        b.vocalization = b.label;
      }
      if(level && level < 10) {
        b = _this.apply_button_level(b, level);
      }
      res.push(b);
    });
    return res;
  },
  contextualized_buttons: function(label_locale, vocalization_locale, history, capitalize, inflection_shift) {
    if(this.get('isDeleted')) {
      return [];
    }
    var t = (this.get('updated') || (new Date()))
    if(t.getTime) { t = t.getTime(); }
    // focus_words: must not rely on JSON.stringify(focus_words) for cache — nested board_ids can fail to
    // serialize or change the key when board_ids updates, returning stale results with no dim/focus.
    var fw = this.appState.get('focus_words');
    var fwCacheKey = '';
    if(fw) {
      var bid = fw.board_ids || {};
      var bidKeys = Object.keys(bid).sort();
      var bidSig = bidKeys.map(function(k) {
        var arr = bid[k] || [];
        return k + ':' + arr.map(function(b) { return b && b.id !== undefined ? b.id : ''; }).join(',');
      }).join('|');
      fwCacheKey = JSON.stringify(fw.list || []) + '||' + (fw.user_id || '') + '||' + !!fw.pending + '||' + bidSig;
    }
    var state = JSON.stringify({hh: this.get('update_hash'), u: t, ll: label_locale, vl: vocalization_locale, h: history, c: capitalize, is: inflection_shift, sp: this.appState.get('speak_mode'), fw: fwCacheKey, fid: this.get('focus_id'), uid: this.appState.get('sessionUser.id'), ai: this.appState.get('referenced_user.preferences.auto_inflections'), sk: this.appState.get('referenced_user.preferences.skin'), r: this.get('current_revision')});
    if(this.get('last_cb.state') == state) {
      return this.get('last_cb.results');
    }
    var res = this.translated_buttons(label_locale, vocalization_locale);
    var _this = this;
    var trans = Object.assign({}, this.get('translations') || {});
    if(label_locale) {
      trans.board_name = trans.board_name || {};
      trans.board_name[this.get('locale')] = trans.board_name[this.get('locale')] || this.get('name');
      if(trans.board_name[label_locale]) {
        this.set('name', trans.board_name[label_locale]);
      }
    }
    _this.set('hidden_buttons', false);
    res.forEach(function(b) { 
      delete b['dim'];
      delete b['focus_word_match'];
      if(b.hidden) { _this.set('hidden_buttons', true) }
    });
    // Focus words: dim non-matches / highlight matches on THIS board directly.
    // Simple local match: check each button's label (or vocalization) against focus_words.list.
    // No hierarchy walk, no button-set regeneration — just the current board's buttons.
    if(this.appState.get('focus_words')) {
      var fw = this.appState.get('focus_words');
      var fwList = (fw && fw.list) || [];
      var fwUser = this.appState.get('focus_words.user_id');
      var sessUser = this.appState.get('sessionUser.id');
      var refUser = this.appState.get('referenced_user.id');
      var userOk = fwUser == null || fwUser === '' ||
        String(fwUser) === String(sessUser) ||
        (refUser != null && refUser !== '' && String(fwUser) === String(refUser));
      if(userOk && fwList.length > 0) {
        var focusWordsSet = {};
        fwList.forEach(function(w) {
          var norm = String(w || '').toLowerCase().trim();
          if(norm) { focusWordsSet[norm] = true; }
        });
        var matches_focus = function(s) {
          if(!s) { return false; }
          var norm = String(s).toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, '').trim();
          return !!focusWordsSet[norm];
        };
        res.forEach(function(button) {
          var voc = button.vocalization;
          var lbl = button.label;
          if(button.tr && button.tr[label_locale]) {
            voc = button.tr[label_locale][1];
            lbl = button.tr[label_locale][0];
          }
          var active = false;
          if(voc && !String(voc).match(/^:/) && matches_focus(voc)) { active = true; }
          else if(lbl && matches_focus(lbl)) { active = true; }
          button.dim = !active;
          button.focus_word_match = !!active;
        });
      }
    }
    if(this.appState.get('speak_mode')) {
      if((label_locale || '').split(/-|_/)[0] == (vocalization_locale || '').split(/-|_/)[0]) {
        if(this.appState.get('referenced_user.preferences.auto_inflections') || inflection_shift) {
          var inflection_types = editManager.inflection_for_types(history || [], label_locale, inflection_shift);

          res.forEach(function(button) {
            var rules = (label_locale && trans[button.id] && (trans[button.id][label_locale] || {}).rules) || 
                        (label_locale && trans[button.id] && (trans[button.id][label_locale.split(/-|_/)[0]] || {}).rules) || 
                        button.rules || [];
            var already_replaced = false;
            if(rules.length > 0 && !already_replaced) {
              var rule = utterance.first_rules(rules, history, true)[0];
              if(rule && rule.label) {
                if(rule.label.match(/^:/)) {
                  var ref_id = rule.label.slice(1);
                  // load button set, look for ref_id
                  if(_this.get('button_set')) {
                    var buttons = _this.get('button_set').redepth(_this.get('id'));
                    var match = buttons.find(function(b) { return b.ref_id == ref_id; });
                    if(match) {
                      var urls = _this.variant_image_urls(_this.appState.get('referenced_user.preferences.skin')) || {};
                      // try to find cache of image
                      if(!urls[match.image_id]) {
                        // urls[match.image_id] = match.image;
                        var p = _this.persistence || (typeof window !== 'undefined' && window.persistence);
                        if(p) {
                          p.find_url(match.image, 'image').then(function(data_uri) {
                            emberSet(match, 'image', data_uri);
                          });
                        }
                      }
                      inflection_types["btn" + button.id] = {
                        label: match.label,
                        image: match.image,
                        image_id: match.image_id,
                        board_id: match.linked_board_id,
                        board_key: match.linked_board_key
                      };
                    }
                  }
                } else {
                  var type = {
                    label: rule.label,
                  };
                  if(rule.label.match(/^_/) || button.text_only) {
                    type.label = rule.label.substring(1);
                    type.image = false;
                  }
                  if(rule.condense_items) { type.condense_items = rule.condense_items; }
                  inflection_types["btn" + button.id] = type;
                }
                already_replaced = true;
              }
            }  
          });
          res = editManager.update_inflections(res, inflection_types, trans, label_locale);
        }
      }
      if(capitalize) {
        // TODO: support capitalization
      }
    }
    this.set('last_cb', {state: state, results: res});
    return res;
  },
  /*
    pre words=button replacement
    pre words=:button with pointer id
    pre words=_text only
    pre &words=ampersanded will be removed as part of replacement
    :inflection_shift_id=inflection-specific result
  */
  different_locale: computed('shortened_locale', function() {
    var current = (navigator.language || 'en').split(/[-_]/)[0];
    return current != this.get('shortened_locale');
  }),
  shortened_locale: computed('locale', 'translated_locales', function() {
    var res = (this.get('locale') || 'en').split(/[-_]/)[0];
    if((this.get('translated_locales') || []).length > 1) { res = res + "+"; }
    return res;
  }),
  find_content_locally: function() {
    var _this = this;
    var fetch_promise = this.get('fetch_promise');
    if(this.get('fetched')) { return RSVP.resolve(); }
    if(fetch_promise) { return fetch_promise; }

    if(this.get('no_lookups')) {
      // we don't need to wait on this for an aggressive local load
      return RSVP.resolve(true);
    }

    var promises = [];
    var image_ids = [];
    var sound_ids = [];
    (this.get('buttons') || []).forEach(function(btn) {
      if(btn.image_id) {
        image_ids.push(btn.image_id);
      }
      if(btn.sound_id) {
        sound_ids.push(btn.sound_id);
      }
    });
    promises.push(this.persistence.push_records('image', image_ids));
    promises.push(this.persistence.push_records('sound', sound_ids));

    fetch_promise = RSVP.all_wait(promises).then(function() {
      _this.set('fetched', true);
      fetch_promise = null;
      _this.set('fetch_promise', null);
      return true;
    }, function() {
      fetch_promise = null;
      _this.set('fetch_promise', null);
    });
    _this.set('fetch_promise', fetch_promise);
    return fetch_promise;
  },
  set_all_ready: observer(
    'pending_buttons',
    'pending_buttons.[]',
    'pending_buttons.@each.content_status',
    function() {
      var allReady = true;
      if(!this.get('pending_buttons')) { return; }
      this.get('pending_buttons').forEach(function(b) {
        // 'missing' = no_lookups / local-only path gave up on image/sound (same as errored for display readiness)
        var s = b.get('content_status');
        if(s != 'ready' && s != 'errored' && s != 'missing') { allReady = false; }
      });
      this.set('all_ready', allReady);
    }
  ),
  prefetch_linked_boards: function() {
    var _this = this;
    var boards = this.get('linked_boards');
    var p = _this.persistence || (typeof window !== 'undefined' && window.persistence);
    runLater(function() {
      if(!p) { return; }
      var board_ids = [];
      boards.forEach(function(b) { if(b.id) { board_ids.push(b.id); } });
      p.push_records('board', board_ids).then(function(boards_hash) {
        for(var idx in boards_hash) {
          if(idx && boards_hash[idx]) {
//            boards_hash[idx].find_content_locally();
          }
        }
      }, function() { });
    }, 500);
  },
  clean_license: function() {
    var _this = this;
    ['copyright_notice', 'source', 'author'].forEach(function(key) {
      if(_this.get('license.' + key + '_link')) {
        _this.set('license.' + key + '_url', _this.get('license.' + key + '_url') || _this.get('license.' + key + '_link'));
      }
      if(_this.get('license.' + key + '_link')) {
        _this.set('license.' + key + '_link', _this.get('license.' + key + '_link') || _this.get('license.' + key + '_url'));
      }
    });
  },
  linked_boards: computed('buttons', function() {
    var buttons = this.get('buttons') || [];
    var result = [];
    for(var idx = 0; idx < buttons.length; idx++) {
      if(buttons[idx].load_board) {
        var board = buttons[idx].load_board;
        if(buttons[idx].link_disabled) {
          board.link_disabled = true;
        }
        result.push(board);
      }
    }
    return Utils.uniq(result, function(r) { return r.id; });
  }),
  unused_buttons: computed('buttons', 'grid', 'grid.order', function() {
    var unused = [];
    var grid = this.get('grid');
    var button_ids = [];
    if(grid && grid.order) {
      for(var idx = 0; idx < grid.order.length; idx++) {
        if(grid.order[idx]) {
          for(var jdx = 0; jdx < grid.order[idx].length; jdx++) {
            button_ids.push(grid.order[idx][jdx]);
          }
        }
      }
    }
    var buttons = this.get('buttons');
    buttons.forEach(function(button) {
      if(button_ids.indexOf(button.id) == -1) {
        unused.push(button);
      }
    });
    return unused;
  }),
  long_preview: computed('name', 'labels', 'user_name', 'created', function() {
    var date = templateHelpers.date(this.get('created'), 'day');
    var labels = this.get('labels');
    if(labels && labels.length > 100) {
      var new_labels = "";
      var ellipsed = false;
      labels.split(/, /).forEach(function(l) {
        if(new_labels.length === 0) {
          new_labels = l;
        } else if(new_labels.length < 75) {
          new_labels = new_labels + ", " + l;
        } else if(!ellipsed) {
          ellipsed = true;
          new_labels = new_labels + "...";
        }
      });
      labels = new_labels;
    }
    return this.get('key') + " (" + date + ") - " + this.get('user_name') + " - " + labels;
  }),
  search_string: computed('name', 'labels', 'user_name', function() {
    return this.get('name') + " " + this.get('user_name') + " " + this.get('labels');
  }),
  parent_board_id: attr('string'),
  parent_board_key: attr('string'),
  link: attr('string'),
  image_url: attr('string'),
  background: attr('raw'),
  hide_empty: attr('boolean'),
  buttons: attr('raw'),
  grid: attr('raw'),
  license: attr('raw'),
  images: hasMany('image', { async: true, inverse: null }),
  permissions: attr('raw'),
  copy: attr('raw'),
  copies: attr('number'),
  original: attr('raw'),
  word_suggestions: attr('boolean'),
  public: attr('boolean'),
  visibility: attr('string'),
  brand_new: attr('boolean'),
  protected: attr('boolean'),
  protected_settings: attr('raw'),
  non_author_uses: attr('number'),
  using_user_names: attr('raw'),
  downstream_boards: attr('number'),
  downstream_board_ids: attr('raw'),
  immediately_upstream_boards: attr('number'),
  unlinked_buttons: attr('number'),
  button_levels: attr('raw'),
  forks: attr('number'),
  total_buttons: attr('number'),
  shared_users: attr('raw'),
  sharing_key: attr('string'),
  starred: attr('boolean'),
  stars: attr('number'),
  /* `starred` is only populated by the backend on responses that pass
     `:permissions => @api_user` (see lib/json_api/board.rb#starred).
     The boards-index endpoint (used by the dashboard preview, boards
     page, and My Boards picker) does NOT pass permissions, so records
     loaded via list queries have starred=undefined. This computed
     fills the gap by checking the user's `stats.starred_board_refs`
     list (loaded with the user record), so any surface that needs
     "is this board liked by the current user" has a reliable answer.
     Falls back to the server-provided `starred` if it IS set (i.e.
     records loaded via the single-board endpoint), so we never lose
     accuracy. */
  starred_for_current_user: computed(
    'starred',
    'id',
    'global_id',
    'appState.referenced_user.stats.starred_board_refs.[]',
    function() {
      if(this.get('starred')) { return true; }
      var id = this.get('id') || this.get('global_id');
      if(!id) { return false; }
      var refs = this.appState.get('referenced_user.stats.starred_board_refs') || [];
      return !!refs.find(function(ref) { return ref && (ref.id == id || ref.id == this.get('global_id')); }.bind(this));
    }
  ),
  non_author_starred: attr('boolean'),
  star_or_unstar: function(star) {
    var _this = this;
    this.persistence.ajax('/api/v1/boards/' + this.get('id') + '/stars', {
      type: 'POST',
      data: {
        '_method': (star ? 'POST' : 'DELETE')
      }
    }).then(function(data) {
      _this.set('starred', data.starred);
      _this.set('stars', data.stars);
    }, function() {
      modal.warning(i18n.t('star_failed', "Like action failed"));
    });
  },
  star: function() {
    return this.star_or_unstar(true);
  },
  unstar: function() {
    return this.star_or_unstar(false);
  },
  embed_code: computed('link', function() {
    return "<iframe src=\"" + this.get('link') + "?embed=1\" frameborder=\"0\" style=\"min-width: 640px; min-height: 480px;\"><\\iframe>";

  }),
  check_for_copy: function() {
    // TODO: check local records for a user-specific copy as a fallback in case
    // offline
  },
  multiple_copies: computed('copies', function() {
    return this.get('copies') > 1;
  }),
  reload_if_lite: function() {
    // Boards first materialized from a #tree/#bulk lite prefetch (issues #286/#293)
    // omit parent_board_id, copies/copy, and the edit-gated shared_users. A full
    // /show always serializes parent_board_id (value may be null), so its absence
    // marks a lite-sourced record. Refetch so the share/details modals don't misread
    // a genuinely-shared board as "shared with nobody" or drop the "Copied From" link.
    // reload() never rejects out of here: on failure we just leave the record as-is
    // and the modal degrades to the pre-fix (lite) view rather than throwing.
    if(this.get('isNew') || !this.get('id')) { return RSVP.resolve(this); }
    if(this.get('parent_board_id') !== undefined) { return RSVP.resolve(this); }
    if(this.get('reloading_detail')) { return RSVP.resolve(this); }
    var _this = this;
    _this.set('reloading_detail', true);
    return _this.reload().then(function(board) {
      _this.set('reloading_detail', false);
      return board;
    }, function() {
      _this.set('reloading_detail', false);
      return _this;
    });
  },
  visibility_setting: computed('visibility', function() {
    var res = {};
    res[this.get('visibility')] = true;
    return res;
  }),
  lookup_editable_source: observer('local_only', 'editable_source', 'editable_source_key', function() {
    if(this.get('local_only') && this.get('obf_type') !== 'emergency') {
      if(this.get('editable_source_key') && this.get('editable_source.key') != this.get('editable_source_key')) {
        var _this = this;
        var key = _this.get('editable_source_key');
        LingoLinq.store.findRecord('board', key).then(function(board) {
          if(_this.get('editable_source_key') == key) {
            _this.set('editable_source', board);
          }
        }, function(err) { 
        });
      }
    }
  }),
  uncopyable: computed('local_only', 'editable_source', function() {
    if(this.get('local_only')) {
      return !this.get('editable_source');
    }
    return false;
  }),
  create_copy: function(user, make_public, swap_library, new_owner, disconnect) {
    var board = LingoLinq.store.createRecord('board', {
      parent_board_id: this.get('global_id') || this.get('id'),
      key: this.get('key').split(/\//)[1],
      name: this.get('copy_name') || this.get('name'),
      prefix: this.get('copy_prefix') || this.get('prefix'),
      description: this.get('description'),
      image_url: this.get('image_url'),
      license: this.get('license'),
      word_suggestions: this.get('word_suggestions'),
      public: (make_public || false),
      buttons: this.get('buttons'),
      grid: this.get('grid'),
      categories: this.get('categories'),
      intro: this.get('intro'),
      locale: this.get('locale'),
      translated_locales: this.get('locales'),
      for_user_id: (user && user.get('id')),
      translations: this.get('translations'),
      new_owner: new_owner,
      disconnect: disconnect
    });
    if(this.get('default_locale') && this.get('default_locale') != this.get('locale')) {
      // If setting a new default locale, do it here
      var new_loc = this.get('default_locale');
      var old_loc = this.get('locale');
      var trans = this.get('translations');
      var buttons = board.get('buttons') || [];
      buttons.forEach(function(btn) {
        trans[btn.id] = trans[btn.id] || {};
        trans[btn.id][old_loc] = trans[btn.id][old_loc] || {}
        if(!trans[btn.id][old_loc].label) {
          trans[btn.id][old_loc].label = btn.label;
          trans[btn.id][old_loc].vocalization = btn.vocalization;  
          trans[btn.id][old_loc].inflections = btn.inflections;  
        }
        if(trans[btn.id][new_loc]) {
          btn.label = trans[btn.id][new_loc].label;
          btn.vocalization = trans[btn.id][new_loc].vocalization;
          btn.inflections = trans[btn.id][new_loc].inflections;
        }
      });
      if(trans['board_name'] && trans['board_name'][new_loc]) {
        board.set('name', trans['board_name'][new_loc]);
      }
      board.set('buttons', buttons);
      board.set('locale', new_loc);
    }
    if(this.get('local_only')) {
      board.set('parent_board_id', null);
    }
    if(board.get('intro')) {
      board.set('intro.unapproved', true);
    }
    this.set('copy_name', null);
    this.set('copy_prefix', null);
    var _this = this;
    var res = board.save();
    res.then(function() {
      _this.rollbackAttributes();
    }, function() { });
    return res;
  },
  add_button: function(button) {
    var buttons = this.get('buttons') || [];
    var new_button = $.extend({}, button.raw());
    new_button.id = button.get('id');
    var collision = false;
    var max_id = 0;
    for(var idx = 0; idx < buttons.length; idx++) {
      if(buttons[idx].id == new_button.id) {
        collision = true;
      }
      max_id = Math.max(max_id, parseInt(buttons[idx].id, 10));
    }
    if(collision || !new_button.id) {
      new_button.id = max_id + 1;
    }
    buttons.push(new_button);
    var grid = this.get('grid');
    var placed = false;
    if(grid && grid.order) {
      for(var idx = 0; idx < grid.order.length; idx++) {
        if(grid.order[idx]) {
          for(var jdx = 0; jdx < grid.order[idx].length; jdx++) {
            if(!grid.order[idx][jdx] && !placed) {
              grid.order[idx][jdx] = new_button.id;
              placed = true;
            }
          }
        }
      }
      this.set('grid', $.extend({}, grid));
    }
    this.set('buttons', [].concat(buttons));
    return new_button.id;
  },
  reload_including_all_downstream: function(affected_board_ids) {
    affected_board_ids = affected_board_ids || [];
    if(affected_board_ids.indexOf(this.get('id')) == -1) {
      affected_board_ids.push(this.get('id'));
    }
    var found_board_ids = [];
    // when a board is copied, we need to reload all the original versions,
    // so if any of them are in-memory or in indexeddb, then we need to
    // reload or fetch them remotely to get the latest, updated version,
    // which will include the "my copy" information.
    var do_reloads = this.appState.get('board_reloads') || {};
    LingoLinq.store.peekAll('board').forEach(function(brd) {
      if(brd && affected_board_ids && affected_board_ids.indexOf(brd.get('id')) != -1) {
        if(!brd.get('isLoading') && !brd.get('isNew') && !brd.get('isDeleted')) {
          do_reloads[brd.get('id')] = true;
        }
        found_board_ids.push(brd.get('id'));
      }
    });
    affected_board_ids.forEach(function(id) {
      if(found_board_ids.indexOf(id) == -1) {
        this.persistence.find('board', id).then(function() {
          // Mark as needing to be reloaded if ever retrieved
          do_reloads[id] = true;
        }, function() { });
      }
    });
    this.appState.set('board_reloads', do_reloads);
  },
  button_visible: function(button_id) {
    var grid = this.get('grid');
    if(!grid || !grid.order) { return false; }
    for(var idx = 0; idx < grid.order.length; idx++) {
      if(grid.order[idx]) {
        for(var jdx = 0; jdx < grid.order[idx].length; jdx++) {
          if(grid.order[idx][jdx] == button_id) {
            return true;
          }
        }
      }
    }
    return false;
  },
  checkForDataURL: function() {
    if(!this || !this.persistence) {
      return RSVP.reject({ error: 'board or persistence not ready' });
    }
    this.set('checked_for_data_url', true);
    var url = this.get('icon_url_with_fallback');
    var _this = this;
    if(!this.get('image_data_uri') && LingoLinq.remote_url(url)) {
      return this.persistence.find_url(url, 'image').then(function(data_uri) {
        if(_this) { _this.set('image_data_uri', data_uri); }
        return _this;
      });
    } else if(url && url.match(/^data/)) {
      return RSVP.resolve(this);
    }
    var url = this.get('background.image');
    if(!this.get('background_image_data_uri') && LingoLinq.remote_url(url) && this.persistence) {
      this.persistence.find_url(url, 'image').then(function(data_uri) {
        if(_this) { _this.set('background_image_data_uri', data_uri); }
        return _this;
      });
    }
    var url = this.get('background.prompt.sound');
    if(!this.get('background_sound_data_uri') && LingoLinq.remote_url(url) && this.persistence) {
      this.persistence.find_url(url, 'sound').then(function(data_uri) {
        if(_this) { _this.set('background_sound_data_uri', data_uri); }
        return _this;
      });
    }
    return RSVP.reject('no board data url');
  },
  background_image_url_with_fallback: computed('background.image', 'background_image_data_uri', function() {
    return this.get('background_image_data_uri') || this.get('background.image');
  }),
  background_sound_url_with_fallback: computed('background_sound_data_uri', 'background.prompt.sound', function() {
    return this.get('background_sound_data_uri') || this.get('background.prompt.sound');
  }),
  has_background: computed('background.image', 'background.text', function() {
    return this.get('background.image') || this.get('background.text');
  }),
  checkForDataURLOnChange: observer('image_url', 'background.image', function() {
    this.checkForDataURL().then(null, function() { });
  }),
  prompt: function(action) {
    var _this = this;
    if(action == 'clear' || !this.appState.get('speak_mode')) {
      if(_this.get('reprompt_wait')) {
        runCancel(_this.get('reprompt_wait'));
        _this.set('reprompt_wait', null);
      }
    } else {
      var text = _this.get('background.prompt.text');
      if(_this.get('reprompt_wait')) {
        runCancel(_this.get('reprompt_wait'));
        _this.set('reprompt_wait', null);
      }
      if(_this.get('background.prompt.timeout') && !action) {
        _this.set('reprompt_wait', runLater(function() {
          _this.prompt('start');
        }, _this.get('background.prompt.timeout')));
        return;
      }
      if(action == 'reprompt' && _this.get('background.delay_prompts.length') > 0) {
        var idx = _this.get('prompt_index') || 0;
        text = _this.get('background.delay_prompts')[idx % _this.get('background.delay_prompts.length')];
        idx++;
        _this.set('prompt_index', idx);
      }
      if(_this.get('background.prompt.text')) {
        speecher.speak_text(text, false, {alternate_voice: speecher.alternate_voice});
      }
      if(_this.get('background.prompt.sound_url') && action != 'reprompt') {
        speecher.speak_audio(_this.get('background_sound_url_with_fallback'), 'background', false, {loop: _this.get('background.prompt.loop')});
      }
      if(_this.get('background.delay_prompt_timeout') && _this.get('background.delay_prompt_timeout') > 0) {
        _this.set('reprompt_wait', runLater(function() {
          _this.prompt('reprompt');
        }, _this.get('background.delay_prompt_timeout')));
      }
    }
  },
  for_sale: computed('protected', 'protected_settings', function() {
    if(this.get('protected')) {
      var settings = this.get('protected_settings') || {};
      if(settings.cost) {
        return true;
      } else if(settings.root_board) {
        return true;
      }
    }
    return false;
  }),
  protected_material: computed(
    'protected',
    'local_images_with_license',
    'local_sounds_with_license',
    function() {
      var protect = !!this.get('protected');
      if(protect) { return true; }
      (this.get('local_images_with_license') || []).forEach(function(image) {
        if(image && image.get('protected')) {
          protect = true;
        }
      });
      if(protect) { return true; }
      (this.get('local_sounds_with_license') || []).forEach(function(sound) {
        if(sound && sound.get('protected')) {
          protect = true;
        }
      });
      return !!protect;
    }
  ),
  copying_state: computed('protected_sources', 'protected_settings.copyable', function() {
    var res = {};
    if(this.get('protected_sources.board')) {
      if(this.get('protected_settings.copyable')) {
        res.limited = true;
      } else {
        res.none = true;
      }
    } else {
      res = null;
    }
    return res;
  }),
  protected_sources: computed('protected_material', 'protected_settings', function() {
    var res = {};
    if(this.get('protected_material')) {
      if(this.get('protected_settings.media')) {
        (this.get('protected_settings.media_sources') || ['lessonpix']).forEach(function(key) {
          res[key] = true;
        });
      }
      if(this.get('protected_settings.vocabulary')) {
        res.board = true;
      }
    }
    res.list = Object.keys(res);
    return res;
  }),
  load_button_set: function(force, skipEmberRecordReload) {
    var _this = this;
    var sync_buttons_from_set = function(button_set) {
      var buttons = button_set && button_set.redepth(_this.get('id'));
      var current_buttons = _this.get('buttons');
      if(buttons && buttons.length && (!current_buttons || !current_buttons.length)) {
        _this.set('buttons', buttons);
        _this.get('appState').incrementProperty('board_reload_key');
      }
      return button_set;
    };
    if(this.get('button_set_needs_reload') && !skipEmberRecordReload) {
      force = true;
      this.set('button_set_needs_reload', null);
    }
    if(this.get('button_set') && !force) {
      if((this.get('button_set.buttons.length')) || this.get('button_set.root_url')) {
        return this.get('button_set').load_buttons().then(sync_buttons_from_set);
      }
    }
    if(this.get('local_only')) {
      var res = RSVP.reject({error: 'board is local only'});
      res.then(null, function() { });
      return res;
    }
    if(!this.get('id')) { return RSVP.reject({error: 'board has no id'}); }
    var button_set = LingoLinq.store.peekRecord('buttonset', this.get('id'));
    if(button_set && !force && ((button_set.get('buttons') && button_set.get('buttons').length) || button_set.get('root_url'))) {
      this.set('button_set', button_set);
      return button_set.load_buttons().then(sync_buttons_from_set);
    } else {
      var valid_button_set = null;
      // first check if there's a satisfactory higher-level buttonset that can be used instead
      LingoLinq.store.peekAll('buttonset').forEach(function(bs) {
        if(bs && (bs.get('board_ids') || []).indexOf(_this.get('id')) != -1) {
          if((bs.get('buttons') && bs.get('buttons').length) || bs.get('root_url')) {
            if(bs.get('fresh') || !valid_button_set) {
              valid_button_set = bs;
            }
          }
        }
      });
      if(valid_button_set && !force) {
        if(!_this.get('fresh') || valid_button_set.get('fresh')) {
          _this.set('button_set', valid_button_set);
          return valid_button_set.load_buttons().then(sync_buttons_from_set);
        } else{
        }
      }
      var buttonset = LingoLinq.Buttonset || Buttonset;
      if(!buttonset || typeof buttonset.load_button_set !== 'function') {
        return RSVP.reject({error: 'buttonset module not loaded'});
      }
      var res = buttonset.load_button_set(this.get('id'), force, this.get('full_set_revision'), skipEmberRecordReload).then(function(button_set) {
        _this.set('button_set', button_set);
        return sync_buttons_from_set(button_set);
      });
      res.then(sync_buttons_from_set, function() { });
      return res;
    }
  },
  clear_real_time_changes: function() {
    var lbls_tmp = document.getElementsByClassName('tweaked_label');
    var lbls = [];
    for(var idx = 0; idx < lbls_tmp.length; idx++) {
      lbls.push(lbls_tmp[idx]);
    }
    lbls.forEach(function(lbl) {
      if(is_suggestion_label(lbl) && !lbl.closest('.clone')) {
        lbl.innerText = lbl.getAttribute('original-text');
        lbl.classList.remove('tweaked_label');
        var btn = lbl.closest('.button');
        if(btn && btn.getAttribute('original-aria-label') != null) {
          btn.setAttribute('aria-label', btn.getAttribute('original-aria-label'));
          btn.removeAttribute('original-aria-label');
        }
        var sym = btn && btn.querySelector('img.symbol.overridden');
        if(sym) {
          sym.style.display = '';
          lbl.style.fontSize = '';
        }
      }
    });
  },
  load_real_time_inflections: function() {
    if(this.get('isDeleted')) {
      return;
    }
    var history = this.stashes.get('working_vocalization') || [];
    // TODO: update inflections for linked buttons as well
    // for load_board settings add a new option to support inflections
    var buttons = this.contextualized_buttons(this.appState.get('label_locale'), this.appState.get('vocalization_locale'), history, false, this.appState.get('inflection_shift'));
    var _this = this;
    var trans = this.get('translations') || {};
    var loc = this.appState.get('label_locale') == this.appState.get('vocalization_locale') ? this.appState.get('label_locale') : null;
    buttons.forEach(function(button) {
      var cap = _this.appState.get('shift');
      if((button.vocalization || '').match(/^:/)) {
      } else if(button.tweaked) {
        var revert = (history.length == 0 && !_this.appState.get('inflection_shift'));
        var str = revert ? button.original_label : button.label;
        if(cap) {
          str = utterance.capitalize(str);
        }
        _this.update_suggestion_button(button, {
          temporary: true,
          word: str
        });
      } else if(cap) {
        _this.update_suggestion_button(button, {
          temporary: true,
          word: utterance.capitalize(button.label)
        });
      }
    });
  },
  load_word_suggestions: function(board_ids) {
    if(this.get('isDeleted')) {
      return null;
    }
    var working = [].concat(this.stashes.get('working_vocalization') || []);
    var in_progress = null;
    if(working.length > 0 && working[working.length - 1].in_progress) {
      in_progress = working.pop().label;
    }
    var last_word = ((working[working.length - 1]) || {}).label;
    var second_to_last_word = ((working[working.length - 2]) || {}).label;

    var _this = this;
    var has_suggested_buttons = false;
    var buttons = {};
    var inflection_buttons = {};
    var skip_labels = {};
    var history = this.stashes.get('working_vocalization') || [];
    var known_buttons = this.contextualized_buttons(this.appState.get('label_locale'), this.appState.get('vocalization_locale'), history, false, null) || [];
    var inflections = [];
    LingoLinq.special_actions.forEach(function(act) {
      if(act.types) {
        inflections.push(act.action);
      }
    });
    known_buttons.forEach(function(button) {
      if(button.vocalization == ':suggestion') {
        buttons[button.id.toString()] = button;
        has_suggested_buttons = true;
      } else if(inflections.indexOf(button.vocalization) != -1 || is_inflection_modifier_button(button)) {
        inflection_buttons[button.id.toString()] = button;
        has_suggested_buttons = true;
      } else if(button.label && !button.vocalization && !button.load_board) {
        skip_labels[button.label.toLowerCase()] = true;
      }
    });
    if(!has_suggested_buttons) {
      return null;
    }
    var suggested_buttons = [];
    var inflectors = [];
    var order = this.get('grid.order') || [];
    for(var idx = 0; idx < order.length; idx++) {
      for(var jdx = 0; jdx < (order[idx] || []).length; jdx++) {
        if(order[idx][jdx]) {
          var button = buttons[order[idx][jdx].toString()];
          if(button && button.vocalization == ':suggestion') {
            suggested_buttons.push(button);
          }
          var infl = inflection_buttons[order[idx][jdx].toString()];
          if(infl && is_inflection_modifier_button(infl)) {
            inflectors.push(infl);
          }
        }
      }
    }
    if(suggested_buttons.length == 0 && inflectors.length == 0) { return null; }
    inflectors.forEach(function(infl) {
      var act = inflection_action_for_button(infl);
      var last_button = working[working.length - 1];
      var last_pos = utterance_part_of_speech(last_button);
      if(!last_pos && last_button && last_button.button_id != null) {
        var source_btn = known_buttons.find(function(b) { return b.id == last_button.button_id; });
        last_pos = utterance_part_of_speech(source_btn);
      }
      if(last_button && !last_button.modified && act && last_pos && act.types.indexOf(last_pos) != -1 && act.alter) {
        var res = {part_of_speech: last_pos};
        act.alter(null, last_button.label, last_button.label, res);
        if(_this.appState.get('shift')) {
          res.label = utterance.capitalize(res.label);
        }
        _this.update_suggestion_button(infl, {word: res.label, temporary: true});
      }
    });
    var lookup_ids = word_suggestions.lookup_board_ids(_this.appState, _this.stashes, (board_ids || []).concat(_this.get('id')));
    word_suggestions.load_vocabulary_button_sets(_this.appState, _this.stashes, (board_ids || []).concat(_this.get('id'))).then(function(warmed_sets) {
      word_suggestions.lookup({
        last_finished_word: last_word || "",
        second_to_last_word: second_to_last_word,
        word_in_progress: in_progress,
        locale: _this.appState.get('label_locale') || _this.get('locale') || 'en',
        board_locale: _this.get('locale') || 'en',
        translations: _this.get('translations'),
        board_ids: lookup_ids,
        button_sets: warmed_sets,
        max_results: suggested_buttons.length > 5 ? (suggested_buttons.length + 3) : (suggested_buttons.length * 2)
      }).then(function(result) {
        var unique_result = (result || []).filter(function(sugg) { return sugg.word && !skip_labels[sugg.word.toLowerCase()]; });
        var merged = unique_result.concat(result);
        var seen = new Set();
        result = merged.filter(function(item) {
          if (seen.has(item)) { return false; }
          seen.add(item);
          return true;
        });
        (result || []).forEach(function(sugg, idx) {
          if(suggested_buttons[idx]) {
            var suggestion_button = suggested_buttons[idx];
            if(sugg.word && _this.appState.get('shift')) {
              sugg = $.extend({}, sugg);
              sugg.word = utterance.capitalize(sugg.word);
            }
            _this.update_suggestion_button(suggestion_button, sugg);
            var persistenceForSugg = _this.persistence || (typeof window !== 'undefined' && window.persistence);
            sugg.image_update = function() {
              if(!persistenceForSugg) { return; }
              persistenceForSugg.find_url(sugg.image, 'image').then(function(data_uri) {
                sugg.data_image = data_uri;
                _this.update_suggestion_button(suggestion_button, sugg);
              }, function() {
                _this.update_suggestion_button(suggestion_button, sugg);
              });
            };
          }
        });
      }, function() { });
    }, function() { });
  },
  _sync_ordered_button_suggestion: function(button, suggestion) {
    if(!suggestion || !suggestion.word) { return; }
    var ctrl = editManager.controller;
    if(!ctrl || !ctrl.get || !ctrl.get('is_board_detail')) { return; }
    var ordered = ctrl.get('ordered_buttons');
    if(!ordered || !ordered.length) { return; }
    var button_id = button.id.toString();
    var url = word_suggestions.resolve_word_image(suggestion);
    if(url && this.persistence && this.persistence.url_cache && this.persistence.url_cache[url]) {
      url = this.persistence.url_cache[url];
    }
    var show_predictions = word_predictions_visible(this.appState);
    var changed = false;
    var newOb = ordered.map(function(row) {
      return (row || []).map(function(btn) {
        if(!btn || btn.id == null || btn.id.toString() !== button_id) { return btn; }
        if(!show_predictions) { return btn; }
        var updates = {};
        if(btn.label !== suggestion.word) { updates.label = suggestion.word; }
        if(url && btn.image_url !== url) { updates.image_url = url; }
        if(!Object.keys(updates).length) { return btn; }
        changed = true;
        return Object.assign({}, btn, updates);
      });
    });
    if(changed) {
      ctrl.set('ordered_buttons', newOb);
    }
  },
  update_suggestion_button: function(button, suggestion) {
    var _this = this;
    var lookups = _this.get('suggestion_lookups') || {};
    var brds = document.getElementsByClassName('board');
    var font_family = Button.style(this.appState.get('currentUser.preferences.device.button_style')).font_family;
    var show_predictions = word_predictions_visible(this.appState);
    for(var idx = 0; idx < brds.length; idx++) {
      var brd = brds[idx];
      if(brd && brd.getAttribute('data-id') == _this.get('id')) {
        var btns = brd.getElementsByClassName('button');
        for(var jdx = 0; jdx < btns.length; jdx++) {
          var btn = btns[jdx];
          if(btn && btn.getAttribute('data-id') == button.id.toString() && !btn.classList.contains('clone')) {
            // set the values in the DOM, and save them in a lookup
            var url = null;
            if(!suggestion.temporary) {
              lookups[button.id.toString()] = suggestion;
              url = word_suggestions.resolve_word_image(suggestion);
              if(url && this.persistence && this.persistence.url_cache && this.persistence.url_cache[url]) {
                url = this.persistence.url_cache[url];
              }
            }
            var lbl = suggestion_label_element(btn);
            var img = btn.getElementsByClassName('symbol')[0]
            if(lbl && lbl.tagName != 'INPUT') {
              if(!lbl.getAttribute('original-text')) {
                lbl.setAttribute('original-text', button.original_label || lbl.innerText);
              }
              lbl.classList.add('tweaked_label');
              var display_word = show_predictions ? suggestion.word : button.label;
              lbl.innerText = display_word;
              if(btn.classList.contains('md-board-detail-symbol-card') && display_word) {
                if(btn.getAttribute('original-aria-label') == null) {
                  btn.setAttribute('original-aria-label', btn.getAttribute('aria-label') || '');
                }
                btn.setAttribute('aria-label', display_word);
              }
              if(button.text_only) {
                var width = parseInt(btn.style.width, 10);
                var height = parseInt(btn.style.height, 10);
                var sym = btn.querySelector('.symbol');
                if(sym) {
                  sym.style.display = 'none';
                  sym.classList.add('overridden');
                }
                var fit = capabilities.fit_text(lbl.innerText, font_family || 'Arial', width, height, 10);
                if(fit.any_fit) {
                  lbl.style.fontSize = fit.size + "px";
                }
              }
            }
            if(img) {
              if(!img.getAttribute('original-src') && img.src) {
                img.setAttribute('original-src', img.src);
              }
              if(url) {
                img.style.display = '';
                img.src = show_predictions ? url : (img.getAttribute('original-src') || url);
              } else if(show_predictions && !suggestion.temporary && img.getAttribute('original-src')) {
                img.style.display = '';
                img.src = img.getAttribute('original-src');
              }
            }
          }
        }
      }
    }
    _this.set('suggestion_lookups', lookups);
    _this._sync_ordered_button_suggestion(button, suggestion);

  },
  add_classes: function() {
    if(this.get('classes_added')) { return; }
    (this.get('buttons') || []).forEach(function(button) {
      boundClasses.add_rule(button);
      boundClasses.add_classes(button);
    });
    this.set('classes_added', true);
  },
  set_fast_html: function(fast) {
    if(fast) {
      var list = ['width', 'height', 'inflection_prefix', 'inflection_shift', 'skin', 'symbols', 'label_locale', 'display_level', 'revision', 'html'];
      var keys = Object.keys(fast)
      var missing = list.filter(function(s) { return keys.indexOf(s) < 0; });
      var extras = keys.filter(function(s) { return list.indexOf(s) < 0; });
      if(missing.length > 0) {
        console.error("BAST FAST_HTML, missing:", missing);
      } else if(extras.length > 0) {
        console.error("BAST FAST_HTML, unexpected:", missing);        
      }
    }
    this.set('fast_html', fast);
  },
  render_fast_html: function(size) {
    LingoLinq.log.track('redrawing');

    var grid = this.get('grid');
    if(!grid || !(grid.rows >= 1) || !(grid.columns >= 1)) {
      return null;
    }
    var buttons = this.contextualized_buttons(this.appState.get('label_locale'), this.appState.get('vocalization_locale'), this.stashes.get('working_vocalization'), false, this.appState.get('inflection_shift'));
    var ob = [];
    for(var idx = 0; idx < grid.rows; idx++) {
      var row = [];
      for(var jdx = 0; jdx < grid.columns; jdx++) {
        var found = false;
        for(var kdx = 0; kdx < buttons.length; kdx++) {
          if(buttons[kdx] && buttons[kdx].id && buttons[kdx].id == (grid.order[idx] || [])[jdx]) {
            found = true;
            var btn = $.extend({}, buttons[kdx]);
            row.push(btn);
          }
        }
        if(!found) {
          row.push({
            empty: true,
            label: '',
            id: -1
          });
        }
      }
      ob.push(row);
    }

    var starting_height = Math.floor((size.height / (grid.rows || 2)) * 100) / 100;
    var starting_width = Math.floor((size.width / (grid.columns || 2)) * 100) / 100;
    var extra_pad = size.extra_pad;
    var inner_pad = size.inner_pad;
    var double_pad = inner_pad * 2;
    var radius = 4;
    var context = null;

    var currentLabelHeight = size.base_text_height - 3;
    this.set('text_size', 'normal');
    if(starting_height < 35) {
      this.set('text_size', 'really_small_text');
      // Scale label down so images stay visible on dense grids
      currentLabelHeight = Math.min(currentLabelHeight, Math.max(Math.floor(starting_height * 0.25), 8));
    } else if(starting_height < 75) {
      this.set('text_size', 'small_text');
      // Scale label down so images stay visible on dense grids
      currentLabelHeight = Math.min(currentLabelHeight, Math.max(Math.floor(starting_height * 0.3), 10));
    }

    var _this = this;
    var preferred_symbols = size.symbols || this.appState.get('referenced_user.preferences.preferred_symbols') || (this.appState.get('speak_mode') && this.stashes.get('session_preferred_symbols')) || 'original';

    var button_html = function(button, pos) {
      var res = "";

      var vars = (_this.variant_image_urls(size.skin) || {})
      var original_image_url = vars[button.image_id];
      var pref_original_image_url = vars[button.image_id + '-' + preferred_symbols];
      var unvarianted_image_url = original_image_url && original_image_url.replace(/\.variant-.+\.(png|svg)$/, '');
      var persistence = _this.persistence || (typeof window !== 'undefined' && window.persistence);
      var url_cache = persistence && persistence.url_cache ? persistence.url_cache : {};
      var local_image_url = url_cache[pref_original_image_url || 'none'] || url_cache[original_image_url || 'none'] || url_cache[unvarianted_image_url || 'none'] || pref_original_image_url || original_image_url || 'none';
      // Fallback for word art and other images (e.g. data URLs) that may not be in image_urls
      if((!local_image_url || local_image_url === 'none') && button.image_id) {
        var locals = _this.get('local_images_with_license') || [];
        var img = locals.find(function(l) { return l.get && String(l.get('id')) === String(button.image_id); });
        if(img && img.get('url')) {
          local_image_url = img.get('url');
        }
      }
      var hc = !pref_original_image_url && !!(_this.get('hc_image_ids') || {})[button.image_id];
      var local_sound_url = (url_cache[(_this.get('sound_urls') || {})[button.sound_id] || 'none'] || (_this.get('sound_urls') || {})[button.sound_id] || 'none');
      boundClasses.add_rule(button);
      boundClasses.add_classes(button);
      var opts = Button.button_styling(button, _this, pos);
      var anchor_class = (opts.button_class && opts.button_class.toString().indexOf('button') !== -1) ? opts.button_class : ('button ' + (opts.button_class || ''));

      // Add darkened outline inline (same approach as board-detail page)
      var btnStyle = opts.button_style || '';
      if(button.background_color && window.tinycolor) {
        var darkenedBorder = window.tinycolor(button.background_color).darken(20).toRgbString();
        btnStyle = btnStyle + 'outline-color:' + darkenedBorder + ';';
      }
      res = res + "<a href='#' style='" + btnStyle + "' class='" + anchor_class + "' data-id='" + button.id + "' tabindex='0'>";
      res = res + "<div class='" + opts.action_class + "'>";
      res = res + "<span class='action'>";
      res = res + "<img src='" + opts.action_image + "' draggable='false' alt='" + opts.action_alt + "' />";
      res = res + "</span>";
      res = res + "</div>";

      res = res + "<span style='" + opts.image_holder_style + "'>";
      var appState = _this.appState || (typeof window !== 'undefined' && window.appState);
      var userForDisplay = (appState && appState.get('speak_mode')) ? appState.get('referenced_user') : appState.get('currentUser');
      if(appState && userForDisplay && !userForDisplay.get('hide_symbols') && local_image_url && local_image_url != 'none' && !_this.get('text_only') && !button.text_only) {
        var symbol_alt = Button.clean_text(opts.label || '').replace(/"/g, '&quot;');
        res = res + "<img src=\"" + Button.clean_url(local_image_url) + "\" rel=\"" + Button.clean_url(pref_original_image_url || original_image_url) + "\" alt=\"" + symbol_alt + "\" onerror='button_broken_image(this);' draggable='false' style='" + opts.image_style + "' class='symbol " + (hc ? ' hc' : '') + "' />";
      }
      res = res + "</span>";
      if(button.sound_id && local_sound_url && local_sound_url != 'none') {
        var rel_url = Button.clean_url(_this.get('sound_urls')[button.sound_id]);
        var url = Button.clean_url(local_sound_url);
        res = res + "<audio style='display: none;' preload='auto' src=\"" + url + "\" rel=\"" + rel_url + "\"></audio>";
      }
      var button_class = button.text_only ? size.text_only_button_symbol_class : size.button_symbol_class;
      var txt = Button.clean_text(opts.label);
      var text_style = '';
      var holder_style = '';
      if(button.text_only) {
        var fit = capabilities.fit_text(txt, (pos.font_family || opts.font_family || 'Arial'), pos.width, pos.height, 10);
        holder_style = "style='position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; z-index: 1;'";
        if(fit.any_fit) {
          text_style = "style='font-size: " + fit.size + "px;'";
        }
      } else if(txt && pos.width) {
        // Scale down label font when text is too wide for the button
        var baseFontSize = size.base_text_height || 18;
        var estCharWidth = baseFontSize * 0.6;
        var maxChars = Math.floor(pos.width / estCharWidth);
        if(txt.length > maxChars && maxChars > 0) {
          var scaledSize = Math.max(Math.floor(pos.width / (txt.length * 0.6)), 8);
          if(scaledSize < baseFontSize) {
            text_style = "style='font-size: " + scaledSize + "px;'";
          }
        }
      }

      res = res + "<div class='" + button_class + "' " + holder_style + ">";
      res = res + "<span " + text_style + "class='button-label " + (button.hide_label ? "hide-label" : "") + "'>" + txt + "</span>";
      res = res + "</div>";

      res = res + "</a>";
      return res;
    };
    var html = "";

    var displayUser = (this.appState && this.appState.get('speak_mode')) ? this.appState.get('referenced_user') : this.appState.get('currentUser');
    var devicePrefs = (displayUser && displayUser.get && displayUser.get('preferences.device')) || (typeof window !== 'undefined' && window.user_preferences && window.user_preferences.device);
    var text_position = "text_position_" + (devicePrefs && devicePrefs.button_text_position ? devicePrefs.button_text_position : 'top');
    if(this.get('text_only')) { text_position = "text_position_text_only"; }

    LingoLinq.log.track('computing dimensions');
    ob.forEach(function(row, i) {
      html = html + "\n<div class='button_row fast'>";
      row.forEach(function(button, j) {
        boundClasses.add_rule(button);
        if(size.display_level && button.level_modifications) {
          var do_show = false;
          if(do_show && size.display_level == _this.get('default_level')) {
          } else {
            var mods = button.level_modifications;
            var level = size.display_level;
            // console.log("mods at", mods, level);
            // Coerce string "true"/"false" rule values to real booleans
            // (Button.coerce_level_value) — boundClasses.add_classes
            // below checks `if(button.hidden)`, and the string "false"
            // is truthy, which would hide buttons the level promotes.
            if(mods.override) {
              for(var key in mods.override) {
                button[key] = Button.coerce_level_value(key, mods.override[key]);
              }
            }
            if(mods.pre) {
              for(var key in mods.pre) {
                if(!mods.override || mods.override[key] == null) {
                  button[key] = Button.coerce_level_value(key, mods.pre[key]);
                }
              }
            }
            for(var idx = 1; idx <= level; idx++) {
              if(mods[idx]) {
                for(var key in mods[idx]) {
                  if(!mods.override || mods.override[key] == null) {
                    button[key] = Button.coerce_level_value(key, mods[idx][key]);
                  }
                }
              }
            }
          }
        }
        boundClasses.add_classes(button);
        var button_height = starting_height - (extra_pad * 2);
        var button_width = starting_width - (extra_pad * 2);
        var top = extra_pad + (i * starting_height);
        var left = extra_pad + (j * starting_width) - 2;

        var image_height = (button_height - currentLabelHeight - LingoLinq.boxPad - (inner_pad * 2) + 8) * 0.9;
        var image_width = (button_width - LingoLinq.boxPad - (inner_pad * 2) + 8) * 0.9;

        var top_margin = currentLabelHeight + LingoLinq.labelHeight - 8;
        if(_this.get('text_size') == 'really_small_text') {
          if(currentLabelHeight > 0) {
            image_height = image_height + currentLabelHeight - LingoLinq.labelHeight + 25;
            top_margin = 0;
          }
        } else if(_this.get('text_size') == 'small_text') {
          if(currentLabelHeight > 0) {
            image_height = image_height + currentLabelHeight - LingoLinq.labelHeight + 10;
            top_margin = top_margin - 10;
          }
        }
        if(button_height < 50) {
          image_height = image_height + (inner_pad * 2);
        }
        if(button_width < 50) {
          image_width = image_width + (inner_pad * 2) + (extra_pad * 2);
        }
        if(currentLabelHeight === 0 || text_position != 'text_position_top') {
          top_margin = 0;
        }

        html = html + button_html(button, {
          top: top,
          left: left,
          width: Math.floor(button_width),
          height: Math.floor(button_height),
          image_height: image_height,
          image_width: image_width,
          image_square: Math.max(Math.min(image_height, image_width), 0),
          image_top_margin: top_margin,
          border: inner_pad
        });
      });
      html = html + "\n</div>";
    });
    return {
      width: size.width,
      height: size.height,
      inflection_prefix: this.appState.get('inflection_prefix'),
      inflection_shift: this.appState.get('inflection_shift'),
      skin: this.appState.get('referenced_user.preferences.skin'),
      symbols: preferred_symbols,
      label_locale: size.label_locale,
      display_level: size.display_level,
      revision: _this.get('current_revision'),
      html: htmlSafe(html)
    };
  }
});

LingoLinq.Board.clear_fast_html = function() {
    var hasUnsavedImages = LingoLinq.store.peekAll('image').some(function(img) {
      return img.get('isSaving');
    });
    if (hasUnsavedImages) {
      console.log('[BOARD] Skipping clear_fast_html because image uploads are in progress');
      return;
    }
    LingoLinq.store.peekAll('board').forEach(function(b) {
      b.set('fast_html', null);
    });
    var appState = this.appState || window.appState || (window.LingoLinq && window.LingoLinq.appState);
    if(appState && appState.get && appState.get('currentBoardState.id') && editManager.controller && !editManager.controller.get('ordered_buttons')) {
      editManager.process_for_displaying();
    }
};
LingoLinq.Board.refresh_data_urls = function() {
    // when you call sync, you're potentially prefetching a bunch of images and
    // sounds that don't have a locally-stored copy yet, so their data-uris will
    // all come up empty. But then if you open one of those boards without
    // refreshing the page, they're stored in the ember-data cache without a
    // data-uri so they fail if you go offline, even though they actually
    // got persisted to the local store. This method tried to address that
    // shortcoming.
    var _this = this;
    runLater(function() {
      LingoLinq.store.peekAll('board').forEach(function(i) {
        if(i) {
          i.checkForDataURL().then(null, function() { });
        }
      });
      LingoLinq.store.peekAll('image').forEach(function(i) {
        if(i) {
          i.checkForDataURL().then(null, function() { });
        }
      });
      LingoLinq.store.peekAll('sound').forEach(function(i) {
        if(i) {
          i.checkForDataURL().then(null, function() { });
        }
      });
    });
};
LingoLinq.Board.mimic_server_processing = function(record, hash) {
    if(hash.board.id.match(/^tmp/)) {
      var splits = (hash.board.key || hash.board.id).split(/\//);
      var key = splits[1] || splits[0];
      var rnd = "tmp_" + Math.round(Math.random() * 10000).toString() + (new Date()).getTime().toString();
      hash.board.key = rnd + "/" + key;
    }
    hash.board.permissions = {
      "view": true,
      "edit": true
    };

    hash.board.buttons = hash.board.buttons || [];
    delete hash.board.images;
    hash.board.grid = {
      rows: (hash.board.grid && hash.board.grid.rows) || 2,
      columns: (hash.board.grid && hash.board.grid.columns) || 4,
      order: (hash.board.grid && hash.board.grid.order) || []
    };
    for(var idx = 0; idx < hash.board.grid.rows; idx++) {
      hash.board.grid.order[idx] = hash.board.grid.order[idx] || [];
      for(var jdx = 0; jdx < hash.board.grid.columns; jdx++) {
        hash.board.grid.order[idx][jdx] = hash.board.grid.order[idx][jdx] || null;
      }
      if(hash.board.grid.order[idx].length > hash.board.grid.columns) {
        hash.board.grid.order[idx] = hash.board.grid.order[idx].slice(0, hash.board.grid.columns);
      }
    }
    if(hash.board.grid.order.length > hash.board.grid.rows) {
      hash.board.grid.order = hash.board.grid.order.slice(0, hash.board.grid.rows);
    }
    return hash;
};

var skin_unis = {
  'light': '1f3fb',
  'medium-light': '1f3fc',
  'medium': '1f3fd',
  'medium-dark': '1f3fe',
  'dark': '1f3ff',
};
LingoLinq.Board.which_skinner = function(skin) {
  var which_skin = function() { return skin; };
  if(skin == 'original') {
    which_skin = function() { return 'default'; }
  } else if(!skin.match(/default|light|medium-light|medium|medium-dark|dark/)) {
    var weights = skin.match(/-(\d)(\d)(\d)(\d)(\d)(\d)$/);
    var df = weights ? parseInt(weights[1], 10) : 2;
    var d = weights ? parseInt(weights[2], 10) : 2;
    var md = weights ? parseInt(weights[3], 10) : 2;
    var m = weights ? parseInt(weights[4], 10) : 2;
    var ml = weights ? parseInt(weights[5], 10) : 2;
    var l = weights ? parseInt(weights[6], 10) : 2;
    var sum = df + d + md + m + ml + l;
    df = df / sum * 100;
    d = d / sum * 100;
    md = md / sum * 100;
    m = m / sum * 100;
    ml = ml / sum * 100;
    l = l / sum * 100;
    which_skin = function(url) {
      var str = url + "::" + skin;
      var sum = Array.from(str).map(function(c) { return c.charCodeAt(0); }).reduce(function(a, b) { return a + b; });
      var mod = sum % 100;
      if(mod < df) { return 'default'; }
      else if(mod < df + d) { return 'dark'; }
      else if(mod < df + d + md) { return 'medium-dark'; }
      else if(mod < df + d + md + m) { return 'medium'; }
      else if(mod < df + d + md + m + ml) { return 'medium-light'; }
      else { return 'light'; }
    }
  }
  return which_skin;
};
LingoLinq.Board.is_skinned_url = function(url) {
  if(url.match(/varianted-skin\.\w+$/)) {
    return true;
  } else if(url.match(/\/libraries\/twemoji\//) && url.match(/-var\w+UNI/)) {
    return true;
  } else {
    return false;
  }
};
// True when URL already selects a concrete skin tone (not the varianted-skin base).
LingoLinq.Board.is_skin_tone_variant_url = function(url) {
  if(!url || typeof url !== 'string') { return false; }
  if(url.match(/\.variant-(dark|light|medium|medium-dark|medium-light|unskinned)\.\w+$/i)) {
    return true;
  }
  if(url.match(/\/libraries\/twemoji\//) && url.match(/-var[0-9a-f]+UNI/i)) {
    return true;
  }
  return false;
};
LingoLinq.Board.skinned_url = function(url, which_skin, unskin) {
  var which_override = null;
  if(unskin) {
    which_override = "unskinned";
  }
  if(!LingoLinq.Board.is_skinned_url(url)) { return url; }
  if(url.match(/varianted-skin\.\w+$/)) {
    var which = which_skin(which_override || url);
    if(which != 'default') {
      return url.replace(/varianted-skin\./, 'variant-' + which + '.');
    } else {
      return url;
    }
  } else if(url.match(/\/libraries\/twemoji\//) && url.match(/-var\w+UNI/)) {
    var which = which_skin(which_override || url);
    var uni = skin_unis[which];
    if(which != 'default' && uni) {
      return url.replace(/-var\w+UNI/g, '-' + uni);
    } else {
      return url;
    }
  } else {
    return url;
  }
};

// Transform an image_id → URL map by applying the user's skin-tone preference
// to each URL. Returns a new map; input is not mutated. Used by board-alt
// (via variant_image_urls) and board-detail (via _build_from_raw) so both
// pages perform skin substitution the same way.
//
// opts.unskins — { image_id: true } map; those keys also get an 'ns_' + key entry
//   holding the unskinned URL variant (matches variant_image_urls behavior).
// opts.persistence — when provided, falls back to the original URL if the
//   skinned variant isn't cached locally and the original is (prevents offline
//    404s when only the base URL has been cached).
// Only backend-verified skin bases (.varianted-skin or twemoji skin codes) are
// rewritten by skin_image_map. Plain /libraries/.../file.png URLs are not
// speculatively upgraded — many symbols have no variant files on OpenSymbols.
LingoLinq.Board.upgrade_url_for_skin_variants = function(url) {
  if(!url || typeof url !== 'string') { return url; }
  return url;
};

LingoLinq.Board.unskin_tone_variant_url = function(url) {
  if(!url || typeof url !== 'string') { return url; }
  if(url.match(/\.variant(?:ed-skin|-[^.]+)\.\w+$/)) {
    return url.replace(/\.variant(?:ed-skin|-[^.]+)\.\w+$/, '');
  }
  return url;
};

LingoLinq.Board.skin_image_map = function(image_map, skin, opts) {
  image_map = image_map || {};
  if(!skin || skin == 'default') { return image_map; }
  opts = opts || {};
  var unskins = opts.unskins || {};
  var persistence = opts.persistence || null;
  var which_skin = LingoLinq.Board.which_skinner(skin);
  var res = {};
  var resolve = function(base_url, unskin) {
    var url = LingoLinq.Board.skinned_url(
      LingoLinq.Board.upgrade_url_for_skin_variants(base_url),
      which_skin,
      unskin
    );
    var online = persistence && (typeof persistence.get === 'function' ? persistence.get('online') : persistence.online);
    if(persistence && !online && !persistence.url_cache[url] && persistence.url_cache[base_url] && (!persistence.url_uncache || !persistence.url_uncache[base_url])) {
      url = base_url;
    }
    return url;
  };
  for(var key in image_map) {
    if(key && image_map[key]) {
      res[key] = resolve(image_map[key], false);
      if(unskins[key]) {
        res['ns_' + key] = resolve(image_map[key], true);
      }
    }
  }
  return res;
};

export default LingoLinq.Board;

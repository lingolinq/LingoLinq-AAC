/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

import EmberObject from '@ember/object';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import capabilities from './capabilities';
import persistence from './persistence';
import tts_voices from './tts_voices';
import app_state from './app_state';
import i18n from './i18n';
import stashes from './_stashes';
import Utils from './misc';
import LingoLinq from '../app';
import { computed } from '@ember/object';

var cloud_locales = ["af-ZA:f","ar-XA:fm","bg-BG:f","bn-IN:fm","ca-ES:f",
  "cmn-CN:fm","cmn-TW:fm","cs-CZ:f","da-DK:fm","de-DE:fm","el-GR:f","en-AU:fm","en-GB:fm",
  "en-IN:fm","en-US:fm","es-ES:fm","es-US:fm","fi-FI:f","fil-PH:fm","fr-CA:fm","fr-FR:fm",
  "gu-IN:fm","hi-IN:fm","hu-HU:f","id-ID:fm","is-IS:f","it-IT:fm","ja-JP:fm","kn-IN:fm","ko-KR:fm",
  "lv-LV:m","ml-IN:fm","ms-MY:fm","nb-NO:fm","nl-BE:fm","nl-NL:fm","pa-IN:fm","pl-PL:fm","pt-BR:fm",
  "pt-PT:fm","ro-RO:f","ru-RU:fm","sk-SK:f","sr-RS:f","sv-SE:fm","ta-IN:fm","te-IN:fm","th-TH:f",
  "tr-TR:fm","uk-UA:f","vi-VN:fm","yue-HK:fm"];
var me_speak_locales = {
  'en-n': 'en/en-n', 'en-rp': 'en/en-rp', 'en-sc': 'en/en-sc', 'en-us': 'en/en-us', 'en-wm': 'en/en-wm',
  'ca': 'ca', 'cs': 'cs', 'de': 'de', 'el': 'el', 'eo': 'eo',
  'es-la': 'es-la', 'es': 'es', 'fi': 'fi', 'fr': 'fr', 'hu': 'hu',
  'it': 'it', 'kn': 'kn', 'la': 'la', 'lv': 'lv', 'nl': 'nl',
  'pl': 'pl', 'pt-pt': 'pt-pt', 'pt': 'pt', 'ro': 'ro',
  'sk': 'sk', 'sv': 'sv', 'tr': 'tr', 'zu-yue': 'zu-yue', 'zh': 'zh'
};
var speecher = EmberObject.extend({
  beep_url: "https://d18vdu4p71yql0.cloudfront.net/beep.mp3",
  chimes_url: "https://d18vdu4p71yql0.cloudfront.net/chimes.mp3",
  click_url: "https://d18vdu4p71yql0.cloudfront.net/click.mp3",
  ding_url: "https://d18vdu4p71yql0.cloudfront.net/ding.mp3",
  bleep_url: "https://d18vdu4p71yql0.cloudfront.net/bleep.mp3",
  spinner_url: "https://d18vdu4p71yql0.cloudfront.net/spinner.mp3",
  battery_url: "https://d18vdu4p71yql0.cloudfront.net/battery.mp3",
  glug_url: "https://d18vdu4p71yql0.cloudfront.net/glug.mp3",
  dice_url: "https://d18vdu4p71yql0.cloudfront.net/dice.mp3",
  partner_start_url: "https://d18vdu4p71yql0.cloudfront.net/partner-start.mp3",
  partner_end_url: "https://d18vdu4p71yql0.cloudfront.net/partner-end.mp3",
  follower_url: "https://d18vdu4p71yql0.cloudfront.net/follower.mp3",
  voices: [],
  text_direction: function() {
    var voice = speecher.get('voices').find(function(v) { return v.voiceURI == speecher.voiceURI; });
    var locale = (voice && voice.lang) || navigator.language || 'en-US';
    return i18n.text_direction(locale);
  },
  refresh_voices: function() {
    var list = [];
    var voices = speecher.scope.speechSynthesis.getVoices() || [];
    if(capabilities.system == 'iOS' && capabilities.installed_app) {
      // iOS has such strict rules around not abusing speechSynthesis
      // that is basically unusable, despite my best efforts.
      voices = [];
    }
    for(var idx = 0; idx < voices.length; idx++) {
      list.push((voices._list || voices)[idx]);
    }
    var _this = this;
    if(capabilities.system == 'iOS' && window.TTS && window.TTS.checkLanguage) {
      var browser_voices = speecher.scope.speechSynthesis.getVoices() || [];
      window.TTS.checkLanguage().then(function(list) {
        if(list && list.split) {
          var voices = _this.get('voices');
          var more_voices = [];
          var langs = list.split(',');
          langs.forEach(function(str) {
            var pieces = str.split(/:/);
            var lang = pieces[0];
            var id = pieces[1];
            var name = "System Voice for " + lang;
            if(pieces[2]) {
              name = "System Voice (" + pieces[2] + ")";
            }
            if(id) {
              var browser_voice = browser_voices.find(function(v) { return v.voiceURI == id; });
              if(browser_voice) {
                name = browser_voice.name + " " + lang;
              }
            }
            more_voices.push({
              lang: lang,
              ident: id,
              name: name,
              system_voice: (name.match(/^System/) || (id && id.match(/ttsbundle\.siri/)) || (id && id.match(/voice\.compact/))),
              voiceURI: 'tts:' + lang + ":" + id
            });
          });
          voices = more_voices.concat(voices);
          voices = Utils.uniq(voices, function(v) { return v.voiceURI; });
          _this.set('voices', voices);
        }
      }, function() { });
    } else if(capabilities.system == 'Windows' && window.TTS && window.TTS.getAvailableVoices) {
      window.TTS.getAvailableVoices({success: function(list) {
        list.forEach(function(voice) {
          var voices = _this.get('voices');
          var more_voices = [];
          more_voices.push({
            lang: voice.language,
            name: voice.name,
            voiceURI: voice.voice_id
          })
          voices = more_voices.concat(voices);
          voices = Utils.uniq(voices, function(v) { return v.voiceURI; });
          _this.set('voices', voices);
        })
      }});
    }
    capabilities.tts.available_voices().then(function(voices) {
      var orig_voices = _this.get('voices');
      var more_voices = [];
      voices.forEach(function(voice) {
        if(voice.active) {
          var ref_voice = tts_voices.find_voice(voice.voice_id);
          if(ref_voice) {
            voice.name = ref_voice.name;
            voice.locale = ref_voice.locale;
          }
          more_voices.push({
            lang: voice.locale,
            name: voice.name,
            addon_voice: true,
            voiceURI: "extra:" + voice.voice_id
          });
        }
      });
      var voices = more_voices.concat(orig_voices);
      voices = Utils.uniq(voices, function(v) { return v.voiceURI; });
      _this.set('voices', voices);
    }, function() { });
    var add_low = false;
    if(window.speak || window.meSpeak) {
      add_low = true;
    }
    if(list.length === 0) {
      list.push({
        name: "Default Voice",
        voiceURI: ""
      });
    }
    // Need a remote English voice for low-cost Kindles
    if(!navigator.language.match(/en/)) {
      list.push({
        name: "English Female (Internet Required)",
        lang: 'en-US',
        remote_voice: true,
        voiceURI: "remote:en-US:female"
      });  
    }
    var match = cloud_locales.find(function(loc) { return loc.match(navigator.language); });
    var same = cloud_locales.filter(function(loc) { return loc.indexOf(navigator.language.split(/-|_/)[0]) == 0; });
    if(match) {
      same = [match];
    }
    same.forEach(function(match) {
      var parts = match.split(':');
      var loc = i18n.locales[parts[0].replace(/-/, '_')] || i18n.other_locales[parts[0].replace(/-/, '_')] || i18n.locales[parts[0].split(/-|_/)[0]];
      if(parts[1].match(/f/) && loc) {
        list.push({
          name: loc + i18n.t('female_internet_required', " Female *Internet Required*"),
          lang: parts[0],
          remote_voice: true,
          voiceURI: "remote:" + parts[0] + ":female"
        })
      }
      if(parts[1].match(/m/) && loc) {
        list.push({
          name: loc + i18n.t('male_internet_required', " Male *Internet Required*"),
          lang: parts[0],
          remote_voice: true,
          voiceURI: "remote:" + parts[0] + ":male"
        })
      }
    });

    if(!navigator.language.match(/uk/)) {
      list.push({
        name: i18n.t('female_ukranian_internet_required', "Ukranian Female *Internet Required*"),
        lang: 'uk-UA',
        remote_voice: true,
        voiceURI: "remote:uk-UA:female"
      });
    }
    list.push({
      name: i18n.t('irish_female_internet_required', "Irish Female *Internet Required*"),
      lang: 'ga-IE',
      remote_voice: true,
      voiceURI: "remote:ga-IE:Ulster"
    });
    if(add_low) {
      var locale = ((i18n.langs || {}).preferred || window.navigator.language).replace(/_/, '-');
      var loc = 'en-us';
      var lang = 'en-US';
      if(window.meSpeak) {
        if(me_speak_locales[locale.toLowerCase()]) {
          loc = locale.toLowerCase();
          lang = locale;
        } else if(me_speak_locales[locale.split(/-/)[0]]) {
          loc = locale.split(/-/)[0];
          lang = loc;
        }
      }
      var i18nlang = i18n.locales_localized[lang] || i18n.locales[lang] || lang;
      list.push({
        name: i18nlang + i18n.t('low_quality_male_voice', " Low-Quality Male Voice"),
        lang: lang,
        voiceURI: "speak_js:" + loc
      });
    }
    if(!this.get('voices') || this.get('voices').length === 0) {
      this.set('voices', list);
    }
    return list;
  },
  check_for_upgrades: function() {
    var latest_version = tts_voices.get('versions.' + capabilities.system);
    if(capabilities.system == 'Windows' && !this.get('checked_for_voice_upgrades')) {
      this.set('checked_for_voice_upgrades', true);
      if(window.file_storage) {
        window.file_storage.voice_content(function(data) {
          var version = parseFloat(data.version.replace(/_/, '.'));
          if(version < latest_version) {
            window.file_storage.upgrade_voices(latest_version, tts_voices.find_voice);
          }
        })
      }
    }
  },
  voiceList: computed('voices', function() {
    var res = [];
    var current_locale = ((i18n.langs || {}).preferred || window.navigator.language || "").replace(/-/g, '_').toLowerCase();
    var current_lang = current_locale.split(/_/)[0];
    speecher.get('voices').forEach(function(v, idx) {
      var name = v.name;
      if(v.lang) {
        name = v.name + " (" + v.lang + ")";
      }
      var locale = (v.lang || "").replace(/-/g, '_').toLowerCase();
      var lang = locale.split(/_/)[0];
      res.push({
        id: v.voiceURI || (v.name + " " + v.lang),
        name: name,
        system_voice: v.system_voice,
        addon_voice: v.addon_voice,
        locale: locale,
        lang: lang,
        index: idx
      });
    });
    // show most-likely candidates at the top
    return res.sort(function(a, b) {
      var a_first = false;
      var b_first = false;
      if(a.locale == current_locale && b.locale != current_locale) {
        a_first = true;
      } else if(b.locale == current_locale && a.locale != current_locale) {
        b_first = true;
      } else if(a.lang == current_lang && b.lang != current_lang) {
        a_first = true;
      } else if(b.lang == current_lang && a.lang != current_lang) {
        b_first = true;
      } else if(a.addon_voice && !b.addon_voice) {
        a_first = true;
      } else if(b.addon_voice && !a.addon_voice) {
        b_first = true;
      } else if(a.system_voice && !b.system_voice) {
        a_first = true;
      } else if(b.system_voice && !a.system_voice) {
        b_first = true;
      }
      if(a_first) {
        return -1;
      } else if(b_first) {
        return 1;
      } else {
        return a.index - b.index;
        // right now we're keeping the same order they came in, assuming there was
        // some reasoning behind the browser's order of voices..
//         if(a.name < b.name) {
//           return -1;
//         } else if(a.name > b.name) {
//           return 1;
//         } else {
//           return 0;
//         }
      }
    });
  }),
  check_readiness: function() {
    if(!this.ready) {
      capabilities.tts.init();
    }
    this.ready = true;
    var ios = function() {
      // ios has a weird quirk where sometimes a list of voices shows
      // up, but sometimes it doesn't. this *might* help add consistency.
      // ref: http://stackoverflow.com/questions/28948562/web-speech-api-consistently-get-the-supported-speech-synthesis-voices-on-ios-sa
      var u = new window.SpeechSynthesisUtterance();
      u.text = "test";
      u.lang = "ja-JP";
      try {
        u.voice = {name: "ja-JP", voiceURI: "ja-JP", lang: "ja-JP", localService: true, default: true};
      } catch(e) { }
    };
    if(capabilities.system == 'iOS') {
//       runLater(ios, 1000);
    }
//     this.ready = !!(!speecher.scope.speechSynthesis.voiceList || speecher.scope.speechSynthesis.voiceList.length > 0);
  },
  set_voice: function(voice, alternate_voice) {
    this.pitch = voice.pitch;
    this.volume = voice.volume;
    this.rate = voice.rate;
    this.voiceURI = null;
    if(voice.voice_uri) {
      var voices = speecher.get('voices');
      var found_voice = voices.find(function(v) { return v.voiceURI == voice.voice_uri; });
      if(found_voice) {
        this.voiceURI = found_voice.voiceURI;
        this.voiceLang = found_voice.lang;
      } else if(voice.voice_uri == 'force_default') {
        this.voiceURI = 'force_default';
        this.voiceLang = navigator.language;
      } else if(!this.voiceURI && voices.length > 0) {
        this.voiceURI = voices[0].voiceURI;
        this.voiceLang = voices[0].lang;
      }
      this.voice = voice;
    }
    if(alternate_voice && alternate_voice.enabled && alternate_voice.voice_uri) {
      this.alternate_pitch = alternate_voice.pitch;
      this.alternate_volume = alternate_voice.volume;
      this.alternate_rate = alternate_voice.rate;
      this.alternate_voiceURI = null;
      var voices = speecher.get('voices');
      var found_voice = voices.find(function(v) { return v.voiceURI == alternate_voice.voice_uri; });
      if(found_voice) {
        this.alternate_voiceURI = found_voice.voiceURI;
        this.alternate_voiceLang = found_voice.lang;
      } else if(alternate_voice.voice_uri == 'force_default') {
        this.alternate_voiceURI = 'force_default';
        this.alternate_voiceLang = navigator.language;
      }
      this.alternate_voice = alternate_voice;
    }
  },
  adjusted_rate: function(rate, voiceURI) {
    rate = rate || 1.0;
    voiceURI = voiceURI || 'default';
    var ios = capabilities.system == 'iOS';
    var too_fast_voice = (ios && (capabilities.browser == 'Safari' || capabilities.browser == 'App') && (!capabilities.system_version || capabilities.system_version < 9.0));
    // 1.0 should be normal speed, 1.5 should be abrupt, 2.0 should fast & barely understandable
    if(ios && (voiceURI.match(/tts:/) || voiceURI == 'force_default')) {
      // ios tts: 1.1, 1.2, 1.3
      if(rate >= 1) {
        rate = 1.1 + ((rate - 1.0) * 0.1);
      }
    } else if(ios && too_fast_voice) {
      rate = rate * 0.2;
    } else if(voiceURI.match(/Google/)) {
      // chrome: 1.0, 1.25, 1.5
      if(rate > 1) {
        rate = 1.0 + ((rate - 1.0) / 2);
      }
    } else if(capabilities.system == 'Android' && (voiceURI.match(/tts:/) || voiceURI == 'force_default')) {
      // android: 1.0, 2.0, 3.0
      if(rate > 1) {
        rate = 1.0 + ((rate - 1.0) * 2);
      }
    } else if(capabilities.system == 'Android' && voiceURI.match(/acap:/)) {
      // android acap: 1.0, 1.4, 1.8
      if(rate > 1) {
        rate = 1.0 + ((rate - 1.0) * 0.8);
      }
    } else if(capabilities.system == 'Android') {
      // android: 1.0, 2.0, 3.0
      if(rate > 1) {
        rate = 1.0 + ((rate - 1.0) * 2);
      }
    } else if(ios && voiceURI.match(/acap:/)) {
      // acap: 1.4, 2.0, 2.6      
      if(rate >= 1) {
        rate = 1.4 + ((rate - 1.0) * 1.2);
      }
    } else if(ios) {
      // ios: 1.0, 1.2, 1.4
      if(rate >= 1) {
        rate = 1.1 + ((rate - 1.0) * 0.3);
      }
    }
    return rate;
    // var too_fast_voice = (ios && (capabilities.browser == 'Safari' || capabilities.browser == 'App') && (!capabilities.system_version || capabilities.system_version < 9.0));
    // if(too_fast_voice) {
    //   return rate * 0.2;
    // } else if(ios && ((voiceURI && voiceURI.match(/tts:/)) || voiceURI == 'force_default')) {
    //   return 0.7;
    // }
    // return 1.0;
  },
  speak_id: 0,
  speak_text: function(text, collection_id, opts) {
    opts = opts || {};
    var already_in_collection = collection_id && this.speaking_from_collection == collection_id;
    if(this.speaking_from_collection && !collection_id) {
      // lets the user start building their next sentence without interrupting the current one
      return;
    } else if(this.speaking && opts.interrupt === false) {
      return;
    } else if(already_in_collection && opts.prevent_repeat) {
      return;
    } else if(this.speaking_from_collection && opts.prevent_repeat && opts.prevent_any) {
      return;
    }
    var interrupted = false;
    if(already_in_collection) {
    } else {
      interrupted = this.speaking;
      this.stop('text');
    }
    if(!text) { return; }
    text = text.toString();
    text = text.replace(/…/, '...');
    // iOS TTS quirk
    if(text.replace(/\s+/g, '') == "I") { text = "eye"; }
    if(text.replace(/\s+/g, '') == "went") { text = "wend"; }
    var _this = this;
    var speak_id = this.speak_id++;
    this.last_speak_id = speak_id;
    var pieces = text.split(/\.\.\./);
    var pieces_started = (new Date()).getTime();
    var next_piece = function() {
      var piece_text = pieces.shift();

      if(!piece_text || (_this.last_stop && pieces_started < _this.last_stop)) {
        _this.speak_end_handler(speak_id);
      } else if(piece_text.length === 0 || piece_text.match(/^\s+$/)) {
        runLater(function() {
          if(_this.last_speak_id == speak_id) {
            next_piece();
          }
        }, 500);
      } else if(_this.last_speak_id != speak_id) {
        // speech has moved on to something else
        _this.speak_end_handler(speak_id);
      } else {
        _this.speak_raw_text(piece_text, collection_id, opts, function() {
          if(pieces.length > 0) {
            runLater(function() {
              if(_this.last_speak_id == speak_id) {
                next_piece();
              }
            }, 500);
          } else {
            _this.speak_end_handler(speak_id);
          }
        });
      }
    };
    var delay = 0;
    if(capabilities.system == 'Windows' && interrupted) { console.log("waiting for last speak to wrap up..."); delay = 300; }
    var runVoice = function() {
      runLater(function() {
        next_piece();
      }, delay);
    };
    _this.set_output_target(opts, runVoice);
  },
  set_output_target: function(opts, callback) {
    opts = opts || {};
    var _this = this;
    var target = opts.target || "default";
    if(_this.alternate_voice && _this.alternate_voice.target && opts.alternate_voice && !opts.target) {
      target = _this.alternate_voice.target;
    } else if(_this.voice && _this.voice.target && !opts.alternate_voice && !opts.target) {
      target = _this.voice.target;
    }
    // Don't keep re-setting the output target if you're already
    // on the right one
    if(_this.current_target != target) {
      _this.current_target = target;
      capabilities.output.set_target(target).then(callback, callback);
    } else if(callback) {
      callback();
    }
  },
  find_voice_by_uri: function(uri, locale, allow_fallbacks) {
    if(uri == 'force_default') { return null; }
    var voices = speecher.get('voices');
    var uri_match = function() {
      // Try to find the exact voice
      var voice = voices.find(function(v) { return v.voiceURI == uri; });
      // Sometimes voiceURI is just the string
      voice = voice || voices.find(function(v) { return (v.name + " " + v.lang) == uri; });
      // Sometimes voiceURI is just the lang
      voice = voice || voices.find(function(v) { return v.lang == uri; });
      return voice;
    };
    // Try to find the matching voice if you can
    var voice = uri_match();
    var locale = (locale || (i18n.langs || {}).preferred || window.navigator.language).toLowerCase().replace(/_/, '-');
    var language = locale && locale.split(/-/)[0];
    var mapped_lang = i18n.lang_map[language] || language;
    if(locale && voice && voice.lang && locale != 'any') {
      // If locale is set but the voice doesn't match, clear it.
      // This is used when we're on a board for a different language
      // than the user's default, but we need to check 
      // the 3-letter language codes as well.
      var voice_lang = voice.lang.toLowerCase().replace(/_/, '-').split(/-/)[0];
      if(voice_lang != language && i18n.lang_map[voice_lang] != mapped_lang && voice_lang != mapped_lang) { voice = null; }
    }
    if(allow_fallbacks) {
      if(locale == 'any') {
        locale = ((i18n.langs || {}).preferred || window.navigator.language).toLowerCase().replace(/_/, '-');
        language = locale && locale.split(/-/)[0];    
      }
      // Don't use remote voices as fallbacks
      var local_voices = voices.filter(function(v) { return !v.remote_voice });
      // Can't find an exact match? Look for a best match by locale
      // First prioritize Google voices because they sound better
      voice = voice || local_voices.find(function(v) { return language && v.name && v.name.match(/^Google/) && v.lang && [language, mapped_lang].indexOf(v.lang.toLowerCase().split(/[-_]/)[0]) != -1; });
      // Then look for voices that match the full locale string
      voice = voice || local_voices.find(function(v) { return locale && locale.match(/-|_/) && v.lang && (v.lang.toLowerCase().replace(/_/, '-') == locale || v.lang.toLowerCase().replace(/-/, '_') == locale); });
      // Then look for voices that match the lang portion of the locale string
      voice = voice || local_voices.find(function(v) { return language && v.lang && [language, mapped_lang].indexOf(v.lang.toLowerCase().split(/[-_]/)[0]) != -1; });
      // Then try again with matching, since that'll be better than whatever just comes first
      voice = voice || uri_match();
      // Then look for the first default voice
      voice = voice || local_voices.find(function(v) { return v['default']; });
      // Finally use a remote voice if it's all there is
      if(persistence.get('online')) {
        voice = voice || voices.find(function(v) { return locale && locale.match(/-|_/) && v.lang && (v.lang.toLowerCase().replace(/_/, '-') == locale || v.lang.toLowerCase().replace(/-/, '_') == locale); });
        voice = voice || voices.find(function(v) { return language && v.lang && [language, mapped_lang].indexOf(v.lang.toLowerCase().split(/[-_]/)[0]) != -1; });
        voice = voice || voices.find(function(v) { return v['default']; });
      }
      // If none found, return a temporary voice from the cloud_locales list
      if(!voice && persistence.get('online')) {
        var remote = cloud_locales.find(function(loc) { return loc.toLowerCase().replace(/-/, '_') == locale; });
        remote = remote || cloud_locales.find(function(loc) { return loc.split(/-|_/)[0] == mapped_lang; });
        if(remote) {
          var parts = remote.split(/:/)[0]
          var loc = i18n.locales[parts[0].replace(/-/, '_')] || i18n.other_locales[parts[0].replace(/-/, '_')] || i18n.locales[parts[0].split(/-|_/)[0]];
          if(parts[1].match(/f/) && loc) {
            voice = {
              name: loc + i18n.t('female_internet_required', " Female *Internet Required*"),
              lang: parts[0],
              remote_voice: true,
              voiceURI: "remote:" + parts[0] + ":female"
            };
          }
        }
      }
      // Finally fall back to something terrible that at least makes noise
      voice = voice || voices[0];
    }
    return voice;
  },
  speak_raw_text: function(text, collection_id, opts, callback) {
    var _this = this;
    if(text.length == 1 && text == text.toUpperCase()) {
      // On iOS, a single letter is read "capital B" instead of just "B"
      text = text.toLowerCase();
    }
    // Replace fancy quote marks with normal ones, or some TTS engines get confused
    text = text.replace(/‘|’/g, "'").replace(/“|”/g, '"');
    var current_locale = app_state.get('vocalization_locale');
    if(opts.default_prompt && opts.voiceURI) { current_locale = 'any'; }
    if(opts.alternate_voice) {
      opts.volume = this.alternate_volume || ((opts.volume || 1.0) * 0.75);
      opts.pitch = this.alternate_pitch;
      opts.rate = this.alternate_rate;
      opts.voiceURI = this.alternate_voiceURI;
      if(app_state.get('vocalization_locale')) {
        // If the alternate voice doesn't match the expected locale, use a different voice
        var set_locale = app_state.get('vocalization_locale').split(/[-_]/)[0].toLowerCase();
        var voice_locale = (_this.alternate_voiceLang || navigator.language).split(/[-_]/)[0].toLowerCase();
        if(set_locale != voice_locale) {
          opts.voiceURI = (speecher.find_voice_by_uri(_this.alternate_voiceURI, current_locale, true) || {}).voiceURI || _this.alternate_voiceURI;
        }
      }
    }
    opts.volume = opts.volume || this.volume || 1.0;
    opts.pitch = opts.pitch || this.pitch || 1.0;
    if(!opts.voiceURI) {
      opts.voiceURI = this.voiceURI;
      if(app_state.get('vocalization_locale')) {
        // If the voice doesn't match the expected locale, use a different voice
        var set_locale = app_state.get('vocalization_locale').split(/[-_]/)[0].toLowerCase();
        var voice_locale = (this.voiceLang || navigator.language).split(/[-_]/)[0].toLowerCase();
        if(set_locale != voice_locale) {
          opts.voiceURI = (speecher.find_voice_by_uri(_this.voiceURI, current_locale, true) || {}).voiceURI || _this.voiceURI;
        }
      }
    }
    opts.voiceURI = opts.voiceURI || this.voiceURI;
    opts.rate = opts.rate || this.rate || 1.0;
    var _this = this;
    if(speecher.scope.speechSynthesis) {
      if(opts.interrupt !== false) {
        this.speaking = true;
        this.speaking_from_collection = collection_id;
      }
      var utterance = new speecher.scope.SpeechSynthesisUtterance();
      utterance.text = text;
      utterance.rate = opts.rate;
      utterance.volume = opts.volume;
      utterance.pitch = opts.pitch;
      utterance.voiceURI = opts.voiceURI;
      var voice = null;
      if(opts.voiceURI != 'force_default') {
        voice = speecher.find_voice_by_uri(opts.voiceURI, current_locale, true);
      }
      // Try to render default prompts in the locale's language
      if(opts.default_prompt) {
        var prompts = tts_voices.get('prompts') || {};
        var lang = ((voice && voice.lang) || navigator.language).toLowerCase().split(/-|_/)[0];
        var prompt = prompts[lang] || prompts[i18n.lang_map[lang]];
        if(prompt) {
          utterance.text = prompt;
          text = utterance.text;
        }
      }
      utterance.rate = speecher.adjusted_rate(utterance.rate, (voice && voice.voiceURI) || opts.voiceURI);

      var speak_utterance = function() {
        speecher.last_utterance = utterance;
        if(opts && opts.voiceURI != 'force_default') {
          if(capabilities.system == 'iOS' && capabilities.ios_version && capabilities.ios_version < 9) {
          } else {
            try {
              utterance.voice = voice;
            } catch(e) { }  
            if(voice) {
              try {
                utterance.lang = voice.lang;
              } catch(e) { }
            }
          }
        }
        var handle_callback = function() {
          utterance.handled = true;
          if(callback) { callback(); }
        };
        if(utterance.addEventListener) {
          utterance.addEventListener('end', function() {
            console.log("ended");
            handle_callback();
          });
          utterance.addEventListener('error', function() {
            console.log("errored");
            LingoLinq.track_error("error rendering synthesized voice", opts);
            handle_callback();
          });
          var hit_boundary = null;
          var any_boundary = false;
          utterance.addEventListener('boundary', function(e) {
            any_boundary = true;
            hit_boundary = (new Date()).getTime();
          });
          var check_boundary = function() {
            if(utterance.handled) { return; }
            if(any_boundary && !hit_boundary) {
              console.log("stopped talking");
              handle_callback();
            } else {
              hit_boundary = false;
              runLater(check_boundary, 1000);
            }
          };
          runLater(check_boundary, 2500);

          utterance.addEventListener('pause', function() {
            console.log("paused");
            handle_callback();
          });
        } else {
          utterance.onend = handle_callback;
          utterance.onerror = handle_callback;
          utterance.onpause = handle_callback;
        }
        var extra_delay = 0;
        if(utterance.cloud_lang && window.cloud_speak) {
          extra_delay = 5000;
          utterance.trigger = function(type) {
            if(type == 'error') {
              // make a flash that cloud TTS isn't working, once per 5 minutes
              var now = (new Date()).getTime();
              var prior_error = speecher.get('last_cloud_error');
              if(window.modal && (!prior_error || prior_error < (now - (5 * 60 * 1000)))) {
                window.modal.error(i18n.t('cloud_tts_failed_trying_fallback', "Cloud-Based Speech Failed, Trying Fallback..."));
                speecher.set('last_cloud_error', now);
              }
              utterance.cloud_lang = null;
              speecher.scope.speechSynthesis.speak(utterance);
            } else if(type == 'end' || type == 'error' || type == 'pause') {
              handle_callback();
            }
          };
          window.cloud_speak(utterance);
        } else if(voice && voice.voiceURI && voice.voiceURI.match(/speak_js/)) {
          extra_delay = 2000;
          if(window.meSpeak) {
            var parts = voice.voiceURI.split(/:/);
            var lang = (parts && parts[1]) || 'en-us';
            var path = me_speak_locales[lang.toLowerCase()] || me_speak_locales[lang.split(/-|_/)[0]]
            if(!window.meSpeak.isVoiceLoaded(path)) {
              window.meSpeak.loadVoice(path);
            }
            window.meSpeak.speak(text, {pitch: utterance.pitch * 50, amplitude: utterance.volume * 100, speed: utterance.rate * 175, voice: path, callback: function(success, id, rawdata) {
              handle_callback();
            }});

          } else {
            window.speak(text, {pitch: utterance.pitch * 50, amplitude: utterance.volume * 100, speed: utterance.rate * 175});
          }
        } else {
          speecher.scope.speechSynthesis.speak(utterance);
        }
        // assuming 15 characters per second, if the utterance hasn't completed after
        // 4 times the estimated duration, go ahead and assume there was a problem and mark completion
        runLater(function() {
          if(!utterance.handled) {
            speecher.scope.speechSynthesis.cancel();
            if(window.cloud_speak) { window.cloud_speak.stop(); }
            handle_callback();
          }
        }, extra_delay + (1000 * Math.ceil(text.length / 15) * 4 / (utterance.rate || 1.0)));
      };

      if(voice && voice.voiceURI && voice.voiceURI.match(/^extra:/)) {
        var voice_id = voice.voiceURI.replace(/^extra:/, '');
        runLater(function() {
          capabilities.tts.speak_text(text, {
            voice_id: voice_id,
            pitch: utterance.pitch,
            volume: utterance.volume,
            rate: utterance.rate
          }).then(function() {
            // method won't be called until the text is done being spoken or was interrupted
            callback();
          }, function(err) {
            console.log("system speak error");
            console.log(err);
            // method call returns error, fallback to speechSynthesis
            speak_utterance();
          });
        });
      } else if(voice && voice.voiceURI && voice.voiceURI.match(/^remote:/) && window.cloud_speak) {
        var parts = voice.voiceURI.split(/:/);
        utterance.cloud_lang = parts[1];
        utterance.cloud_voice_id = parts[2]
        speak_utterance(utterance);
      } else if(capabilities.system == 'iOS' && window.TTS && (!opts.voiceURI || opts.voiceURI == 'force_default' || opts.voiceURI == 'default' || opts.voiceURI.match(/tts:/))) {
        console.log("using native iOS tts");
        var opts = {
          text: utterance.text,
          rate: utterance.rate,
        };
        if(voice) {
          opts.locale = (voice && voice.lang);
          opts.id = (voice && voice.ident);
        }
        // TODO: opts.target = 'call' to send through active call
        // #import <CoreTelephony/CTCallCenter.h>
        // #import <CoreTelephony/CTCall.h>
        
        // -(bool)isOnPhoneCall {
        //     /*
        //      Returns YES if the user is currently on a phone call
        //      */
        
        //     CTCallCenter *callCenter = [[[CTCallCenter alloc] init] autorelease];
        //     for (CTCall *call in callCenter.currentCalls)  {
        //         if (call.callState == CTCallStateConnected) {
        //             return YES;
        //         }
        //     }
        //     return NO;
        // }        
        window.TTS.speak(opts).then(function() {
          callback();
        }, function(err) {
          speak_utterance();
        });
      } else if(capabilities.system == 'Windows' && opts.voiceURI && opts.voiceURI.match(/tts:/) && window.TTS && window.TTS.speakText) {
        window.TTS.speakText({
          text: utterance.text,
          rate: utterance.rate,
          volume: utterance.volume,
          pitch: utterance.pitch,
          voice_id: opts.voiceURI,
          success: function() {
            callback();
          },
          error: function() {
            speak_utterance();
          }
        })
      
      } else {
        var delay = (capabilities.installed_app && capabilities.system == 'Windows') ? 300 : 0;
        var _this = this;
        // TODO: this delay may no longer be needed when we update chromium/electron, but right
        // now it only speaks every other text string unless you wait an extra half-second or so.
        runLater(function() {
          speak_utterance.call(_this);
        }, delay);
      }
    } else {
      alert(text);
    }
  },
  next_speak: function() {
    if(speecher.speaks && speecher.speaks.length) {
      var speak = speecher.speaks.shift();
      if(speak.sound) {
        speecher.speak_audio(speak.sound, 'text', speecher.speaking_from_collection);
      } else if(speak.text) {
        var stashVolume = speecher.volume;
        if(speak.volume) { speecher.volume = speak.volume; }
        speecher.speak_text(speak.text, speecher.speaking_from_collection, speak);
        speecher.volume = stashVolume;
      } else if(speak.wait) {
        runLater(function() {
          speecher.next_speak();
        }, speak.wait);
      } else {
        speecher.next_speak();
      }
    } else {
      if(speecher.speaking_from_collection) {
        var defer = (speecher.speak_defers || {})[speecher.speaking_from_collection];
        if(defer) { defer.resolve(); }
      }
      // console.log("no speaks left");
    }
  },
  speak_end_handler: function(speak_id) {
    if(speak_id == speecher.last_speak_id) {
      if(!speecher.speaks || speecher.speaks.length === 0) {
        if(speecher.speaking_from_collection && speecher.speak_defers) {
          var defer = speecher.speak_defers[speecher.speaking_from_collection];
          if(defer) { defer.resolve(); }
        }
        speecher.speaking_from_collection = false;
      }
      speecher.speaking = false;
      speecher.next_speak();
    } else {
      // TODO: do we need to clear anything else at this point?
      // console.log('unexpected speak_id');
    }
  },
  speak_background_audio: function(url) {
    this.speak_audio(url, 'background');
  },
  load_beep: function() {
    var promises = []
    promises.push(this.load_sound('beep_url'));
    promises.push(this.load_sound('chimes_url'));
    promises.push(this.load_sound('click_url'));
    promises.push(this.load_sound('ding_url'));
    promises.push(this.load_sound('bleep_url'));
    promises.push(this.load_sound('spinner_url'));
    promises.push(this.load_sound('battery_url'));
    promises.push(this.load_sound('glug_url'));
    promises.push(this.load_sound('dice_url'));
    promises.push(this.load_sound('partner_start_url'));
    promises.push(this.load_sound('partner_end_url'));
    promises.push(this.load_sound('follower_url'));
   
    return RSVP.all_wait(promises);
  },
  load_sound: function(attr) {
    if(speecher[attr]) {
      if(speecher[attr].match(/^data:/)) { return RSVP.resolve(true); }
      else if(!LingoLinq.remote_url(speecher[attr])) { return RSVP.resolve(true); }
      var find = persistence.find_url(speecher[attr], 'sound').then(function(data_uri) {
        if(data_uri) {
          speecher[attr] = data_uri;
          return true;
        } else {
          return persistence.store_url_now(speecher[attr], 'sound').then(function(data) {
            speecher[attr] = data.local_url || data.data_uri;
            return true;
          });
        }
      }, function() {
        return persistence.store_url_now(speecher[attr], 'sound').then(function(data) {
          speecher[attr] = data.local_url || data.data_uri;
          return true;
        });
      });
      return find.then(null, function(err) {
        console.log(err);
        return RSVP.reject(err);
      });
    } else {
      return RSVP.reject({error: "beep sound not saved: " + attr});
    }
  },
  oops: function() {
    var oopses = tts_voices.get('oops');
    var loc = (app_state.get('vocalization_locale') || 'en').split(/-|_/)[0];
    var str = oopses[loc] || oopses['en'] || "Oops";
    speecher.speak_text(str, 'oops', {});
  },
  play_audio: function(ref) {
    // the check for lastListener is weird, but there was a lag where if you played
    // the same audio multiple times in a row then it would trigger an 'ended' event
    // on the newly-attached listener. This approach tacks on a new audio element
    // if that's likely to happen. The "throwaway" class and the setTimeouts in here
    // are all to help with that purpose.
    console.log("PLAY", ref);
    var audio = ref.audio;
    var cleanup_audio = function(audio) {
      if(audio.lastListener) {
        var ll = audio.lastListener;
        audio.removeEventListener('ended', audio.lastListener);
        audio.removeEventListener('pause', audio.lastListener);
        audio.removeEventListener('abort', audio.lastListener);
        audio.removeEventListener('error', audio.lastListener);
        // see above for justification of the timeout
        setTimeout(function() {
          if(audio.lastListener == ll) {
            audio.lastListener = null;
          }
        }, 50);
      }  
    };
    if(audio.lastListener || (capabilities.mobile && capabilities.browser == "Safari")) {
      // Audio files can get backed up
      if(ref.skip_repeat) {
        // We don't care if clicks or beeps get backed up,
        // and garbage collection seems to hang badly on lots of
        // audio files on iOS
        audio.pause();
        audio.currentTime = 0;
        var url = audio.src;
        // This resets the audio, which is required for replay on iOS (sad trombone)
        audio.src = null;
        audio.src = url;
        audio.load()
      } else {
        audio = audio.cloneNode();
        audio.className = 'throwaway';  
      }
    }

    audio.pause();
    if(audio.media) { audio.media.pause(); }
    audio.currentTime = 0;
    var _this = this;
    var speak_id = ref.speak_id;
    cleanup_audio(audio);
    var audio_status = {init: (new Date()).getTime()};
    audio.speak_id = speak_id;
    var handler = function(event) {
      if(ref.speak_id == speak_id) {
        if(audio_status.handled) { return; }
        audio_status.handled = true;
        audio.pause();
        audio.currentTime = 0;
        if(audio.media) {
          audio.media.pause();
        }
        if(audio.className == 'throwaway') {
          audio.src = null;
        }
        _this.speak_end_handler(speak_id);    
      }
    };
    audio.lastListener = handler;
    var src = (audio.src || '');
    if(false && capabilities.mobile && capabilities.installed_app && window.Media && !src.match(/http:\/\/localhost/)) {
      // console.log("using native media playback!");
      // iOS media plugin can't handle file:/// paths, so we strip it off and things work fine
      if(capabilities.system == 'iOS') {
        // src = src.replace(/^file:\/\//, '');
      }
      var media = new window.Media(src, function() { 
        media.release();
      }, function(err) {
        media.release();
        handler();
      }, function(status_code) {
        if(status_code == window.Media.MEDIA_PAUSED || status_code == window.Media.MEDIA_STOPPED) {
          media.release();
          handler();
        }
      });
      audio.media = media;
      try {
        media.play();
      } catch(e) {
        console.error("media playback error", e);
        handler();
      }
    } else {
      audio.addEventListener('ended', handler);
      audio.addEventListener('pause', handler);
      audio.addEventListener('abort', handler);
      audio.addEventListener('error', handler);
      runLater(function() {
        var promise = audio.play();
        if(promise && promise.then) {
          promise.then(function(res) {
            return true;
          }, function(err) {
            handler();
            return true;
          });
        }
      }, 10);
    }
    var check_status = function() {
      if(handler == audio.lastListener && !audio_status.handled) {
        if(audio_status.last_time && audio_status.last_time == audio.currentTime) {
          audio_status.stucks = (audio_status.stucks || 0) + 1;
          if(audio_status.stucks > 10) {
            // if we've been stuck for a full second, go ahead and call it quits
            handler();
            return;
          }
        } else {
          audio_status.last_time = null;
        }
        var handle_audio_status = function(opts) {
          if(opts.pos > 0) {
            audio_status.started = true;
            audio_status.last_time = opts.pos;
          }
          if(opts.duration > 0) {
            var now = (new Date()).getTime();
            // if we've waited 3 times as long as the duration of the audio file and it's still
            // not done, go ahead and call it quits
            if((now - audio_status.init) / 1000 > (audio.duration * 3)) {
              handler();
              return;
            }
          }
          if(opts.ended || opts.error) {
            // if the audio file is done, call the handler
            handler();
          } else {
            // otherwise, keep polling during audio playback
            runLater(check_status, 100);
          }
        };
        if(audio.media) {
          audio.media.duration = audio.media.getDuration();
          audio.media.getCurrentPosition(function(pos) {
            handle_audio_status({
              duration: audio.media.duration,
              pos: pos
            });
          }, function(err) {
            handler();
          });
        } else {
          handle_audio_status({
            ended: audio.ended,
            error: audio.error,
            duration: audio.duration,
            pos: audio.currentTime
          });
        }
      }
    };
    runLater(check_status, 100);
    return audio;
  },
  assert_audio: function(url, skippable) {
    speecher.sounds = speecher.sounds || {};
    var now = (new Date()).getTime();
    var load_url = url;
    if(capabilities && capabilities.installed_app && capabilities.storage && load_url.match(/localhost/)) {
      load_url = capabilities.storage.fix_url(load_url);
    }
    if(!speecher.sounds[url]) {
      var audio = new Audio();
      audio.src = load_url;
      audio.load();
      speecher.sounds[url] = {
        audio: audio,
        updated: now
      };
    } else {
      // Resetting the src or calling load() is apparently required for re-play to work on iOS (sad trombone)
      speecher.sounds[url].audio.src = null;
      speecher.sounds[url].audio.src = load_url;
      speecher.sounds[url].audio.load();
    }
    var ref = speecher.sounds[url];
    if(skippable) {
      ref.skip_repeat = true;
    }
    if(ref) {
      ref.audio.loop = false;
    }
    return ref;
  },
  beep: function(opts) {
    opts = opts || {};
    var beep = speecher.assert_audio(speecher.beep_url, true);
    if(beep) {
      this.play_audio(beep);
      stashes.log({
        action: 'beep',
        button_triggered: opts.button_triggered
      });
    } else {
      console.log("beep sound not found");
    }
  },
  click: function(click_type) {
    click_type = click_type || 'click';
    var click = speecher.assert_audio(speecher[click_type + '_url'] || speecher.click_url, true); 
    if(click) {
      this.play_audio(click);
    } else {
      console.log("click sound not found");
    }
  },
  speak_audio: function(url, type, collection_id, opts) {
    opts = opts || {};
    var _this = this;
    var already_in_collection = collection_id && this.speaking_from_collection == collection_id;
    if(this.speaking_from_collection && !collection_id) {
      // lets the user start building their next sentence without interrupting the current one
      return;
    } else if(this.speaking && opts.interrupt === false) {
      return;
    } else if(already_in_collection && opts.prevent_repeat) {
      return;
    } else if(this.speaking_from_collection && opts.prevent_repeat && opts.prevent_any) {
      return;
    }
    if(opts.interrupt !== false && type != 'background') {
      this.speaking = true;
      this.speaking_from_collection = collection_id;
    }
    this.audio = this.audio || {};
    type = type || 'text';
    if(already_in_collection) {
    } else {
      this.stop(type);
    }

    var audio = this.assert_audio(url);
    if(audio) {
      audio.audio.loop = !!opts.loop;
      var playAudio = function() {
        if(type == 'text') {
          var speak_id = _this.speak_id++;
          _this.last_speak_id = speak_id;
          _this.speaking = true;
          _this.speaking_from_collection = collection_id;
          audio.speak_id = speak_id;
        }
        var playing_audio = _this.play_audio(audio);
        _this.audio[type] = playing_audio;
      }

      _this.set_output_target(opts, playAudio);
    } else {
      _this.speak_id++;
      _this.speak_end_handler(_this.speak_id);
      console.log("couldn't find sound to play");
    }
  },
  find_or_create_element: function(url) {
    var $res = $("audio[src='" + url + "']");
    if($res.length === 0) {
      $res = $("audio[rel='" + url + "']");
    }
    if($res.length === 0 && url) {
      var new_url = persistence.url_cache[url] || url;
      $res = $("<audio>", {preload: 'auto', src: new_url, rel: url}).appendTo($("#button_list,#button_settings"));
    } else if($res.closest("#button_list").length == 0) {
      $("#button_list").append($res[0]);
    }
    $res[0].loop = false;
    return $res;
  },
  speak_collection: function(list, collection_id, opts) {
    this.speak_defers = this.speak_defers || {};
    this.stop('text');
    var defer = RSVP.defer();
    if(collection_id) {
      this.speak_defers[collection_id] = defer;
    }
    this.speaks = list;
    if(opts && opts.override_volume) {
      list.forEach(function(s) { s.volume = opts.override_volume; });
    }
    if(list && list.length > 0) {
      this.speaking_from_collection = collection_id;
      this.next_speak();
    }
    return defer.promise;
  },
  stop: function(type) {
    this.audio = this.audio || {};
    type = type || 'all';
    this.last_stop = (new Date()).getTime();
    $("audio.throwaway").remove();
    if(type == 'text' || type == 'all') {
      this.speaking = false;
      this.speak_defers = this.speak_defers || {};
      for(var key in this.speak_defers) {
        this.speak_defers[key].reject();
        delete this.speak_defers[key];
      }
      this.speaking_from_collection = false;
      if(type === 'all') { this.speaks = []; }
      speecher.scope.speechSynthesis.cancel();
      if(window.cloud_speak) { window.cloud_speak.stop(); }
      if(capabilities.system == 'iOS' && window.TTS && window.TTS.stop) {
        window.TTS.stop(function() { }, function() { });
      } else if(capabilities.syste == 'Windows' && window.TTS && window.TTS.stopSpeakingText) {
        window.TTS.stopSpeakingText({success: function() { }, error: function() { }});
      }
      capabilities.tts.stop_text();
      if(this.audio.text) {
        this.audio.text.pause();
        if(this.audio.text.media) {
          this.audio.text.media.pause();
        }
        this.audio.text.removeEventListener('ended', this.audio.text.lastListener);
        this.audio.text.removeEventListener('pause', this.audio.text.lastListener);
        var audio = this.audio.text;
        setTimeout(function() {
          audio.lastListener = null;
        }, 50);
        this.audio.text = null;
      }
    }
    if(type == 'background' || type == 'all') {
      if(this.audio.background) {
        this.audio.background.pause();
        if(this.audio.background.media) {
          this.audio.background.media.pause();
        }
        this.audio.background.removeEventListener('ended', this.audio.background.lastListener);
        this.audio.background.removeEventListener('pause', this.audio.background.lastListener);
        var audio = this.audio.background;
        setTimeout(function() {
          audio.lastListener = null;
        }, 50);
        this.audio.background = null;
      }
    }
  },
  prompt: function(voice_id) {
    return tts_voices.render_prompt(voice_id);
  }
}).create({scope: (window.polyspeech || window)});
speecher.check_readiness();
window.speecher = speecher;

export default speecher;

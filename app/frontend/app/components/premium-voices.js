import EmberObject from '@ember/object';
import Component from '@ember/component';
import { inject as service } from '@ember/service';
import speecher from '../utils/speecher';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import tts_voices from '../utils/tts_voices';

export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'premium-voices';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.refresh_voices();
  },

  willDestroyElement() {
    this._super(...arguments);
    speecher.refresh_voices();
  },

  refresh_voices() {
    var _this = this;
    if (capabilities.installed_app) {
      capabilities.tts.status().then(function() {
        if ((_this.get('appState.currentUser.currently_premium') && _this.get('appState.currentUser.premium_voices.allowed') > 0) || _this.get('appState.currentUser.premium_voices.always_allowed')) {
          _this.set('premium_available', true);
        }
      }, function() {});
    }

    var all_voices = capabilities.tts.downloadable_voices();
    var res = [];
    this.set('voice_error', null);
    var claimed_voices = this.get('model.user.premium_voices.claimed') || [];
    all_voices.forEach(function(voice) {
      var v = EmberObject.create(voice);
      v.set('male', voice.gender === 'm');
      v.set('female', voice.gender === 'f');
      v.set('adult', voice.age === 'adult');
      v.set('teen', voice.age === 'teen');
      v.set('child', voice.age === 'child');
      if (claimed_voices.indexOf(v.get('voice_id')) >= 0) {
        v.set('claimed', true);
      }
      res.push(v);
    });
    this.set('voices', res);
    capabilities.tts.available_voices().then(function(voices) {
      var set_voices = _this.get('voices') || [];
      voices.forEach(function(voice) {
        var ref_voice = tts_voices.find_voice(voice.voice_id) || voice;
        var found_voice = set_voices.find(function(v) { return v.get('voice_id') === ref_voice.voice_id; });
        if (found_voice) {
          found_voice.set('active', true);
        }
      });
    }, function() {
      _this.set('voice_error', i18n.t('error_loading_voices', "There was an unexpected problem retrieving the premium voices."));
    });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    play_voice(voice) {
      var audio = new Audio();
      audio.src = voice.get('voice_sample');
      audio.play();
    },
    download_voice(voice) {
      var _this = this;
      _this.set('voice_error', null);
      tts_voices.download_voice(voice, _this.get('model.user')).then(function(res) {
        _this.refresh_voices();
      }, function(err) {
        _this.refresh_voices();
        _this.set('voice_error', (err && err.msg) || i18n.t('error_downloading_voice', "There was an unexpected problem while trying to download the voice"));
      });
    },
    delete_voice(voice) {
      var _this = this;
      capabilities.tts.delete_voice(voice.get('voice_id')).then(function(res) {
        _this.refresh_voices();
      }, function(err) {
        _this.refresh_voices();
        _this.set('voice_error', (err && err.msg) || i18n.t('error_deleting_voice', "There was an unexpected problem while trying to delete the voice"));
      });
    }
  }
});

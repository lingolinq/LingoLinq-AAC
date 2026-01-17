import EmberObject from '@ember/object';
import modal from '../utils/modal';
import { inject as service } from '@ember/service';
import speecher from '../utils/speecher';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import persistence from '../utils/persistence';
import tts_voices from '../utils/tts_voices';

export default modal.ModalController.extend({
  appState: service('app-state'),

  opening: function() {
    this.refresh_voices();
  },
  closing: function() {
    speecher.refresh_voices();
  },
  refresh_voices: function() {
    var _this = this;
    if(capabilities.installed_app) {
      capabilities.tts.status().then(function() {
        if((this.appState.get('currentUser.currently_premium') && this.appState.get('currentUser.premium_voices.allowed') > 0) || this.appState.get('currentUser.premium_voices.always_allowed')) {
          _this.set('premium_available', true);
        }
      }, function() {
      });
    }

    var all_voices = capabilities.tts.downloadable_voices();
    var res = [];
    this.set('voice_error', null);
    var claimed_voices = this.get('model.user.premium_voices.claimed') || [];
    all_voices.forEach(function(voice) {
      var v = EmberObject.create(voice);
      v.set('male', voice.gender == 'm');
      v.set('female', voice.gender == 'f');
      v.set('adult', voice.age == 'adult');
      v.set('teen', voice.age == 'teen');
      v.set('child', voice.age == 'child');
      if(claimed_voices.indexOf(v.get('voice_id')) >= 0) {
        v.set('claimed', true);
      }

      res.push(v);
    });
    this.set('voices', res);
    capabilities.tts.available_voices().then(function(voices) {
      var set_voices = _this.get('voices') || [];
      voices.forEach(function(voice) {
        var ref_voice = tts_voices.find_voice(voice.voice_id) || voice;
        var found_voice = set_voices.find(function(v) { return v.get('voice_id') == ref_voice.voice_id; });
        if(found_voice) {
          found_voice.set('active', true);
        }
      });
    }, function() {
      _this.set('voice_error', i18n.t('error_loading_voices', "There was an unexpected problem retrieving the premium voices."));
    });
  },
  actions: {
    play_voice: function(voice) {
      var audio = new Audio();
      audio.src = voice.get('voice_sample');
      audio.play();
    },
    download_voice: function(voice) {
      var _this = this;
      _this.set('voice_error', null);
      tts_voices.download_voice(voice, _this.get('model.user')).then(function(res) {
        _this.refresh_voices();
      }, function(err) {
        _this.refresh_voices();
        _this.set('voice_error', (err && err.msg) || i18n.t('error_downloading_voice', "There was an unexpected problem while trying to download the voice"));
      });
    },
    delete_voice: function(voice) {
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

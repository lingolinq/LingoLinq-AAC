import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import speecher from '../utils/speecher';
import utterance from '../utils/utterance';
import capabilities from '../utils/capabilities';

/**
 * Voice & Output modal — extracts the most-touched voice and audio output
 * controls from the full preferences page so they can be adjusted from the
 * board-detail page without leaving the user's communication context.
 *
 * Operates on a clone of `user.preferences` (`pending_prefs`) and only
 * commits changes to the user model on Save. Cancel discards. The "More
 * options" link routes to the full preferences page for advanced settings.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service('router'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'voice-output';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    const user = (options && options.user) ||
                 this.get('appState').get('referenced_user') ||
                 this.get('appState').get('currentUser');
    this.set('model', options);
    this.set('user', user);

    // Clone the voice prefs so edits don't take effect until Save.
    const prefs = (user && user.get && user.get('preferences')) || {};
    const device = prefs.device || {};
    const voice = device.voice || {};
    this.set('pending_prefs', {
      voice_uri: voice.voice_uri || '',
      rate: voice.rate != null ? voice.rate : 1.0,
      pitch: voice.pitch != null ? voice.pitch : 1.0,
      volume: voice.volume != null ? voice.volume : 1.0,
      target: voice.target || 'default'
    });
    this.set('status', null);

    // Capture current panel states so we can restore them on close
    // rather than forcing panels open unconditionally.
    var boardDetail = getOwner(this).lookup('controller:user/board-detail');
    if(boardDetail) {
      this.set('_prev_panels_collapsed', boardDetail.get('panels_collapsed'));
      this.set('_prev_board_collapsed', boardDetail.get('board_collapsed'));
    }
  },

  // Audio target selection is only meaningful inside the installed mobile app.
  audio_target_available: computed(function() {
    return capabilities.installed_app && (capabilities.system === 'iOS' || capabilities.system === 'Android');
  }),

  // Build the dropdown list from the system voice list filtered against
  // the user's claimed premium voices — same logic as preferences.js.
  user_voice_list: computed('appState.refresh_voices', function() {
    const list = speecher.get('voiceList') || [];
    const user = this.get('user');
    const claimed = (user && user.get && user.get('premium_voices.claimed')) || [];
    const premium_ids = claimed.map(function(id) { return 'extra:' + id; });
    const result = [];
    list.forEach(function(v) {
      if (v.voiceURI && v.voiceURI.match && v.voiceURI.match(/^extra/)) {
        if (premium_ids.indexOf(v.voiceURI) >= 0) { result.push(v); }
      } else {
        result.push(v);
      }
    });
    if (result.length > 1) {
      result.unshift({
        id: 'default',
        name: i18n.t('select_a_voice', '[ Select A Voice ]')
      });
      result.push({
        id: 'force_default',
        name: i18n.t('system_default_voice', 'System Default Voice')
      });
    }
    return result;
  }),

  audio_output_list: computed(function() {
    return [
      { id: 'default', name: i18n.t('default_audio', 'Play on Default Audio') },
      { id: 'headset', name: i18n.t('headset', 'Play on Headset if Connected') },
      { id: 'speaker', name: i18n.t('speaker', 'Play on Speaker even with Headset Connected') },
      { id: 'headset_or_earpiece', name: i18n.t('headset_or_earpiece', 'Play on Headset or Earpiece') },
      { id: 'earpiece', name: i18n.t('earpiece', 'Play on Earpiece') }
    ];
  }),

  // Helper for the +/- number pickers — clamp rate/pitch/volume into a
  // sensible range and round to 1 decimal so the displayed value stays clean.
  _bump: function(field, delta) {
    var current = parseFloat(this.get('pending_prefs.' + field));
    if (isNaN(current)) { current = 1.0; }
    var next = Math.round((current + delta) * 10) / 10;
    if (next < 0.1) { next = 0.1; }
    if (next > 3.0) { next = 3.0; }
    this.set('pending_prefs.' + field, next);
  },

  actions: {
    close() {
      // Restore the panel states to whatever they were before the modal opened.
      var boardDetail = getOwner(this).lookup('controller:user/board-detail');
      if(boardDetail) {
        boardDetail.set('panels_collapsed', this.get('_prev_panels_collapsed'));
        boardDetail.set('board_collapsed', this.get('_prev_board_collapsed'));
      }
      this.get('modal').close();
    },
    opening() {},
    closing() {},

    bump_rate(delta) { this._bump('rate', delta); },
    bump_pitch(delta) { this._bump('pitch', delta); },
    bump_volume(delta) { this._bump('volume', delta); },

    update_voice_uri(value) {
      this.set('pending_prefs.voice_uri', value);
    },
    update_target(value) {
      this.set('pending_prefs.target', value);
    },

    test_voice() {
      const p = this.get('pending_prefs');
      utterance.test_voice(p.voice_uri, p.rate, p.pitch, p.volume, p.target);
    },

    open_premium_voices() {
      const user = this.get('user');
      this.get('modal').close();
      modal.open('premium-voices', { user: user });
    },

    open_full_preferences() {
      const user = this.get('user');
      const user_name = user && user.get && user.get('user_name');
      if (user_name) {
        // Tell the preferences controller to auto-expand the Voice Settings
        // section and scroll to it after the page loads.
        this.get('appState').set('open_voice_settings', true);
        this.get('modal').close();
        this.get('router').transitionTo('user.preferences', user_name);
      }
    },

    save() {
      const user = this.get('user');
      if (!user || !user.set || !user.save) {
        this.set('status', { error: true });
        return;
      }
      const p = this.get('pending_prefs');
      // Coerce rate/pitch/volume to numbers — same as preferences.js does
      // before persisting, to keep the data shape consistent.
      var rate = parseFloat(p.rate); if (isNaN(rate)) { rate = 1.0; }
      var pitch = parseFloat(p.pitch); if (isNaN(pitch)) { pitch = 1.0; }
      var volume = parseFloat(p.volume); if (isNaN(volume)) { volume = 1.0; }

      user.set('preferences.device.voice.voice_uri', p.voice_uri);
      user.set('preferences.device.voice.rate', rate);
      user.set('preferences.device.voice.pitch', pitch);
      user.set('preferences.device.voice.volume', volume);
      if (this.get('audio_target_available')) {
        user.set('preferences.device.voice.target', p.target);
      }

      this.set('status', { saving: true });
      const _this = this;
      user.save().then(function() {
        _this.set('status', { saved: true });
        _this.get('modal').close();
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});

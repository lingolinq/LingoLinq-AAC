import Component from '@ember/component';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';

// Display order: Dark → Light, then Pale last. Backend limit string order is: Pale, Dark, Medium-Dark, Medium, Medium-Light, Light.
const TONE_OPTIONS = [
  { id: 'dark', labelKey: 'dark_skin_tone', labelDefault: 'Dark', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3ff.svg' },
  { id: 'medium_dark', labelKey: 'medium_dark_skin_tone', labelDefault: 'Medium-Dark', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fe.svg' },
  { id: 'medium', labelKey: 'medium_skin_tone', labelDefault: 'Medium', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fd.svg' },
  { id: 'medium_light', labelKey: 'medium_light_skin_tone', labelDefault: 'Medium-Light', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fc.svg' },
  { id: 'light', labelKey: 'light_skin_tone', labelDefault: 'Light', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fb.svg' },
  { id: 'default', labelKey: 'default_skin_tones', labelDefault: 'Pale', image_url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f469-1f3fb.svg' }
];
// Backend expects digits in order: Pale(0), Dark(1), Medium-Dark(2), Medium(3), Medium-Light(4), Light(5). Our display order has those at indices: 5,0,1,2,3,4.
const BACKEND_ORDER = [5, 0, 1, 2, 3, 4];

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'limit-skin-tones';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    {};
    const setup = options.setup;
    const existingOpts = setup && setup.get && setup.get('skin.options');
    // Backend order: 0=Pale, 1=Dark, 2=Medium-Dark, 3=Medium, 4=Medium-Light, 5=Light. Our display order: 0=Dark..5=Pale.
    const displayToBackend = [1, 2, 3, 4, 5, 0];
    const toneOptions = TONE_OPTIONS.map(function(tone, idx) {
      const label = i18n.t(tone.labelKey, tone.labelDefault);
      let checked = true;
      const backendIdx = displayToBackend[idx];
      if (existingOpts && existingOpts[backendIdx]) {
        checked = !!existingOpts[backendIdx].checked;
      }
      return {
        id: tone.id,
        label: label,
        image_url: tone.image_url,
        checked: checked
      };
    });
    this.set('setup', setup);
    this.set('toneOptions', toneOptions);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    toggleChecked(idx) {
      const opts = this.get('toneOptions').slice();
      if (opts[idx]) {
        opts[idx].checked = !opts[idx].checked;
        this.set('toneOptions', opts);
      }
    },
    confirm() {
      const setup = this.get('setup');
      const user = setup && (setup.get('setup_user') || setup.get('fake_user'));
      if (!user || !user.get('id')) {
        this.get('modal').close();
        return;
      }
      const opts = this.get('toneOptions') || [];
      const digits = BACKEND_ORDER.map(function(displayIdx) { return opts[displayIdx].checked ? '1' : '0'; });
      const str = 'mix_only::' + user.get('id') + '::limit-' + digits.join('');
      setup.send('set_preference', 'skin', str);
      this.get('modal').close();
    }
  }
});

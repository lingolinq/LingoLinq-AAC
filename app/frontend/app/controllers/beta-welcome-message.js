import Controller from '@ember/controller';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Controller.extend({
  betaWelcomeMode: service('beta-welcome-mode'),
  displayName: '',
  // Used by the Short layout's accept checkbox + Get Started button (the flow
  // moved up to this page in Short mode; in Original mode it lives on
  // beta-welcome).
  agreementAccepted: false,
  acceptButtonDisabled: computed('agreementAccepted', function() {
    return !this.get('agreementAccepted');
  }),
  // false -> Original layout, true -> Short layout (see beta-welcome-mode service).
  showShort: computed('betaWelcomeMode.short', function() {
    return !!this.get('betaWelcomeMode.short');
  }),
  actions: {
    set_beta_mode(short) {
      this.set('betaWelcomeMode.short', !!short);
    }
  }
});

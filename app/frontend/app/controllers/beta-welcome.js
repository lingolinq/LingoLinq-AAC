import Controller from '@ember/controller';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Controller.extend({
  betaWelcomeMode: service('beta-welcome-mode'),
  // Used by the Original layout's accept checkbox + Get Started button. In Short
  // mode this page is a read-only detour with only a Back button.
  agreementAccepted: false,
  acceptButtonDisabled: computed('agreementAccepted', function() {
    return !this.get('agreementAccepted');
  }),
  // false -> Original layout, true -> Short layout (see beta-welcome-mode service).
  showShort: computed('betaWelcomeMode.short', function() {
    return !!this.get('betaWelcomeMode.short');
  })
});

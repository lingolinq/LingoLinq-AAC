import Controller from '@ember/controller';
import { computed } from '@ember/object';

export default Controller.extend({
  agreementAccepted: false,
  acceptButtonDisabled: computed('agreementAccepted', function() {
    return !this.get('agreementAccepted');
  })
});

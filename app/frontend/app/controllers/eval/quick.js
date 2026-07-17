import Controller from '@ember/controller';
import { computed } from '@ember/object';

export default Controller.extend({
  user: null,
  session: null,

  isConfiguring: computed('session.state', function() {
    return this.get('session.state') === 'configuring';
  }),
  isScreening: computed('session.state', function() {
    return this.get('session.state') === 'screening';
  }),
  isReviewing: computed('session.state', function() {
    return this.get('session.state') === 'reviewing';
  })
});

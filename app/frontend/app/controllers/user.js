import Controller from '@ember/controller';
import { observer } from '@ember/object';
import sync from '../utils/sync';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';

export default Controller.extend({
  // Explicit injection for app_state to avoid implicit injection deprecation warning
  app_state: computed(function() {
    var owner = getOwner(this);
    return owner.lookup('lingolinq:app_state');
  }),
});

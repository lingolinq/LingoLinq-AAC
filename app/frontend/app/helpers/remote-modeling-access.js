import Helper from '@ember/component/helper';
import { inject as service } from '@ember/service';
import { remoteModelingState, openRemoteModeling } from '../utils/remote_modeling';
import { same_person } from '../utils/backend_user_id';

// {{#let (remote-modeling-access communicator) as |rm|}}: `rm.limited` draws the "Limited" badge,
// `rm.open` is the click handler, `rm.is_self` is true on your own account. The rules and the
// window each state opens live in utils/remote_modeling.js; the signed-in supporter is read from
// app state, so a template only passes the communicator.
export default Helper.extend({
  appState: service('app-state'),
  compute(params) {
    var user = params[0];
    var supporter = this.get('appState.sessionUser');
    var state = remoteModelingState(user, supporter);
    return {
      state: state,
      limited: state !== 'available',
      // same_person: the supporter may be held by a 'self'-keyed record and the communicator card by the real-id one
      // (utils/backend_user_id.js), so an id comparison misread your own account as someone else's.
      is_self: !!(user && supporter && same_person(user, supporter, supporter)),
      open: function(event) {
        if(event && event.preventDefault) { event.preventDefault(); }
        if(event && event.stopPropagation) { event.stopPropagation(); }
        openRemoteModeling(user, supporter);
      }
    };
  }
});

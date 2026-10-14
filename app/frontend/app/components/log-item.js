import Component from '@ember/component';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: '',

  /* THE ORIGIN, CARRIED ONE HOP (2026-09-21). `?nav=home` records which menu the user arrived
     through (controllers/user/logs.js:23-31), and the log DETAIL page is a sibling route
     (router.js:142 declares `log` with path '/logs/:log_id'), so without this the param is
     dropped the moment someone opens one of these rows. Measured before it was carried: the
     pill nav unmounted on that click, the account rail flipped from Home Page to Logs, and the
     page jumped from y=262 to y=136 -- then all of it back again on Back. Opening an update is
     the most likely thing to do on the Updates page, so that is the main path, not an edge.

     A COMPUTED, NOT `{{hash nav=@navOrigin}}` IN THE TEMPLATE. This component also renders from
     templates/user/goal.hbs, where there is no origin at all; passing `nav: undefined` to
     <LinkTo> asks the router to serialize a query param with no value rather than to omit it.
     An empty hash omits it cleanly, so the goal page's links are byte-for-byte what they were.

     Only 'home' is honoured. The param exists to name ONE origin (the Home section's nav), and
     echoing an arbitrary caller-supplied value into every link on the page would make this a
     way to write the URL from a log record. */
  linkQuery: computed('navOrigin', function() {
    return this.get('navOrigin') === 'home' ? { nav: 'home' } : {};
  })
});

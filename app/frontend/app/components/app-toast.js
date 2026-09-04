import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default Component.extend({
  app_state: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    /* Bound in init rather than left as a bare prototype method, because the template
       passes it straight to `{{on "click" this.dismiss}}`. `{{on}}` invokes what it is
       given with no receiver, so a bare method reference runs with `this` undefined and
       the first `this.get` throws:
         "You accessed `this.get` from a function passed to the `on` modifier, but the
          function itself was not bound to a valid `this` context."
       That aborted the click handler, so the toast's close button did nothing and the
       error surfaced through the board's pass-through click machinery
       (dispatchPassThroughClick -> element_release) rather than at an obvious source.
       Same idiom, and the same reasoning, as components/copy-progress-drawer.js#onDismiss. */
    var self = this;
    this.dismiss = function() {
      self.get('app_state').hide_toast();
    };
  }
});

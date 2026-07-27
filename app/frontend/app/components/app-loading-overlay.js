import Component from '@ember/component';
import { inject as service } from '@ember/service';

// Full-viewport loading overlay. The template binds directly to the tracked
// `app_state.loading_overlay_message` (set via app_state.show_loading_overlay /
// cleared by hide_loading_overlay) so it reacts reliably under Ember 5.x —
// no intermediate computed needed.
export default Component.extend({
  app_state: service('app-state'),
  tagName: ''
});

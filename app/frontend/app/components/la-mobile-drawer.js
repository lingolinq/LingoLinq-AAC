import Component from '@ember/component';

/**
 * Reusable mobile nav drawer: backdrop + panel with close button and yielded content.
 * Used for landing-alt (unauthenticated) and modern dashboard (authenticated) collapse.
 * Parent owns state and passes @isOpen and @onClose; trigger (hamburger) stays in parent.
 */
export default Component.extend({
  tagName: ''
});

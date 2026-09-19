import Route from '@ember/routing/route';
import i18n from '../../utils/i18n';

/**
 * Supervision, as a PAGE (2026-09-18). It was only ever a modal, opened from the account card
 * and later from the account nav. A modal is the wrong container for it: it holds several
 * lists plus its own add and request flows, and it is one of the destinations the section nav
 * offers, so it needs a URL like every other one.
 *
 * THE MODAL IS NOT RETIRED. components/dashboard/classic-view.js and controllers/setup.js
 * still open it, and on the dashboard utils/modal.js diverts it into the bento inline view
 * instead. None of those paths change; this only adds a route that renders the SAME component
 * in `standalone` mode.
 *
 * Model and `subroute_name` mirror routes/user/account.js so the page behaves like its
 * siblings in the section.
 */
export default Route.extend({
  model: function() {
    var model = this.modelFor('user');
    model.set('subroute_name', i18n.t('supervision', "Supervision"));
    return model;
  },
  setupController: function(controller, model) {
    if(model) { model.reload(); }
    controller.set('model', model);
  }
});

import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

// Sentinel returned by model() when a lesson share token is expired,
// malformed, or otherwise unresolvable. See the UX-06 runtime finding in
// tests/acceptance/lesson_expired_test.js: Api::LessonsController#show
// tolerantly returns a 200 with `extra_user: nil` for an unresolved token,
// which findRecord resolves (does not reject) as a record with no `user`.
// This sentinel gives setupController/the template a single, reliable flag
// to branch on regardless of which Ember-Data outcome occurs.
var LINK_EXPIRED_MODEL = { link_expired: true };

// Codex review finding (dual-reviewer pass, 2026-07-11): the original .catch
// mapped EVERY findRecord rejection to LINK_EXPIRED_MODEL, which mislabeled a
// genuinely missing/nonce-mismatched lesson (a real 404 from
// Api::LessonsController#show's `exists?` guard, app/controllers/
// application_controller.rb:295-304) as "link expired" -- misleading, since
// asking for a new link never helps if the lesson itself doesn't exist.
// This checks for a real 404 using the exact two error shapes this app's own
// error-handling code already checks elsewhere in this file for other status
// codes (app/frontend/app/utils/persistence.js:4338-4354, e.g. the existing
// `err.errors[0].status === 401` / `err.fakeXHR.status === 0` checks) --
// verified against that file, not guessed.
function isNotFoundError(err) {
  if (!err) { return false; }
  if (err.errors && err.errors[0] && String(err.errors[0].status) === '404') { return true; }
  if (err.fakeXHR && err.fakeXHR.status === 404) { return true; }
  return false;
}

export default Route.extend({
  store: service('store'),
  title: "Inflections",
  model: function(params) {
    this.set('user_token', params.user_token);
    this.set('lesson_code', params.lesson_code);
    var uid = params.user_token && params.user_token.split(/-/)[0]
    return this.store.findRecord('lesson', params.lesson_id + ":" + params.lesson_code + ":" + params.user_token).then(function(model) {
      // A resolved lesson for an unresolved token never has a `user` block
      // (api/lessons#show only sets it when extra_user is present). A
      // personalized, valid-token lesson always includes one.
      if (!model || !model.get('user')) {
        return LINK_EXPIRED_MODEL;
      }
      return model;
    }, function(err) {
      if (isNotFoundError(err)) {
        // Genuinely missing/nonce-mismatched lesson -- let this bubble as a
        // real not-found error (the `error` action below lets it through
        // too), distinct from an unresolved share token on an existing lesson.
        throw err;
      }
      // Belt-and-suspenders: if a future Ember Data version tightens the
      // id-mismatch warning (see UX-06 finding) into a hard rejection with
      // some other shape, convert it to the same sentinel instead of
      // bubbling to the application-level error page.
      return LINK_EXPIRED_MODEL;
    });
  },
  actions: {
    error: function(error, transition) {
      if (isNotFoundError(error)) {
        // Let a genuine not-found bubble to the generic application error
        // handler instead of showing the "link expired" message for it.
        return true;
      }
      // Belt-and-suspenders: catches a rejection that escapes the model()
      // .catch above (e.g. a beforeModel-phase failure). Stop it here
      // rather than bubbling to the generic application error handler.
      var controller = this.controllerFor('lesson');
      if (controller) {
        controller.set('model', LINK_EXPIRED_MODEL);
        controller.set('link_expired', true);
      }
      return false;
    }
  },
  setupController: function(controller, model) {
    // Always overwrite the controller's model FIRST, on both branches, so a
    // fast valid-lesson -> expired-lesson transition never leaves a stale
    // prior lesson visible (adversary-review finding).
    controller.set('model', model);
    if (model && model.link_expired) {
      controller.set('link_expired', true);
      // Do not call setup_tracking() -- there is no real lesson/url to track.
    } else {
      controller.set('link_expired', false);
      controller.set('user_token', this.get('user_token'));
      controller.set('lesson_code', this.get('lesson_code'));
      controller.setup_tracking();
    }
  }
});

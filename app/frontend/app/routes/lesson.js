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

// Adversary-review finding (dual-reviewer pass, 2026-07-11): a transient
// backend/network failure (5xx, timeout, offline) is not "link expired"
// either -- mislabeling it that way tells a user with a perfectly valid link
// to go ask for a new one, and (worse) silently removes the failure from
// Ember's normal error path, where any client-side error reporting hooks in.
// Status-shape check mirrors this codebase's own existing convention for 5xx
// / offline detection (app/frontend/app/utils/persistence.js:4338-4346, the
// `.substring(0, 1) == '5'` and `fakeXHR.status === 0` checks) -- verified
// against that file, not guessed.
function isTransientOrServerError(err) {
  if (!err) { return false; }
  var status = (err.errors && err.errors[0] && err.errors[0].status);
  if (status === undefined || status === null) { status = err.fakeXHR && err.fakeXHR.status; }
  if (status === undefined || status === null) { return false; }
  status = String(status);
  if (status === '0') { return true; }
  return status.charAt(0) === '5';
}

// Codex review finding (High, dual-reviewer pass, 2026-07-11): booting the
// Ember shell unconditionally for a valid-lesson/unresolved-token fresh
// navigation (boards_controller.rb's Task 1 change) means the browser then
// calls findRecord -> Api::LessonsController#show, which renders full lesson
// content (title/url/description via lib/json_api/lesson.rb's build_json --
// only the `user` block is gated by extra_user) regardless of whether the
// token resolved. That defeats the new copy's "for your security, links stop
// working" promise: the content is fetched either way, just hidden by CSS/JS.
// app/views/boards/index.html.erb now embeds `window.lesson_share_token_valid`
// (set server-side, before Ember boots, from the exact same
// User.find_by_lesson_share_token result boards_controller#lesson already
// computed) specifically so this route can skip the findRecord call entirely
// on the fresh-navigation entry point when the token didn't resolve -- no
// content-fetching API call happens at all in that case.
//
// This flag is a ONE-SHOT signal for the initial page boot only (it reflects
// whichever lesson was server-rendered at load time). It is read and then
// immediately cleared so a later same-session client-side transition to a
// DIFFERENT lesson URL is unaffected and falls through to the normal
// resolve/reject detection below -- which still relies on the nonce-gated
// content visibility that predates this phase (Api::LessonsController#show
// is reachable directly by anyone who knows a lesson's nonce, independent of
// share-token validity; that is the nonce's own long-standing content-view
// gate, unrelated to and not fixed by this change -- flagged separately for
// Scot, out of scope for this UX-polish phase).
function consumeServerSideTokenValidityFlag() {
  var flag = window.lesson_share_token_valid;
  try { delete window.lesson_share_token_valid; } catch (e) { window.lesson_share_token_valid = undefined; }
  return flag;
}

export default Route.extend({
  store: service('store'),
  title: "Inflections",
  model: function(params) {
    this.set('user_token', params.user_token);
    this.set('lesson_code', params.lesson_code);
    var uid = params.user_token && params.user_token.split(/-/)[0]
    var serverSideValidity = consumeServerSideTokenValidityFlag();
    if (serverSideValidity === false) {
      return LINK_EXPIRED_MODEL;
    }
    return this.store.findRecord('lesson', params.lesson_id + ":" + params.lesson_code + ":" + params.user_token).then(function(model) {
      // A resolved lesson for an unresolved token never has a `user` block
      // (api/lessons#show only sets it when extra_user is present). A
      // personalized, valid-token lesson always includes one.
      if (!model || !model.get('user')) {
        return LINK_EXPIRED_MODEL;
      }
      return model;
    }, function(err) {
      if (isNotFoundError(err) || isTransientOrServerError(err)) {
        // Genuinely missing/nonce-mismatched lesson, or a transient
        // backend/network failure -- let this bubble as a real error (the
        // `error` action below lets it through too), distinct from an
        // unresolved share token on an existing, reachable lesson.
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
      if (isNotFoundError(error) || isTransientOrServerError(error)) {
        // Let a genuine not-found or transient failure bubble to the
        // generic application error handler instead of showing the
        // "link expired" message for it.
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

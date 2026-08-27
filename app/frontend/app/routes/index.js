import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import Subscription from '../utils/subscription';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import LingoLinq from '../app';
import session from '../utils/session';
import i18n from '../utils/i18n';
import progress_tracker from '../utils/progress_tracker';
import { onlyIfGenuinelyResolved, maybeShowSessionEntryGate, sessionEntryGatePending } from '../utils/article50_gate';
import sessionHistory from '../utils/session_history';

export default Route.extend({
  router: service('router'),
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  persistence: service('persistence'),
  beforeModel: function(transition) {
    var from = transition && transition.from;
    var from_name = (from && from.name) || '';
    // Auto-launch into speak mode ONLY on a genuine login / app-boot
    // entry into the dashboard:
    //   - cold boot / full-page reload after auth -> no `transition.from`
    //   - SPA login flow (login route -> index)    -> from a `login*` route
    // ANY other navigation into index / user.home (notably Exit Speak
    // Mode from board-detail's `exit_to_home` -> index, or board-alt's
    // EXIT BOARDS -> return_to_index -> user.home) must NOT re-enter
    // speak mode. Stored on appState because user.home extends this
    // route (inherits setupController, which has no transition arg) and
    // index.afterModel may replaceWith('user.home') — the origin
    // `transition.from` is preserved across that chain, so a recompute
    // there still resolves to "not login".
    var login_entry = !from || /^login(\.|$)/.test(from_name);
    this.appState.set('_index_login_entry', login_entry);
    return this._super.apply(this, arguments);
  },
  model: function() {
    var _this = this;
    if(session.get('access_token')) {
      return LingoLinq.store.findRecord('user', 'self').then(function(user) {
        // notifications and logs should show up when you re-visit the dashboard
        if(!user.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
          user.reload();
        }
        return RSVP.resolve(user);
      }, function() {
        return RSVP.resolve(null);
      });
    } else {
      return RSVP.resolve(null);
    }
  },
  // Where a user lands when there is no remembered page to resume (below).
  // Supporters — SLPs/therapists/parents/teachers, all of whom the backend
  // collapses to `preferences.role == 'supporter'` at signup (User#process_params)
  // — work out of their caseload, so that is their default page; everyone else
  // gets the dashboard as before.
  //
  // Gated on `_index_login_entry` (see beforeModel) so this is genuinely a
  // "page you log in to": an in-app return to index (Exit Speak Mode from
  // board-detail, EXIT BOARDS -> return_to_index) still lands on the dashboard.
  //
  // `supporter_role` is deliberately the same gate the Caseload pill uses
  // (components/user-pill-nav.hbs, utils/dashboard_sections.js), so the default
  // page is always one the user can see a pill for, and it is a strict subset of
  // the caseload route's own access guard (routes/caseload.js) — no bounce loop.
  _land_on_default: function(model) {
    if (this.appState.get('_index_login_entry') && model.get('supporter_role') &&
        !this._session_entry_gate_pending(model)) {
      this.router.replaceWith('caseload');
    } else {
      this.router.replaceWith('user.home', model.get('user_name'));
    }
  },
  // This route's setupController is the ONLY host for the session-entry gates —
  // the terms-agree modal and the EU AI Act Art.50 disclosure (routes/bento.js is
  // the one other host; the caseload route has neither). Redirecting a supporter
  // straight to /caseload therefore skips whichever gate is still outstanding, so
  // while one is pending they keep landing on the dashboard exactly as they do
  // today and pick up the caseload default from the next login onward. A landing
  // preference must never cost a compliance gate.
  _session_entry_gate_pending: function(model) {
    // Same predicate setupController uses below to decide to open terms-agree.
    if (model.get('id') && model.get('user_name') && !model.get('terms_agree')) { return true; }
    return sessionEntryGatePending(model);
  },
  afterModel: function(model) {
    var _this = this;
    if (model && model.get('user_name') && session.get('access_token')) {
      try {
        if (window.sessionStorage && sessionStorage.getItem('ll_pending_beta_welcome') === '1') {
          sessionStorage.removeItem('ll_pending_beta_welcome');
          if (model.get('preferences.beta_program_access') !== false) {
            this.router.transitionTo('beta-welcome-message');
            return;
          }
        }
      } catch (e) { /* sessionStorage unavailable */ }
      var home_board_key = model.get('preferences.home_board.key');
      // Direct users straight to their home board on login/app-boot —
      // the `progress.setup_done` gate was tied to the Getting Started
      // onboarding flow (now disabled / under evaluation for re-add),
      // and held users on the dashboard until that flow was complete.
      // With onboarding off, any user who has a home_board_key should
      // skip the dashboard and land in speak mode on their board.
      // Other gates kept: `_index_login_entry` so in-app returns to
      // index (e.g. Exit Speak Mode) don't bounce back into speak,
      // and supporter_view / eval_ended which need the dashboard.
      // Also skip auto-speak for non-communicator accounts that manage an org
      // (`has_management_responsibility`) — a manager/admin whose role isn't
      // explicitly 'supporter' would otherwise slip past `supporter_view` and get
      // dropped into speak mode on login/refresh instead of their dashboard.
      // Users without a home_board_key still fall through to the
      // dashboard below — there's no board to send them to yet.
      // A "communicator only" account: not in supporter view and not managing an
      // org. These two checks are the gate this route has always used to decide
      // who belongs on a board rather than the dashboard, and they are also the
      // exception to session resume below — a communicator-only user goes to
      // their board-detail page on every login, never to a remembered page.
      var communicator_only = !model.get('supporter_view') && !model.get('has_management_responsibility');
      if (this.appState.get('_index_login_entry') && home_board_key && communicator_only && !model.get('eval_ended')) {
        this.appState.home_in_speak_mode({user: model});
        this.appState.set('already_homed', true);
        return;
      }
      // Everyone else resumes where they left off last session — the remembered
      // page always wins over the default landing page below, so a supporter who
      // has used the app before returns to whatever they were last on rather than
      // being forced back to their caseload. A communicator-only user who reaches
      // here has no home board yet (first login / mid-onboarding) and needs the
      // dashboard to pick one, so they are excluded here too. Storage + eligible
      // routes: utils/session_history.js.
      if (this.appState.get('_index_login_entry') && !communicator_only && !model.get('eval_ended') &&
          this.appState.get('feature_flags.session_resume')) {
        var last = sessionHistory.last_location(model.get('user_name'));
        if (last && last.url) {
          var user_name = model.get('user_name');
          var resume = this.router.replaceWith(last.url);
          // The remembered page can have gone away since last session (a deleted
          // board, a supervisee relationship that ended, a renamed org). Drop the
          // stale record and fall back to the default landing page rather than an
          // error page.
          if (resume && resume.then) {
            resume.then(null, function() {
              sessionHistory.clear_location(user_name);
              _this._land_on_default(model);
            });
          }
          return;
        }
      }
      this._land_on_default(model);
    }
  },
  setupController: function(controller, model) {
    var _this = this;

    controller.set('user', this.store.createRecord('user', {preferences: {}, referrer: LingoLinq.referrer, ad_referrer: LingoLinq.ad_referrer}));
    controller.set('user.watch_user_name_and_cookies', true);
    LingoLinq.sale = LingoLinq.sale || parseInt(window.sale, 10) || null;
    controller.set('subscription', Subscription.create());
    controller.set('model', model);
    // Note: 'extras' is already injected via dependency injection, no need to set it again
    // Gated on `_index_login_entry` (see beforeModel): auto-speak only on
    // a login / app-boot entry. Inherited by user.home, so board-alt's
    // EXIT BOARDS (-> user.home) also lands on the dashboard, not speak.
    var jump_to_speak = !!(_this.appState.get('_index_login_entry') && ((_this.stashes.get('current_mode') == 'speak' && !document.referrer) || (model && model.get('currently_premium') && model.get('preferences.auto_open_speak_mode'))));
    // EU AI Act Art.50 session-entry gate (03-UI-SPEC 7.1): tracks whether a
    // terms_agree-missing sub-branch below has already claimed responsibility
    // for the Art.50 check this render, so the shared tail doesn't also check.
    var art50_checked_inline = false;

    var progress = _this.appState.get('sessionUser.preferences.progress') || {};
    if(!progress || (!progress.skipped_subscribe_modal && !progress.setup_done)) {
      if(_this.appState.get('sessionUser.grace_period')) {
        if(modal.route) {
          jump_to_speak = false;
        }
      }
    } else if(_this.appState.get('sessionUser.really_expired')) {
      jump_to_speak = false;
    }

    if(model && model.get('eval_ended')) { jump_to_speak = false; }
    // Only check terms_agree if user data is fresh (from server), not from stale local storage
    // This prevents showing the modal when data is incomplete due to API errors (like 401)
    if(model && model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
      // If data is not fresh, try to reload first before showing modal
      if(!model.get('really_fresh') && _this && _this.persistence && typeof _this.persistence.get === 'function' && _this.persistence.get('online')) {
        // Claim the Art.50 check now — the shared tail below must not also
        // check it once this branch is responsible for it (03-UI-SPEC 7.1).
        art50_checked_inline = true;
        model.reload().then(function() {
          // After successful reload, check again if terms_agree is still missing
          if(model.get('id') && model.get('user_name') && !model.get('terms_agree')) {
            // A resolved .then() here is not the same thing as "the user
            // acknowledged" — modal.open() resolves a bumped modal's promise
            // with {replaced: true}. onlyIfGenuinelyResolved rejects that.
            modal.open('terms-agree').then(function(result) {
              onlyIfGenuinelyResolved(result, model);
            });
          } else {
            // Reload cleared terms_agree — this call isn't chained off any
            // other modal's promise, so it needs no {replaced: true} guard.
            maybeShowSessionEntryGate(model);
          }
        }, function(err) {
          // If reload fails (e.g., 401 error), don't show modal
          // We can't be sure the data is complete, so don't assume terms_agree is missing
          // The modal will show on next successful load if terms_agree is actually false
          // Same caution extends to Art.50: don't show it either this pass.
          // art50_checked_inline stays true so the tail skips its own check.
        });
      } else if(model.get('really_fresh')) {
        // Data is fresh from server, safe to check terms_agree
        art50_checked_inline = true;
        modal.open('terms-agree').then(function(result) {
          onlyIfGenuinelyResolved(result, model);
        });
      }
      // If data is not fresh and we're offline, don't show modal (can't verify)
    } else {
      if(_this.stashes.get('current_mode') == 'edit') {
        _this.stashes.persist('current_mode', 'default');
      } else if(jump_to_speak && model && model.get('id') && !model.get('supporter_view') && !model.get('has_management_responsibility') && !_this.appState.get('already_homed') && model.get('preferences.home_board.key')) {
        var homey = function() {
          _this.appState.home_in_speak_mode({user: model});
          _this.appState.set('already_homed', true);
        };
        // for some reason, iOS doesn't like being auto-launched into speak mode too quickly..
        // android installed app is taking like 5 times as long to load with auto-speak, maybe this will help there too?
        var always_wait = true;
        if(capabilities.system == 'iOS' || always_wait) {
          runLater(homey);
        } else {
          homey();
        }
        return;
      }
    }

    _this.appState.clear_mode();
    // Only query starting_boards when authenticated - user_id=self requires a token
    if(session.get('isAuthenticated') && !_this.appState.get('currentUser.preferences.home_board.id')) {
      this.store.query('board', {user_id: 'self', starred: true, public: true}).then(function(boards) {
        controller.set('starting_boards', boards);
      }, function() { });
    }
    if(!session.get('isAuthenticated')) {
      controller.set('homeBoards', {loading: true});
      controller.store.query('board', {sort: 'home_popularity', per_page: 9}).then(function(data) {
        controller.set('homeBoards', data);
        controller.checkForBlankSlate();
      }, function() {
        controller.set('homeBoards', {error: true});
        controller.checkForBlankSlate();
      });

      controller.set('popularBoards', {loading: true});
      controller.store.query('board', {sort: 'popularity', per_page: 9}).then(function(data) {
        controller.set('popularBoards', data);
        controller.checkForBlankSlate();
      }, function() {
        controller.set('popularBoards', {error: true});
        controller.checkForBlankSlate();
      });
    }
    controller.update_selected();
    controller.checkForBlankSlate();
    controller.subscription_check();
    controller.update_current_badges();
    if(_this.appState.get('show_intro')) {
      modal.open('intro');
    }
    // EU AI Act Art.50 session-entry opportunity (03-UI-SPEC 7.1): only check
    // here if none of the terms_agree-missing sub-branches above already
    // claimed it. Deliberately placed AFTER modal.open('intro') above — a
    // compliance-load-bearing BLOCK modal beats a discretionary onboarding
    // tour if both would fire in the same render.
    if(!art50_checked_inline) {
      maybeShowSessionEntryGate(model);
    }
  },
  actions: {
    homeInSpeakMode: function(board_for_user_id, keep_as_self) {
      if(board_for_user_id) {
        this.appState.set_speak_mode_user(board_for_user_id, true, keep_as_self);
      } else if((this.appState.get('currentUser.permissions.delete') && (this.appState.get('currentUser.supervisees') || []).length > 0) || this.appState.get('currentUser.communicator_in_supporter_view')) {
        var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
        if(this.appState.get('currentUser.communicator_in_supporter_view')) {
          prompt = i18n.t('speak_as_which_mode', "Select Mode and User for Session");
        }
        this.appState.set('referenced_speak_mode_user', null);
        this.appState.controller.send('switch_communicators', {stay: true, modeling: 'ask', skip_me: false, header: prompt});
      } else {
        this.appState.home_in_speak_mode();
      }
    },
    manual_session: function() {
      LingoLinq.Log.manual_log(this.appState.get('currentUser.id'), !!this.appState.get('currentUser.external_device'))
    },
    home_board: function(key) {
      var parts = key ? key.split('/') : [];
      if(parts.length === 2) {
        this.router.transitionTo('user.board-detail', parts[0], parts[1]);
      } else {
        this.router.transitionTo('board', key);
      }
    },
    saveProfile: function() {
      var controller = this.get('controller');
      var user = controller.get('user');
      var _this = this;
      controller.set('triedToSave', true);
      if(!user.get('terms_agree')) { return; }
      var p = (_this && _this.persistence) || (typeof window !== 'undefined' && window.persistence);
      if(!p || typeof p.get !== 'function' || !p.get('online')) { return; }
      if(controller.get('badEmail') || controller.get('shortPassword') || controller.get('noName') || controller.get('noSpacesName')) {
        return;
      }
      controller.set('registering', {saving: true});
      user.save().then(function(user) {
        controller.set('start_code', null);
        var meta = p && typeof p.meta === 'function' ? p.meta('user', null) : null;
        controller.set('triedToSave', false);
        user.set('password', null);
        var save_done = function() {
          controller.set('registering', null);
          _this.appState.return_to_index();
          if(meta && meta.access_token) {
            session.override(meta);
          }
        };
        if(user.get('start_progress')) {
          controller.set('registering', {saving: true, initializing: true})

          progress_tracker.track(user.get('start_progress'), function(event) {
            if(event.status == 'errored' || (event.status == 'finished' && event.result && event.result.translated === false)) {
              controller.set('registering', {error: {progress: true}});
            } else if(event.status == 'finished') {
              save_done();
            }
          });
        } else {
          save_done();
        }
      }, function(err) {
        controller.set('registering', {error: true});
        if(err.errors && err.errors[0] == 'blocked email address') {
          controller.set('registering', {error: {email_blocked: true}});
        } else if(err.errors && err.errors[0] && err.errors[0].start_code_error) {
          controller.set('registering', {error: {start_code: true}});
        }
      });
    }
  }
});

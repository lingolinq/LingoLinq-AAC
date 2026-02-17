import Ember from 'ember';
import Route from '@ember/routing/route';
import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { getOwner } from '@ember/application';
import EmberObject from '@ember/object';
import {
  set as emberSet,
  setProperties as setProperties,
  get as emberGet
} from '@ember/object';
import {
  later as runLater,
  cancel as runCancel,
  next as runNext,
  scheduleOnce
} from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
// stashes now injected as service
// persistence now injected as service
import boundClasses from '../utils/bound_classes';
import utterance from '../utils/utterance';
import modal from '../utils/modal';
import LingoLinq from '../app';

import editManager from '../utils/edit_manager';
import buttonTracker from '../utils/raw_events';
import capabilities from '../utils/capabilities';
import scanner from '../utils/scanner';

import speecher from '../utils/speecher';
import geolocation from '../utils/geo';
import i18n from '../utils/i18n';
import frame_listener from '../utils/frame_listener';
import Button from '../utils/button';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import sync from '../utils/sync';

// tracks:
// current mode (edit mode, speak mode, default)
// whether the sidebar is enabled
// what the currently-visible board is
// who the currently-logged-in user is
// who we're acting as for speak mode
// whether logging is temporarily disabled
// "back button" history
export default Service.extend({
  stashes: service('stashes'),
  persistence: service('persistence'),
  router: service('router'),
  session: service('session'),
  contentGrabbers: service('content-grabbers'),
  init() {
    LingoLinq.appState = this;
    // Expose globally for utilities
    window.appState = this;
    if (typeof window !== 'undefined') {
      window.LingoLinq = window.LingoLinq || {};
      window.LingoLinq.appState = this;
    }
    // Also assign to buttonTracker as it's used in raw_events
    if(buttonTracker) {
      buttonTracker.appState = this;
    }
    // CRITICAL: Fix stashes injection BEFORE calling _super() to prevent errors
    // If this.stashes is a class (not an instance), use window.stashes or lookup the service
    if(this.stashes && typeof this.stashes.create === 'function') {
      // this.stashes is a class, not an instance - fix it before _super() is called
      console.warn('[APP-STATE INIT] WARNING: this.stashes is a class, not an instance. Fixing before _super()...');
      // Try to get the instance from the owner first (but don't use this.get() before _super())
      try {
        var owner = (this.constructor && this.constructor.owner) || (this.owner);
        if(owner && typeof owner.lookup === 'function') {
          var stashesService = owner.lookup('service:stashes');
          if(stashesService && typeof stashesService.get === 'function') {
            console.log('[APP-STATE INIT] Found stashes service via owner.lookup (before _super)');
            this.stashes = stashesService;
          }
        }
      } catch(e) {
        console.warn('[APP-STATE INIT] Error looking up stashes service (before _super):', e);
      }
      // Fallback to window.stashes if owner lookup didn't work
      if(!this.stashes || typeof this.stashes.get !== 'function') {
        if(window.stashes && typeof window.stashes.get === 'function') {
          console.log('[APP-STATE INIT] Using window.stashes as fallback (before _super)');
          this.stashes = window.stashes;
        } else {
          console.warn('[APP-STATE INIT] WARNING: stashes service not available, setting to null to prevent errors');
          this.stashes = null;
        }
      }
    }
    
    this._super(...arguments);
    
    // Fix stashes injection again after _super() in case it got reset
    if(this.stashes && typeof this.stashes.create === 'function') {
      // this.stashes is still a class, not an instance - fix it after _super()
      console.warn('[APP-STATE INIT] WARNING: this.stashes is still a class after _super(). Fixing...');
      try {
        var owner = this.get('owner') || (this.constructor && this.constructor.owner);
        if(owner && typeof owner.lookup === 'function') {
          var stashesService = owner.lookup('service:stashes');
          if(stashesService && typeof stashesService.get === 'function') {
            console.log('[APP-STATE INIT] Found stashes service via owner.lookup (after _super)');
            this.stashes = stashesService;
          }
        }
      } catch(e) {
        console.warn('[APP-STATE INIT] Error looking up stashes service (after _super):', e);
      }
      // Fallback to window.stashes if owner lookup didn't work
      if(!this.stashes || typeof this.stashes.get !== 'function') {
        if(window.stashes && typeof window.stashes.get === 'function') {
          console.log('[APP-STATE INIT] Using window.stashes as fallback (after _super)');
          this.stashes = window.stashes;
        } else {
          console.warn('[APP-STATE INIT] WARNING: stashes service not available, setting to null to prevent errors');
          this.stashes = null;
        }
      }
    }
    
    this.setup();
    // Defer refresh timers to ensure all services are initialized
    // This prevents errors if window.persistence isn't ready yet
    var _this = this;
    runLater(function() {
      _this._setupRefreshTimers();
    }, 0);
  },

  setup: function() {
    // CRITICAL: Fix stashes injection FIRST, before any code that uses it
    // This prevents "Cannot read properties of undefined (reading 'get')" errors
    if(this.stashes && typeof this.stashes.create === 'function') {
      // this.stashes is a class, not an instance - fix it immediately
      try {
        // Try window.stashes first (set by instance initializer)
        if(window.stashes && typeof window.stashes.get === 'function') {
          this.stashes = window.stashes;
        } else {
          // Try owner lookup
          var owner = this.get('owner') || (this.constructor && this.constructor.owner);
          if(owner && typeof owner.lookup === 'function') {
            var stashesService = owner.lookup('service:stashes');
            if(stashesService && typeof stashesService.get === 'function') {
              this.stashes = stashesService;
            }
          }
          // Final fallback: set to null to prevent errors
          if(!this.stashes || typeof this.stashes.get !== 'function') {
            this.stashes = null;
          }
        }
      } catch(e) {
        console.warn('[APP-STATE SETUP] Error fixing stashes injection:', e);
        this.stashes = null;
      }
    }
    
    // Guard: ensure stashes is available before proceeding
    if(!this.stashes || typeof this.stashes.set !== 'function') {
      console.error('[APP-STATE SETUP] ERROR: stashes service not available! Cannot proceed with setup.');
      console.error('[APP-STATE SETUP] this.stashes:', this.stashes);
      console.error('[APP-STATE SETUP] window.stashes:', window.stashes);
      // Try one more time to get stashes
      if(window.stashes && typeof window.stashes.set === 'function') {
        console.warn('[APP-STATE SETUP] Using window.stashes as emergency fallback');
        this.stashes = window.stashes;
      } else {
        console.error('[APP-STATE SETUP] CRITICAL: Cannot proceed without stashes service!');
        return; // Exit early to prevent errors
      }
    }
    
    var _this = this;
    this.set('browser', capabilities.browser);
    this.set('system', capabilities.system);
    this.set('button_list', []);
    // Defer stashes access until after service initialization is complete
    runLater(function() {
      _this.set('stashes', _this.stashes);
    }, 0);
    this.set('geolocation', geolocation);
    this.set('installed_app', capabilities.installed_app);
    this.set('no_linky', capabilities.installed_app && capabilities.system == 'iOS');
    this.set('licenseOptions', LingoLinq.licenseOptions);
    this.set('device_name', capabilities.readable_device_name);
    var settings = window.domain_settings || {};
    settings.app_name = LingoLinq.app_name || settings.app_name || "LingoLinq";
    settings.company_name = LingoLinq.company_name || settings.company_name || "LingoLinq";
    this.set('domain_settings', settings);
    // Ensure window.user_preferences.any_user exists to prevent TypeError
    window.user_preferences = window.user_preferences || {};
    window.user_preferences.any_user = window.user_preferences.any_user || {};
    this.set('currentBoardState', null);
    var _this = this;
    this.set('version', window.app_version || 'unknown');
    var _this = this;

    capabilities.battery.listen(function(battery) {
      battery.level = Math.round(battery.level * 100);
      if(battery.level != _this.get('battery.level') || battery.charging !== _this.get('battery.charging')) {
        _this.set('battery', battery);
        _this.set('battery.progress_style', htmlSafe("width: " + parseInt(battery.level) + "%;"));
        _this.set('battery.low', battery.level < 30);
        _this.set('battery.really_low', battery.level < 15);
        var warns = _this.get('battery_warns') || {};
        var fulls = _this.get('battery_fulls') || {};
        if(battery.charging || battery.level >= 30) {
          warns = {};
        }
        if(!battery.charging || battery.level <= 70) {
          fulls = {};
        }
        if(!_this.get('battery_after_speak_mode')) {
          // If already topped-off when entering speak
          // mode, don't make any full audio alerts,
          // and wait at least a moment before doing low
          // battery alerts
          _this.set('battery_after_speak_mode', true);
          if(battery.charging && battery.level == 100) {
            fulls.complete = true;
            fulls.reminds = 10;
          } else if(battery.level <= 15) {
            return;
          }
        }
        var maybe_sound = function(type, attempt) {
          attempt = attempt || 0;
          if(_this.get('speak_mode') && _this.get('currentUser.preferences.battery_sounds')) {
            if(speecher.speaking) {
              if(attempt < 5) {
                runLater(function() {
                  maybe_sound(type, attempt + 1);
                }, 5000);  
              }
            } else {
              speecher.click(type);
            }
          }
        };
        if(battery.level <= 15 && !battery.charging) {
          if(_this.get('speak_mode')) {
            if(battery.level <= 4) {
              if(!warns.critical) {
                warns.critical = true; warns.dangerous = true; warns.low = true;
                maybe_sound('battery');
              }
            } else if(battery.level <= 7) {
              if(!warns.dangerous) {
                warns.dangerous = true; warns.low = true;
                maybe_sound('battery');
              }
            } else {
              if(!warns.low) {
                warns.low = true;
                maybe_sound('battery');
              }
            }  
          }
          _this.set('battery.progress_class', "progress-bar progress-bar-danger");
        } else if(battery.level <= 30 && !battery.charging) {
          _this.set('battery.progress_class', "progress-bar progress-bar-warning");
        } else {
          _this.set('battery.progress_class', "progress-bar progress-bar-success");
          if(_this.get('speak_mode')) {
            if(battery.charging && battery.level >= 85) {
              if(battery.level == 100) {
                if(!fulls.complete) {
                  fulls.complete = true; fulls.mostly = true; fulls.ready = true;
                  var remind = function() {
                    // taper off reminders that the device is fully charged
                    if(_this.get('battery_fulls.complete') && battery.charging && battery.level == 100 && _this.get('battery_fulls.reminds') <= 3) {
                      maybe_sound('glug');
                      var reminds = (_this.get('battery_fulls.reminds') || 1) + 1;
                      runLater(remind, reminds * 15 * 60 * 1000)
                      _this.set('battery_fulls.reminds', reminds);
                    }
                  };
                  runLater(remind, 15 * 60 * 1000);
                  fulls.reminds = (fulls.reminds || 0) + 1;
                  maybe_sound('glug');
                }
              } else if(battery.level >= 95) {
                if(!fulls.mostly) {
                  fulls.mostly = true; fulls.ready = true;
                  maybe_sound('glug');
                }
              } else {
                if(!fulls.ready) {
                  fulls.ready = true;
                  maybe_sound('glug');
                }
              }
            }
          }
        }
        _this.set('battery_warns', warns);
        _this.set('battery_fulls', fulls);
      }
    });
    capabilities.ssid.listen(function(ssid) {
      _this.set('current_ssid', ssid);
    });
    capabilities.nfc.available().then(function(res) {
      if(res && res.background) {
        var _this_service = _this;
        capabilities.nfc.listen('global', function(tag) {
          _this_service.handle_tag(tag);
        }).then(null, function() {
        })
      }
    });
    sync.default_listen();
    Button.load_actions();
//    speecher.check_for_upgrades();
    this.refresh_user();
  },
  reset: function() {
    this.set('currentBoardState', null);
    this.set('currentUser', null);
    this.set('sessionUser', null);
    this.set('speakModeUser', null);
    this.set('referenced_speak_mode_user', null);
    this.stashes.set('current_mode', 'default');
    this.stashes.set('root_board_state', null);
    this.stashes.set('boardHistory', []);
    this.stashes.set('browse_history', []);
    this.controller = null;
    this.route = null;
    modal.reset();
    boundClasses.clear();
  },
  setup_controller: function(route, controller) {
    var _this = this;
    this.route = route;
    this.controller = controller;
    if(!this.session.get('isAuthenticated') && capabilities.mobile && capabilities.browserless) {
      this.set('login_modal', true);
    } else if(!this.session.get('isAuthenticated') && !this.get('domain_settings.full_domain')) {
      this.set('login_index', true);
    }
    modal.setup(route);
    this.set('browser', capabilities.browser);
    this.set('system', capabilities.system);
    this.contentGrabbers.boardGrabber.transitioner = route;
    LingoLinq.controller = controller;
    this.stashes.controller = controller;
    editManager.setup(controller, this, this.persistence, this.stashes);
    boundClasses.setup();
//    controller.set('model', EmberObject.create());
    utterance.setup(controller);
    this.speak_mode_handlers();
    this.dom_changes_on_board_state_change();
    LingoLinq.session = this.session;
    modal.close();
    if(this.session.get('access_token')) {
      // this shouldn't run until the db is initialized, otherwise if the user is offline
      // or has a spotty connection, then looking up the user will not succeed, and
      // the app will force a logout unexpectedly.
      var find_user = function(last_try) {
        var find = LingoLinq.store.findRecord('user', 'self');

        find.then(function(user) {
          console.log("user initialization working..");
          try {
            if (user && typeof user.get === 'function') {
              try {
                if(_this.session) {
                  user.set('modeling_session', _this.session.get('modeling_session'));
                }
                _this.set('sessionUser', user);
                if (!_this.get('speak_mode') || !_this.get('speakModeUser')) {
                  _this.set('currentUser', user);
                }
                // Notify property change to ensure observers fire
                _this.notifyPropertyChange('currentUser');
              } catch(e) {
                console.error('[APP-STATE] find_user: ERROR setting sessionUser/currentUser', e, e.stack);
              }
            } else {
              console.error('[APP-STATE] find_user: user object is invalid', {
                has_user: !!user,
                user_type: typeof user,
                has_get: user && typeof user.get === 'function'
              });
            }
          } catch(e) {
            console.error('[APP-STATE] find_user: ERROR in find.then() callback', e, e.stack);
          }
          
          var valid_user = RSVP.resolve(user);
          if(_this.session && !_this.session.get('as_user_id') && _this.session.get('user_id') && _this.session.get('user_id') != user.get('id')) {
            // mismatch due to a user being renamed
            // console.log('[APP-STATE] find_user: user ID mismatch, fetching by session user_id');
            valid_user = LingoLinq.store.findRecord('user', _this.session.get('user_id'));
          } else if(_this.session && _this.session.get('as_user_id') && user.get('user_name') && _this.session.get('as_user_id') != user.get('user_name')) {
            // mismatch due to a user being renamed
            // console.log('[APP-STATE] find_user: user name mismatch, fetching by session as_user_id');
            valid_user = LingoLinq.store.findRecord('user', _this.session.get('as_user_id'));
          }
          console.log('[APP-STATE] find_user: about to call valid_user.then()', {
            valid_user_type: typeof valid_user,
            is_promise: valid_user && typeof valid_user.then === 'function',
            valid_user: valid_user
          });
          valid_user.then(function(user) {
            console.log('[APP-STATE] find_user: valid_user.then() called', {
              has_user: !!user,
              user_type: typeof user,
              user_id: user && user.get ? user.get('id') : 'no get method'
            });
            try {
              if(!user.get('fresh') && _this.stashes.get('online')) {
              // if online, try reloading, but it's ok if you can't
              user.reload().then(function(user) {
                _this.set('sessionUser', user);
                // Manually set currentUser after reload
                if (!_this.get('speak_mode') || !_this.get('speakModeUser')) {
                  _this.set('currentUser', user);
                }
              }, function() { });
            }
            if(_this.session) {
              user.set('modeling_session', _this.session.get('modeling_session'));
            }
            console.log('[APP-STATE] find_user: setting sessionUser', {
              has_user: !!user,
              user_id: user ? user.get('id') : null
            });
            LingoLinq.appState.set('sessionUser', user);
            
            // Manually trigger the observer to ensure currentUser is set
            // The observer should fire automatically, but we'll also manually set currentUser
            // to ensure it happens immediately
            if (!LingoLinq.appState.get('speak_mode') || !LingoLinq.appState.get('speakModeUser')) {
              if(user && user.get && !user.get('preferences.progress.app_added') && (navigator.standalone || (capabilities.installed_app && capabilities.mobile))) {
                user.set('preferences.progress.app_added', true);
                user.save().then(null, function() { });
              }
              LingoLinq.appState.set('currentUser', user);
              console.log('[APP-STATE] find_user: manually set currentUser', {
                has_currentUser: !!LingoLinq.appState.get('currentUser'),
                currentUser_id: LingoLinq.appState.get('currentUser') ? LingoLinq.appState.get('currentUser.id') : null
              });
            }
            } catch(e) {
              console.error('[APP-STATE] find_user: error in valid_user.then() callback', e, e.stack);
            }

            if(LingoLinq.appState.stashes.get('speak_mode_user_id') || LingoLinq.appState.stashes.get('referenced_speak_mode_user_id')) {
              var ref_id = LingoLinq.appState.stashes.get('speak_mode_user_id') || LingoLinq.appState.stashes.get('referenced_speak_mode_user_id');
              LingoLinq.store.findRecord('user', ref_id).then(function(user) {
                if(LingoLinq.appState.stashes.get('speak_mode_user_id')) {
                  LingoLinq.appState.set('speakModeUser', user);
                }
                LingoLinq.appState.set('referenced_speak_mode_user', user);
              }, function() {
                console.error('failed trying to speak as ' + ref_id);
              });
            }
          }, function(err) {
            console.error('[APP-STATE] find_user: valid_user promise rejected', err);
          });
        }, function(err) {
          if(LingoLinq.appState.stashes.get('current_mode') == 'edit') {
            controller.toggleMode('edit');
          }
          console.log(err);
          console.log(err.status);
          console.log(err.error);
          // Check if it's an auth error (should force logout)
          var do_logout = err.status == 400 && (err.error == 'Not authorized' || err.error == "Invalid token");
          // Check if it's a timeout/network error (should NOT force logout, just retry or fail gracefully)
          var is_timeout = !err.status || err.status === 0 || err.error === 'timeout' || (err.errors && err.errors[0] === 'timeout');
          console.log("will log out: " + (do_logout || (last_try && !is_timeout)));
          console.error("user initialization failed");
          // Only force logout on auth errors, not on timeouts
          // For timeouts, we'll retry a few times, but won't force logout
          if(do_logout || (last_try && !is_timeout)) {
            var error = null;
            if(last_try) {
              error = i18n.t('error_logging_in', "We couldn't retrieve your user account, please try logging back in");
            } else {
              error = i18n.t('session_expired', "This session has expired, please log back in");
            }
            if(_this.session && typeof _this.session.force_logout === 'function') {
              _this.session.force_logout(error);
            }
          } else if(is_timeout && !last_try) {
            // For timeouts, retry (but only once to avoid infinite loops)
            console.log("Retrying user initialization after timeout...");
            runLater(function() {
              find_user(true);
            }, 2000); // Wait 2 seconds before retry
          } else {
            // Other errors or timeout on last try - don't force logout, just log
            console.warn("User initialization failed, but not forcing logout (timeout or non-auth error)");
          }
        });
      };
      if(_this.session && _this.session.get('access_token')) {
        find_user();
      }
    }
    this.session.addObserver('access_token', function() {
      var _this_service = _this;
      runLater(function() {
        if(_this_service.session && _this_service.session.get('access_token')) {
          _this_service.refresh_session_user();
        }
      }, 10);
    });
    $('#loading_box').remove();
    $("body").removeClass('pretty_loader');
  },
  refresh_user: function() {
    var _this = this;
    runCancel(_this.refreshing_user);

    function refresh() {
      runCancel(_this.refreshing_user);
      _this.refreshing_user = runLater(function() {
        _this.refresh_user();
      }, 60000 * 15);
    }
    if(_this.get('currentUser') && _this.get('currentUser').reload) {
      _this.get('currentUser').reload().then(function() {
        if(capabilities.installed_app && capabilities.system == 'iOS' && _this.get('currentUser.subscription.plan_id') == 'LingoLinqiOSMonthly' && !_this.get('currentUser.checked_iap')) {
          _this.set('currentUser.checked_iap', true);
          // TODO: API call that triggers Purchasing.verify_receipt for the user
          // and reloads again on success
        }

        refresh();
      }, function() {
        refresh();
      });
    } else {
      refresh();
    }
  },
  global_transition: function(transition) {
    if(transition.aborted) { return; }
    if(transition.to_route === 'board.index' || transition.to_route === 'board') {
      console.log('[BOARD-DEBUG] app-state global_transition', { to_route: transition.to_route, from_route: transition.from_route });
    }
    var route = this.get('route');
    var from_url = null;
    if(route && typeof route.get === 'function') {
      try {
        from_url = route.get('_router.url') || route.get('router.url');
      } catch(e) {
        // Silently handle errors accessing route properties
        console.warn('[app-state] Error getting route URL:', e);
      }
    }
    this.set('from_url', from_url);
    var from = [transition.from_route].concat(transition.from_params);
    if(from[0] && from[0] != 'board.index') {
      this.set('from_route', from);
    }
    this.set('latest_board_id', null);
    this.set('login_modal', false);
    this.set('to_target', transition.to_route);
    var from_route = (this.get('from_route') || [])[0] || transition.from_route;
    if(transition.to_route == 'board.index' && (from_route == 'setup' || from_route == 'home-boards')) {
      this.set('set_as_root_board_state', true);
    }

    // On desktop, setting too soon causes a re-render, but on mobile
    // calling it too late does.
    if(capabilities.mobile) {
      this.set('index_view', transition.to_route == 'index');
    }
    if(transition.to_route == 'board.index') {
      boundClasses.setup();
      var delay = this.get('currentUser.preferences.board_jump_delay') || window.user_preferences.any_user.board_jump_delay;
      LingoLinq.log.track('global transition handled');
      runLater(this, this.check_for_board_readiness, delay, 50);
    }
    var controller = this.controller;
    runLater(function() {
      if(controller && controller.updateTitle) {
        controller.updateTitle();
      }
    }, controller && controller.updateTitle ? 0 : 500);
    
    modal.close();
    modal.close_board_preview();
    if(this.get('edit_mode')) {
      this.toggle_edit_mode();
    }
//           $(".hover_button").remove();
    this.set('hide_search', transition.to_route == 'search');
    if(transition.to_route != 'board.index') {
      this.set('currentBoardState', null);
    }
    if(!this.get('sessionUser') && this.session.get('isAuthenticated')) {
      this.refresh_session_user();
    }
    this.set('current_route', transition.to_route);
  },
  finish_global_transition: function() {
    var _this = this;
    this.set('already_homed', true);
    runNext(function() {
      var target = _this.get('current_route');
      _this.set('index_view', target == 'index');
    });
    // footer was showing up too quickly and looking weird when the rest of the page hadn't
    // re-rendered yet.
    if(!this.get('currentBoardState')) {
      try {
        this.controller.set('footer', true);
        if(this.get('to_target') && this.get('to_target') != 'setup' && this.get('to_target') != 'home-boards') {
          this.controller.set('setup_footer', false);
          this.controller.set('simple_board_header', false);
          this.set('setup_user', null);
          this.controller.set('setup_user_id', null);
        }
      } catch(e) { }
    }
    if(LingoLinq.embedded && !this.get('speak_mode')) {
      if(window.top && window.top != window.self) {
        window.top.location.replace(window.location);
      }
    }
  },
  check_for_protected_usage: observer('currentUser.preferences.protected_usage', function() {
    var protect_user = !!this.get('currentUser.preferences.protected_usage');
    if(window._trackJs) {
      window._trackJs.disabled = protect_user;
    }
    LingoLinq.protected_user = protect_user;
    this.stashes.persist('protected_user', protect_user);
  }),
  set_root_board_state: observer('set_as_root_board_state', 'currentBoardState', function() {
    // When browsing boards from the "select a home board" interface,
    // automatically set them as the temporary root board for browsing
    if(this.get('set_as_root_board_state') && this.get('currentBoardState')) {
      this.stashes.persist('board_level', this.get('currentBoardState.default_level'));
      console.log("root state", this.stashes.get('board_level'));
      this.stashes.persist('root_board_state', this.get('currentBoardState'));
      this.set('set_as_root_board_state', false);
    }
  }),
  current_board_level: computed('stashes.board_level', function() {
    return this.stashes.get('board_level') || 10;
  }),
  board_url: computed('currentBoardState.key', function() {
    if(this.get('currentBoardState.key')) {
      return htmlSafe((capabilities.api_host || (location.protocol + "//" + location.host)) + "/" + this.get('currentBoardState.key'));
    } else {
      return null;
    }
  }),
  domain_board_user_name: computed('domain_settings.board_user_name', function() {
    return this.get('domain_settings.board_user_name') || 'example';
  }),
  h1_class: computed('currentBoardState.id', 'from_route', 'edit_mode', function() {
    var res = "";
    if(this.get('currentBoardState.id')) {
      res = res + "with_board " ;
      if(this.get('from_route') && !this.get('edit_mode')) {
        res = res + "sr-only ";
      }
    }
    return htmlSafe(res);
  }),
  nav_header_class: computed('currentBoardState.id', 'from_route', function() {
    var res = "no_beta ";
    if(this.get('currentBoardState.id') && this.get('from_route') && !this.get('edit_mode')) {
      res = res + "board_done ";
    }
    return htmlSafe(res);
  }),
  set_latest_board_id: observer('currentBoardState.id', function() {
    this.set('latest_board_id', this.get('currentBoardState.id'));
  }),
  check_for_board_readiness: function(delay) {
    if(this.check_for_board_readiness.timer) {
      runCancel(this.check_for_board_readiness.timer);
    }
    var id = this.get('latest_board_id');
    if(id) {
      var $board = $(".board[data-id='" + id + "']");
      var $integration = $("#integration_frame");
      var _this = this;
      if($integration.length || ($board.length && $board.find(".button_row,canvas").length)) {
        runLater(function() {
          LingoLinq.log.track('done transitioning');
          buttonTracker.transitioning = false;
        }, delay);
        return;
      }
    }
    this.check_for_board_readiness.timer = runLater(this, this.check_for_board_readiness, delay, 100);
  },
  track_depth: function(type) {
    var actions = this.get('depth_actions') || {depth: 0};
    if(type == 'home') {
      // TODO: make sure not to count double-hits without any change in page
      if(actions.last_action != 'home') {
        actions.depth = 0;
      }
      actions.depth++;
    } else if(type == 'back') {
      actions.depth = Math.max(0, actions.depth - 1);
    } else if(type == 'clear') {
      actions.depth = 0;
    } else {
      actions.depth++;
    }
    actions.last_action = type;
    this.set('depth_actions', actions);
  },
  return_to_index: function() {
    var router = this.get('router') || this.router;
    if(router && typeof router.transitionTo === 'function') {
      router.transitionTo('index');
    } else {
      console.warn('[APP-STATE] Cannot transition to index route: router not available');
    }
  },
  jump_to_board: function(new_state, old_state) {
    console.log('[BOARD-DEBUG] app-state.jump_to_board entry', { newKey: new_state && new_state.key, source: new_state && new_state.source, oldKey: old_state && old_state.key });
    buttonTracker.transitioning = true;
    if(new_state && old_state && new_state.id && (new_state.id == old_state.id || new_state.key == old_state.key)) {
      // transition was getting stuck when staying on the same board
      buttonTracker.transitioning = false;
    }
    if(new_state && (new_state.source == 'sidebar' || new_state.source == 'swipe')) {
      if(new_state && new_state.locale && this.stashes.get('override_label_locale') && new_state.locale != this.stashes.get('override_label_locale')) {
        this.stashes.persist('override_label_locale', null);
      }
      if(new_state && new_state.locale && this.stashes.get('override_vocalization_locale') && new_state.locale != this.stashes.get('override_vocalization_locale')) {
        this.stashes.persist('override_vocalization_locale', null);
      }
      this.stashes.persist('last_root', new_state);
    }
    var history = this.get_history();
    old_state = old_state || this.get('currentBoardState');
    if(this.stashes.get('board_level') && old_state) {
      emberSet(old_state, 'level', this.stashes.get('board_level'));
    }
    history.push(old_state);
    this.stashes.log({
      action: 'open_board',
      previous_key: old_state,
      new_id: new_state
    });
    if(new_state && new_state.home_lock) {
      if(new_state.meta_home) {
        this.set('temporary_root_board_key', null);
        this.stashes.persist('temporary_root_board_state', null);
        var root_state = this.stashes.get('root_board_state') || old_state;
        this.set('meta_home', {state: root_state, unassigned: true, new_key: new_state.key})
      } else {
        this.set('temporary_root_board_key', new_state.key);
      }
    }
    this.controller.send('hide_temporary_sidebar');
    this.set_history([].concat(history));
    if(new_state.level) {
      this.stashes.persist('board_level', new_state.level);
    }
    if(new_state.locale) {
      this.stashes.persist('label_locale', new_state.locale);
      this.stashes.persist('vocalization_locale', new_state.locale);
      this.set('label_locale', new_state.locale);
      this.set('vocalization_locale', new_state.locale);
    }
    this.set('referenced_board', new_state);
    var _this = this;
    var promise = new RSVP.Promise(function(resolve, reject) {
      var router = _this.get && _this.get('router') || _this.router;
      if(router && typeof router.transitionTo === 'function') {
        try {
          console.log('[BOARD-DEBUG] app-state calling router.transitionTo', { route: 'board', key: new_state.key });
          router.transitionTo('board', new_state.key);
          console.log('[BOARD-DEBUG] app-state router.transitionTo returned (async transition started)');
        } catch(e) {
          console.warn('[APP-STATE] router.transitionTo threw:', e);
        }
      } else {
        console.warn('[APP-STATE] Cannot transition to board route: router not available');
      }
      if(old_state && new_state && old_state.key == new_state.key) {
        // If we are staying on the same board, force a redraw
        editManager.process_for_displaying();
      }
      var check = function() {
        check.attempts = (check.attempts || 0);
        if(!buttonTracker.transitioning) { check.attempts++; }
        var currentKey = _this.get('currentBoardState.key');
        if(check.attempts <= 3 || check.attempts % 5 === 0 || check.attempts > 18) {
          console.log('[BOARD-DEBUG] app-state check attempt', check.attempts, { currentKey: currentKey, expectedKey: new_state.key, match: currentKey === new_state.key });
        }
        if(currentKey == new_state.key) {
          console.log('[BOARD-DEBUG] app-state currentBoardState matched, resolving');
          buttonTracker.transitioning = false;
          resolve();
        } else {
          if(check.attempts > 20) {
            console.warn('[BOARD-DEBUG] app-state check timeout after 20 attempts', { currentKey: currentKey, expectedKey: new_state.key });
            buttonTracker.transitioning = false;
            reject({error: 'not loaded'});
          } else {
            runLater(check, 200);
          }
        }
      };
      runLater(check, 100);
    });
    promise.then(null, function() { });
    return promise;
  },
  check_for_lock_on_board_state: observer('currentBoardState', function() {
    var state = this.get('currentBoardState');
    if(state && state.key) {
      if(state.key == this.get('temporary_root_board_key')) {
        this.toggle_home_lock(true);
      }
      this.set('temporary_root_board_key', null);
    }
  }),
  toggle_home_lock: function(force) {
    var state = this.stashes.get('root_board_state');
    var current = this.get('currentBoardState');
    if(force === false || (this.stashes.get('temporary_root_board_state') && force !== true)) {
      this.stashes.persist('temporary_root_board_state', null);
    } else {
      if(state && current && state.key != current.key) {
        this.stashes.persist('temporary_root_board_state', this.get('currentBoardState'));
        this.set_history([]);
      }
    }
  },
  meta_home_if_possible: function() {
    if(this.get('speak_mode') && this.stashes.get('root_board_state.meta_home')) {
      this.set('temporary_root_board_key', null);
      this.stashes.persist('temporary_root_board_state', null);
      this.set('meta_home', {unassigned: true, new_key: this.stashes.get('root_board_state.meta_home.key')});
      this.jump_to_board({
        id: this.stashes.get('root_board_state.meta_home.id'),
        key: this.stashes.get('root_board_state.meta_home.key')
      });
    }
    this.set_history([]);
  },
  toggle_modeling_if_possible: function(enable) {
    if(this.get('modeling_for_user')) {
      modal.warning(i18n.t('cant_clear_session_modeling', "You are in a modeling session. To leave modeling mode, Exit Speak Mode and then Speak As the communicator"), true);
    } else {
      this.toggle_modeling(enable);
    }
  },
  toggle_modeling: function(enable) {
    if(enable === undefined || enable === null) {
      enable = !this.get('manual_modeling');
    }
    this.set('last_activation', (new Date()).getTime());
    this.set('manual_modeling', !!enable);
    if(enable) {
      this.set('modeling_started', (new Date()).getTime());
    }
  },
  update_modeling: observer('modeling', function() {
    if(this.get('modeling') !== undefined && this.get('modeling') !== null) {
      this.stashes.set('modeling', !!this.get('modeling'));
    }
  }),
  modeling: computed('manual_modeling', 'modeling_for_user', 'modeling_for_self', 'modeling_ts', function(ch) {
    var res = !!(this.get('manual_modeling') || this.get('modeling_for_user'));
    return res;
  }),
  modeling_for_user: computed('speak_mode', 'currentUser', 'referenced_speak_mode_user', 'modeling_for_self', function() {
    var res = this.get('speak_mode') && this.get('currentUser') && this.get('referenced_speak_mode_user') && this.get('currentUser.id') != this.get('referenced_speak_mode_user.id');
    res = res || this.get('modeling_for_self');
    var _this = this;
    // this is weird and hacky, but for some reason modeling wasn't reliably updating when modeling_for_user changed
    runLater(function() {
      _this.set('modeling_ts', (new Date()).getTime() + "_" + Math.random());
    });
    return !!res;
  }),
  auto_clear_modeling: observer('short_refresh_stamp', 'modeling', function() {
    if(this.get('manual_modeling')) {
      var now = (new Date()).getTime();
      if(!this.get('last_activation')) {
        this.set('last_activation', now);
      }
      // progressively get more aggressive at auto-clearing modeling flag
      var duration = now - this.get('modeling_started');
      // by default, clear manual modeling mode after 5 minutes of inactivity
      var cutoff = 5 * 60 * 1000;
      // if you've been modeling for more than 30 minutes, then auto-clear after
      // 5 seconds without modeling
      if(duration > (30 * 60 * 1000)) {
        cutoff = 5 * 1000;
      // if you've been modeling for 10-30 minutes, then auto-clear modeling after
      // 30 seconds of inactivity
      } else if(duration > (10 * 60 * 1000)) {
        cutoff = 30 * 1000;
      // if you've been modeling for 5-10 minutes, then auto-clear after 60 inactive seconds
      } else if(duration > (5 * 60 * 1000)) {
        cutoff = 60 * 1000;
      }
      if(now - this.get('last_activation') > cutoff) {
        this.toggle_modeling();
      }
    }
  }),
  current_locale_string: computed(function() {
    var loc = (i18n.langs || {}).preferred || 'en';
    var fallback = (i18n.langs || {}).fallback || 'en';
    var res = i18n.locales_localized[loc] || i18n.locales[loc] || i18n.locales_localized[fallback] || i18n.locales[fallback] || loc;
    if(i18n.locales_translated.indexOf(loc) == -1 && i18n.locales_translated.indexOf(fallback) == -1) {
      res = res + "*";
    }
    return res;
  }),
  back_one_board: function(opts) {
    opts = opts || {};
    var history = this.get_history();
    var state = history.pop();
    if(!state) { 
      if(this.get('currentBoardState.extra_back') == 'emergency') {
        var router = this.get('router') || this.router;
        if(router && typeof router.transitionTo === 'function') {
          router.transitionTo('offline_boards');
        } else {
          console.warn('[APP-STATE] Cannot transition to offline_boards route: router not available');
        }
      }
      return; 
    }
    buttonTracker.transitioning = true;
    if(state && state.id && state.id == this.get('currentBoardState.id')) {
      buttonTracker.transitioning = false;
    }
    this.stashes.log({
      action: 'back',
      button_triggered: opts.button_triggered
    });
    this.set_history([].concat(history));
    if(state.level) {
      this.stashes.persist('board_level', state.level);
    }
    this.set('referenced_board', state);
    var router = this.get('router') || this.router;
    if(router && typeof router.transitionTo === 'function') {
      router.transitionTo('board', state.key);
    } else {
      console.warn('[APP-STATE] Cannot transition to board route: router not available');
    }
  },
  jump_to_root_board: function(options) {
    options = options || {};
    var index_as_fallback = options.index_as_fallback;
    var auto_home = options.auto_home;


    this.set_history([]);
    var current = this.get('currentBoardState');
    var state = this.stashes.get('temporary_root_board_state') || this.stashes.get('root_board_state');
    state = state || this.get('currentUser.preferences.home_board');

    var do_log = false;
    if(state && state.key) {
      if(this.get('currentBoardState.key') != state.key) {
        buttonTracker.transitioning = true;
        if(state.level || state.default_level) {
          this.stashes.persist('board_level', state.level || state.default_level);
        }
        if(this.stashes.get('override_label_locale')) {
          // If manually-set for the session, revert
          // to the preferred value
          this.stashes.persist('label_locale', this.stashes.get('override_label_locale'));
          this.stashes.persist('vocalization_locale', this.stashes.get('override_vocalization_locale'));
        } else if(state.locale) {
          // Otherwise revert to the original
          // state in case it got changed during navigation
          this.stashes.persist('label_locale', state.locale);
          this.stashes.persist('vocalization_locale', state.locale);
        }
        this.set('referenced_board', state);
        var router = this.get('router') || this.router;
        if(router && typeof router.transitionTo === 'function') {
          router.transitionTo('board', state.key);
        } else {
          console.warn('[APP-STATE] Cannot transition to board route: router not available');
        }
        do_log = current && current.key && state.key != current.key;
      }
    } else if(index_as_fallback) {
      this.return_to_index();
      do_log = current && current.key;
    }
    if(do_log) {
      this.stashes.log({
        action: (auto_home ? 'auto_home' : 'home'),
        button_triggered: options.button_triggered,
        new_id: {
          id: state.id,
          key: state.key
        }
      });
    }
  },
  jump_to_next(forward) {
    var jump_between_boards = true;
    if(jump_between_boards) {
      var last_root = this.stashes.get('last_root') || this.get('referenced_user.home_board') || {};
      var roots = [this.get('referenced_user.preferences.home_board') || {}];
      if(this.get('referenced_user.preferences.sync_starred_boards')) {
        (this.get('referenced_user.stats.starred_board_refs') || []).forEach(function(ref) {
          roots.push(ref);
        });
      }
      roots = roots.concat((this.get('current_sidebar_boards') || []).filter(function(i) { return i.key; }));
      var found = roots.find(function(r) { return r && ((r.key && r.key == last_root.key) || (r.id && r.id == last_root.id)); });
      var current = Math.max(0, roots.indexOf(found));
      if(forward) { current++; } else { current--; }
      if(current < 0) { current = roots[roots.length - 1]; }
      else if(current >= roots.length) { current = 0; }
      if(roots[current]) {
        var ref = Object.assign({}, roots[current]);
        ref.source = 'swipe';
        this.jump_to_board(ref);
      }
      // for the list of boards including home and sidebar, figure out
      // which board they jumped to using the sidebar/home/entering speak mode
      // and jump to the next one instead
    } else {
      // TODO: option to jump between communicators? Nah.
    }
  },
  toggle_speak_mode: function(decision) {
    if(decision) {
      modal.close(true);
    }
    var current = this.get('currentBoardState');
    var preferred = this.get('speakModeUser.preferences.home_board') || this.get('currentUser.preferences.home_board');
    if(preferred && current) {
      emberSet(preferred, 'text_direction', current.text_direction);
    }
    if(preferred && this.get('label_locale') && this.get('label_locale') == this.get('vocalization_locale')) {
      emberSet(preferred, 'locale', this.get('label_locale'));
    }
    
    if(!this.get('speak_mode')) {
      // if it's in the speak-mode-user's board set, keep the original home board,
      // otherwise set the current board to home for now
      var user = this.get('speakModeUser') || this.get('currentUser');
      if(user && (user.get('stats.board_set_ids') || []).indexOf(this.get('currentBoardState.id')) >= 0) {
        decision = decision || 'rememberRealHome';
      } else {
        decision = decision || 'currentAsHome';
      }
    }

    if(!current || decision == 'goHome') {
      this.home_in_speak_mode();
    } else if(decision == 'goBrowsedHome') {
      this.toggle_mode('speak', {override_state: this.stashes.get('root_board_state') || preferred});
    } else if(this.stashes.get('current_mode') == 'speak') {
      if(this.get('embedded')) {
        modal.open('about-lingolinq', {no_exit: true});
      } else if(this.get('currentUser.preferences.require_speak_mode_pin') && decision != 'off' && this.get('currentUser.preferences.speak_mode_pin')) {
        modal.open('speak-mode-pin', {actual_pin: this.get('currentUser.preferences.speak_mode_pin'), hide_hint: this.get('currentUser.preferences.hide_pin_hint')});
      } else {
        this.toggle_mode('speak');
      }
    } else if(decision == 'currentAsHome' || !preferred || (preferred && current && preferred.key == current.key)) {
      this.toggle_mode('speak', {temporary_home: true, override_state: preferred});
    } else if(decision == 'rememberRealHome') {
      this.toggle_mode('speak', {override_state: preferred});
    } else {
      this.controller.send('pickWhichHome');
    }
  },
  assert_source: function() {
    var _this = this;
    if(!_this.controller || typeof _this.controller.get !== 'function') {
      return RSVP.reject({error: 'no board controller'});
    }
    var board = _this.controller.get('board.model');
    if(!board) { return RSVP.reject({error: 'no board found'}); }
    if(board.get('local_only')) {
      if(board.get('locale') && !this.get('speak_mode')) {
        this.stashes.persist('label_locale', board.get('locale'));
        this.stashes.persist('vocalization_locale', board.get('locale'));
        this.set('label_locale', this.stashes.get('label_locale'));
        this.set('vocalization_locale', this.stashes.get('vocalization_locale'));
      }
      if(board.get('editable_source_key')) {
        var load_board = function() {
          return this.jump_to_board({
            key: board.get('editable_source_key')
          });
        };
        if(board.get('editable_source')) {
          return load_board();
        } else {
          runLater(function() {
            if(board.get('editable_source')) {
              return load_board();
            } else {
              return RSVP.reject({error: ' editable source never loaded for local board'});
            }
          }, 2000);
        }
      } else {
        return RSVP.reject({error: 'no editable source for local board'});
      }
    } else {
      return RSVP.resolve(board);
    }
  },
  toggle_edit_mode: function(decision) {
    editManager.clear_history();
    var _this = this;
    this.assert_source().then(function() {
      if(!_this.get('controller.board.model.permissions.edit')) {
        modal.open('confirm-needs-copying', {board: _this.controller.get('board.model')}).then(function(res) {
          if(res == 'confirm') {
            _this.toggle_mode('edit', {copy_on_save: true});
          }
        });
        return;
      } else if(decision == null && !_this.get('edit_mode') && _this.controller && _this.controller.get('board').get('model').get('could_be_in_use')) {
        modal.open('confirm-edit-board', {board: _this.controller.get('board.model')}).then(function(res) {
          if(res == 'tweak') {
            _this.controller.send('tweakBoard');
          }
        });
        return;
      }
      _this.toggle_mode('edit');  
    }, function() { });
  },
  clear_mode: function() {
    this.stashes.persist('current_mode', 'default');
    this.stashes.persist('last_mode', null);
    editManager.clear_paint_mode();
  },
  toggle_mode: function(mode, opts) {
    LingoLinq.log.track('setting mode to ' + mode);
    opts = opts || {};
    utterance.clear({skip_logging: true});
    var current_mode = this.stashes.get('current_mode');
    var temporary_root_state = null;
    if(opts && opts.force) { current_mode = null; }
    if(mode == 'speak') {
      var board_state = this.get('currentBoardState');
      // use the current board's level setting unless forcing the user's home board to be root
      var board_level = board_state && board_state.default_level;
      if(!board_state) {
        // if we're not launching from a currently-viewed board, clear stashed level,
        // which will feel less arbitrary, at least
        this.stashes.persist('board_level', null);
      }

      var user = this.get('referenced_speak_mode_user') || this.get('currentUser');
      if(user && current_mode != 'speak') {
        var speak_mode_user = this.get('speakModeUser') || this.get('currentUser');
        var level = {};
        var state = board_state || opts.override_state;
        if(this.get('sessionUser.eval_ended')) {
          modal.open('modals/eval-status', {user: this.get('sessionUser')});
          return;
        }
        // If already on a board, and board level is manually set,
        // check if it's the user's home or sidebar board, and override
        // the user's preferred level
        // TODO: save level as part of starring a board
        if(user.get('preferences.home_board.id') == state.id) {
          level.preferred = user.get('preferences.home_board.level');
          level.source = 'home';
        } else {
          (user.get('preferences.sidebar_boards') || []).forEach(function(board) {
            if(board && board.id == state.id) {
              level.preferred = board.level;
              level.source = 'sidebar';
            }
          });
        }
        var save_user = false;
        if(user == speak_mode_user) {
          // If entering Speak Mode on what is already
          // the user's home board, but with a different
          // locale, then update the user's preferences
          // to set the new locale as the new preference
          var home = user.get('preferences.home_board');
          if(home && home.locale && opts.override_state && home.locale != opts.override_state.locale && user.get('preferences.home_board')) {
            user.set('preferences.home_board.locale', opts.override_state.locale);
            var save_user = false;
          }
        }
        if(this.stashes.get('label_locale'))
        if(level.preferred || level.source) {
          // If the user has a preference for the currently-launching board,
          // then we take that into account. If already on a board and not in
          // modelling mode, assume this is the user's new preference and
          // update automatically. If not launching from a board, just use the
          // user's preference.
          if(board_state && this.stashes.get('board_level') && this.stashes.get('board_level') != level.preferred) {
            level.current = this.stashes.get('board_level');
            this.stashes.persist('board_level', level.current); // TODO: isn't this redundant?
            if(opts.override_state) {
              opts.override_state = $.extend({}, opts.override_state, {level: level.current});
            }
            if(user == speak_mode_user) {
              // If in Speak (not modelling) mode, assume the
              // change was intentional and set it to the user's
              // new preference.
              if(level.source == 'home') {
                user.set('preferences.home_board.level', level.current);
                save_user = true;
              } else {
                (user.get('preferences.sidebar_boards') || []).forEach(function(board) {
                  if(board && board.id == state.id) {
                    emberSet(board, 'level', level.current);
                  }
                });
                save_user = true;
              }
            }
            board_level = level.current;
          } else if(level.preferred) {
            this.stashes.persist('board_level', level.preferred);
            if(opts.override_state) {
              opts.override_state = $.extend({}, opts.override_state, {level: level.preferred});
            }
            board_level = level.preferred;
          }
        }
        if(save_user) {
          user.save();
        }
      }

      if(opts && opts.override_state) {
        if(opts.temporary_home && board_state && board_state.id != opts.override_state.id) {
          // If not currently on the override_state board,
          // set the current board as temporary home, and the override_state
          // board as the actual home
          temporary_root_state = board_state;
          board_level = board_state.level || board_state.default_level || null;
        } else {
          // If starting on the user's home board, use that level
          // unless a different one has already been set
          if(opts.temporary_home || this.stashes.get('board_level')) {
            board_level = null;
          } else {
            board_level = opts.override_state.level || board_level;
          }
        }
        // override_state becomes root_board_state if defined, otherwise use currentBoardState
        board_state = opts.override_state;
      }

      if(board_level) {
        this.stashes.persist('board_level', board_level);
        console.log("toggling to level", this.stashes.get('board_level'));
      }
      if(this.get('currentBoardState') && this.stashes.get('board_level')) {
        // set the level for currentBoardState
        // possibly affecting root_board_state/temporary_root_board_state
        this.set('currentBoardState.level', this.stashes.get('board_level'));
      }
      this.stashes.persist('root_board_state', board_state);
    }
    if(current_mode == mode) {
      if(mode == 'edit' && this.stashes.get('last_mode')) {
        this.stashes.persist('current_mode', this.stashes.get('last_mode'));
      } else {
        this.stashes.persist('current_mode', 'default');
      }
      if(mode == 'speak' && this.get('currentBoardState')) {
        this.set('currentBoardState.reload_token', Math.random());
      }
      this.stashes.persist('last_mode', null);
      this.stashes.persist('copy_on_save', null);
    } else {
      if(mode == 'edit') {
        var brd = this.controller.get('board.model');
        if(brd) {
          var pref_locale = this.get('label_locale');
          var translated_locales = brd.get('translated_locales') || [];
          this.controller.set('board.model.button_locale', this.controller.get('board.model.locale'));
          if(pref_locale && !translated_locales.includes(pref_locale)) {
            if(translated_locales.includes(pref_locale.split(/-|_/)[0])) {
              pref_locale = pref_locale.split(/-|_/)[0];
            } else {
              var found_loc = translated_locales.find(function(l) { return pref_locale = l.split(/-|_/)[0]; });
              if(found_loc) {
                pref_locale = found_loc;
              } else {
                pref_locale = null;
              }
            }
          }
          if(pref_locale && this.controller.get('board.model.locale') != pref_locale) {
            this.controller.set('board.model.button_locale', pref_locale);
          }
        }
        this.stashes.persist('last_mode', this.stashes.get('current_mode'));
        if(opts.copy_on_save) {
          this.stashes.persist('copy_on_save', this.get('currentBoardState.id'));
        }
      } else if(mode == 'speak') {
        var already_speaking_as_someone_else = this.get('speakModeUser.id') && this.get('speakModeUser.id') != this.get('sessionUser.id');
        if(this.get('currentBoardState')) { delete this.get('currentBoardState').reload_token }
        // when entering speak mode, if the user is expired,
        // or modeling-only w/o hany premium supervisees,
        // pop up a closeable notice about purchasing the app
        // (the speak mode session will time out on its own)
        // NOTE: For a paid supporter, it seems out of place
        // to pester them every time they enter Speak Mode
        // w/o supervisees, so we'll just tell them when it times out instead
        var speaking_user = (this.get('speakModeUser') || this.get('currentUser'))
        var communicator_limited = speaking_user && speaking_user.get('expired');
        var supervisor_limited = this.get('currentUser.supporter_role') && this.get('currentUser.modeling_only') && !this.get('speakModeUser') && !this.session.get('modeling_session');
        if(this.get('currentUser') && !opts.reminded && (communicator_limited || supervisor_limited) && !already_speaking_as_someone_else) {
          return modal.open('premium-required', {user_name: this.get('currentUser.user_name'), user: this.get('currentUser'), remind_to_upgrade: true, reason: (communicator_limited ? 'communicator_limited' : 'supervisor_limited'), limited_supervisor: (!communicator_limited && supervisor_limited), action: 'app_speak_mode'}).then(function() {
            opts.reminded = true;
            this.toggle_mode(mode, opts);
          });
        }
        if(this.get('currentBoardState')) {
          this.stashes.persist('last_root', {id: this.get('currentBoardState.id'), key: this.get('currentBoardState.key')});
        }
        // if scanning mode... has to be here because focus will only reliably work when
        // a user-controlled event has occurred, so can't be on a listener
        if(this.get('currentUser.preferences.device.scanning') && capabilities.mobile && capabilities.installed_app) { // scanning mode
          scanner.listen_for_input();
        }
      }
      this.stashes.persist('current_mode', mode);
    }
    this.stashes.persist('temporary_root_board_state', temporary_root_state);
    this.stashes.persist('sticky_board', false);
    var $stash_hover = $("#stash_hover");
    $stash_hover.removeClass('on_button').data('button_id', null);
    editManager.clear_paint_mode();
    editManager.clear_preview_levels();
    LingoLinq.log.track('done setting mode to ' + mode);
  },
  assert_lang_override: observer('vocalization_locale', function() {
    if(this.get('vocalization_locale')) {
      i18n.load_lang_override(this.get('vocalization_locale'));
    }
  }), 
  sync_reconnect: observer('refresh_stamp', function() {
    if(this.get('sessionUser.permissions.supervise')) {
      sync.connect();
    }
  }),
  sync_send_utterance: observer('stashes.working_vocalization', function() {
    if(!LingoLinq || !LingoLinq.store) { return; }
    var shareable_voc = function() {
      var u = LingoLinq.store.createRecord('utterance', {
        button_list: this.stashes.get('working_vocalization') || [], 
        timestamp: (new Date()).getTime() / 1000,
        user_id: this.get('referenced_user.id')
      });
      u.assert_remote_urls();
      return u.get('button_list');
    };

    if(!this.get('sessionUser.supporter_view')) {
      // TODO: DRY this check, it's in sync too
      if(this.get('sessionUser.preferences.remote_modeling') && (this.get('pairing') || this.get('sessionUser.preferences.remote_modeling_auto_follow') || this.get('followers.allowed'))) {
        var str = JSON.stringify(shareable_voc());
        // If the sentence has changed or hasn't been
        // encoded, then send it through encoding
        if((str != this.get('sync_utterance.json') || !this.get('sync_utterance.encoded')) && window.persistence) {
          this.set('sync_utterance', {
            json: str
          });
          window.persistence.ajax('/api/v1/users/' + this.get('sessionUser.id') + '/ws_encrypt', {
            type: 'POST',
            data: {text: str}
          }).then(function(res) {
            if(JSON.stringify(shareable_voc()) == str) {
              this.set('sync_utterance', {
                json: str,
                encoded: res.encoded,
                attempted: true
              });
              sync.send_update(this.get('referenced_user.id') || this.get('currentUser.id'), {utterance: res.encoded});
            }
          }, function(err) { });
        } else {
          var encoded = this.get('sync_utterance.encoded');
          if(encoded) {
            sync.send_update(this.get('referenced_user.id') || this.get('currentUser.id'), {utterance: encoded});
            this.set('sync_utterance.attempted', true);
          }
        }
      }
    }
  }),
  sync_keepalive: observer('short_refresh_stamp', function() {
    var last = this.get('last_keepalive') || 0;
    var now = (new Date()).getTime();
    if(this.get('speak_mode') && !this.get('currentUser.supporter_view')) {
      // every 20 seconds, re-assert board state
      if(last < now - (20 * 1000))     {
        sync.check_following();
        var obj = {};
        if(this.get('sync_utterance.encoded')) {
          obj.utterance = this.get('sync_utterance.encoded');
        } else if(!this.get('sync_utterance.attempted')) {
          this.sync_send_utterance();
        }
        sync.send_update(this.get('referenced_user.id') || this.get('currentUser.id'), obj);
        this.set('last_keepalive', now);
        sync.keepalive();
      }
    } else {
      // every 5 minutes, send a keepalive
      var cutoff = now - (2 * 60 * 1000);
      if(this.get('pairing.partner') && this.get('pairing.follow')) {
        // If following, let them know more often you're watching
        cutoff = now - (20 * 1000);
      }
      if(last < cutoff) {
        this.set('last_keepalive', now);
        sync.keepalive();
      }
    }
  }),
  home_in_speak_mode: function(opts) {
    // This is only entered for the current
    // user, not for supervisees (see set_speak_mode_user)
    this.stashes.persist('label_locale', null);
    this.stashes.persist('vocalization_locale', null);
    opts = opts || {};
    var speak_mode_user = opts.user || this.get('currentUser');
    // TODO: if preferred matches user's home board, pass the user's level instead of the board's default level
    if(!opts.remember_level) {
      this.stashes.persist('board_level', null);
    }
    var user_preferred = null;
    if(speak_mode_user) {
      if(speak_mode_user.get('preferences.sync_starred_boards')) {
        if(speak_mode_user.get('stats.starred_board_refs.length') || speak_mode_user.get('preferences.home_board')) {
          user_preferred = {key: 'obf/stars-' + speak_mode_user.get('id')};
        }
      } else {
        user_preferred = speak_mode_user.get('preferences.home_board');
      }
    }
    var preferred = opts.force_board_state || user_preferred || opts.fallback_board_state || this.stashes.get('root_board_state') || {key: 'example/yesno'};
    if(preferred.locale) {
      this.stashes.persist('label_locale', preferred.locale);
      this.stashes.persist('vocalization_locale', preferred.locale);
    }
    var communicator_limited = speak_mode_user && speak_mode_user.get('expired');
    var supervisor_limited = speak_mode_user && speak_mode_user.get('supporter_role') && speak_mode_user.get('modeling_only') && !this.session.get('modeling_session');
    if(speak_mode_user && !opts.reminded && (communicator_limited || supervisor_limited)) {
      return modal.open('premium-required', {user_name: speak_mode_user.get('user_name'), user: speak_mode_user, reason: (communicator_limited ? 'communicator_limited' : 'supervisor_limited'), remind_to_upgrade: true, limited_supervisor: (!communicator_limited && supervisor_limited), action: 'app_speak_mode'}).then(function() {
        opts.reminded = true;
        this.home_in_speak_mode(opts);
      });
    }
    if(preferred && speak_mode_user && preferred.id == speak_mode_user.get('preferences.home_board.id')) {
      preferred = speak_mode_user.get('preferences.home_board') || preferred;
    }
    // Resolve board key for URL (route uses key, e.g. example/yesno)
    var boardKey = preferred && (preferred.key || (preferred.get && preferred.get('key')));
    if(!boardKey && preferred && (preferred.id || (preferred.get && preferred.get('id')))) {
      var bid = preferred.id || (preferred.get && preferred.get('id'));
      var peek = LingoLinq.store.peekRecord('board', bid);
      if(peek && peek.get('key')) {
        boardKey = peek.get('key');
      }
    }
    if(!boardKey && preferred) {
      boardKey = preferred.id || (preferred.get && preferred.get('id'));
    }
    // Transition first so the URL updates immediately; then set speak mode state
    var router = null;
    try {
      router = this.router;
      if(!router || typeof router.transitionTo !== 'function') {
        try {
          var owner = getOwner(this);
          if(owner && typeof owner.lookup === 'function') {
            router = owner.lookup('service:router');
          }
        } catch(e) {
          var owner = (this.constructor && this.constructor.owner) || (this.owner) || (this._owner);
          if(owner && typeof owner.lookup === 'function') {
            router = owner.lookup('service:router');
          }
        }
      }
      if((!router || typeof router.transitionTo !== 'function') && this.controller && this.controller.target) {
        router = this.controller.target;
      }
      if(!router || typeof router.transitionTo !== 'function') {
        router = window.router;
      }
    } catch(e) {
      console.warn('[APP-STATE] Error getting router service:', e);
    }
    if(boardKey && router && typeof router.transitionTo === 'function') {
      try {
        router.transitionTo('board', boardKey);
      } catch(e) {
        console.error('[APP-STATE] Error transitioning to board route:', e);
      }
    } else if(!boardKey) {
      console.warn('[APP-STATE] home_in_speak_mode: no board key available for transition', preferred);
    } else {
      console.warn('[APP-STATE] Cannot transition to board route: router and controller not available');
    }
    // NOTE: text-direction is updated on board load, so it's ok that it's not known here
    this.toggle_mode('speak', {force: true, override_state: preferred});
    this.set('referenced_board', preferred);
    if(speak_mode_user && speak_mode_user == this.get('sessionUser') && speak_mode_user.get('communicator_in_supporter_view')) {
      // Supporter devices for communicators should start in modeling mode
      this.set('modeling_for_self', true);
    }
  },
  check_scanning: function() {
    if(!this || (this.isDestroyed !== undefined && this.isDestroyed)) { return; }
    var _this = this;
    sync.send_update(this.get('referenced_user.id') || this.get('currentUser.id'));
    runLater(function() {
      if(!_this || (_this.isDestroyed !== undefined && _this.isDestroyed)) { return; }
      buttonTracker.scan_modeling = false;
      if(_this.get('speak_mode') && _this.get('currentUser.preferences.device.scanning')) { // scanning mode
        buttonTracker.scanning_enabled = true;
        buttonTracker.any_select = _this.get('currentUser.preferences.device.scanning_select_on_any_event');
        buttonTracker.select_keycode = _this.get('currentUser.preferences.device.scanning_select_keycode');
        buttonTracker.skip_header = _this.get('currentUser.preferences.device.scanning_skip_header');
        buttonTracker.scan_modeling = _this.get('currentUser.preferences.device.scan_modeling');
        buttonTracker.next_keycode = _this.get('currentUser.preferences.device.scanning_next_keycode');
        buttonTracker.prev_keycode = _this.get('currentUser.preferences.device.scanning_prev_keycode');
        buttonTracker.cancel_keycode = _this.get('currentUser.preferences.device.scanning_cancel_keycode');
        buttonTracker.left_screen_action = _this.get('currentUser.preferences.device.scanning_left_screen_action');
        buttonTracker.right_screen_action = _this.get('currentUser.preferences.device.scanning_right_screen_action');
        if(capabilities.system == 'iOS' && !capabilities.installed_app && !buttonTracker.left_screen_action && !buttonTracker.right_screen_action) {
          modal.warning(i18n.t('keyboard_may_jump', "NOTE: if you don't have a bluetooth switch installed, the keyboard may keep popping up while trying to scan."));
        }
        if(modal.is_open() && (!modal.highlight_settings || modal.highlight_settings.highlight_type != 'button_search')) {
          modal.close();
        }
        var interval = parseInt(_this.get('currentUser.preferences.device.scanning_interval'), 10);
        scanner.start({
          scan_mode: _this.get('currentUser.preferences.device.scanning_mode'),
          interval: interval,
          sweep: _this.get('currentUser.preferences.device.scanning_sweep_speed'),
          auto_scan: interval !== 0,
          auto_start: !_this.get('currentUser.preferences.device.scanning_wait_for_input'),
          vertical_chunks: _this.get('currentUser.preferences.device.scanning_region_rows'),
          debounce: _this.get('currentUser.preferences.debounce'),
          horizontal_chunks: _this.get('currentUser.preferences.device.scanning_region_columns'),
          skip_header: _this.get('currentUser.preferences.device.scanning_skip_header'),
          scanning_auto_select: _this.get('currentUser.preferences.device.scanning_auto_select'),
          audio: _this.get('currentUser.preferences.device.scanning_prompt')
        });
      } else {
        buttonTracker.scanning_enabled = false;
        // this was breaking the "find button" interface when you get to the second board
        if(scanner.interval || (scanner.options || {}).scan_mode == 'axes' || scanner.scanning) {
          scanner.stop();
        }
      }
      runLater(function() {
        _this.retry_images();
      }, 1000);
      buttonTracker.multi_touch_modeling = _this.get('currentUser.preferences.multi_touch_modeling');
      buttonTracker.keyboard_listen = _this.get('currentUser.preferences.device.external_keyboard');
      buttonTracker.dwell_modeling = false;
      buttonTracker.dwell_enabled = false;

      var head_pointer = _this.get('currentUser.preferences.device.dwell_type') == 'head' && _this.get('currentUser.preferences.device.dwell_head_pointer');
      if(_this.get('speak_mode') && _this.get('currentUser.preferences.device.dwell')) {
        buttonTracker.dwell_enabled = true;
        buttonTracker.dwell_timeout = parseInt(_this.get('currentUser.preferences.device.dwell_duration'), 10);
        buttonTracker.dwell_delay = _this.get('currentUser.preferences.device.dwell_delay');
        buttonTracker.dwell_type = _this.get('currentUser.preferences.device.dwell_type');
        buttonTracker.dwell_icon = _this.get('currentUser.preferences.device.dwell_icon');
        buttonTracker.dwell_selection = _this.get('currentUser.preferences.device.dwell_selection') || 'dwell';
        buttonTracker.select_expression = _this.get('currentUser.preferences.device.select_expression');
        buttonTracker.select_keycode = _this.get('currentUser.preferences.device.scanning_select_keycode');
        buttonTracker.dwell_arrow_speed = _this.get('currentUser.preferences.device.dwell_arrow_speed');
        buttonTracker.dwell_animation = _this.get('currentUser.preferences.device.dwell_targeting');
        buttonTracker.dwell_release_distance = _this.get('currentUser.preferences.device.dwell_release_distance');
        buttonTracker.dwell_no_cutoff = _this.get('currentUser.preferences.device.dwell_no_cutoff');
        buttonTracker.dwell_cursor = _this.get('currentUser.preferences.device.dwell_cursor');
        buttonTracker.dwell_modeling = _this.get('currentUser.preferences.device.dwell_modeling');
        buttonTracker.dwell_gravity = _this.get('currentUser.preferences.device.dwell_gravity');
        buttonTracker.head_tracking = !!  (buttonTracker.dwell_type == 'head' && !head_pointer);
        if(buttonTracker.dwell_type == 'eyegaze' || buttonTracker.dwell_type == 'eyegaze_external') {
          capabilities.eye_gaze.listen({level: 'noisy', expressions: buttonTracker.dwell_selection == 'expression', external_accessory: buttonTracker.dwell_type == 'eyegaze_external'});
        } else if(buttonTracker.dwell_type == 'head' || buttonTracker.dwell_selection == 'expression') {
          if(head_pointer) {
            buttonTracker.dwell_type = 'eyegaze';
          }
          var head_opts = {head_pointing: head_pointer};
          head_opts.tilt = capabilities.tracking.tilt_factor(_this.get('currentUser.preferences.device.dwell_tilt_sensitivity'));
  
          capabilities.head_tracking.listen(head_opts);
        }
      } else {
        buttonTracker.dwell_enabled = false;
        if(!capabilities.eye_gaze.calibrating_or_testing || window.weblinger) {
          capabilities.eye_gaze.stop_listening();
          capabilities.head_tracking.stop_listening();
        }
      }
    }, 1000);
  },
  refresh_session_user: function() {
    var _this = this;
    LingoLinq.store.findRecord('user', 'self').then(function(user) {
      if(!user.get('fresh')) {
        user.reload().then(function(user) {
          user.set('modeling_session', _this.session.get('modeling_session'));
          _this.set('sessionUser', user);
        }, function() { });
      }
      user.set('modeling_session', _this.session.get('modeling_session'));
      _this.set('sessionUser', user);
    }, function() { });
  },
  set_auto_synced: observer('sessionUser', 'sessionUser.auto_sync', function() {
    // Guard: check this before accessing properties
    if(!this || typeof this !== 'object') {
      return;
    }
    var auto_sync = this.get('sessionUser.auto_sync');
    if(auto_sync == null) {
      auto_sync = !!capabilities.installed_app;
    }
    if(this.persistence) {
      this.persistence.set('auto_sync', auto_sync);
    }
  }),
  check_free_space: function() {
    var _this = this;
    return capabilities.storage.free_space().then(function(res) {
      if(res && res.mb && res.mb < 70) {
        res.too_little = true;
        if(res.gb < 1) { res.gb = null; }
        _this.set('limited_free_space', res);
      } else {
        _this.set('limited_free_space', false);
      }
      return res;
    }, function(err) { });
  },
  set_speak_mode_user: function(board_user_id, jump_home, keep_as_self, board_key) {
    var session_user_id = this.get('sessionUser.id');
    // If switching to the communicator's home,
    // or if not already on a board (i.e. starting a new
    // speak mode session) then clear the
    // stashed locale settings
    if(jump_home || !this.get('currentBoardState')) {
      this.stashes.persist('label_locale', null);
      this.stashes.persist('vocalization_locale', null);
    }
    if(board_user_id == 'self' || (session_user_id && board_user_id == session_user_id)) {
      this.set('speakModeUser', null);
      this.set('referenced_speak_mode_user', null);
      this.stashes.persist('speak_mode_user_id', null);
      this.stashes.persist('referenced_speak_mode_user_id', null);
      if(!board_key && !this.get('speak_mode') && jump_home !== true) {
        this.toggle_speak_mode();
      } else {
        var opts = {};
        if(board_key) {
          opts.force_board_state = {key: board_key};
        }
        this.home_in_speak_mode(opts);
      }
      if(keep_as_self && this.get('sessionUser.communicator_in_supporter_view')) {
        this.set('modeling_for_self', true);
      }
    } else {
      // TODO: this won't get the device-specific settings correctly unless
      // device_key matches across the users
      var _this = this;
      
      // Note: board_user_id can be either a username (e.g., 'example') or a global ID (e.g., '1_123')
      // The backend's find_by_path treats non-numeric strings as usernames.
      // Using global IDs would avoid ambiguity, but we often only have the username from board keys.
      // If the API returns a different user than requested (e.g., 'self' instead of 'example'),
      // Ember Data will warn about the ID mismatch. This is a backend behavior issue.
      LingoLinq.store.findRecord('user', board_user_id).then(function(u) {
        var data = RSVP.resolve(u);
        if(!u.get('preferences') || (!u.get('fresh') && _this.stashes.get('online'))) {
          data = u.reload();
        }
        data.then(null, function() {
          // go with what you have, you might not actually be online like you thought you were
          if(u.get('preferences')) {
            return RSVP.resolve(u);
          } else {
            return RSVP.reject();
          }
        }).then(function(u) {
          if(keep_as_self) {
            _this.set('speakModeUser', null);
            _this.stashes.persist('speak_mode_user_id', null);
          } else {
            _this.set('speakModeUser', u);
            _this.stashes.persist('speak_mode_user_id', (u && u.get('id')));
          }
          _this.set('referenced_speak_mode_user', u);
          _this.stashes.persist('referenced_speak_mode_user_id', (u && u.get('id')));
          var user_state = u.get('preferences.home_board');
          var current = _this.get('currentBoardState') || user_state;
          if(board_key) {
            _this.home_in_speak_mode({
              user: u,
              reminded: !jump_home,
              remember_level: !jump_home,
              fallback_board_state: user_state || _this.get('sessionUser.preferences.home_board'),
              force_board_state: {key: board_key}
            });
          } else if(jump_home || (user_state && current && user_state.id == current.id)) {
            _this.home_in_speak_mode({
              user: u,
              reminded: !jump_home,
              remember_level: !jump_home,
              fallback_board_state: user_state || _this.get('sessionUser.preferences.home_board')
            });
          } else {
            if(!_this.get('speak_mode')) {
              _this.toggle_speak_mode();
            }
            var user_state = u.get('preferences.home_board');
            var current = _this.get('currentBoardState') || user_state;
            _this.stashes.persist('temporary_root_board_state', current);
          }
        }, function() {
          modal.error(i18n.t('user_retrive_failed2', "Failed to retrieve user details for Speak Mode"));
        });
      }, function() {
        modal.error(i18n.t('user_retrive_failed', "Failed to retrieve user for Speak Mode"));
      });
    }
  },
  say_louder: function(pct) {
    this.controller.sayLouder(pct);
  },
  flip_text: function() {
    this.set('flipped', !this.get('flipped'));
  },
  save_phrase: function(voc, category) {
    var user = this.get('currentUser');
    if(user) {
      // TODO: needs to peresist locally if offline
      var vocs = user.get('vocalizations') || []
      var id = Math.round(Math.random() * 9999).toString() + ((new Date()).getTime() % 1000).toString() + vocs.length;
      user.add_action({
        action: 'add_vocalization',
        value: voc,
        category: category || 'default',
        ts: Math.round((new Date()).getTime() / 1000),
        id: id
      });
      vocs.unshift({list: voc, category: category, id: id, ts: Math.round((new Date()).getTime() / 1000)});
      user.set('vocalizations', vocs);
      user.save().then(function() { user.set('offline_actions', null); }, function() { });
    } else {
      this.stashes.remember({override: voc});
    }
  },
  remove_phrase: function(phrase) {
    var voc = this.get('currentUser.vocalizations') || [];
    var stash = this.stashes.get('remembered_vocalizations');
    var matches = 0;
    if(phrase.id) {
      voc = voc.filter(function(v) { 
        if(v.id == phrase.id) { matches++; return matches > 1; }
        return true;
      });
    } else {
      voc = voc.filter(function(v) { 
        if(v.sentence == phrase.sentence && !phrase.stash) { matches++; return matches > 1; }
        return true;
      });
      stash = (stash || []).filter(function(v) {
        if(v.sentence == phrase.sentence && phrase.stash) { matches++; return matches > 1; }
        return true;
      });
    }
    if(this.get('currentUser')) {
      var u = this.get('currentUser');
      u.set('vocalizations', voc);
      u.add_action({
        action: 'remove_vocalization',
        value: phrase.id
      });
      u.save().then(function() { u.set('offline_actions', null); }, function() { });
    }
    this.stashes.persist('remembered_vocalizations', stash);
  },
  shift_phrase: function(phrase, direction) {
    if(this.get('currentUser')) {
      var u = this.get('currentUser');
      var list = u.get('vocalizations') || [];
      var voc = list.find(function(v) { return v && v.id && phrase.id && v.id == phrase.id; });
      var idx = list.indexOf(voc);
      if(idx !== -1) {
        if(direction == 'up' && idx > 0) {
          var pre = list.filter(function(v, jdx) { return (v.category || 'default') == (phrase.category || 'default') && jdx < idx; }).pop();
          var pre_idx = list.indexOf(pre);
          if(pre && pre_idx !== -1) {
            var ref = list[pre_idx];
            list[pre_idx] = voc;
            list[idx] = ref;
          }
        } else if(direction == 'down' && idx < list.length - 1) {
          var post = list.find(function(v, jdx) { return (v.category || 'default') == (phrase.category || 'default') && jdx > idx; });
          var post_idx = list.indexOf(post);
          if(post && post_idx !== -1) {
            var ref = list[post_idx];
            list[post_idx] = voc;
            list[idx] = ref;
          }
        }
      }
      var ids = list.map(function(v) { return v && v.id; }).join(',');
      u.set('vocalizations', list);
      u.add_action({
        action: 'reorder_vocalizations',
        value: ids
      })
      u.save().then(function() { u.set('offline_actions', null); }, function() { });
    }
  },
  set_and_say_buttons(vocalizations) {
    this.controller.set_and_say_buttons(vocalizations);
  },
  set_current_user: observer('sessionUser', 'speak_mode', 'speakModeUser', function() {
    this.did_set_current_user = true;
    console.log('[APP-STATE] set_current_user observer fired', {
      has_sessionUser: !!this.get('sessionUser'),
      sessionUser_id: this.get('sessionUser') ? this.get('sessionUser.id') : null,
      speak_mode: this.get('speak_mode'),
      has_speakModeUser: !!this.get('speakModeUser')
    });
    if(this.get('speak_mode') && this.get('speakModeUser')) {
      this.set('currentUser', this.get('speakModeUser'));
      console.log('[APP-STATE] set_current_user: set currentUser to speakModeUser');
    } else {
      var user = this.get('sessionUser');
      console.log('[APP-STATE] set_current_user: setting currentUser from sessionUser', {
        has_user: !!user,
        user_id: user ? user.get('id') : null
      });
      if(user && user.get && !user.get('preferences.progress.app_added') && (navigator.standalone || (capabilities.installed_app && capabilities.mobile))) {
        user.set('preferences.progress.app_added', true);
        user.save().then(null, function() { });
      }
      this.set('currentUser', user);
      console.log('[APP-STATE] set_current_user: currentUser set', {
        has_currentUser: !!this.get('currentUser'),
        currentUser_id: this.get('currentUser') ? this.get('currentUser.id') : null
      });
    }
    if(this.get('currentUser')) {
      this.set('currentUser.load_all_connections', true);
    }
    if(this.get('sessionUser.permissions.supervise')) {
      sync.connect();
    }
  }),
  eye_gaze_state: computed(
    'currentUser.preferences.device.dwell',
    'currentUser.preferences.device.dwell_type',
    'eye_gaze.statuses',
    function() {
      if(!this.get('currentUser.preferences.device.dwell') || this.get('currentUser.preferences.device.dwell_type') != 'eyegaze') {
        return null;
      }
      var state = {};
      var statuses = emberGet(capabilities.eye_gaze, 'statuses') || {};
      var active = null, pending = null, dormant = null;
      for(var idx in statuses) {
        if(statuses[idx]) {
          if(statuses[idx].active) {
            if(!statuses[idx].dormant) {
              if(!active || active.dormant) {
                active = statuses[idx];
              }
            } else {
              dormant = dormant || statuses[idx];
            }
          } else if(!statuses[idx].disabled) {
            pending = pending || statuses[idx];
          }
        }
      }

      if(!active && !pending && !dormant) {
        return null;
      }
      return {
        active: !!active,
        dormant: !!(!active && dormant),
        disabled: !!(!active && !dormant),
        status: (active && active.status) || (dormant && dormant.status) || (pending && pending.status)
      };
    }
  ),
  dom_changes_on_board_state_change: observer('currentBoardState', function() {
    if(!this.get('currentBoardState')) {
      $('#speak_mode').popover('destroy');
      $('html,body').css('overflow', '');
    } else if(!this.get('testing')) {
      $('html,body').css('overflow', 'hidden').scrollTop(0);
      try {
        this.controller.set('footer', false);
      } catch(e) { }
    }
  }),
  update_button_tracker: observer(
    'speak_mode',
    'currentUser.preferences.activation_location',
    'currentUser.preferences.activation_minimum',
    'currentUser.preferences.activation_cutoff',
    'currentUser.preferences.activation_on_start',
    'currentUser.preferences.debounce',
    function() {
      if(this.get('speak_mode')) {
        buttonTracker.minimum_press = this.get('currentUser.preferences.activation_minimum');
        buttonTracker.activation_location = this.get('currentUser.preferences.activation_location');
        buttonTracker.clear_on_wiggle = true; // TODO: make this a user pref
        buttonTracker.short_press_delay = this.get('currentUser.preferences.activation_cutoff') || null;
        if(this.get('currentUser.preferences.activation_on_start')) {
          buttonTracker.short_press_delay = 50;
        }
        buttonTracker.swipe_pages = !!this.get('currentUser.preferences.swipe_pages');
        buttonTracker.long_press_delay = Math.max((buttonTracker.short_press_delay || 50) * 2, 1500);
        buttonTracker.debounce = this.get('currentUser.preferences.debounce');
      } else if (window.user_preferences) {
        buttonTracker.minimum_press = null;
        buttonTracker.activation_location = null;
        buttonTracker.long_press_delay = 1500;
        buttonTracker.short_press_delay = null;
        buttonTracker.debounce = null;
      }
    }
  ),
  align_button_list: observer(
    'speak_mode',
    'button_list',
    'button_list.length',
    'insertion.index',
    function() {
      if(this.get('speak_mode')) {
        var _this = this;
        runLater(function() {
          var $button_list = $("#button_list");
          var $item = null;
          if(_this.get('insertion.index')) {
            $item = $button_list.find(".utterance_cursor");
            if($item.length == 0) {
              $item = $button_list.find(".history_button:not(.utterance_cursor)").eq(_this.get('insertion.index'));
            }
          }
          if(!$item || $item.length == 0) { $item = $button_list.find(".history_button").last(); }
          if($item.length && $button_list.length) {
            var box_bounds = $button_list[0].getBoundingClientRect();
            var scroll_top = $button_list.scrollTop();
            var item_bounds = $item[0].getBoundingClientRect();
            // TODO: don't know why the 1 is necessary
            var top = item_bounds.top + scroll_top - box_bounds.top - 1; 
            $button_list.scrollTop(top);
          } else {
            $button_list.scrollTop(9999999);
          }
        }, 200);
      }
    }
  ),
  monitor_scanning: observer('speak_mode', 'currentBoardState', function() {
    this.check_scanning();
  }),
  extra_colored_keys: computed('currentUser.all_extra_colors', 'currentUser.preferences.extra_colors', 'color_key_id', function() {
    var list = [];
    if(this.get('currentUser.all_extra_colors')) {
      list = [].concat(this.get('currentUser.all_extra_colors'));
    // } else if(this.get('currentUser.preferences.extra_colors')) {
    //   list = [].concat(LingoLinq.extra_keyed_colors);
    } else {
      if(this.controller && this.controller.get('board.model') && window.tinycolor && editManager.controller.get('ordered_buttons')) {
        var knowns = {};
        LingoLinq.keyed_colors.forEach(function(clr) {
          var a = window.tinycolor(clr.border);
          var b = window.tinycolor(clr.fill);
          knowns[clr.border + clr.fill] = true;
          knowns[a.toString() + b.toString()] = true;
          knowns[a.toHexString() + b.toHexString()] = true;
          knowns[a.toRgbString() + b.toRgbString()] = true;
        });
        // eslint-disable-next-line ember/no-side-effects
        this.set('colored_keys', true);

        editManager.controller.get('ordered_buttons').forEach(function(row) {
          row.forEach(function(button) {
            var ref = button.get('border_color') + button.get('background_color');
            if(!knowns[ref] && ref) {
              knowns[ref] = true;
              list.push({fill: button.get('background_color'), border: button.get('border_color')});
            }
          });
        });
      }
    }
    list.forEach(function(extra) {
      emberSet(extra, 'style', htmlSafe("width: 40px; border-color: " + extra.border + "; background: " + extra.fill + ";"));
    });
    return list;
  }),
  board_lang: computed('label_locale', function() {
    return (this.get('label_locale') || 'en').split(/-|_/)[0];
  }),
  get_history: function() {
    if(this.get('speak_mode')) {
      return this.stashes.get('boardHistory');
    } else {
      return this.stashes.get('browse_history');
    }
  },
  set_history: function(hist) {
    if(this.get('speak_mode')) {
      this.stashes.persist('boardHistory', hist);
    } else {
      this.stashes.persist('browse_history', hist);
    }
  },
  feature_flags: computed('currentUser.feature_flags', function() {
    var res = this.get('currentUser.feature_flags') || {};
    (window.enabled_frontend_features || []).forEach(function(feature) {
      emberSet(res, feature, true);
    });
    return res;
  }),
  empty_header: computed('default_mode', 'currentBoardState', 'hide_search', function() {
    return !!(this.get('default_mode') && !this.get('currentBoardState') && !this.get('hide_search'));
  }),
  header_size: computed(
    'currentUser.preferences.device.vocalization_height',
    'controller.board.model.small_header',
    'window_inner_width',
    'window_inner_height',
    'flipped',
    'currentUser.preferences.device.flipped_override',
    function() {
      // Guard: ensure this is valid
      if(!this || typeof this !== 'object' || typeof this.get !== 'function') {
        return 'medium'; // default size
      }
      var size = this.get('currentUser.preferences.device.vocalization_height') || ((window.user_preferences || {}).device || {}).vocalization_height || 100;
      if(this.get('currentUser.preferences.device.flipped_override') && this.get('flipped') && this.get('currentUser.preferences.device.flipped_height')) {
        size = this.get('currentUser.preferences.device.flipped_height');
      }
      // Guard: ensure controller exists and has get method before accessing it
      try {
        if(this.controller && typeof this.controller.get === 'function') {
          var small_header = this.controller.get('board.model.small_header');
          if(small_header) {
            if(size != 'tiny' && size != 'small') {
              size = 'small';
            }
          }
        }
      } catch(e) {
        // Silently ignore if controller.get fails
        console.warn('header_size: error accessing controller.get:', e);
      }
      if(window.innerHeight < 400) {
        size = 'tiny';
      } else if(window.innerHeight < 600 && size != 'tiny') {
        size = 'small';
      }
      return size;
    }
  ),
  header_height: computed('header_size', 'speak_mode', function() {
    if(this.get('speak_mode')) {
      var size = this.get('header_size');
      if(size == 'tiny') {
        return 50;
      } else if(size == 'small') {
        return 70;
      } else if(size == 'medium') {
        return 100;
      } else if(size == 'large') {
        return 150;
      } else if(size == 'huge') {
        return 200;
      }
    } else {
      return 70;
    }
  }),
  check_for_currently_premium: function(user, action, allow_fully_purchased, allow_premium_supporter) {
    var allowed = user && user.get('currently_premium');
    if(allow_fully_purchased && user && user.get('fully_purchased')) {
      allowed = true;
    }
    if(allow_premium_supporter && user && user.get('currently_premium_or_premium_supporter')) {
      allowed = true;
    }
    if(allowed) {
      return RSVP.resolve({dialog: false});
    } else {
      // prevent action if not currently_premium
      return modal.open('premium-required', {user_name: (user && user.get('user_name')), user: user, reason: "combo-" + allow_fully_purchased + "." + (user && user.get('fully_purchased')) + "-" + allow_premium_supporter + "." + (user && user.get('currently_premium_or_premium_supporter')), action: action}).then(function() {
        return RSVP.reject({dialog: true});
      });
    }
  },
  check_for_needing_purchase: function(prevent_unless_purchased) {
    var user = this.get('sessionUser');
    // Modeling-only and expired communicator accounts have 
    // a number of features that they are prevented from using.
    // If the user is very expired, or they are modeling-only
    // then remind them about purchasing,
    // and possibly prevent the action.
    if(!user || (user.get('really_expired') || user.get('modeling_only'))) {
      var user_name = user && user.get('user_name');
      return modal.open('premium-required', {user_name: user_name, reason: "combo2-" + !user + "." + (user.get('really_expired')+  "." + user.get('modeling_only')), cancel_on_close: false, remind_to_upgrade: true}).then(function() {
        if(user.get('modeling_only') || prevent_unless_purchased) {
          // modeling-only are prevented from the actions
          // not just reminded about them.
          return RSVP.reject({dialog: true});
        } else {
          return RSVP.resolve({dialog: true});
        }
      });
    } else {
      return RSVP.resolve({dialog: false});
    }
  },
  on_user_change: observer('currentUser', function() {
    if(this.get('currentUser') && LingoLinq.Board) {
      LingoLinq.Board.clear_fast_html();
    }
  }),
  speak_mode_handlers: observer(
    'speak_mode',
    'currentUser.id',
    'currentUser.preferences.logging',
    'referenced_user.preferences.logging',
    'referenced_user.id',
    function() {
      if(this.session.get('isAuthenticated') && !this.get('currentUser.id')) {
        // Don't run handlers on page reload until user is loaded
        return;
      }
      if(this.get('speak_mode')) {
        this.stashes.set('logging_enabled', !!(this.get('speak_mode') && (this.get('currentUser.preferences.logging') || this.get('referenced_user.preferences.logging'))));
        this.stashes.set('geo_logging_enabled', !!(this.get('speak_mode') && this.get('currentUser.preferences.geo_logging')));
        this.stashes.set('speaking_user_id', this.get('currentUser.id'));
        this.stashes.set('session_user_id', this.get('sessionUser.id'));
        this.stashes.set('session_preferred_symbols', this.get('referenced_user.preferences.preferred_symbols'));

        var voices = speecher.get('voices');
        // Android Chrome seems to have a short delay before voices get loaded
        if(voices.length == 1 && (voices[0] || {}).voiceURI == "") {
          runLater(function() {
            speecher.refresh_voices();
          }, 500);
        }

        var geo_enabled = this.get('currentUser.preferences.geo_logging') || this.get('sidebar_boards').find(function(b) { return b.highlight_type == 'locations' || b.highlight_type == 'custom'; });
        if(geo_enabled) {
          this.stashes.geo.poll();
        }
        this.set('speak_mode_started', (new Date()).getTime());
        this.set('battery_after_speak_mode', false);

        // this method is getting called again on every board load, even if already in speak mode. This check
        // limits the following block to once per speak-mode-activation.
        if(!this.get('last_speak_mode')) {
          if(this.get('currentUser.preferences.speak_on_speak_mode')) {
            runLater(function() {
              speecher.speak_text(i18n.t('here_we_go', "here we go"), null, {volume: 0.1});
            }, 200);
          }
          this.set('speak_mode_activities_at', (new Date()).getTime());
          this.set('speak_mode_modeling_ideas', null);
          if(this.get('currentUser.preferences.device.wakelock') !== false) {
            capabilities.wakelock('speak!', true);
          }
          // When entering Speak Mode, use the board's default locale
          // if(this.get('currentBoardState.default_locale')) {
          //   var loc = this.get('currentBoardState.default_locale');
          //   this.set('label_locale', loc);
          //   this.set('vocalization_locale', loc);
          // }
          this.set_history([]);
          var noticed = false;
          if(this.stashes.get('logging_enabled')) {
            noticed = true;
            modal.notice(i18n.t('logging_enabled', "Logging is enabled"), true);
          }
          if(this.get('currentBoardState.has_fallbacks')) {
            modal.notice(i18n.t('board_using_fallbacks', "This board uses premium assets which you don't have access to so you will see free images and sounds which may not perfectly match the author's intent"), true);
          }
          if(!(speecher.get('voices') || []).find(function(v) { return !v.remote_voice; })) {
            modal.warning(i18n.t('no_local_voices', "This device doesn't have any local voices, so an Internet connection will be required for any speech output until you download a premium voice"), true);
          }
          if(!capabilities.mobile && this.get('currentUser.preferences.device.fullscreen')) {
            capabilities.fullscreen(true).then(null, function() {
              if(!noticed) {
                modal.warning(i18n.t('fullscreen_failed', "Full Screen Mode failed to load"), true);
              }
            });
          }
          $("#hidden_input").val("");
          capabilities.tts.reload().then(function(res) {
            console.log("tts reload status");
            console.log(res);
          });
          capabilities.volume_check().then(function(level) {
            console.log("volume is " + level);
            if(level === 0) {
              noticed = true;
              modal.warning(i18n.t('volume_is_off', "Volume is muted, you will not be able to hear speech"), true);
            } else if(level < 0.2) {
              noticed = true;
              modal.warning(i18n.t('volume_is_low', "Volume is low, you may not be able to hear speech"), true);
            }
          });
          capabilities.silent_mode().then(function(silent) {
            if(silent && capabilities.system == 'iOS') {
              modal.warning(i18n.t('ios_muted', "The app is currently muted, so you will not hear speech. To unmute, check the mute switch, and also swipe up from the bottom of the screen to check for app-level muting"), true);
            }
          });
          var ref_user = this.get('referenced_speak_mode_user') || this.get('currentUser');
          if(ref_user && ref_user.get('goal.summary')) {
            runLater(function() {
              noticed = true;
              var str = i18n.t('user_apostrophe', "%{user_name}'s ", {user_name: ref_user.get('user_name')});
              str = str + i18n.t('current_goal', "Current Goal: %{summary}", {summary: ref_user.get('goal.summary')});
              modal.notice(str, true);
            }, 100);
          }
          speecher.set_output_target({}, function() { });
          this.load_user_badge();
          if(this.get('installed_app') && window.persistence) {
            var _this = this;
            var get_local_revisions = this.persistence.find('settings', 'synced_full_set_revisions').then(function(res) {
              if(_this.get('currentBoardState.id') && !res[_this.get('currentBoardState.id')]) {
                var persistenceService = _this.persistence || window.persistence;
                if(!persistenceService || typeof persistenceService.get !== 'function' || !persistenceService.get('last_sync_at')) {
                  // if not ever synced, remind them to sync before trying to use Speak Mode
                  modal.warning(i18n.t('remember_to_sync', "Remember to sync before trying to use boards somewhere without a strong Internet connection!"), true);
                } else if(this.get('current_board_in_extended_board_set')) {
                  // if synced and this is in home board set, remind them to sync
                  modal.warning(i18n.t('need_to_re_sync', "Remember to sync so you have access to all your boards offline!"), true);
                } else {
                  // otherwise, remind them about unsynced boards
                  modal.warning(i18n.t('unsynced_boards_may_not_work', "This board isn't available from you home board or sidebar so it won't be synced, and may not work properly without a strong Internet connection"), true);
                }
              }
            }, function() { });
          }
        }
        this.set('eye_gaze', capabilities.eye_gaze);
        this.set('embedded', !!(LingoLinq.embedded));
        this.set('full_screen_capable', capabilities.fullscreen_capable());
        if(this.get('currentBoardState') && this.get('currentUser.needs_speak_mode_intro')) {
          var intro = this.get('currentUser.preferences.progress.speak_mode_intro_done');
          if(!intro && !this.get('speak-mode-intro')) {
            if(modal.route && !modal.is_open('speak-mode-intro')) {
              modal.open('speak-mode-intro');
            }
          } else if(intro && !this.get('currentUser.preferences.progress.modeling_intro_done') && this.get('currentUser.preferences.logging') && !this.get('modeling-intro')) {
            var now = (new Date()).getTime();
            if(intro === true && this.get('currentUser.joined')) { intro = this.get('currentUser.joined').getTime(); }
            if(now - intro > (4 * 24 * 60 * 60 * 1000)) {
              if(modal.route && !modal.is_open('modeling-intro')) {
                modal.open('modeling-intro');
              }
            }
          }
        }
      } else if(!this.get('speak_mode') && this.get('last_speak_mode') !== undefined) {
        capabilities.wakelock('speak!', false);
        capabilities.fullscreen(false);
        this.check_scanning();
        buttonTracker.hit_spots = [];
        this.set('suggestion_id', null);
        if(this.get('last_speak_mode') !== false) {
          if(this.get('sessionUser')) {
            this.set('sessionUser.request_alert', null);
          }
          this.set('pairing', null);
          this.set('followers', null);
          this.set('focus_words', null);
          this.set('sync_utterance', null);
          this.set('modeling_for_self', null);

          sync.end_follows();
          sync.current_pairing = null;
          this.stashes.persist('temporary_root_board_state', null);
          this.stashes.persist('sticky_board', false);
          this.stashes.persist('speak_mode_user_id', null);
          this.stashes.persist('all_buttons_enabled', null);
          this.set('manual_modeling', false);
          this.set('referenced_speak_mode_user', null);
          this.stashes.persist('referenced_speak_mode_user_id', null);
          if(LingoLinq.Board) {
            LingoLinq.Board.clear_fast_html();
          }
        }
      }
      this.refresh_suggestions();
      
      if(!this.session.get('isAuthenticated') || this.get('currentUser')) {
        this.set('last_speak_mode', !!this.get('speak_mode'));
      }
    }
  ),
  update_speak_mode_modeling_ideas: observer(
    'speak_mode',
    'referenced_user.id',
    'speak_mode_activities_at',
    'short_refresh_stamp',
    function() {
      var _this = this;
      var cutoff = (new Date()).getTime() - (45 * 1000);
      // Try showing modeling ideas as an icon for like thirty seconds when
      // first entering speak mode, if there are any. (if the user has already checked out
      // modeling ideas at least once)
      if(_this.get('speak_mode_activities_at') < cutoff) {
        if(_this.get('speak_mode_modeling_ideas')) {
          _this.set('speak_mode_modeling_ideas.enabled', false);
          _this.set('speak_mode_modeling_ideas.timeout', true);
        }
        return;
      }
      if(!_this.get('speak_mode') || _this.get('referenced_user.id') === _this.get('speak_mode_modeling_ideas.user_id')) {
        return;
      }
      if(_this.get('currentUser.preferences.progress.modeling_ideas_viewed')) {
        if(_this.get('referenced_user.currently_premium') && !_this.get('referenced_user.supporter_role')) {
          _this.set('speak_mode_modeling_ideas', {user_id: _this.get('referenced_user.id')});      
          _this.get('referenced_user').load_word_activities().then(function(activities) {
            if(activities && activities.list && activities.list.length > 0) {
              var list = activities.words;
              // If user-defined goal words are set, use one of those if possible
              var goal_list = (activities.words || []).filter(function(w) {
                return w && w.reasons && w.reasons.indexOf('primary_words') !== -1;
              });
              if(goal_list.length > 0) { list = goal_list; }
              var mod = (new Date()).getDate() % (list || {length: 3}).length;
              var word = ((list || [])[mod] || {}).word;
              _this.set('speak_mode_modeling_ideas', {user_id: _this.get('referenced_user.id'), enabled: true, word: word});
            }
          }, function() { });
        } else {
          _this.set('speak_mode_modeling_ideas', false);
        }
      } else {
        _this.set('speak_mode_modeling_ideas', false);      
      }
    }
  ),
  refresh_suggestions: function() {
    if(this.controller && this.controller.get('board.model')) {
      // TODO: only load this if we know we need it?
      var history_string = (this.stashes.get('working_vocalization') || []).map(function(v) { return (v.label || "") + (v.button_id || "n") + ((v.board || {}).id || "n"); }).join(",");
      var ref = this.controller.get('board.model.id') + "::" + history_string + "::" + this.get('shift');
      if(true || ref != this.get('suggestion_id')) {
        var $board = $(".board[data-id='" + this.controller.get('board.model.id') + "']");
        if($board.length > 0) {
          this.set('suggestion_id', ref);
          this.controller.get('board.model').clear_real_time_changes();
          this.controller.get('board.model').load_word_suggestions([this.get('currentUser.preferences.home_board.id'), this.stashes.get('temporary_root_board_state.id')]);
          if(this.get('referenced_user.preferences.auto_inflections') || this.get('inflection_shift') || this.get('shift')) {
            this.controller.get('board.model').load_real_time_inflections();
          }
        }
      }
    }
  },
  inflection_prefix: computed('stashes.working_vocalization', 'referenced_user.preferences.auto_inflections', 'inflection_shift', function() {
      var sentence = null;
      if(this.get('referenced_user.preferences.auto_inflections') || this.get('inflection_shift')) {
        sentence = (this.stashes.get('working_vocalization') || []).map(function(v) { return v.label; }).join(' ');
      }
      return sentence;
  }),
  handle_tag: function(tag) {
    if(!this.get('speak_mode')) { return; }
    var text_fallback = function(text) {
      if(!text) { return; }
      var obj = {
        label: text,
        vocalization: text,
        prevent_return: true,
        button_id: null,
        source: 'tag',
        board: {id: this.get('currentBoardState.id'), parent_id: this.get('currentBoardState.parent_id'), key: this.get('currentBoardState.key')},
        type: 'speak'
      };
  
      this.activate_button({}, obj);
    };
    if(tag.uri) {
      var tag_id = (tag.uri.match(/^cough:\/\/tag\/([^\/]+)$/) || [])[1];
      tag_id = tag_id || JSON.stringify(tag.id);
      if(tag_id) {
        // check local or remote for matching tag
        LingoLinq.store.findRecord('tag', tag_id).then(function(tag_object) {
          if(tag_object.get('button')) {
            var button = Button.create(tag_object.get('button'));
            this.controller.activateButton(button, {board: editManager.controller.get('model'), trigger_source: 'tag'});
          } else {
            text_fallback(tag_object.get('label'));
          }
        }, function(err) { 
          // if no tag round, fall back to text
          text_fallback(tag.text); 
        });
      } else {
        text_fallback(tag.text);
      }
    } else if(tag && tag.text && tag.text.match(/^\"/) && tag.text.match(/\"$/)) {
      // speak the tag's text
      text_fallback(tag.text.slice(1, tag.text.length - 2));
    }
  },
  speak_mode: computed('stashes.current_mode', 'currentBoardState', function() {
    return !!(this.stashes.get('current_mode') == 'speak' && this.get('currentBoardState'));
  }),
  edit_mode: computed('stashes.current_mode', 'currentBoardState', function() {
    return !!(this.stashes.get('current_mode') == 'edit' && this.get('currentBoardState'));
  }),
  default_mode: computed('stashes.current_mode', 'currentBoardState', function() {
    return !!(this.stashes.get('current_mode') == 'default' || !this.get('currentBoardState'));
  }),
  limited_speak_mode_options: computed(
    'speak_mode',
    'currentUser.preferences.require_speak_mode_pin',
    function() {
      return this.get('speak_mode');
      // TODO: decide if this should be an option at all
      //return this.get('speak_mode') && this.get('currentUser.preferences.require_speak_mode_pin');
    }
  ),
  superProtectedSpeakMode: computed('speak_mode', 'embedded', function() {
    return this.get('speak_mode') && this.get('embedded');
  }),
  retry_images: observer('medium_refresh_stamp', 'persistence.online', function() {
    // Guard: ensure this is valid before accessing it
    if(!this || typeof this.get !== 'function') {
      return;
    }
    var _this = this; // Capture outer 'this' for use in callbacks
    document.querySelectorAll('img.broken_image').forEach(function(img) {
      if(img.getAttribute('rel-url') && img.src.match(/square\.svg/)) {
        // try to recover images from being broken
        var i = new Image();
        i.onload = function() {
          img.classList.remove('broken_image');
          img.src = i.src;
        };
        i.onerror = function() {
          if(i.already_errored) { return; }
          i.already_errored = true;
          // Guard: ensure persistence exists before accessing it
          // Use window.persistence or _this.persistence, not 'this' (which is Image)
          var persistence = window.persistence || (_this && _this.persistence);
          if(!persistence) {
            return;
          }
          if(i.src.match(/^file/) || i.src.match(/^localhost/)) {
            if(persistence.url_cache) {
              for(var key in persistence.url_cache) {
                if(persistence.url_cache[key] == i.src) {
                  setTimeout(function() {
                    i.src = key;
                  }, 10);
                }
              }
            }
          } else {
            if(persistence.find_url && typeof persistence.find_url === 'function') {
              persistence.find_url(i.src).then(function(data_uri) {
                i.src = data_uri;
              }, function() {
                // try falling back to variant-less
                var alt = i.src && i.src.replace(/\.variant-.+\.(png|svg)$/, '');
                if(alt != i.src && persistence.find_url) {
                  persistence.find_url(alt).then(function(data_uri) {
                    i.src = data_uri;
                  });
                }
              });
            }
          }
        };
        i.src = img.getAttribute('rel-url');
      }
    })
  }),
  auto_exit_speak_mode: observer('speak_mode_started', 'medium_refresh_stamp', function() {
    var now = (new Date()).getTime();
    var redirect_option = false;
    if(this.controller && this.controller.get('board.model.local_only') && this.controller.get('board.model.obf_type') == 'emergency') {
      return;
    }
    // if we're speaking as the current user and they're a limited supervisor, or if
    // we're speaking/modeling related to a supervisee and they're expired, limit
    // the session to 15 minutes and notify them of the time limit.
    if(this.get('speak_mode') && this.get('speak_mode_started')) {
      var started = this.get('speak_mode_started');
      var done = false;
      // If running speak mode for themselves, supervisors need to be working with someone
      if(this.get('currentUser.id') == this.get('sessionUser.id') && !this.get('referenced_speak_mode_user') && this.get('currentUser.any_limited_supervisor')) {
        if(started < now - (15 * 60 * 1000)) {
          redirect_option = 'contact';
          done = i18n.t('limited_supervisor_timeout', "Speak mode sessions are limited to 15 minutes for supervisors not working with paid communicators. Please consider a communicator or evaluator account if you need longer sessions.");
        }
      // If running speak mode for a communicator, check the status of the communicator
      } else if(this.get('sessionUser.id') != this.get('referenced_speak_mode_user.id') && this.get('referenced_speak_mode_user.expired')) {
        if(started < now - (15 * 60 * 1000)) {
          redirect_option = 'contact';
          done = i18n.t('expired_supervisee_timeout', "Speak mode sessions are limited to 15 minutes when working with communicators that don't have a paid or sponsored account.");
        }
      // If running speak mode as a communicator, check if they're expired
      } else if(this.get('currentUser.expired')) {
        if(started < now - (15 * 60 * 1000)) {
          redirect_option = 'subscribe';
          done = i18n.t('really_expired_communicator_timeout', "This account has expired, and sessions are limited to 15 minutes. If you need help with funding we can help, please contact us!");
        }
      }

      if(done) {
        this.toggle_speak_mode();
        modal.notice(done, true, true, {redirect: redirect_option});
        this.set('speak_mode_started', null);
      }
    } else {
      this.set('speak_mode_started', null);
    }
  }),
  check_inbox: observer('referenced_user.id', 'medium_refresh_stamp', function() {
    // Guard: check this before accessing properties
    if(!this || typeof this !== 'object') {
      return;
    }
    var ref_user = this.get('referenced_user');
    var persistenceService = this.persistence || window.persistence;
    if(persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('online') && this.get('speak_mode') && ref_user) {
      var last_share = ref_user.get('last_share') || 0;
      var last_check = ref_user.get('retrieved') || ref_user.get('last_sync_stamp.checked') || 1;
      var now = (new Date()).getTime();

      // but default check for new messages once every 10 minutes
      var cutoff = now - (10 * 60 * 1000);
      if(ref_user.get('last_sync_stamp.user_id') != ref_user.get('id')) {
        // after switching communicators, make sure you have the latest
        cutoff = now - (5 * 60 * 1000);
      }
      if(now - last_share < (15 * 60 * 1000)) {
        // after a messaging share, check more frequently for the next 15 minutes
        cutoff = now - (60 * 1000);
      } else if(now - last_share < (60 * 60 * 1000)) {
        // for a while after, check a little more frequently
        cutoff = now - (3 * 60 * 1000);
      }
      if(last_check < (cutoff + 5000)) {
        ref_user.set('last_sync_stamp', {user_id: ref_user.get('id'), checked: (new Date()).getTime()});
        ref_user.reload().then(function(res) {
        }, function() { });
      }
    }
  }),
  current_board_name: computed('currentBoardState', function() {
    var state = this.get('currentBoardState');
    if(state && state.key) {
      return state.name || state.key.split(/\//)[1];
    }
    return null;
  }),
  current_board_user_name: computed('currentBoardState', function() {
    var state = this.get('currentBoardState');
    if(state && state.key) {
      return state.key.split(/\//)[0];
    }
    return null;
  }),
  current_board_is_home: computed(
    'currentBoardState',
    'currentUser',
    'currentUser.preferences.home_board.id',
    function() {
      var board = this.get('currentBoardState');
      var user = this.get('currentUser');
      return !!(board && user && user.get('preferences.home_board.id') == board.id);
    }
  ),
  current_board_is_speak_mode_home: computed(
    'speak_mode',
    'currentBoardState',
    'stashes.root_board_state',
    'stashes.temporary_root_board_state',
    function() {
      var state = this.stashes.get('temporary_root_board_state') || this.stashes.get('root_board_state');
      var current = this.get('currentBoardState');
      return this.get('speak_mode') && state && current && state.key == current.key;
    }
  ),
  root_board_is_home: computed(
    'stashes.root_board_state',
    'stashes.temporary_root_board_state',
    'currentUser.preferences.home_board.id',
    function() {
      var state = this.stashes.get('temporary_root_board_state') || this.stashes.get('root_board_state');
      var user = this.get('currentUser');
      return !!(state && user && user.get('preferences.home_board.id') == state.id);
    }
  ),
  current_board_not_home_or_supervising: computed('current_board_is_home', 'currentUser.supervisees', function() {
    return !this.get('current_board_is_home') || (this.get('currentUser.supervisees') || []).length > 0;
  }),
  current_board_in_board_set: computed('currentUser.stats.board_set_ids', 'currentBoardState', function() {
    return (this.get('currentUser.stats.board_set_ids') || []).indexOf(this.get('currentBoardState.id')) >= 0;
  }),
  current_board_in_extended_board_set: computed(
    'currentUser.stats.board_set_ids_including_supervisees',
    'currentBoardState',
    function() {
      return (this.get('currentUser.stats.board_set_ids_including_supervisees') || []).indexOf(this.get('currentBoardState.id')) >= 0;
    }
  ),
  speak_mode_possible: computed(
    'currentBoardState',
    'currentUser',
    'currentUser.preferences.home_board.key',
    function() {
      return !!(this.get('currentBoardState') || this.get('currentUser.preferences.home_board.key'));
    }
  ),
  board_in_current_user_set: computed('currentUser.stats.board_set_ids', 'currentBoardState.id', function() {
    return (this.get('currentUser.stats.board_set_ids') || []).indexOf(this.get('currentBoardState.id')) >= 0;
  }),
  empty_board_history: computed(
    'stashes.boardHistory',
    'stashes.browse_history',
    'speak_mode',
    function() {
      // TODO: this is borken
      return this.get_history().length === 0;
    }
  ),
  sidebar_visible: computed(
    'speak_mode',
    'stashes.sidebarEnabled',
    'currentUser',
    'currentUser.preferences.quick_sidebar',
    'eval_mode',
    function() {
      // TODO: does this need to trigger board resize event? maybe...
      return this.get('speak_mode') && !this.get('eval_mode') && (this.stashes.get('sidebarEnabled') || this.get('currentUser.preferences.quick_sidebar'));
    }
  ),
  sidebar_relegated: computed('speak_mode', 'window_inner_width', function() {
    return this.get('speak_mode') && this.get('window_inner_width') < 750;
  }),
  time_string: function(timestamp) {
    return window.moment(timestamp).format("HH:mm");
  },
  fenced_sidebar_board: computed(
    'last_fenced_board',
    'medium_refresh_stamp',
    'current_ssid',
    'stashes.geo.latest',
    'nearby_places',
    'currentUser',
    'current_sidebar_boards',
    function() {
      var _this = this;
      var loose_tolerance = 1000; // 1000 ft
      var boards = this.get('current_sidebar_boards') || [];
      var all_matches = [];
      var now_time_string = _this.time_string((new Date()).getTime());
      var any_places = false;
      boards.forEach(function(b) { if(b.places) { any_places = true; } });
      var current_place_types = {};
      if(_this.get('nearby_places') && any_places) {
        // set current_place_types to the list of places for the closest-retrieved place
        (_this.get('nearby_places') || []).forEach(function(place) {
          var d = geolocation.distance(place.latitude, place.longitude, this.stashes.get('geo.latest.coords.latitude'), this.stashes.get('geo.latest.coords.longitude'));
          // anything with 500ft could be a winner
          if(d && d < 500) {
            place.types.forEach(function(type) {
              if(!current_place_types[type] || current_place_types[type].distance > d) {
                current_place_types[type] = {
                  distance: d,
                  latitude: place.latitude,
                  longitude: place.longitude
                };
              }
            });
          }
        });
      }
      boards.forEach(function(brd) {
        var do_add = false;
        // add all sidebar boards that match any of the criteria
        var ssids = brd.ssids || [];
        if(ssids.split) { ssids = ssids.split(/,/); }
        var matches = {};
        if(ssids && ssids.indexOf(_this.get('current_ssid')) != -1) {
          matches['ssid'] = true;
        }
        var geo_set = false;
        if(brd.geos && this.stashes.get('geo.latest.coords')) {
          var geos = brd.geos || [];
          if(geos.split) { geos = geos.split(/;/).map(function(g) { return g.split(/,/).map(function(n) { return parseFloat(n); }); }); }
          brd.geo_distance = -1;
          geos.forEach(function(geo) {
            var d = geolocation.distance(this.stashes.get('geo.latest.coords.latitude'), this.stashes.get('geo.latest.coords.longitude'), geo[0], geo[1]);
            if(d && d < loose_tolerance && (brd.geo_distance == -1 || d < brd.geo_distance)) {
              brd.geo_distance = d;
              geo_set = true;
              matches['geo'] = true;
            }
          });
        }
        if(brd.times) {
          var all_times = brd.times || [];

          all_times.forEach(function(times) {
            if(times[0] > times[1]) {
              if(now_time_string >= times[0] || now_time_string <= times[1]) {
                matches['time'] = true;
              }
            } else {
              if(now_time_string >= times[0] && now_time_string <= times[1]) {
                matches['time'] = true;
              }
            }
          });
        }
        if(brd.places && Object.keys(current_place_types).length > 0) {
          var places = brd.places || [];
          if(places.split) { places = places.split(/,/); }
          var closest = null;
          places.forEach(function(place) {
            if(current_place_types[place]) {
              if(!closest || current_place_types[place].distance < closest) {
                closest = current_place_types[place].distance;
                matches['place'] = true;
                if(!geo_set) {
                  brd.geo_distance = closest;
                }
              }
            }
          });
        }

        if(brd.highlight_type == 'locations' && (matches['geo'] || matches['ssid'])) {
          all_matches.push(brd);
        } else if(brd.highlight_type == 'places' && matches['place']) {
          all_matches.push(brd);
        } else if(brd.highlight_type == 'times' && matches['time']) {
          all_matches.push(brd);
        } else if(brd.highlight_type == 'custom') {
          if(!brd.ssids || matches['ssid']) {
            if(!brd.geos || matches['geo']) {
              if(!brd.places || matches['place']) {
                if(!brd.times || matches['time']) {
                  all_matches.push(brd);
                }
              }
            }
          }
        }
      });
      var res = all_matches[0];
      if(all_matches.length > 1) {
        if(!all_matches.find(function(m) { return !m.geo_distance; })) {
          // if it's location-based just return the closest one
          res = all_matches.sort(function(a, b) { return a.geo_distance - b.geo_distance; })[0];
        } else {
          // otherwise craft a special button that pops up the list of matches
        }
      }
      if(res) {
        res = $.extend({}, res);
        res.fenced = true;
        res.shown_at = (new Date()).getTime();
        _this.set('last_fenced_board', res);
      } else if(_this.get('last_fenced_board') && _this.get('last_fenced_board').shown_at && _this.get('last_fenced_board').shown_at > (new Date()).getTime() - (2*60*1000)) {
        // if there is no fenced board but there was one, go ahead and keep that one around
        // for an extra minute or so
        res = _this.get('last_fenced_board');
      }
      return res;
    }
  ),
  current_sidebar_boards: computed('referenced_user.sidebar_boards_with_fallback', function() {
    var res = this.get('referenced_user.sidebar_boards_with_fallbacks');
    return res;
  }),
  check_locations: observer(
    'speak_mode',
    'persistence.online',
    'stashes.geo.latest',
    'modeling_for_user',
    'currentUser',
    'currentUser.sidebar_boards_with_fallbacks',
    'referenced_speak_mode_user',
    'referenced_speak_mode_user.sidebar_boards_with_fallback',
    function() {
      // Guard: ensure this is valid before accessing it
      if(!this || typeof this.get !== 'function') {
        return RSVP.resolve([]);
      }
      if(!this.get('speak_mode')) { return RSVP.resolve([]); }
      var boards = this.get('current_sidebar_boards') || [];
      if(!boards.find(function(b) { return b.places; })) { return RSVP.reject(); }
      var res = geolocation.check_locations();
      res.then(null, function() { });
      return res;
    }
  ),
  sidebar_boards: computed(
    'fenced_sidebar_board',
    'currentUser',
    'current_sidebar_boards',
    function() {
      var res = this.get('current_sidebar_boards');
      if(!res && window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.default_sidebar_boards) {
        res = window.user_preferences.any_user.default_sidebar_boards;
      }
      res = res || [];
      var sb = this.get('fenced_sidebar_board');
      if(!sb) { return res; }
      res = res.filter(function(b) { return b.key != sb.key; });
      res.unshift(sb);
      return res;
    }
  ),
  sidebar_pinned: computed(
    'speak_mode',
    'currentUser',
    'currentUser.preferences.quick_sidebar',
    function() {
      return this.get('speak_mode') && this.get('currentUser.preferences.quick_sidebar');
    }
  ),
  referenced_user: computed(
    'modeling_for_user',
    'currentUser',
    'referenced_speak_mode_user',
    function() {
      var user = this.get('currentUser');
      if(this.get('modeling_for_user') && this.get('referenced_speak_mode_user')) {
        user = this.get('referenced_speak_mode_user');
      }
      return user;
    }
  ),
  ding_on_message: observer('referenced_user.unread_alerts', function() {
    var ref_id = this.get('referenced_user.id') + ":" + this.get('referenced_user.unread_alerts');
    if(ref_id != this.get('last_ding_state') && this.get('speak_mode') && this.get('referenced_user.unread_alerts') > 0) {
      speecher.click('ding');
    }
    this.set('last_ding_state', ref_id);
  }),
  ding_on_request_alert: observer('referenced_user.request_alert', function() {
    if(this.get('referenced_user.request_alert') && this.get('speak_mode') && !this.get('referenced_user.request_alert.dinged')) {
      this.set('referenced_user.request_alert.dinged', true);
      speecher.click('ding');
    }
  }),
  load_user_badge: observer('speak_mode', 'referenced_user', 'persistence.online', function() {
    // Guard: ensure this is valid before accessing it
    if(!this || typeof this.get !== 'function') {
      return;
    }
    // TODO: option to disable badges
    // Fixed: 'this.persistence.online' is invalid observer path, changed to 'persistence.online'
    var persistenceService = this.persistence || window.persistence;
    if(this.get('speak_mode') && persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('online')) {
      var badge_hash = (this.get('referenced_user.id') || 'nobody') + "::" + ((new Date()).getTime() / 1000 / 3600)
      // don't check more than once an hour
      if(this.get('user_badge_hash') == badge_hash) { return; }
      var old_badge_hash = this.get('user_badge_hash');

      var _this = this;
      var user = this.get('referenced_user');
      // clear current badge if it doesn't match the referenced user info
      if(!user || _this.get('user_badge.user_id') != user.get('id')) {
        _this.set('user_badge', null);
      }

      // load recent badges, debounced by ten minutes
      var last_check = (user && _this.get('last_user_badge_load_for_' + user.get('id'))) || 0;
      var now = (new Date()).getTime();
      if(LingoLinq.store && user && !user.get('supporter_role') && user.get('currently_premium') && last_check < (now - 600000)) {
        _this.set('last_user_badge_load_for_' + user.get('id'), now);
        runLater(function() {
          _this.set('user_badge_hash', badge_hash);
          LingoLinq.store.query('badge', {user_id: user.get('id'), recent: 1}).then(function(badges) {
            _this.set('user_badge_hash', badge_hash);
            badges = badges.filter(function(b) { return b.get('user_id') == user.get('id'); });
            var badge = LingoLinq.Badge.best_earned_badge(badges);
            if(!badge || badge.get('dismissed')) {
              var next_badge = LingoLinq.Badge.best_next_badge(badges);
              badge = next_badge || badge;
            }
            _this.set('user_badge', badge);
          }, function(err) {
            _this.set('user_badge_hash', old_badge_hash);
          });
        });
      }
    } else if(this.get('user_badge') && this.get('user_badge.user_id') != this.get('referenced_user.id')) {
      this.set('user_badge', null);
    }
  }),
  testing: computed(function() {
    return Ember.testing;
  }),
  logging_paused: computed('stashes.logging_paused_at', function() {
    return !!this.stashes.get('logging_paused_at');
  }),
  current_time: computed('short_refresh_stamp', function() {
    return (this.get('short_refresh_stamp') || new Date());
  }),
  check_for_user_updated: observer('short_refresh_stamp', 'sessionUser', function(obj, changes) {
    // Guard: check this before accessing properties (avoids "reading 'persistence' of null")
    if(!this || typeof this !== 'object' || typeof this.get !== 'function') {
      return;
    }
    var p = null;
    try { p = this.get('persistence'); } catch (e) { /* teardown / null context */ }
    if (!p && typeof window !== 'undefined') { p = window.persistence; }
    if(p && typeof p.get === 'function') {
      if(changes == 'sessionUser' || !p.get('last_sync_stamp')) {
        p.set('last_sync_stamp', this.get('sessionUser.sync_stamp'));
      }
    }
    if(this.get('sessionUser')) {
      var interval = (this.get('sessionUser.preferences.sync_refresh_interval') || (5 * 60)) * 1000;
      if(p && typeof p.get === 'function') {
        if(p.get('last_sync_stamp_interval') != interval) {
          p.set('last_sync_stamp_interval', interval);
        }
      } else {
        console.error('persistence needed for checking user status');
      }
    }
  }),
  activate_button: function(button, obj) {
    LingoLinq.log.start();
    if(button.apply_level && button.board) {
      button.apply_level(button.board.get('display_level'))
    }
    // skip hidden buttons
    if((button.hidden || button.empty) && !this.get('edit_mode') && this.get('currentUser.preferences.hidden_buttons') == 'grid') {
      if(!this.stashes.get('all_buttons_enabled')) {
        return false;
      }
    }

    if(this.get('speak_mode') && !modal.is_open()) {
      if(!buttonTracker.check('native_keyboard') && !buttonTracker.check('scanning_enabled')) {
        $(":focus").blur();
      }
    }
    if(this.get('pairing.partner') && this.get('pairing.model')) {
      sync.model_button(button, obj);
      return;
    }

    // track modeling events correctly
    var now = (new Date()).getTime();
    var skip_navigation = false;
    if(this.get('modeling')) {
      obj.modeling = true;
    } else if(this.stashes.last_selection && this.stashes.last_selection.modeling && this.stashes.last_selection.ts > (now - 500)) {
      obj.modeling = true;
    }


    if(button.vocalization == ':suggestion') {
      obj.vocalization = ':predict';
      if(button.board && button.board.get('suggestion_lookups')) {
        var suggestion = button.board.get('suggestion_lookups')[button.id.toString()];
        if(suggestion) {
          obj.label = suggestion.word;
          obj.completion = suggestion.word;
          obj.suggestion_override = true;
          obj.image = suggestion.image;
          obj.image_license = suggestion.image_license;
        }
      }
    }

    if(obj.vocalization == ':predict' || obj.vocalization == ':complete') {
    }

    this.set('last_activation', now);
    // update button attributes preemptively
    if(button.link_disabled) {
      button = $.extend({}, button);
      setProperties(button, {
        apps: null,
        url: null,
        video: null,
        add_vocalization: true,
        load_board: null,
        user_integration: null
      })
    }
    if(button.apps) {
      obj.type = 'app';
    } else if(button.url) {
      if(button.video && button.video.popup) {
        obj.type = 'video';
      } else {
        obj.type = 'url';
      }
    } else if(button.load_board) {
      obj.type = 'link';
    }
    var overlay = obj.overlay;
    delete obj['overlay'];

    // Clone now, because once you call add_button
    // then the original button will change.
    var $button_clone = null;
    var $button = $(".button[data-id='" + button.id + "']");
    if(button.id != -1 && $button.length) {
      $button_clone = $button.clone();
      $button_clone.clone = true;
    }
    // only certain buttons should be added to the sentence box
    var button_to_speak = obj;
    var specialty_button = null;
    var specialty = utterance.specialty_button(obj);
    var skip_speaking_by_default = !!(button.load_board || specialty || button_to_speak.special || button.url || button.apps || (button.integration && button.integration.action_type == 'render'));
    var button_added_or_spoken = false;
    var add_to_voc = button.add_vocalization == null ? button.add_to_vocalization : button.add_vocalization;
    if(specialty) {
      specialty_button = $.extend({}, specialty);
      specialty_button.special = true;
      if(specialty.specialty_with_modifiers) {
        if(specialty.default_speak) { 
          skip_speaking_by_default = false; 
          if(specialty.default_speak !== true) {
            obj.vocalization = specialty.default_speak;
          }
        }
        button_to_speak = utterance.add_button(obj, button);
        button_added_or_spoken = true;
      } else if(specialty.default_speak) {
        skip_speaking_by_default = false;
        obj.vocalization = specialty.default_speak;
        utterance.add_button(obj, button);
        button_added_or_spoken = true;
      }
    } else if(skip_speaking_by_default && !add_to_voc) {
    } else if(button.skip_vocalization) {
    } else if(button.add_vocalization == false) {
      button_added_or_spoken = true;
    } else {
      button_to_speak = utterance.add_button(obj, button);
      button_added_or_spoken = true;
    }

    var skip_highlight = false;
    var skip_sound = false;
    var skip_auto_return = false;
    // check if the button is part of a board that has a custom handler,
    // and skip the other actions if handled
    if(button.board == this.controller.get('board.model') && button.board.get('button_handler')) {
      var button_handled = button.board.get('button_handler')(button, obj);
      if(button_handled) { 
        if(button_handled.highlight === false) { skip_highlight = true; }
        if(button_handled.sound === false) { skip_sound = true; }
        if(button_handled.auto_return === false) { skip_auto_return = true; }
        if(button_handled.ignore) {
          return;
        }
      }
    }

    // speak or make a sound to show the button was selected
    if(obj.label && !skip_sound) {
      var _this = this;
      var no_user = !this.get('currentUser');
      var click_buttons = no_user ? (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.click_buttons !== false) : this.get('currentUser.preferences.click_buttons');
      var click_sound = function() {
        if(click_buttons) {
          if(specialty_button && specialty_button.has_sound) {
          } else {
            speecher.click();
          }
        }
      };
      var vibrate = function() {
        if(_this.get('currentUser.preferences.vibrate_buttons') && _this.get('speak_mode')) {
          capabilities.vibrate();
        } else if(no_user && _this.get('speak_mode') && (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.vibrate_buttons)) {
          capabilities.vibrate();
        }
      };
      if(this.get('speak_mode')) {
        if(!skip_speaking_by_default) {
          obj.for_speaking = true;
        }

        var vocalize = this.get('currentUser.preferences.vocalize_buttons') || (no_user && (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.vocalize_buttons !== false));
        if(vocalize) {
          if(skip_speaking_by_default && !this.get('currentUser.preferences.vocalize_linked_buttons') && !add_to_voc) {
            // don't say it...
            click_sound();
            vibrate();
          } else if(button_to_speak.in_progress && this.get('currentUser.preferences.silence_spelling_buttons')) {
            // don't say it...
            click_sound();
            vibrate();
          } else if(button.skip_vocalization || (specialty_button && specialty_button.only_action)) {
            // don't say it...
            click_sound();
            vibrate();
          } else {
            obj.spoken = true;
            obj.for_speaking = true;
            var doSpeak = function() {
              if (typeof console !== 'undefined' && console.log) {
                console.log('[speak-mode] button activate:', button_to_speak.label || '(no label)', 'sound:', !!button_to_speak.sound, 'vocalization:', (button_to_speak.vocalization || button_to_speak.label) || '(none)');
              }
              utterance.speak_button(button_to_speak);
              vibrate();
            };
            if (button_to_speak && !button_to_speak.sound) {
              var soundUrl = (button.get && (button.get('local_sound_url') || (button.get('sound') && button.get('sound.best_url')))) || (button.local_sound_url || (button.sound && button.sound.get && button.sound.get('best_url')));
              if (soundUrl) {
                button_to_speak.sound = soundUrl;
                doSpeak();
                return;
              }
              var hasSoundId = (button.get && button.get('sound_id')) || button.sound_id;
              if (hasSoundId && button.load_sound) {
                var loadSound = button.load_sound('local');
                if (loadSound && typeof loadSound.then === 'function') {
                  loadSound.then(function(sound) {
                    sound = sound || (button.get && button.get('sound'));
                    if (sound && button_to_speak) {
                      button_to_speak.sound = sound.get ? sound.get('best_url') : (sound.best_url || sound.url);
                    }
                    doSpeak();
                  }, function() {
                    doSpeak();
                  });
                  return;
                }
              }
            }
            doSpeak();
          }
        } else {
          click_sound();
          vibrate();
        }
      } else if(button_to_speak) {
        utterance.silent_speak_button(button_to_speak);
      }
    }

    // record the button activation in the usage logs
    if(button_to_speak.modified && !button_to_speak.in_progress) {
      obj.completion = obj.completion || button_to_speak.label;
    }
    // TODO: If the user just navigated to a home-locked board
    // then it'll be logged with a depth of 0 even though it
    // took them any number of steps to get there. On average
    // it will probably be fine, but some buttons won't get 
    // enough weight.
    obj.depth = this.get('depth_actions.depth') || 0; // || (this.stashes.get('boardHistory') || []).length;
    obj.access = this.get('currentUser.access_method');
    obj.overlay = !!overlay;
    this.stashes.log(obj);
    sync.send_update(this.get('referenced_user.id') || this.get('currentUser.id'), {button: obj});
    var _this = this;

    // highlight the button that if highlights are enabled
    if((this.get('referenced_user.preferences.highlighted_buttons') || 'none') != 'none' && this.get('speak_mode') && !skip_highlight) {
      if(button_added_or_spoken || this.get('referenced_user.preferences.highlighted_buttons') == 'all') {
        this.highlight_selected_button(button, overlay, obj.label, $button_clone);
      }
    }
    if(button.board && button.board.prompt) {
      button.board.prompt('clear');
    }

    // additional actions (besides just speaking) will be necessary for some buttons
    if((button.load_board && button.load_board.key) || (button.vocalization || '').match(/:native-keyboard/)) {
      var user_prefers_native_keyboard = this.get('referenced_user.preferences.device.prefer_native_keyboard');
      if(user_prefers_native_keyboard == undefined) {
        user_prefers_native_keyboard = window.user_preferences.any_user.prefer_native_keyboard;
      }
      var native_keyboard_available = capabilities.installed_app && (capabilities.system == 'iOS' || capabilities.system == 'Android') && !buttonTracker.scanning_enabled;
      var expecting_key = (button.vocalization || '').match(/:native-keyboard/) || (button.load_board && button.load_board.key == 'example/keyboard');
      if(expecting_key && native_keyboard_available && user_prefers_native_keyboard && window.Keyboard && window.Keyboard.hide) {
        scanner.native_keyboard();
      } else if(this.stashes.get('sticky_board') && this.get('speak_mode')) {
        modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
      } else {
        runLater(function() {
          _this.track_depth('link');
          _this.jump_to_board({
            id: button.load_board.id,
            key: button.load_board.key,
            button_triggered: true,
            meta_home: button.meta_home,
            home_lock: button.home_lock
          }, obj.board);
        }, 50);
      }
    } else if(button.url) {
      this.track_depth('clear');
      if(this.stashes.get('sticky_board') && this.get('speak_mode')) {
        modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
      } else if(this.get('currentUser.preferences.external_links') == 'prevent') {
        modal.warning(i18n.t('external_links_disabled_notice', "External Links have been disabled in this user's preferences."), true);
      } else {
        this.launch_url(button, null, obj.board);
      }
    } else if(button.apps) {
      this.track_depth('clear');
      if(this.stashes.get('sticky_board') && this.get('speak_mode')) {
        modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
      } else if(this.get('currentUser.preferences.external_links') == 'prevent') {
        modal.warning(i18n.t('external_links_disabled_notice', "External Links have been disabled in this user's preferences."), true);
      } else {
        if((!this.get('currentUser') && (window.user_preferences.any_user.external_links || '').match(/confirm/)) || (this.get('currentUser.preferences.external_links') || '').match(/confirm/)) {
          modal.open('confirm-external-app', {apps: button.apps});
        } else if((!this.get('currentUser') && window.user_preferences.any_user.confirm_external_links) || this.get('currentUser.preferences.confirm_external_links')) {
          modal.open('confirm-external-app', {apps: button.apps});
        } else {
          if(capabilities.system == 'iOS' && button.apps.ios && button.apps.ios.launch_url) {
            capabilities.window_open(button.apps.ios.launch_url, '_blank');
          } else if(capabilities.system == 'Android' && button.apps.android && button.apps.android.launch_url) {
            capabilities.window_open(button.apps.android.launch_url, '_blank');
          } else if(button.apps.web && button.apps.web.launch_url) {
            capabilities.window_open(button.apps.web.launch_url, '_blank');
          } else {
            // TODO: handle this edge case smartly I guess
          }
        }
      }
    } else if(specialty_button) {
      this.track_depth('clear');
      var res = this.specialty_actions(button.vocalization);
      var auto_return_possible = !!specialty_button.default_speak || res.auto_return_possible;
      if(auto_return_possible && !res.already_navigating && !skip_auto_return) {
        this.possible_auto_home(obj);
      }
    } else if(button.integration && button.integration.action_type == 'webhook') {
      this.track_depth('clear');
      Button.extra_actions(button);
      runLater(function() { _this.check_scanning(); }, 200);
    } else if(button.integration && button.integration.action_type == 'render') {
      this.track_depth('clear');
      runLater(function() {
      _this.jump_to_board({
        id: "i" + button.integration.user_integration_id,
        key: "integrations/" + button.integration.user_integration_id + ":" + (button.integration.action || ''),
        home_lock: button.home_lock,
        meta_home: button.meta_home
      }, obj.board);
      }, 100);
    } else if(!skip_auto_return) {
      this.possible_auto_home(obj);
    }
    frame_listener.notify_of_button(button, obj);
    return true;
  },
  specialty_actions: function(voc) {
    var res = {auto_return_possible: false, already_navigating: false};
    (voc || '').split(/\s*&&\s*/).forEach(function(mod) {
      if(mod && mod.length > 0) {
        var found = false;
        LingoLinq.special_actions.forEach(function(action) {
          if(found) { return; }
          if(mod == action.action || (action.match && mod.match(action.match))) {
            found = true;
            if(action.trigger) {
              var trigger_res = null;
              if(action.match) {
                trigger_res = action.trigger(mod.match(action.match));
              } else {
                trigger_res = action.trigger(mod)
              }
              if(trigger_res && trigger_res.auto_return_possible) {
                res.auto_return_possible = true;
              }
              if(trigger_res && trigger_res.already_navigating) {
                res.already_navigating = true;
              }
            }
          }
        });
      }
    });
    return res;
  },
  highlight_selected_button: function(button, overlay, label_override, $clone) {
    // TODO: ensure you are using the auto-inflected label for the highlight
    var $button = $(".button[data-id='" + button.id + "']");
    if(overlay) {
      $button = $(overlay);
      $clone = $button;
    }
    if(button.id != -1 && $button.length) {
      var $board = $(".board:first");
      var board_offset = $board.offset();
      var width = $button.outerWidth();
      var height = $button.outerHeight();
      var offset = $button.offset();
      $clone = $clone || $button;
      if(!$clone.clone) {
        $clone = $clone.clone();
        $clone.clone = true;
      }
      $clone.addClass('hover_button').addClass('touched');
      if(label_override) {
        $clone.find(".button-label").text(label_override);
        // if(!button.text_only && !clone[0].querySelector() && $clone[0].querySelector('img.symbol.overridden')) {
        //   $clone[0].querySelector('.button-label').style.fontSize = '';
        //   var sym = $clone[0].querySelector('.symbol')
        //   if(sym) { sym.style.display = ''; }
        // }
      }
      var wait_to_fade = 1500;
      // TODO: wait_to_fade should be configurable maybe
      if(this.get('referenced_user.preferences.highlight_popup_text')) {
        // https://rerc-aac.psu.edu/1819-2/
        var popup_width = Math.min(400, window.innerWidth);
        var popup_height = Math.min(200, window.innerHeight - board_offset.top);
        var popup_top = Math.max(0, offset.top - board_offset.top - popup_height);
        var below = false;
        // if the popup overlaps the button
        if(popup_top + popup_height > offset.top + height) {
          // ..and there is room underneath the button
          if(window.innerHeight > offset.top + height + popup_height) {
            popup_top = offset.top - board_offset.top + height;
            below = true;
          }
        }
        wait_to_fade = 5000;
        $clone = $("<div/>").addClass('button').addClass('hover_button');
        var popup_left = offset.left + (width / 2) - board_offset.left - (popup_width / 2);
        var marg = popup_height;
        if(offset.top - board_offset.top - popup_height < 0) {
          marg = offset.top - board_offset.top;
        }
        $clone.css({
          position: 'absolute',
          top: popup_top,
          zIndex: 9,
          left: popup_left,
          width: 20,
          height: 10,
          opacity: 0.0,
          marginTop: below ? -10 : marg,
          marginLeft: (popup_width - 20) / 2,
          border: '1px solid #000',
          background: '#fff'
        });
        $clone.addClass('text_popup');
        var $canvas = $("<canvas/>");
        $canvas.attr({width: popup_width * 2, height: popup_height * 2});
        $canvas.css({
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%'
        });
        var context = $canvas[0].getContext('2d');
        var text = button.vocalization || button.label;
        var max_font_size = 120;
        var text_height = max_font_size;
        var style = Button.style(this.controller.get('board.button_style')) || {};
        var font_family = style.font_family || 'Arial';
  
        context.font = text_height + "px " + font_family;
        var rows = 1;
        var lines = [text];
        var max_text_width = context.measureText(text).width / 2;
        var trim_line = function(text, length) {
          var pre = length, post = length;
          while(text) {
            if(text.charAt(pre).match(/\s/)) {
              return [text.substring(0, pre), text.substring(pre + 1)];
            } else if(text.charAt(post).match(/\s/)) {
              return [text.substring(0, post), text.substring(post + 1)];
            } else if(pre <= 0 && post >= text.length) {
              return [text, ""];  
            } else {
              pre--;
              post++;
            }
          }
        }
        var stay_put = false;
        var max_lines = 4;
        while(max_text_width > popup_width && rows <= max_lines) {
          var text_cutoff = (rows == max_lines || stay_put) ? 50 : 80;
          while(text_height > text_cutoff && max_text_width > popup_width) {
            var widths = [];
            text_height = text_height - 10;
            context.font = text_height + "px " + font_family;
            max_text_width = Math.max.apply(null, lines.map(function(l) { return context.measureText(l).width; })) / 2;
          }
          if(max_text_width > popup_width && rows < max_lines && !stay_put) {
            rows++;
            var last_lines = lines;
            lines = [];
            var line_length = text.length / rows;
            var leftover = text;
            for(var i = 0; i < rows; i++) {
              if(i == rows - 1) {
                lines.push(leftover);
              } else {
                var arr = trim_line(leftover, line_length);
                leftover = arr[1];
                lines.push(arr[0]);
              }
            }
            var last_max_length = Math.max.apply(null, last_lines.map(function(l) { return l.length; }));
            var new_max_length = Math.max.apply(null, lines.map(function(l) { return l.length; }));
            if(last_max_length == new_max_length) {
              stay_put = true;
              lines = last_lines;
            }
            text_height = max_font_size + 20 - (lines.length * 10);
          }
        }
        context.textAlign = 'center';
        context.fillStyle = '#000';
        context.measureText(text);
        var text_top = popup_height - ((text_height + 5) * lines.length / 2);
        lines.forEach(function(line, idx) {
          context.fillText(line, popup_width, text_top - (text_height / 6) + ((text_height + 5) * (idx + 1)));
        });

        $clone.append($canvas);
        runLater(function() {
          $clone.css({
            width: 400,
            height: 200,
            opacity: 1.0,
            marginLeft: Math.min(Math.max(0, -1 * popup_left + 5), window.innerWidth - popup_left - popup_width - 5),
            marginTop: below ? 10 : -10
          })
        });
        runLater(function() {
          $clone.css({
            width: 20,
            height: 10,
            opacity: 0.0,
            marginTop: below ? -10 : marg,
            marginLeft: (popup_width - 20) / 2,
          });
        }, wait_to_fade);
        // pop-up speech
      } else {
        $clone.css({
          position: 'absolute',
          top: offset.top - board_offset.top,
          left: offset.left - board_offset.left,
          width: width + 8,
          height: height + 8,
          margin: -4
        });
      }

      $board.append($clone);
      $clone.addClass('selecting');
      $clone.addClass('clone');

      // Have to reposition if moving to/from keyboard suggestion board
      var offset_y = $("#word_suggestions").height() || 0;
      var checky = function() {
        if(!$clone.removed) {
          var new_offset_y = $("#word_suggestions").height() || 0;
          if(offset_y != new_offset_y) {
            var top = parseInt($clone.css('top'), 10);
            top = top + (offset_y - new_offset_y);
            offset_y = new_offset_y;
            $clone.css('top', top);
          }
          runLater(checky, 100);
        }
      };
      runLater(checky);

      runLater(function() {
        $clone.addClass('fading');
        $button.addClass('selecting');
        var later = runLater(function() {
          $clone.removed = true;
          $button.removeClass('selecting');
          $button.data('later', null);
          $clone.remove();
        }, 3000);
        $button.data('later', later);
      }, wait_to_fade);
    }
  },
  possible_auto_home: function(obj) {
    var _this = this;
    this.track_depth('clear');
    if(obj.prevent_return) {
      // integrations and configured buttons can explicitly prevent navigating away when activated
      runLater(function() { _this.check_scanning(); }, 200);
    } else if(this.get('speak_mode') && ((!this.get('currentUser') && window.user_preferences.any_user.auto_home_return) || this.get('currentUser.preferences.auto_home_return'))) {
      if(this.stashes.get('sticky_board') && this.get('speak_mode')) {
        var state = this.stashes.get('temporary_root_board_state') || this.stashes.get('root_board_state');
        var current = this.get('currentBoardState');
        if(state && current && state.key == current.key) {
        } else {
          modal.warning(i18n.t('sticky_board_notice', "Board lock is enabled, disable to leave this board."), true);
        }
        runLater(function() { _this.check_scanning(); }, 200);
      } else if(obj && obj.vocalization && obj.vocalization.match(/^\+/)) {
        // don't home-return when spelling out words
        runLater(function() { _this.check_scanning(); }, 200);
      } else {
        this.jump_to_root_board({auto_home: true});
        // check for scanning because if already on home, nothing will change
        runLater(function() { _this.check_scanning(); }, 200);
      }
    }
  },
  eval_mode: computed('currentBoardState.key', function() {
    return (this.get('currentBoardState.key') || '').match(/^obf\/eval/);
  }),
  launch_url: function(button, force, board) {
    var _this = this;
    if(!force && _this.get('currentUser.preferences.external_links') == 'confirm_all') {
      modal.open('confirm-external-link', {url: button.url}).then(function(res) {
        if(res && res.open) {
          _this.launch_url(button, true, board);
        }
      });
    } else {
      var real_url = button.url;
      var book_integration = _this.get('sessionUser.global_integrations.tarheel');
      book_integration = book_integration || ((window.user_preferences || {}).global_integrations || []).indexOf('tarheel') != -1;
      if(button.book && button.book.popup && button.book.url) {
        real_url = button.book.url;
      }
      if(button.video && button.video.popup) {
        modal.open('inline-video', button);
      } else if(button.book && button.book.popup && book_integration) {
        var opts = $.extend({}, button.book || {});
        delete opts['base_url'];
        delete opts['url'];
        delete opts['popup'];
        delete opts['type'];
        runLater(function() {
          _this.jump_to_board({
            id: "i_tarheel",
            key: "integrations/tarheel:" + encodeURIComponent(btoa(JSON.stringify(opts))),
            home_lock: button.home_lock,
            meta_home: button.meta_home
          }, board);
        }, 100);
      } else {
        var do_confirm = (!_this.get('currentUser') && window.user_preferences.any_user.external_links == 'confirm_custom') || _this.get('currentUser.preferences.external_links') == 'confirm_custom';
        do_confirm = do_confirm || (!_this.get('currentUser') && window.user_preferences.any_user.confirm_external_links) || _this.get('currentUser.preferences.confirm_external_links');
        if(!force && do_confirm) {
          modal.open('confirm-external-link', {url: button.url, real_url: real_url}).then(function(res) {
            if(res && res.open) {
              capabilities.window_open(real_url || button.url, '_blank');
            }
          });
        } else {
          capabilities.window_open(real_url || button.url, '_blank');
        }
      }
    }
  },
  remember_global_integrations: observer('sessionUser.global_integrations', function() {
    if(this.get('sessionUser.global_integrations')) {
      this.stashes.persist('global_integrations', this.get('sessionUser.global_integrations'));
    }
  }),
  toggle_cookies: observer('sessionUser.preferences.cookies', function(state, change) {
    if(change == 'sessionUser.preferences.cookies') {
      state = !!this.get('sessionUser.preferences.cookies');
    }
    if(state === true) {
      // If changed on the user preferences page, or they haven't explicitly said
      // 'No Thanks' on the popup, go ahead and enable cookies and tracking
      if(!change || this.get('sessionUser.watch_cookies') || localStorage['enable_cookies'] != 'explicit_false') {
        if(!window.ga && window.ga_setup) {
          window.ga_setup();
        }
        localStorage['enable_cookies'] = 'true';
      }
    } else if(state === false) {
      window.ga = null;
      localStorage['enable_cookies'] = 'false';
    }
    if(localStorage['enable_cookies']) {
      var elem = document.getElementById('cookies_prompt');
      if(elem) {
        elem.style.display = 'none';
        elem.setAttribute('data-hidden', 'true');
      }
    }
  }),
  // Returned object is a plain object; when its methods are called (e.g. from raw_events),
  // 'this' is the plain object, not the service. Always use _this.get/_this.set inside these methods.
  board_virtual_dom: computed(function() {
    var _this = this;
    var dom = {
      sendAction: function() {
      },
      trigger: function(event, id, args) {
        var useVirtualDom = _this.get('currentUser.preferences.device.canvas_render') || _this.get('speak_mode');
        if(useVirtualDom && LingoLinq.customEvents[event]) {
          var sendAction = _this.get('board_virtual_dom.sendAction');
          if(typeof sendAction === 'function') {
            sendAction(LingoLinq.customEvents[event], id, {event: args});
          } else {
            dom.sendAction(LingoLinq.customEvents[event], id, {event: args});
          }
        }
      },
      each_button: function(callback) {
        var rows =_this.get('board_virtual_dom.ordered_buttons') || [];
        var idx = 0;
        rows.forEach(function(row) {
          row.forEach(function(b) {
            if(!b.get('empty_or_hidden')) {
              b.idx = idx;
              idx++;
              callback(b);
            }
          });
        });
      },
      add_state: function(state, id) {
        if(state == 'touched' || state == 'hover') {
          dom.clear_state(state, id);
          dom.each_button(function(b) {
            if(b.id == id && !emberGet(b, state)) {
              emberSet(b, state, true);
              dom.sendAction('redraw', b.id);
            }
          });
        }
      },
      clear_state: function(state, except_id) {
        dom.each_button(function(b) {
          if(b.id != except_id && emberGet(b, state)) {
            emberSet(b, state, false);
            dom.sendAction('redraw', b.id);
          }
        });
      },
      clear_touched: function() {
        dom.clear_state('touched');
//        dom.sendAction('redraw');
      },
      clear_hover: function() {
        dom.clear_state('hover');
//        dom.sendAction('redraw');
      },
      button_result: function(b) {
        var pos = b.positioning;
        return {
          id: b.id,
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          button: true,
          index: b.idx
        };
      },
      button_from_point: function(x, y) {
        var res = null;
        var useVirtualDom = _this.get('currentUser.preferences.device.canvas_render') || _this.get('speak_mode');
        if(useVirtualDom) {
          dom.each_button(function(b) {
            var pos = b.positioning;
            if(pos && !b.hidden) {
              if(x > pos.left - 2 && x < pos.left + pos.width + 2) {
                if(y > pos.top - 2 && y < pos.top + pos.height + 2) {
                  res = dom.button_result(b);
                }
              }
            }
          });
        }
        return res;
      },
      button_from_index: function(idx) {
        var res = null;
        dom.each_button(function(b) {
          if(b.idx == idx || (idx == -2)) {
            res = dom.button_result(b);
          }
        });
        return res;
      },
      button_from_id: function(id) {
        var res = null;
        dom.each_button(function(b) {
          var pos = b.positioning;
          if(b.id == id) {
            res = dom.button_result(b);
          }
        });
        return res;
      }
    };
    return dom;
  }),

  _setupRefreshTimers: function() {
    var _this = this;
    if(!this.get('testing')) {
      this.set('refresh_stamp', (new Date()).getTime());
      this.set('medium_refresh_stamp', (new Date()).getTime());
      this.set('short_refresh_stamp', (new Date()).getTime());
      setInterval(function() {
        try {
          // Guard: ensure service is still valid before setting properties
          if(_this && typeof _this.set === 'function' && !_this.isDestroyed && !_this.isDestroying) {
            // Defer property update to avoid render errors
            runLater(function() {
              if(_this && typeof _this.set === 'function' && !_this.isDestroyed && !_this.isDestroying) {
                _this.set('refresh_stamp', (new Date()).getTime());
              }
            }, 0);
          }
        } catch(e) {
          console.warn('[app-state] Error setting refresh_stamp:', e);
        }
      }, 5*60*1000);
      setInterval(function() {
        try {
          // Guard: ensure service is still valid before setting properties
          if(_this && typeof _this.set === 'function' && !_this.isDestroyed && !_this.isDestroying) {
            // Defer property update to avoid render errors
            runLater(function() {
              if(_this && typeof _this.set === 'function' && !_this.isDestroyed && !_this.isDestroying) {
                _this.set('medium_refresh_stamp', (new Date()).getTime());
              }
            }, 0);
          }
        } catch(e) {
          console.warn('[app-state] Error setting medium_refresh_stamp:', e);
        }
      }, 60*1000);
      setInterval(function() {
        try {
          // Guard: ensure service is still valid before setting properties
          if(_this && typeof _this.set === 'function' && !_this.isDestroyed && !_this.isDestroying) {
            // Schedule after render to avoid "Cannot read properties of null (reading 'persistence')"
            // when run loop flush runs during transition/teardown (e.g. from _setupRefreshTimers).
            scheduleOnce('afterRender', _this, function() {
              try {
                if(this && typeof this.set === 'function' && !this.isDestroyed && !this.isDestroying) {
                  this.set('short_refresh_stamp', (new Date()).getTime());
                  if(window.persistence && typeof window.persistence.set === 'function') {
                    window.persistence.set('refresh_stamp', (new Date()).getTime());
                  }
                }
              } catch(e) {
                // Ignore errors during teardown or when context is null
              }
            });
          }
        } catch(e) {
          console.warn('[app-state] Error setting short_refresh_stamp:', e);
        }
      }, 500);
    }
  }
});

// ScrollTopRoute exported separately for backward compatibility
export const ScrollTopRoute = Route.extend({
  activate: function() {
    this._super();
    if(!this.get('already_scrolled')) {
      this.set('already_scrolled', true);
      $('body').scrollTop(0);
    }
  }
});
// window.app_state will be set in initializer after service is created

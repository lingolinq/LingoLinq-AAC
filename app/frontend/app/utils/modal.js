import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
import { getOwner } from '@ember/application';
// import $ from 'jquery';
import scanner from './scanner';

var modal = EmberObject.extend({
  /**
   * Get the modal service instance
   * Uses Ember's getOwner to lookup the service
   */
  _getService: function() {
    // Try to get service from Ember application
    try {
      // First try using the route's owner (most reliable)
      if (this.route) {
        var owner = getOwner(this.route);
        if (owner) {
          var service = owner.lookup('service:modal');
          if (service) {
            return service;
          }
        }
      }
      // Fallback to window.LingoLinq
      if (typeof window !== 'undefined' && window.LingoLinq) {
        var owner = getOwner(window.LingoLinq);
        if (owner) {
          return owner.lookup('service:modal');
        }
      }
    } catch(e) {
      // Service not available yet or not initialized
    }
    return null;
  },
  
  setup: function(route) {
    if(this.last_promise) { this.last_promise.reject('closing due to setup'); }
    this.route = route;
    this.settings_for = {};
    this.controller_for = {};
    
    // Initialize service if available
    var service = this._getService();
    if (service) {
      // Service is ready - we can use it for new modals
    }
  },
  reset: function() {
    this.route = null;
  },
  open: function(template, options) {
    // On dashboard (index route), show supervision content inline in bento instead of popup
    if (template === 'supervision-settings' && this.route) {
      try {
        var owner = getOwner(this.route);
        if (owner) {
          var appState = owner.lookup('service:app-state');
          var router = owner.lookup('router:main');
          if (appState && router && router.get('currentRouteName') === 'index') {
            appState.set('requestedSupervisorsView', true);
            return RSVP.resolve();
          }
        }
      } catch (e) {
        // fall through to open modal
      }
    }

    var service = this._getService();
    var outlet = template;
    var render_template = template;
    if(template != 'highlight' && template != 'highlight-secondary') {
      outlet = 'modal';
    }
    if(outlet == 'highlight-secondary') {
      render_template = 'highlight2';
      options = options || {};
      options.secondary_highlight = true;
      options.clear_overlay = true;
    }

    // All modals use component-based rendering via the service (no outlet)
    var useComponentRendering = service && outlet == 'modal';

    // For modal outlet, handle entirely via service and skip outlet-based rendering
    // and skip all outlet-based rendering logic
    if (useComponentRendering) {
      // Update service state
      service.set('settingsFor', service.get('settingsFor') || {});
      service.settingsFor[render_template] = options;
      // Do NOT set currentTemplate here — service.open() will set it.
      // Setting it twice to the same value causes Ember to skip the re-render
      // because computed properties don't fire when a value doesn't change.
      service.set('currentOptions', options);

      // Handle scanner integration
      if(template != 'highlight' && template != 'highlight-secondary') {
        this.resume_scanning = true;
        scanner.stop();  
        runLater(function() {
          var targets = modal.scannable_targets();
          if(targets.length > 0 && options && options.scannable) {
            scanner.start(scanner.options);
          }
        });
      }
      
      // Replace existing modal: resolve old promise and clear state (service handles DOM via modal-container)
      if (this.last_template || this._component_based_template) {
        if (this.last_promise && this.last_promise.resolve) {
          this.last_promise.resolve({replaced: true});
        }
        this.last_promise = null;
        if (service) {
          service._resolveCurrentPromise({replaced: true});
        }
        this.last_template = null;
        this._component_based_template = null;
        this.component = null;
      }
      
      // Update state for tracking (but don't trigger outlet rendering)
      // IMPORTANT: Don't set last_template for component-based modals to prevent outlet conflicts
      // Use a separate flag to track component-based modals
      this.settings_for[render_template] = options;
      this.last_any_template = template;
      // DO NOT set this.last_template for component-based modals - it triggers outlet rendering
      // Instead, we'll track it separately
      this._component_based_template = template;
      
      // Get promise from service and return it
      var servicePromise = service.open(template, options);
      
      // Create promise wrapper for old system compatibility
      // The service returns a Promise, but we need to track it for the old system
      var promiseResolve, promiseReject;
      var wrappedPromise = new RSVP.Promise(function(resolve, reject) {
        promiseResolve = resolve;
        promiseReject = reject;
      });
      
      // When service promise resolves/rejects, update our wrapper
      servicePromise.then(function(result) {
        promiseResolve(result);
      }, function(err) {
        promiseReject(err);
      });
      
      // Store promise wrapper for old system
      this.last_promise = {
        resolve: promiseResolve,
        reject: promiseReject,
        promise: wrappedPromise
      };
      
      return wrappedPromise;
    }
    
    if(template != 'highlight' && template != 'highlight-secondary') {
      this.resume_scanning = true;
      scanner.stop();  
      runLater(function() {
        var targets = modal.scannable_targets();
        if(targets.length > 0 && options && options.scannable) {
          scanner.start(scanner.options);
        }
      });
    }
    var _this = this;
    // If there's an existing overlay (e.g. highlight), close it first
    if ((this.last_promise || this.last_template || this._component_based_template)) {
      this.close(null, outlet);
    }
    if(!this.route) { throw "must call setup before trying to open a modal"; }

    this.settings_for[render_template] = options;
    this.last_any_template = template;
    if(template != 'highlight' && template != 'highlight-secondary') {
      this.last_template = template;
    }
    // Outlet-based rendering for highlight / highlight-secondary only (modals use service)
    this.route.render(render_template, { into: 'application', outlet: outlet});
    return new RSVP.Promise(function(resolve, reject) {
      if(template != 'highlight' && template != 'highlight-secondary') {
        _this.last_promise = {
          resolve: resolve,
          reject: reject
        };
        if (service) {
          service.set('currentPromise', { resolve, reject });
        }
      } else {
        resolve();
      }
    });
  },
  is_open: function(template) {
    if(template == 'highlight') {
      return !!this.highlight_controller;
    } else if(template == 'highlight-secondary') {
      return !!this.highlight2_controller;
    } else if(template) {
      // Check both outlet-based and component-based modals
      return this.last_template == template || this._component_based_template == template;
    } else {
      return !!this.last_template || !!this._component_based_template;
    }
  },
  is_closeable: function() {
    var modal = document.querySelector(".modal");
    return modal && modal.getAttribute('data-uncloseable') != 'true';
  },
  scannable_targets: function() {
    if(modal.is_open()) {
      return document.querySelectorAll(".modal-dialog .modal_targets .btn, .modal-dialog .modal_targets a, .modal-dialog .modal_targets .speak_menu_button, .modal-dialog .modal_targets .md-speak-menu__btn, .modal-dialog .modal_targets .md-speak-menu__bottom-btn");
    } else {
      return document.querySelectorAll('nothing'); // Return empty NodeList equivalent
    }
  },
  queue: function(template) {
    // TODO: pretty sure this isn't used anywhere
    if(this.is_open()) {
      this.queued_template = template;
    } else {
      this.open(template);
    }
  },
  highlight: function($elems, options) {
    var defer = RSVP.defer();
    // This may just be necessary for UIWebKit, but
    // iOS is still struggling sometimes with find-a-button
    runLater(function() {
      var rect = scanner.measure($elems);
      var minX = rect.left, minY = rect.top, maxX = rect.left + rect.width, maxY = rect.top + rect.height;
      var do_stretch = true;
      if(do_stretch) {
        minX = minX - 10;
        minY = minY - 10;
        maxX = maxX + 10;
        maxY = maxY + 10;
      }
      var settings = modal.highlight_settings || EmberObject.create();
      settings.setProperties({
        left: Math.floor(minX),
        top: Math.floor(minY),
        width: Math.ceil(maxX - minX),
        height: Math.ceil(maxY - minY),
        bottom: Math.floor(maxY),
      });

      options = options || {};
      settings.set('overlay', options.overlay);
      if(settings.get('overlay') !== false) { settings.set('overlay', true); }
      settings.set('clear_overlay', options.clear_overlay);
      if(options.icon) {
        settings.set('icon_class', 'highlight_icon glyphicon glyphicon-' + options.icon);
      }
      settings.set('prevent_close', options.prevent_close);
      settings.set('select_anywhere', options.select_anywhere);
      settings.set('highlight_type', options.highlight_type);
      settings.set('defer', defer);
      var template = 'highlight';
      var controller_name = 'highlight_controller';
      var promise_name = 'highlight_promise';
      var settings_name = 'highlight_settings';
      if((options.highlight_type == 'model' || options.highlight_type == 'button_search') && scanner.scanning) {
        // If scanning, we can't use the primary
        // highlight mechanism
        template = 'highlight-secondary';
        controller_name = 'highlight2_controller';
        promise_name = 'highlight2_promise';
        settings_name = 'highlight2_settings';
      }
      var promise = settings.get('defer').promise;

      if(modal[controller_name]) {
        if(modal[promise_name]) {
          modal[promise_name].reject({reason: 'closing due to new highlight', highlight_close: true});
        }
        modal[controller_name].set('model', settings);
      } else {
        modal.close(null, template);
        runLater(function() {
          modal.open(template, settings);
        });
      }
      modal[promise_name] = settings.get('defer');
      modal[settings_name] = settings;
    }, 100);
    return defer.promise;
  },
  close_highlight: function() {
    if(this.highlight_controller) {
      modal.close(null, 'highlight');
      modal.close(null, 'highlight-secondary');
    }
    // Clear highlight settings even without controller
    this.highlight_settings = null;
    this.highlight2_settings = null;
  },
  close: function(success, outlet) {
    outlet = outlet || 'modal';
    if(!this.route) { return; }
    
    var service = this._getService();
    
    if(this.last_promise && outlet != 'highlight' && outlet != 'highlight-secondary') {
      // Treat null, undefined, or any truthy value as success
      // Only reject if explicitly passed false
      if(success === false) {
        if (this.last_promise.reject) {
          this.last_promise.reject({reason: 'force close'});
        }
      } else {
        if (this.last_promise.resolve) {
          this.last_promise.resolve(success);
        }
      }
      this.last_promise = null;
      
      // Also resolve service promise if it exists
      if (service) {
        service._resolveCurrentPromise(success);
        service.set('currentTemplate', null);
        service.set('currentOptions', null);
        service.set('currentComponent', null);
        service.set('currentController', null);
        service.set('currentPromise', null);
      }
    }
    if(this.highlight_promise && outlet == 'highlight') {
      this.highlight_promise.reject({reason: 'force close'});
      this.highlight_promise = null;
    }
    if(this.highlight2_promise && outlet == 'highlight-secondary') {
      this.highlight2_promise.reject({reason: 'force close'});
      this.highlight2_promise = null;
    }
    if(this.resume_scanning) {
      var _this = this;
      runLater(function() {
        if(!modal.is_open()) {
          _this.resume_scanning = false;
          scanner.start(scanner.options);
        }
      });
    }
    if(outlet != 'highlight' && outlet != 'highlight-secondary') {
      // Clear outlet-based template
      this.last_template = null;
      this.component = null; // Clear component reference when closing
      
      // Clear component-based template flag (prevents outlet system from trying to render)
      this._component_based_template = null;
      
      // Also clear in service (modal-container will unmount component)
      if (service) {
        service.set('currentTemplate', null);
        service.set('currentComponent', null);
      }
      
      runLater(function() {
        modal.close(null, 'highlight');
        modal.close(null, 'highlight-secondary');
      });
    }
    // For non-modal outlets (e.g. flash-message, board-preview), clear outlet DOM
    if (outlet !== 'modal') {
      var _this = this;
      runLater(function() {
        var outletElement = document.querySelector('[data-ember-outlet="' + outlet + '"]') ||
                           document.querySelector('[id="' + outlet + '"]') ||
                           document.querySelector('.ember-view[data-outlet-name="' + outlet + '"]') ||
                           document.querySelector('[data-outlet-name="' + outlet + '"]');
        if(outletElement) {
          outletElement.innerHTML = '';
        }
      }, 0);
    }
    // Call closing callbacks if needed
    if(outlet == 'highlight') {
      if(this.highlight_controller && this.highlight_controller.closing) {
        this.highlight_controller.closing();
      }
    } else if(outlet == 'highlight-secondary') {
      if(this.highlight2_controller && this.highlight2_controller.closing) {
        this.highlight2_controller.closing();
      }
    } else {
      if(this.last_controller && this.last_controller.closing) {
        this.last_controller.closing();
      }
    }
    if(this.queued_template) {
      runLater(function() {
        if(!modal.is_open()) {
          modal.open(modal.queued_template);
          modal.queued_template = null;
        }
      }, 2000);
    }
  },
  flash: function(text, type, below_header, sticky, opts) {
    if(!this.route) { throw "must call setup before trying to show a flash message"; }
    type = type || 'notice';
    opts = opts || {};
    this.settings_for['flash'] = {type: type, text: text, sticky: sticky, action: opts.action};
    if(below_header) {
      this.settings_for['flash'].below_header = below_header;
    }
    var redirectHash;
    if(opts.redirect) {
      redirectHash = {};
      redirectHash[opts.redirect] = true;
      this.settings_for['flash'].redirect = redirectHash;
    }
    var service = this._getService();
    if(service) {
      var serviceOpts = Object.assign({}, opts, redirectHash ? { redirect: redirectHash } : {});
      service.flash(text, type, below_header, sticky, serviceOpts);
      var _this = this;
      if(!sticky) {
        runLater(function() {
          _this.fade_flash();
        }, below_header ? 3500 : (opts.timeout || 1500));
      }
      return;
    }
    var _this = this;
    runLater(function() {
      var timeout = below_header ? 3500 : 1500;
      if(opts.timeout) { timeout = opts.timeout; }
      modal.route.render('flash-message', { into: 'application', outlet: 'flash-message'});
      if(!sticky) {
        runLater(function() {
          _this.fade_flash();
        }, timeout);
      }
    });
  },
  fade_flash: function() {
    var flash = document.querySelector('.flash');
    if(flash) { flash.classList.add('fade'); }
  },
  warning: function(text, below_header, sticky, opts) {
    modal.flash(text, 'warning', below_header, sticky, opts);
  },
  error: function(text, below_header, sticky, opts) {
    modal.flash(text, 'error', below_header, sticky, opts);
  },
  notice: function(text, below_header, sticky, opts) {
    modal.flash(text, 'notice', below_header, sticky, opts);
  },
  success: function(text, below_header, sticky, opts) {
    modal.flash(text, 'success', below_header, sticky, opts);
  },
  board_preview: function(board, locale, allow_style, callback) {
    var service = this._getService();
    if (service) {
      service.open('board-preview', {
        board: board,
        locale: locale || (board.get ? board.get('preview_locale') : board.preview_locale),
        option: board.preview_option || board.get ? board.get('preview_option') : undefined,
        allow_style: allow_style,
        callback: callback
      });
    } else if (this.route) {
      this.route.render('board-preview', { into: 'application', outlet: 'board-preview', model: {board: board, locale: locale, option: board.preview_option, allow_style: allow_style, callback: callback}});
    }
  },
  cancel_auto_close: function() {
    try {
      modal.auto_close = false;
    } catch(e) { }
    if(modal.component) {
      modal.component.set('auto_close', false);      
    }
    // Also cancel in service if available
    var service = this._getService();
    if (service) {
      service.cancelAutoClose();
    }
  },
  close_board_preview: function() {
    var service = this._getService();
    if (service) {
      service.close(null, 'board-preview');
    } else {
      this.close(null, 'board-preview');
    }
  }
}).create();

modal.ModalController = Controller.extend({
  actions: {
    opening: function() {
      var template = modal.last_any_template;
      if(!template) { console.error("can't find template name"); }
      var settings = modal.settings_for[template] || {};
      var controller = this;
      if(modal.last_any_template != 'highlight' && modal.last_any_template != 'highlight-secondary') {
        modal.last_controller = controller;
        // Set controller in service if available
        var service = modal._getService();
        if (service) {
          service.setController(controller);
        }
      }
      var tooltip = document.querySelector('body > .tooltip');
      if(tooltip) {
        tooltip.parentElement.removeChild(tooltip);
      }
  
      controller.set('model', settings);
      if(modal.auto_close_timer) {
        runCancel(modal.auto_close_timer);
      }
      modal.auto_close_callback = null;
      modal.auto_close_timer = null;
      
      // Also cancel service auto-close if available
      var service = modal._getService();
      if (service) {
        service.cancelAutoClose();
      }
      
      if(settings && settings.inactivity_timeout) {
        modal.auto_close_callback = function() {
          if(modal.auto_close && modal.component && modal.component.element && modal.component.element.querySelectorAll(".modal-content.auto_close").length) {
            modal.close();
            modal.auto_close = false;
          }
        }
        modal.auto_close = true;
        var duration = 20 * 1000;
        // After 20 seconds with no interaction, close this modal
        if(scanner.options && scanner.options.interval && scanner.options.auto_start) {
          // If scanning, wait until 2 times through the list to auto-close
          runLater(function() {
            var targets = Math.max(5, modal.scannable_targets().length);
            duration = Math.max(duration, scanner.options.interval * targets * 2);
            if(modal.auto_close) {
              modal.auto_close_timer = runLater(modal.auto_close_callback, duration);
              // Also set in service
              if (service) {
                service.set('autoClose', true);
                service.set('autoCloseTimer', modal.auto_close_timer);
                service.set('autoCloseCallback', modal.auto_close_callback);
              }
            }
          }, 500);
        } else {
          modal.auto_close_timer = runLater(modal.auto_close_callback, duration);
          // Also set in service
          if (service) {
            service.set('autoClose', true);
            service.set('autoCloseTimer', modal.auto_close_timer);
            service.set('autoCloseCallback', modal.auto_close_callback);
          }
        }
      }
      if(controller.opening) {
        controller.opening();
      }
    },
    closing: function() {
      if(this.closing) {
        this.closing();
      }
    },
    close: function() {
      modal.close();
    }
  }
});

// global var required for speech.js library
// TODO: fix speech.js library to not need to have global var
window.modal = modal;

export default modal;

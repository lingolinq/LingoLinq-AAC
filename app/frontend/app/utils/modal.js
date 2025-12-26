import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
// import $ from 'jquery';
import scanner from './scanner';

var modal = EmberObject.extend({
  setup: function(route) {
    if(this.last_promise) { this.last_promise.reject('closing due to setup'); }
    this.route = route;
    this.settings_for = {};
    this.controller_for = {};
  },
  reset: function() {
    this.route = null;
  },
  open: function(template, options) {
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
    if((this.last_promise || this.last_template)) {
      this.close(null, outlet);
    }
    if(!this.route) { throw "must call setup before trying to open a modal"; }

    this.settings_for[render_template] = options;
    this.last_any_template = template;
    if(template != 'highlight' && template != 'highlight-secondary') {
      this.last_template = template;
    }
    this.route.render(render_template, { into: 'application', outlet: outlet});
    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      if(template != 'highlight' && template != 'highlight-secondary') {
        _this.last_promise = {
          resolve: resolve,
          reject: reject
        };
      }
    });
  },
  is_open: function(template) {
    if(template == 'highlight') {
      return !!this.highlight_controller;
    } else if(template == 'highlight-secondary') {
      return !!this.highlight2_controller;
    } else if(template) {
      return this.last_template == template;
    } else {
      return !!this.last_template;
    }
  },
  is_closeable: function() {
    var modal = document.querySelector(".modal");
    return modal && modal.getAttribute('data-uncloseable') != 'true';
  },
  scannable_targets: function() {
    if(modal.is_open()) {
      return document.querySelectorAll(".modal-dialog .modal_targets .btn, .modal-dialog .modal_targets a, .modal-dialog .modal_targets .speak_menu_button");
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
  },
  close: function(success, outlet) {
    outlet = outlet || 'modal';
    if(!this.route) { return; }
    if(this.last_promise && outlet != 'highlight' && outlet != 'highlight-secondary') {
      if(success || success === undefined) {
        this.last_promise.resolve(success);
      } else {
        this.last_promise.reject({reason: 'force close'});
      }
      this.last_promise = null;
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
      this.last_template = null;
      runLater(function() {
        modal.close(null, 'highlight');
        modal.close(null, 'highlight-secondary');
      });
    }
    if(this.route.disconnectOutlet) {
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
      this.route.disconnectOutlet({
        outlet: outlet,
        parentView: 'application'
      });
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
    this.route.disconnectOutlet({
      outlet: 'flash-message',
      parentView: 'application'
    });
    this.settings_for['flash'] = {type: type, text: text, sticky: sticky, action: (opts || {}).action};
    if(below_header) {
      this.settings_for['flash'].below_header = below_header;
    }
    if(opts && opts.redirect) {
      var hash = {};
      hash[opts.redirect] = true;
      this.settings_for['flash'].redirect = hash;
    }

    var _this = this;
    runLater(function() {
      var timeout = below_header ? 500 : 1500;
      if(opts && opts.timeout) { timeout = opts.timeout; }
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
    modal.route.render('board-preview', { into: 'application', outlet: 'board-preview', model: {board: board, locale: locale, option: board.preview_option, allow_style: allow_style, callback: callback}});
  },
  cancel_auto_close: function() {
    try {
      modal.auto_close = false;
    } catch(e) { }
    if(modal.component) {
      modal.component.set('auto_close', false);      
    }
  },
  close_board_preview: function() {
    if(modal.route) {
      modal.route.disconnectOutlet({
        outlet: 'board-preview',
        parentView: 'application'
      });
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
      if(settings && settings.inactivity_timeout) {
        modal.auto_close_callback = function() {
          if(modal.auto_close && modal.component.element.querySelectorAll(".modal-content.auto_close").length) {
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
            }
          }, 500);
        } else {
          modal.auto_close_timer = runLater(modal.auto_close_callback, duration);
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

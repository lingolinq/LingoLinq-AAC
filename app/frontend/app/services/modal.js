import Service from '@ember/service';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
import EmberObject from '@ember/object';
import scanner from '../utils/scanner';

/**
 * Modal Service - Modern service-based modal management
 * 
 * This service replaces the deprecated route.render() approach with
 * component-based rendering. It maintains backward compatibility with
 * the existing modal.open() and modal.close() API.
 */
export default Service.extend({
  appState: service('app-state'),

  // Current modal state
  currentTemplate: null,
  currentOptions: null,
  currentPromise: null,
  currentComponent: null,
  currentController: null,
  
  // Settings storage (keyed by template name)
  settingsFor: {},
  
  // Scanner integration
  resumeScanning: false,
  
  // Auto-close functionality
  autoClose: false,
  autoCloseTimer: null,
  autoCloseCallback: null,
  
  // Highlight system state
  highlightController: null,
  highlight2Controller: null,
  highlightPromise: null,
  highlight2Promise: null,
  highlightSettings: null,
  highlight2Settings: null,
  
  // Flash message state
  flashMessage: null,
  flashTimer: null,
  
  // Board preview state
  boardPreview: null,
  
  // Queue for modals
  queuedTemplate: null,
  
  /**
   * Open a modal
   * @param {string} template - Template name to render
   * @param {object} options - Options to pass to the modal
   * @returns {Promise} Promise that resolves when modal closes
   */
  open(template, options) {
    options = options || {};
    
    // Handle highlight templates specially
    if (template === 'highlight' || template === 'highlight-secondary') {
      return this._openHighlight(template, options);
    }
    
    // Handle flash messages
    if (template === 'flash-message') {
      return this._openFlash(options);
    }
    
    // Handle board preview
    if (template === 'board-preview') {
      return this._openBoardPreview(options);
    }
    
    // Regular modal
    return this._openModal(template, options);
  },
  
  /**
   * Open a regular modal
   */
  _openModal(template, options) {
    // If there's an existing modal, close it first
    if (this.get('currentTemplate')) {
      this._resolveCurrentPromise({replaced: true});
    }
    
    // Store settings
    if (!this.settingsFor) {
      this.settingsFor = {};
    }
    this.settingsFor[template] = options;
    
    // Set current state
    this.set('currentTemplate', template);
    this.set('currentOptions', options);
    this.set('currentComponent', null);
    this.set('currentController', null);
    
    // Scanner integration - stop scanning when modal opens
    this.set('resumeScanning', true);
    scanner.stop();
    
    // Start scanning if modal is scannable
    runLater(() => {
      const targets = this.scannableTargets();
      if (targets.length > 0 && options && options.scannable) {
        scanner.start(scanner.options);
      }
    });
    
    // Create promise for modal lifecycle
    var _this = this;
    const promise = new RSVP.Promise((resolve, reject) => {
      _this.set('currentPromise', { resolve, reject });
    });
    
    return promise;
  },
  
  /**
   * Open highlight overlay
   */
  _openHighlight(template, options) {
    // Highlight system uses different outlets - keep existing logic for now
    // This will be refactored in a later phase
    const renderTemplate = template === 'highlight-secondary' ? 'highlight2' : template;
    const controllerName = template === 'highlight-secondary' ? 'highlight2Controller' : 'highlightController';
    const promiseName = template === 'highlight-secondary' ? 'highlight2Promise' : 'highlightPromise';
    const settingsName = template === 'highlight-secondary' ? 'highlight2Settings' : 'highlightSettings';
    
    const settings = this.get(settingsName) || EmberObject.create();
    settings.setProperties({
      left: options.left || 0,
      top: options.top || 0,
      width: options.width || 0,
      height: options.height || 0,
      bottom: options.bottom || 0,
      overlay: options.overlay !== false,
      clearOverlay: options.clear_overlay,
      iconClass: options.icon ? `highlight_icon glyphicon glyphicon-${options.icon}` : null,
      preventClose: options.prevent_close,
      selectAnywhere: options.select_anywhere,
      highlightType: options.highlight_type,
    });
    
    this.set(settingsName, settings);
    
    // If controller exists, update it; otherwise will be handled by old system
    const existingController = this.get(controllerName);
    if (existingController) {
      const existingPromise = this.get(promiseName);
      if (existingPromise) {
        existingPromise.reject({reason: 'closing due to new highlight', highlight_close: true});
      }
      existingController.set('model', settings);
      this.set(promiseName, RSVP.defer());
      return this.get(promiseName).promise;
    }
    
    // Fall back to old system for highlights during migration
    return RSVP.resolve();
  },
  
  /**
   * Open flash message
   */
  _openFlash(options) {
    this.set('flashMessage', {
      type: options.type || 'notice',
      text: options.text,
      sticky: options.sticky,
      action: options.action,
      belowHeader: options.below_header,
      redirect: options.redirect
    });
    
    // Auto-fade if not sticky
    if (!options.sticky) {
      const timeout = options.below_header ? 3500 : (options.timeout || 1500);
      this.set('flashTimer', runLater(() => {
        this.fadeFlash();
      }, timeout));
    }
    
    return RSVP.resolve();
  },
  
  /**
   * Open board preview
   */
  _openBoardPreview(options) {
    this.set('boardPreview', {
      board: options.board,
      locale: options.locale,
      option: options.option,
      allowStyle: options.allow_style,
      callback: options.callback
    });
    
    return RSVP.resolve();
  },
  
  /**
   * Close the current modal
   * @param {*} success - Value to resolve promise with (false to reject)
   * @param {string} outlet - Outlet name (for backward compatibility)
   */
  close(success, outlet) {
    outlet = outlet || 'modal';
    
    // Handle different outlet types
    if (outlet === 'highlight' || outlet === 'highlight-secondary') {
      return this._closeHighlight(outlet);
    }
    
    if (outlet === 'flash-message') {
      return this._closeFlash();
    }
    
    if (outlet === 'board-preview') {
      return this._closeBoardPreview();
    }
    
    // Regular modal
    this._closeModal(success);
  },
  
  /**
   * Close regular modal
   */
  _closeModal(success) {
    const wasGettingStarted = this.get('currentTemplate') === 'getting-started';
    const appState = this.get('appState');

    // Resolve or reject promise
    this._resolveCurrentPromise(success);

    // After closing Getting Started, show welcome celebration icon next to username (once per session)
    if (wasGettingStarted && appState && !appState.get('index_celebration_shown')) {
      appState.set('show_index_celebration', true);
      runLater(() => {
        if (appState.get('show_index_celebration')) {
          appState.set('show_index_celebration', false);
          appState.set('index_celebration_shown', true);
        }
      }, 2500);
    }

    // Clear state
    this.set('currentTemplate', null);
    this.set('currentOptions', null);
    this.set('currentComponent', null);
    this.set('currentController', null);
    this.set('currentPromise', null);
    
    // Resume scanning if needed
    if (this.get('resumeScanning')) {
      runLater(() => {
        if (!this.isOpen()) {
          this.set('resumeScanning', false);
          scanner.start(scanner.options);
        }
      });
    }
    
    // Close highlights when main modal closes
    runLater(() => {
      this.close(null, 'highlight');
      this.close(null, 'highlight-secondary');
    });
    
    // Handle queued modal
    if (this.queuedTemplate) {
      runLater(() => {
        if (!this.isOpen()) {
          this.open(this.queuedTemplate);
          this.set('queuedTemplate', null);
        }
      }, 2000);
    }
  },
  
  /**
   * Close highlight
   */
  _closeHighlight(outlet) {
    const promiseName = outlet === 'highlight-secondary' ? 'highlight2Promise' : 'highlightPromise';
    const controllerName = outlet === 'highlight-secondary' ? 'highlight2Controller' : 'highlightController';
    
    const promise = this.get(promiseName);
    if (promise) {
      promise.reject({reason: 'force close'});
      this.set(promiseName, null);
    }
    
    const controller = this.get(controllerName);
    if (controller && controller.closing) {
      controller.closing();
    }
    
    this.set(controllerName, null);
  },
  
  /**
   * Close flash message
   */
  _closeFlash() {
    if (this.flashTimer) {
      runCancel(this.flashTimer);
      this.set('flashTimer', null);
    }
    this.set('flashMessage', null);
  },
  
  /**
   * Close board preview
   */
  _closeBoardPreview() {
    this.set('boardPreview', null);
  },
  
  /**
   * Resolve current promise
   */
  _resolveCurrentPromise(success) {
    const promise = this.get('currentPromise');
    if (promise) {
      if (success === false) {
        promise.reject({reason: 'force close'});
      } else {
        promise.resolve(success);
      }
      this.set('currentPromise', null);
    }
  },
  
  /**
   * Check if a modal is open
   * @param {string} template - Optional template name to check
   * @returns {boolean}
   */
  isOpen(template) {
    if (template === 'highlight') {
      return !!this.get('highlightController');
    }
    if (template === 'highlight-secondary') {
      return !!this.get('highlight2Controller');
    }
    if (template) {
      return this.get('currentTemplate') === template;
    }
    return !!this.get('currentTemplate');
  },
  
  /**
   * Check if current modal is closeable
   */
  isCloseable() {
    const modalElement = document.querySelector('.modal');
    return modalElement && modalElement.getAttribute('data-uncloseable') !== 'true';
  },
  
  /**
   * Get scannable targets in current modal
   */
  scannableTargets() {
    if (this.isOpen()) {
      return document.querySelectorAll('.modal-dialog .modal_targets .btn, .modal-dialog .modal_targets a, .modal-dialog .modal_targets .speak_menu_button');
    }
    return document.querySelectorAll('nothing'); // Return empty NodeList
  },
  
  /**
   * Queue a modal to open after current one closes
   */
  queue(template) {
    if (this.isOpen()) {
      this.set('queuedTemplate', template);
    } else {
      this.open(template);
    }
  },
  
  /**
   * Cancel auto-close timer
   */
  cancelAutoClose() {
    this.set('autoClose', false);
    if (this.autoCloseTimer) {
      runCancel(this.autoCloseTimer);
      this.set('autoCloseTimer', null);
    }
    if (this.autoCloseCallback) {
      this.set('autoCloseCallback', null);
    }
    const component = this.get('currentComponent');
    if (component) {
      component.set('auto_close', false);
    }
  },
  
  /**
   * Fade flash message
   */
  fadeFlash() {
    const flash = document.querySelector('.flash');
    if (flash) {
      flash.classList.add('fade');
    }
  },
  
  /**
   * Flash message helpers
   */
  flash(text, type, belowHeader, sticky, opts) {
    return this.open('flash-message', {
      text,
      type: type || 'notice',
      below_header: belowHeader,
      sticky,
      ...opts
    });
  },
  
  warning(text, belowHeader, sticky, opts) {
    return this.flash(text, 'warning', belowHeader, sticky, opts);
  },
  
  error(text, belowHeader, sticky, opts) {
    return this.flash(text, 'error', belowHeader, sticky, opts);
  },
  
  notice(text, belowHeader, sticky, opts) {
    return this.flash(text, 'notice', belowHeader, sticky, opts);
  },
  
  success(text, belowHeader, sticky, opts) {
    return this.flash(text, 'success', belowHeader, sticky, opts);
  },
  
  /**
   * Get current modal info
   */
  getCurrentModal() {
    return {
      template: this.get('currentTemplate'),
      options: this.get('currentOptions'),
      component: this.get('currentComponent'),
      controller: this.get('currentController')
    };
  },
  
  /**
   * Get settings for a template
   */
  getSettingsFor(template) {
    return this.settingsFor[template] || {};
  },
  
  /**
   * Set component reference (called by modal-container)
   */
  setComponent(component) {
    this.set('currentComponent', component);
  },
  
  /**
   * Set controller reference (called by modal controller)
   */
  setController(controller) {
    this.set('currentController', controller);
  }
});

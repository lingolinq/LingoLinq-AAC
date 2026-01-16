import Service from '@ember/service';
import RSVP from 'rsvp';
import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
import scanner from '../utils/scanner';

/**
 * Modern Ember Service for Modal Management
 *
 * Replaces app/utils/modal.js with proper service pattern.
 * Removes dependency on deprecated route.render() pattern.
 *
 * Handles:
 * - Modal state management
 * - Modal promise resolution
 * - Modal options passing
 * - Scanner integration
 */
export default Service.extend({
  // State properties
  currentModal: null,
  modalOptions: null,
  isHighlight: false,
  isSecondaryHighlight: false,

  // Private properties
  _modalPromise: null,
  _resumeScanning: false,

  /**
   * Open a modal
   * @param {string} template - Modal template name
   * @param {object} options - Modal options
   * @returns {Promise} - Resolves when modal is closed
   */
  open(template, options) {
    var outlet = template;
    var render_template = template;
    var isHighlight = (template === 'highlight' || template === 'highlight-secondary');

    if(template != 'highlight' && template != 'highlight-secondary') {
      outlet = 'modal';
    }

    if(outlet == 'highlight-secondary') {
      render_template = 'highlight2';
      options = options || {};
      options.secondary_highlight = true;
      options.clear_overlay = true;
      this.set('isSecondaryHighlight', true);
    }

    if(!isHighlight) {
      this._resumeScanning = true;
      scanner.stop();
      runLater(() => {
        var targets = this.scannable_targets();
        if(targets.length > 0 && options && options.scannable) {
          scanner.start(scanner.options);
        }
      });
    }

    // Close any existing modal
    if(this.get('currentModal') || this._modalPromise) {
      this.close(null, outlet);
    }

    this.set('currentModal', render_template);
    this.set('modalOptions', options);
    this.set('isHighlight', isHighlight);

    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      if(!isHighlight) {
        _this._modalPromise = {
          resolve: resolve,
          reject: reject
        };
      }
    });
  },

  /**
   * Check if modal is open
   * @param {string} template - Optional template name to check
   * @returns {boolean}
   */
  is_open(template) {
    if(template == 'highlight') {
      return this.get('isHighlight') && !this.get('isSecondaryHighlight');
    } else if(template == 'highlight-secondary') {
      return this.get('isSecondaryHighlight');
    } else if(template) {
      return this.get('currentModal') == template;
    } else {
      return !!this.get('currentModal');
    }
  },

  /**
   * Check if modal is closeable
   * @returns {boolean}
   */
  is_closeable() {
    var modal = document.querySelector(".modal");
    return modal && modal.getAttribute('data-uncloseable') != 'true';
  },

  /**
   * Get scannable targets in modal
   * @returns {NodeList}
   */
  scannable_targets() {
    if(this.is_open()) {
      return document.querySelectorAll(".modal-dialog .modal_targets .btn, .modal-dialog .modal_targets a, .modal-dialog .modal_targets .speak_menu_button");
    } else {
      return document.querySelectorAll('nothing');
    }
  },

  /**
   * Close the modal
   * @param {*} result - Result to resolve promise with
   * @param {string} outlet - Optional outlet name
   */
  close(result, outlet) {
    if(this._modalPromise) {
      if(result && result.error) {
        this._modalPromise.reject(result);
      } else {
        this._modalPromise.resolve(result);
      }
      this._modalPromise = null;
    }

    this.set('currentModal', null);
    this.set('modalOptions', null);
    this.set('isHighlight', false);
    this.set('isSecondaryHighlight', false);

    if(this._resumeScanning && scanner.interval) {
      scanner.start(scanner.options);
      this._resumeScanning = false;
    }
  },

  /**
   * Flash a notification
   * @param {string} message - Message to display
   */
  flash(message) {
    // TODO: Implement flash notification in Phase 2
    console.log('Flash:', message);
  },

  /**
   * Show warning modal
   * @param {string} message - Warning message
   * @param {object} options - Modal options
   */
  warning(message, options) {
    // TODO: Implement warning modal in Phase 2
    console.warn('Warning:', message);
  },

  /**
   * Show error modal
   * @param {string} message - Error message
   */
  error(message) {
    // TODO: Implement error modal in Phase 2
    console.error('Error:', message);
  },

  /**
   * Show notice modal
   * @param {string} message - Notice message
   */
  notice(message) {
    // TODO: Implement notice modal in Phase 2
    console.info('Notice:', message);
  }
});

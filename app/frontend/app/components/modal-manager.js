import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

/**
 * Modal Manager Component
 *
 * Renders modals based on modal service state.
 * Replaces deprecated route.render() pattern.
 *
 * Usage:
 *   Place in application.hbs: {{modal-manager}}
 */
export default Component.extend({
  tagName: '',  // No wrapper element

  // Service injection
  modal: service(),

  /**
   * Current modal template name
   */
  currentModal: computed.alias('modal.currentModal'),

  /**
   * Current modal options
   */
  modalOptions: computed.alias('modal.modalOptions'),

  /**
   * Is highlight modal
   */
  isHighlight: computed.alias('modal.isHighlight'),

  /**
   * Actions
   */
  actions: {
    /**
     * Close modal
     */
    closeModal(result) {
      this.modal.close(result);
    }
  }
});

import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';

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
   * Check if currentModal is an actual component
   */
  isComponent: computed('currentModal', function() {
    let name = this.get('currentModal');
    if (!name) { return false; }
    
    let owner = getOwner(this);
    // In Ember 3.x, we check if the component class or template-only component exists
    return !!(owner.lookup(`component:${name}`) || owner.lookup(`template:components/${name}`));
  }),

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

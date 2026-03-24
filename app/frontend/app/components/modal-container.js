import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { readOnly } from '@ember/object/computed';
import { observer } from '@ember/object';

/**
 * Modal Container Component
 * 
 * This component watches the modal service state and coordinates with
 * the existing modal system during the incremental migration.
 * 
 * During migration, this component works alongside the outlet-based system.
 * Eventually, it will handle all modal rendering directly.
 */
export default Component.extend({
  modalService: service('modal'),
  tagName: '',
  
  /**
   * Current modal template name from service
   */
  currentTemplate: readOnly('modalService.currentTemplate'),
  
  /**
   * Whether a modal is currently open
   */
  isOpen: computed('currentTemplate', function() {
    return !!this.get('currentTemplate');
  }),
  
  /**
   * Whether the current modal is component-based (converted)
   */
  isComponentBased: computed('currentTemplate', function() {
    const template = this.get('currentTemplate');
    const convertedModals = ['about-lingolinq', 'cloud-extras', 'supervision-settings', 'new-board', 'confirm-delete-board', 'speak-menu', 'support', 'intro', 'limit-skin-tones', 'terms-agree', 'confirm-update-app', 'download-board', 'share-board', 'set-as-home', 'copying-board', 'confirm-edit-board', 'confirm-needs-copying', 'speak-mode-pin', 'premium-required', 'which-home', 'force-logout', 'switch-languages', 'badge-awarded', 'getting-started', 'add-to-sidebar', 'copy-board', 'find-button', 'board-details', 'speak-mode-intro', 'button-stash', 'board-copies', 'switch-communicators', 'record-note', 'sync-details', 'dashboard-supervisors-modal', 'confirm-notify-user', 'share-utterance', 'share-email', 'edit-board-details', 'approve-board-share', 'importing-recordings', 'importing-boards', 'confirm-remove-board', 'modeling-intro', 'confirm-external-app', 'confirm-external-link', 'download-log', 'add-app', 'add-tool', 'confirm-delete-logs', 'inline-book', 'swap-or-drop-button', 'subscribe', 'inline-video', 'device-settings', 'translation-select', 'swap-images', 'quick-assessment', 'add-supervisor', 'word-data', 'word-cloud', 'new-goal', 'button-suggestions', 'batch-recording', 'button-settings', 'enable-logging', 'sidebar-button-settings', 'premium-voices', 'pick-avatar', 'modify-core-words', 'button-set', 'board-stats', 'rename-board', 'edit-unit', 'save-snapshot', 'modals/board-intro', 'modals/board-actions', 'modals/start-codes', 'modals/confirm-delete-user', 'modals/confirm-remove-goal', 'modals/board-privacy', 'modals/gif', 'modals/choose-locale', 'modals/tag-board', 'modals/assign-lesson', 'modals/slice-locales', 'modals/confirm-org-action', 'modals/assessment-settings', 'modals/eval-jump', 'modals/eval-status', 'modals/big-button', 'modals/external-device', 'modals/extra-colors', 'modals/timer', 'modals/paint-level', 'modals/focus-words', 'modals/remote-model', 'modals/modeling-ideas', 'modals/repairs', 'modals/inbox', 'modals/phrases', 'modals/masquerade', 'modals/manual-log', 'modals/importing-logs', 'modals/message-unit', 'modals/note-templates', 'modals/profiles', 'modals/program-nfc', 'modals/push_to_cloud', 'modals/request-supervisee', 'modals/user-status', 'modals/valet-mode', 'fs-features-modal'];
    return template && convertedModals.indexOf(template) >= 0;
  }),
  
  /**
   * During incremental migration, this component primarily serves as a bridge.
   * The actual rendering still happens via outlets, but the service manages state.
   * This allows us to gradually migrate modals one by one.
   */
  init() {
    this._super(...arguments);
    // Component is ready - service will coordinate rendering
  }
});

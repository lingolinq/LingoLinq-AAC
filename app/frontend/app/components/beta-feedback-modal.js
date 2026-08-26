import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'beta-feedback-modal';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this._bindHandlers();
  },

  /*
   * init(), NOT didInsertElement(): every one of these is passed to the template
   * as an argument that is read DURING render —
   * `<BetaFeedbackPanel @onClose={{this.onClose}} @onCancel={{this.onCancel}}
   * @onSubmitSuccess={{this.onSubmitSuccess}} />` — and the panel gates its close
   * button on `{{#if @onClose}}` (beta-feedback-panel.hbs:46).
   *
   * Assigned in didInsertElement they were all `undefined` at render, so the
   * close button was never RENDERED at all (not merely dead), and the form's
   * cancel / submit-success callbacks were dead too. Found by
   * scripts/modal-audit-qa.mjs reporting hasCloseButton:false.
   */
  _bindHandlers() {
    var self = this;
    this.onClose = function() {
      self.send('close');
    };
    this.onOpening = function() {
      self.send('opening');
    };
    this.onClosing = function() {
      self.send('closing');
    };
    this.onSubmitSuccess = function() {
      self.send('onSubmitSuccess');
    };
    this.onCancel = function() {
      self.send('onCancel');
    };
  },

  willDestroyElement() {
    this._super(...arguments);
    this.onClose = null;
    this.onOpening = null;
    this.onClosing = null;
    this.onSubmitSuccess = null;
    this.onCancel = null;
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    onSubmitSuccess() {
      modal.close('beta-feedback-modal');
    },
    onCancel() {
      modal.close('beta-feedback-modal');
    }
  }
});

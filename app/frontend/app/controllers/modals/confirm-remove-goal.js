import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ConfirmRemoveGoalController extends modal.ModalController {
  @service store;

  @tracked status = null;
  @tracked auto_conclude = false;

  opening() {
    this.status = null;
    this.auto_conclude = false;
  }

  @action
  confirm() {
    this.status = {saving: true};
    this.store.findRecord('unit', this.model.source.id).then((unit) => {
      unit.set('goal', {remove: true, auto_conclude: this.auto_conclude});
      unit.save().then(() => {
        unit.set('goal', null);
        modal.close({confirmed: true});
      }, () => {
        this.status = {error: true};
      });
    }, (err) => {
      this.status = {error: true};
    })
  }
}

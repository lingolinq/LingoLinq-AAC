import { inject as service } from '@ember/service';

import modal from '../../utils/modal';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.set('words', null);
    this.set('date', window.moment().toISOString().substring(0, 10));
    this.set('time', '');
  },
  actions: {
    submit: function() {
      var text = this.get('words');
      var date = window.moment(this.get('date') + ' ' + this.get('time'))._d;
      this.modal.close({
        words: text,
        date: date
      });
    }
  }
});

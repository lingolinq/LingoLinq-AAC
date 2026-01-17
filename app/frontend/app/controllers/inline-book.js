import modal from '../utils/modal';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
  },
  book_url: computed('model.url', function() {
    return "https://tools.openaac.org/tarheel/launch#" + this.get('model.url');
  }),
  actions: {
  }
});

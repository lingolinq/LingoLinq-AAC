import modal from '../../utils/modal';
import { htmlSafe } from '@ember/string';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  num_percent: computed('progress.percent', function() {
    return Math.round(100 * (this.get('progress.percent') || 0));
  }),
  num_style: computed('num_percent', function() {
    return htmlSafe("width: " + this.get('num_percent') + "%;");
  })
});

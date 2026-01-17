import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';
import LingoLinq from '../../app';

export default Controller.extend({
  modal: service(),

  actions: {
    update_org: function() {
      var org = this.get('model');
      org.save().then(null, function(err) {
        console.log(err);
        this.modal.error(i18n.t('org_update_failed', 'Organization update failed unexpectedly'));
      });
    }
  }
});

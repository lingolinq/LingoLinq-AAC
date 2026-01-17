import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import session from '../../utils/session';
import { later as runLater } from '@ember/runloop';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  opening: function() {
    this.set('confirmed', false);
  },
  actions: {
    confirm: function() {
      if(!this.get('confirmed')) { return; }
      var data = session.restore();
      data.original_user_name = data.user_name;
      data.as_user_id = this.get('model.user.id');
      data.user_name = this.get('model.user.user_name');
      session.persist(data).then(function() {
        app_state.return_to_index();
        runLater(function() {
          location.reload();
        });
      });
  }
  }
});


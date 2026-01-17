import { inject as service } from '@ember/service';

import modal from '../utils/modal';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';

export default modal.ModalController.extend({
  persistence: service(),

  opening: function() {
    this.set('loading', true);
    this.set('error', null);
    var _this = this;
    this.persistence.ajax('/api/v1/boards/' + this.get('model.board.id') + '/copies', {
      type: 'GET'
    }).then(function(data) {
      _this.set('loading', false);
      _this.set('copies', data.board);
    }, function() {
      _this.set('loading', false);
      _this.set('error', i18n.t('copies_loading_error', "There was an unexpected error trying to load copies of this board"));
    });
  }
});

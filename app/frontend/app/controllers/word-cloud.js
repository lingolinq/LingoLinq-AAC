import { computed } from '@ember/object';
import modal from '../utils/modal';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  opening: function() {
    this.render_cloud();
  },
  zoom: 1.0,
  stretch_ratio: computed('model.stats2', function() {
    return this.get('model.stats2') ? 2.0 : null;
  }),
  render_cloud: function() {
    this.set('word_cloud_id', Math.random());
  },
  actions: {
    refresh: function() {
      this.render_cloud();
    },
    zoom: function(direction) {
      if(direction == 'in') {
        this.set('zoom', Math.round(this.get('zoom') * 1.2 * 10.0) / 10.0);
      } else {
        this.set('zoom', Math.round(this.get('zoom') / 1.2 * 10.0) / 10.0);
      }
      this.render_cloud();
    }
  }
});